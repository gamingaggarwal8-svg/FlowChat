import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  api,
  checkDB,
  HttpError,
  jsonBody,
  requireBusiness,
  supabaseConfigured,
} from "../../../lib/server/http";
export const GET = api(async (request) => {
  const { db, businessId, user, role } = await requireBusiness(request);
  const { data: members, error } = await db
    .from("business_members")
    .select("user_id,role")
    .eq("business_id", businessId);
  checkDB(error);
  return Response.json({ user: user.email, role, members });
});
export const POST = api(async (request) => {
  const input = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("create"),
        name: z.string().trim().min(1).max(120),
      }),
      z.object({
        action: z.literal("member"),
        email: z.email(),
        role: z.enum(["accountant", "viewer"]),
      }),
    ])
    .parse(await jsonBody(request));
  if (input.action === "member") {
    const { db, businessId } = await requireBusiness(request, true, true);
    const { error } = await db.rpc("add_business_member", {
      p_business: businessId,
      p_email: input.email,
      p_role: input.role,
    });
    if (error)
      throw new HttpError(
        400,
        "Cannot add teammate. They must sign up first; existing owners cannot be changed here.",
      );
    return Response.json({ ok: true });
  }
  if (!supabaseConfigured())
    throw new HttpError(503, "Supabase is not configured.");
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, "Sign in first.");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    },
  );
  const {
    data: { user },
  } = await db.auth.getUser(token);
  if (!user) throw new HttpError(401, "Invalid session.");
  const { data, error } = await db.rpc("create_business", {
    p_name: input.name,
  });
  checkDB(error);
  return Response.json({ businessId: data });
});
