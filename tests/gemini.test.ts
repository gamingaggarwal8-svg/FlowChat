import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
const fake = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: fake.generate };
  },
}));
import { generateStructured } from "../lib/server/gemini";
const schema = z.object({ text: z.string() }).strict();
function database(cached: unknown = null, allowed = true) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: cached ? { payload: cached } : null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
  const db = {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: allowed, error: null }),
  };
  return { db: db as unknown as SupabaseClient, query, rpc: db.rpc };
}
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-placeholder-not-a-real-key");
  fake.generate.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("Gemini validated requests", () => {
  it("uses a business cache before consuming quota", async () => {
    const { db, rpc } = database({ text: "cached" });
    const response = await generateStructured({
      db,
      businessId: "business-a",
      schema,
      instruction: "Explain",
      input: "facts",
    });
    expect(response).toEqual({ result: { text: "cached" }, cached: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(fake.generate).not.toHaveBeenCalled();
  });
  it("denies requests before contacting the provider when quota is exhausted", async () => {
    const { db } = database(null, false);
    await expect(
      generateStructured({
        db,
        businessId: "a",
        schema,
        instruction: "Explain",
        input: "facts",
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fake.generate).not.toHaveBeenCalled();
  });
  it("retries invalid structured output once and then validates it", async () => {
    const { db } = database();
    fake.generate
      .mockResolvedValueOnce({ text: '{"invented":true}' })
      .mockResolvedValueOnce({ text: '{"text":"Valid explanation"}' });
    const response = await generateStructured({
      db,
      businessId: "a",
      schema,
      instruction: "Explain",
      input: "facts",
    });
    expect(response.result.text).toBe("Valid explanation");
    expect(fake.generate).toHaveBeenCalledTimes(2);
    expect(fake.generate.mock.calls[0][0].config.responseMimeType).toBe(
      "application/json",
    );
  });
  it("returns a bounded rate-limit error after one provider retry", async () => {
    const { db } = database();
    fake.generate.mockRejectedValue({ status: 429 });
    await expect(
      generateStructured({
        db,
        businessId: "a",
        schema,
        instruction: "Explain",
        input: "facts",
      }),
    ).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(fake.generate).toHaveBeenCalledTimes(2);
  });
  it("rejects unsupported cached and fresh evidence before writing a valid cache", async () => {
    const { db, query, rpc } = database({ text: "made up" });
    fake.generate
      .mockResolvedValueOnce({ text: '{"text":"invented"}' })
      .mockResolvedValueOnce({ text: '{"text":"exact source quote"}' });
    const result = await generateStructured({
      db,
      businessId: "a",
      schema,
      instruction: "Copy evidence",
      input: "exact source quote",
      validate: (value) => {
        if (value.text !== "exact source quote")
          throw new Error("Unsupported evidence");
      },
    });
    expect(result.result.text).toBe("exact source quote");
    expect(rpc).toHaveBeenCalledOnce();
    expect(query.upsert).toHaveBeenCalledOnce();
    expect(fake.generate).toHaveBeenCalledTimes(2);
  });
});
