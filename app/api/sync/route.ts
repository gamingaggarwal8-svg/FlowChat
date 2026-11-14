import {
  api,
  checkDB,
  HttpError,
  requireBusiness,
} from "../../../lib/server/http";
import {
  parseWorkbook,
  workbookTemplate,
} from "../../../lib/integrations/workbook";
import { workspaceAnalytics } from "../../../lib/server/workspace";
export const runtime = "nodejs";
export const GET = api(async (request) => {
  if (new URL(request.url).searchParams.get("template") === "1")
    return new Response(Buffer.from(await workbookTemplate()), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="flowchat-workbook.xlsx"',
      },
    });
  const { db, businessId } = await requireBusiness(request);
  if (new URL(request.url).searchParams.get("history") === "1") {
    const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      throw new HttpError(400, "Invalid audit offset.");
    const { data, error } = await db
      .from("record_versions")
      .select("kind,record_id,revision,payload,created_at,created_by")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .order("kind")
      .order("record_id")
      .order("revision", { ascending: false })
      .range(offset, offset + 99);
    checkDB(error);
    return Response.json({
      versions: data,
      nextOffset: data?.length === 100 ? offset + 100 : null,
    });
  }
  const workspace = await workspaceAnalytics(db, businessId);
  const { data: runs, error } = await db
    .from("sync_runs")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);
  checkDB(error);
  return Response.json({ ...workspace, runs });
});
export const POST = api(async (request) => {
  const { db, businessId } = await requireBusiness(request, true);
  if (Number(request.headers.get("content-length")) > 5 * 1024 * 1024)
    throw new HttpError(413, "Workbook is too large.");
  const form = await request.formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    file.size > 4 * 1024 * 1024 ||
    !file.name.endsWith(".xlsx")
  )
    throw new HttpError(400, "Upload an .xlsx workbook smaller than 4 MB.");
  const rows = await parseWorkbook(new Uint8Array(await file.arrayBuffer()));
  const { data, error } = await db.rpc("sync_records", {
    p_business: businessId,
    p_source: file.name,
    p_rows: rows,
  });
  checkDB(error);
  return Response.json({
    ...data,
    ...(await workspaceAnalytics(db, businessId)),
  });
});
