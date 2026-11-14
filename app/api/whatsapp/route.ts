import {
  api,
  adminDB,
  checkDB,
  HttpError,
  requireBusiness,
} from "../../../lib/server/http";
import { validSignature } from "../../../lib/server/razorpay";
export const GET = api(async (request) => {
  const params = new URL(request.url).searchParams;
  if (params.get("hub.mode") === "subscribe") {
    if (
      !process.env.WHATSAPP_VERIFY_TOKEN ||
      params.get("hub.verify_token") !== process.env.WHATSAPP_VERIFY_TOKEN
    )
      throw new HttpError(403, "Verification failed.");
    return new Response(params.get("hub.challenge") || "");
  }
  const { db, businessId } = await requireBusiness(request);
  const { data, error } = await db
    .from("whatsapp_messages")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  checkDB(error);
  return Response.json({ messages: data });
});
export const POST = api(async (request) => {
  const raw = await request.text();
  if (raw.length > 1000000) throw new HttpError(413, "Payload too large.");
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (
    !secret ||
    !validSignature(
      raw,
      (request.headers.get("x-hub-signature-256") || "").replace(
        /^sha256=/,
        "",
      ),
      secret,
    )
  )
    throw new HttpError(401, "Invalid Meta webhook signature.");
  const body = JSON.parse(raw);
  if (body.object !== "whatsapp_business_account")
    return Response.json({ ignored: true });
  const db = adminDB();
  for (const entry of body.entry || [])
    for (const change of entry.changes || []) {
      const value = change.value,
        phone = value?.metadata?.phone_number_id;
      if (!phone) continue;
      const { data: mapping } = await db
        .from("whatsapp_numbers")
        .select("business_id")
        .eq("phone_number_id", phone)
        .maybeSingle();
      if (!mapping) continue;
      for (const message of value.messages || []) {
        if (!message.id) continue;
        checkDB(
          (
            await db
              .from("whatsapp_messages")
              .upsert(
                {
                  id: message.id,
                  business_id: mapping.business_id,
                  payload: message,
                },
                { onConflict: "id", ignoreDuplicates: true },
              )
          ).error,
        );
      }
    }
  return Response.json({ received: true });
});
