import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFile, readdir } from "node:fs/promises";
import { validateBatch } from "../lib/integrations/records";
const owner = "11111111-1111-4111-8111-111111111111",
  outsider = "22222222-2222-4222-8222-222222222222",
  viewer = "33333333-3333-4333-8333-333333333333";
let db: PGlite, business: string;
async function identity(id: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [id, role],
  );
  await db.exec(`set role ${role}`);
}
const row = (amount = 100) =>
  validateBatch([
    {
      kind: "payment_received",
      id: "PAY-1",
      date: "2026-11-14",
      party: "Sharma",
      amount,
    },
  ]);
async function sync(rows = row()) {
  return db.query<{ sync_records: { inserted: number; unchanged: number } }>(
    "select public.sync_records($1,$2,$3::jsonb)",
    [business, "test.xlsx", JSON.stringify(rows)],
  );
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(
    `create role authenticated;create role anon; create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
  );
  await db.query("insert into auth.users values($1,$2),($3,$4),($5,$6)", [
    owner,
    "owner@example.test",
    outsider,
    "other@example.test",
    viewer,
    "viewer@example.test",
  ]);
  await db.exec(
    "create policy legacy_public_read on storage.objects for select to public using(true);grant usage on schema storage to anon;grant select on storage.objects to anon;",
  );
  await db.exec(
    "insert into storage.buckets(id,name,public) values('accounting','accounting',true)",
  );
  for (const migration of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8"));
  await db.exec(
    "grant usage on schema public,auth,storage to authenticated,service_role;grant all on all tables in schema public,storage to authenticated,service_role;",
  );
  await identity(owner);
  const result = await db.query<{ create_business: string }>(
    "select create_business('Textile desk')",
  );
  business = result.rows[0].create_business;
  await db.query(
    "select add_business_member($1,'viewer@example.test','viewer')",
    [business],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("real PostgreSQL RLS and immutable history", () => {
  it("isolates another business and blocks outsider membership escalation", async () => {
    await identity(outsider);
    expect((await db.query("select * from businesses")).rows).toHaveLength(0);
    await expect(
      db.query(
        "select add_business_member($1,'other@example.test','accountant')",
        [business],
      ),
    ).rejects.toThrow("Owner role required");
    await expect(sync()).rejects.toThrow("Writer role required");
  });
  it("deduplicates repeated syncs and preserves changed revisions", async () => {
    await identity(owner);
    expect((await sync()).rows[0].sync_records).toEqual({
      inserted: 1,
      unchanged: 0,
    });
    expect((await sync()).rows[0].sync_records).toEqual({
      inserted: 0,
      unchanged: 1,
    });
    expect((await sync(row(200))).rows[0].sync_records.inserted).toBe(1);
    expect((await db.query("select * from record_versions")).rows).toHaveLength(
      2,
    );
    await db.exec(
      "update record_versions set payload='{}';delete from record_versions;",
    );
    expect((await db.query("select * from record_versions")).rows).toHaveLength(
      2,
    );
  });
  it("allows viewer reads but denies financial writes and private uploads", async () => {
    await identity(viewer);
    expect((await db.query("select * from record_versions")).rows).toHaveLength(
      2,
    );
    await expect(sync()).rejects.toThrow("Writer role required");
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name) values('accounting',$1)",
        [`${business}/bad.pdf`],
      ),
    ).rejects.toThrow("row-level security");
  });
  it("scopes private storage reads to the business folder", async () => {
    await identity(owner);
    expect(
      (
        await db.query<{ public: boolean }>(
          "select public from storage.buckets where id='accounting'",
        )
      ).rows[0].public,
    ).toBe(false);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('accounting',$1)",
      [`${business}/invoice.pdf`],
    );
    await identity(outsider);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name) values('accounting',$1)",
        [`${business}/attack.pdf`],
      ),
    ).rejects.toThrow("row-level security");
    await identity("", "anon");
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
  });
  it("rejects a whole invalid batch without committing earlier rows", async () => {
    await identity(owner);
    const before = (await db.query("select * from record_versions")).rows
      .length;
    const good = { ...row()[0], id: "PAY-ATOMIC" },
      bad = { ...row()[0], id: "PAY-BAD", amount: -1 };
    await expect(
      db.query("select sync_records($1,$2,$3::jsonb)", [
        business,
        "bad",
        JSON.stringify([good, bad]),
      ]),
    ).rejects.toThrow();
    expect((await db.query("select * from record_versions")).rows).toHaveLength(
      before,
    );
  });
  it("protects server-only billing changes and deduplicates signed events", async () => {
    await identity(owner);
    await expect(
      db.query("select record_billing_event($1,$2,$3,100,$4,null,null)", [
        "evt",
        business,
        "sub_test",
        "captured",
      ]),
    ).rejects.toThrow();
    await identity("", "service_role");
    await db.query("select record_billing_event($1,$2,$3,100,$4,null,null)", [
      "evt",
      business,
      "sub_test",
      "captured",
    ]);
    await db.query("select record_billing_event($1,$2,$3,100,$4,null,null)", [
      "evt",
      business,
      "sub_test",
      "captured",
    ]);
    expect((await db.query("select * from billing_events")).rows).toHaveLength(
      1,
    );
  });
});
let savedThread: string;
describe("persistent private assistant memory", () => {
  it("stores complete exchanges atomically and appends a follow-up without changing the ledger", async () => {
    await identity(owner);
    const before = (await db.query("select * from record_versions")).rows
      .length;
    const result = await db.query<{ store_ai_exchange: string }>(
      "select store_ai_exchange($1,null,$2,$3,$4::jsonb,$5)",
      [
        business,
        "Sharma ka outstanding?",
        "Review the recorded balance.",
        JSON.stringify({ outstanding: 400 }),
        "receivables",
      ],
    );
    savedThread = result.rows[0].store_ai_exchange;
    await db.query("select store_ai_exchange($1,$2,$3,$4,$5::jsonb,$6)", [
      business,
      savedThread,
      "Aur Gupta ka?",
      "Here is the freshly checked ledger.",
      JSON.stringify({ party: "Gupta" }),
      "receivables",
    ]);
    const turns = await db.query<{ role: string; sequence: number }>(
      "select role,sequence from ai_turns order by sequence",
    );
    expect(turns.rows.map((r) => r.sequence)).toEqual([1, 2, 3, 4]);
    expect(turns.rows.map((r) => r.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    await db.exec("update ai_turns set content='tampered'");
    expect(
      (await db.query("select * from ai_turns where content='tampered'")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from record_versions")).rows).toHaveLength(
      before,
    );
  });
  it("isolates saved conversations and personal caches even between coworkers in the same business", async () => {
    await identity(owner);
    await db.query(
      "insert into ai_cache(business_id,cache_key,payload) values($1,'private-answer',$2::jsonb)",
      [business, JSON.stringify({ text: "Personal conversation answer" })],
    );
    await db.query(
      "select add_business_member($1,'other@example.test','accountant')",
      [business],
    );
    await identity(outsider);
    expect((await db.query("select * from ai_threads")).rows).toHaveLength(0);
    expect((await db.query("select * from ai_turns")).rows).toHaveLength(0);
    expect((await db.query("select * from ai_cache")).rows).toHaveLength(0);
    await expect(
      db.query("select store_ai_exchange($1,$2,$3,$4,$5::jsonb,$6)", [
        business,
        savedThread,
        "Read their history",
        "no",
        "{}",
        "overview",
      ]),
    ).rejects.toThrow("Conversation not found");
    await identity(viewer);
    await expect(
      db.query("select store_ai_exchange($1,null,$2,$3,$4::jsonb,$5)", [
        business,
        "question",
        "answer",
        "{}",
        "overview",
      ]),
    ).rejects.toThrow("Writer role required");
  });
  it("cleans expired caches and counters while retaining conversations, documents and financial history", async () => {
    await identity(owner);
    await db.query(
      "insert into ai_cache(business_id,cache_key,payload,created_at) values($1,'expired','{}',now()-interval '25 hours')",
      [business],
    );
    await identity("", "service_role");
    await db.query(
      "insert into ai_usage values($1,now()-interval '49 hours',1)",
      [business],
    );
    await identity(owner);
    await expect(db.query("select cleanup_ai_cache()")).rejects.toThrow();
    await identity("", "service_role");
    const result = await db.query<{
      cleanup_ai_cache: { expired_caches: number; old_quota_counters: number };
    }>("select cleanup_ai_cache()");
    expect(result.rows[0].cleanup_ai_cache).toEqual({
      expired_caches: 1,
      old_quota_counters: 1,
    });
    expect((await db.query("select * from ai_turns")).rows).toHaveLength(4);
    expect((await db.query("select * from record_versions")).rows).toHaveLength(
      2,
    );
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
    expect(
      (
        await db.query(
          "select * from ai_cache where cache_key='private-answer'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("only deletes conversation history after its owner explicitly deletes that thread", async () => {
    await identity(outsider);
    await db.query("delete from ai_threads where id=$1", [savedThread]);
    await identity(owner);
    expect((await db.query("select * from ai_turns")).rows).toHaveLength(4);
    await db.query("delete from ai_threads where id=$1", [savedThread]);
    expect((await db.query("select * from ai_turns")).rows).toHaveLength(0);
    expect((await db.query("select * from record_versions")).rows).toHaveLength(
      2,
    );
  });
});
