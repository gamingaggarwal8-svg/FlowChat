import { timingSafeEqual } from "node:crypto";
import { adminDB, api, checkDB, HttpError } from "../../../../lib/server/http";
import { syncCloudWorkbook } from "../../../../lib/server/excel";
export const maxDuration = 180;
export const GET = api(async (request) => {
  const secret = process.env.CRON_SECRET || "",
    provided = request.headers.get("authorization") || "",
    expected = `Bearer ${secret}`;
  if (
    !secret ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    throw new HttpError(401, "Invalid scheduled sync authorization.");
  const db = adminDB();
  const { data, error } = await db
    .from("excel_connections")
    .select("business_id")
    .order("last_attempt_at", { ascending: true, nullsFirst: true })
    .limit(5);
  checkDB(error);
  const results = await Promise.allSettled(
    (data || []).map((c) => syncCloudWorkbook(db, c.business_id)),
  );
  return Response.json({
    processed: results.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });
});
