import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { POST as chats } from "../app/api/chats/route";
import { POST as documents } from "../app/api/documents/route";
import { POST as billing } from "../app/api/billing/route";
import { POST as billingWebhook } from "../app/api/billing/webhook/route";
import { POST as whatsapp } from "../app/api/whatsapp/route";
import { GET as cron } from "../app/api/sync/cron/route";
import { seal, unseal } from "../lib/server/excel";
const request = () =>
  new Request("http://localhost/api/test", {
    method: "POST",
    body: "{}",
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "secret");
  vi.stubEnv("WHATSAPP_APP_SECRET", "secret");
  vi.stubEnv("CRON_SECRET", "server-secret");
});
afterEach(() => vi.unstubAllEnvs());
describe("API boundaries", () => {
  it("requires authentication before uploads, extraction and billing", async () => {
    for (const handler of [chats, documents, billing])
      expect((await handler(request())).status).toBe(401);
  });
  it("rejects unsigned provider events and scheduled jobs", async () => {
    expect((await billingWebhook(request())).status).toBe(401);
    expect((await whatsapp(request())).status).toBe(401);
    expect(
      (await cron(new Request("http://localhost/api/sync/cron"))).status,
    ).toBe(401);
  });
  it("encrypts Microsoft tokens and rejects tampered state", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "12".repeat(32));
    const value = seal({ token: "never-in-plaintext", business: "one" });
    expect(value).not.toContain("never-in-plaintext");
    expect(unseal(value)).toEqual({
      token: "never-in-plaintext",
      business: "one",
    });
    const altered = Buffer.from(value, "base64url");
    altered[15] ^= 1;
    expect(() => unseal(altered.toString("base64url"))).toThrow("invalid");
  });
});
