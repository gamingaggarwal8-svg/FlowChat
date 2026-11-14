import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { HttpError } from "../integrations/errors";
export { HttpError } from "../integrations/errors";
export function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
export async function requireBusiness(
  request: Request,
  write = false,
  owner = false,
) {
  if (!supabaseConfigured())
    throw new HttpError(
      503,
      "Cloud workspace is not configured. Local demo remains available.",
    );
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token)
    throw new HttpError(401, "Sign in to use the connected workspace.");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user)
    throw new HttpError(401, "Your session expired. Sign in again.");
  const businessId = z.uuid().safeParse(request.headers.get("x-business-id"));
  if (!businessId.success)
    throw new HttpError(400, "Select a business workspace.");
  const { data: member } = await db
    .from("business_members")
    .select("role")
    .eq("business_id", businessId.data)
    .eq("user_id", user.id)
    .single();
  if (
    !member ||
    (owner && member.role !== "owner") ||
    (write && !["owner", "accountant"].includes(member.role))
  )
    throw new HttpError(
      403,
      "This action is not allowed for your workspace role.",
    );
  return {
    db,
    user,
    userId: user.id,
    businessId: businessId.data,
    role: member.role as "owner" | "accountant" | "viewer",
  };
}
export function adminDB() {
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    throw new HttpError(503, "Server integration credentials are missing.");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function jsonBody(
  request: Request,
  max = 300000,
): Promise<unknown> {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
export function api(handler: (r: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const response = await handler(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .slice(0, 5)
                .join("; ")
            : "The operation failed. Check server configuration and retry.";
      return Response.json(
        { error: message },
        {
          status,
          headers: {
            "Cache-Control": "no-store",
            ...(error instanceof HttpError && error.retryAfter
              ? { "Retry-After": String(error.retryAfter) }
              : {}),
          },
        },
      );
    }
  };
}
export function checkDB(error: unknown) {
  if (error)
    throw new HttpError(
      500,
      "Database operation failed. Check the migration and workspace permissions.",
    );
}
