import { createHash } from "node:crypto";
import { adminDB, api, checkDB, HttpError } from "../../../../lib/server/http";
import { validSignature, razorpay } from "../../../../lib/server/razorpay";
export const POST = api(async (request) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "Webhook not configured.");
  const raw = await request.text();
  if (raw.length > 1000000) throw new HttpError(413, "Payload too large.");
  if (
    !validSignature(
      raw,
      request.headers.get("x-razorpay-signature") || "",
      secret,
    )
  )
    throw new HttpError(401, "Invalid webhook signature.");
  const event = JSON.parse(raw),
    entity = event.payload?.subscription?.entity;
  if (!entity?.id) return Response.json({ ignored: true });
  const db = adminDB();
  const { data: sub } = await db
    .from("subscriptions")
    .select("business_id")
    .eq("provider_id", entity.id)
    .single();
  if (!sub)
    throw new HttpError(
      409,
      "Subscription has not been registered yet. Retry this webhook.",
    );
  // Query current provider state so out-of-order webhooks cannot reactivate a cancelled plan.
  const current = await razorpay(
    `subscriptions/${encodeURIComponent(entity.id)}`,
  );
  const payment = event.payload?.payment?.entity;
  const id =
    event.event === "subscription.charged" && payment?.id
      ? `payment:${payment.id}`
      : request.headers.get("x-razorpay-event-id") ||
        createHash("sha256").update(raw).digest("hex");
  const { error } = await db.rpc("record_billing_event", {
    p_id: id,
    p_business: sub.business_id,
    p_subscription: entity.id,
    p_amount:
      event.event === "subscription.charged" && payment?.status === "captured"
        ? payment.amount
        : 0,
    p_status: String(event.event),
    p_state: current.status,
    p_end: current.current_end
      ? new Date(current.current_end * 1000).toISOString()
      : null,
  });
  checkDB(error);
  return Response.json({ received: true });
});
