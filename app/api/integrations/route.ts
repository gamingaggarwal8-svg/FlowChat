import { supabaseConfigured } from "../../../lib/server/http";
export function GET() {
  return Response.json(
    {
      server: true,
      supabase: supabaseConfigured(),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      gemini: Boolean(process.env.GEMINI_API_KEY),
      razorpay: Boolean(
        process.env.RAZORPAY_KEY_ID &&
        process.env.RAZORPAY_KEY_SECRET &&
        process.env.RAZORPAY_WEBHOOK_SECRET &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      excel: Boolean(
        process.env.MICROSOFT_CLIENT_ID &&
        process.env.MICROSOFT_CLIENT_SECRET &&
        process.env.TOKEN_ENCRYPTION_KEY &&
        process.env.APP_URL,
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
