import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  documentKinds,
  invoiceSchema,
  invoiceIssues,
} from "../../../lib/integrations/accounting";
import {
  api,
  checkDB,
  HttpError,
  jsonBody,
  requireBusiness,
} from "../../../lib/server/http";
import { generateStructured } from "../../../lib/server/gemini";
export const runtime = "nodejs";
export const maxDuration = 180;
export const GET = api(async (request) => {
  const { db, businessId } = await requireBusiness(request);
  const query = new URL(request.url).searchParams;
  const id = query.get("id");
  if (id) {
    z.uuid().parse(id);
    const { data, error } = await db
      .from("accounting_documents")
      .select("storage_path,name")
      .eq("id", id)
      .eq("business_id", businessId)
      .single();
    if (error || !data) throw new HttpError(404, "Document not found.");
    const signed = await db.storage
      .from("accounting")
      .createSignedUrl(
        data.storage_path,
        60,
        query.get("download") === "1" ? { download: data.name } : undefined,
      );
    checkDB(signed.error);
    return Response.json({ url: signed.data!.signedUrl, expiresIn: 60 });
  }
  let builder = db
    .from("accounting_documents")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  const search = query.get("q");
  if (search)
    builder = builder.ilike("name", `%${search.replace(/[%_]/g, "")}%`);
  const { data, error } = await builder.limit(1000);
  checkDB(error);
  return Response.json({ documents: data });
});
export const POST = api(async (request) => {
  const { db, businessId } = await requireBusiness(request, true);
  if (Number(request.headers.get("content-length")) > 5 * 1024 * 1024)
    throw new HttpError(413, "PDF limit is 4 MB.");
  const form = await request.formData();
  const file = form.get("file");
  const kind = z.enum(documentKinds).parse(form.get("kind"));
  if (
    !(file instanceof File) ||
    file.size > 4 * 1024 * 1024 ||
    !file.name.toLowerCase().endsWith(".pdf")
  )
    throw new HttpError(400, "Choose a PDF smaller than 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (Buffer.from(bytes.slice(0, 5)).toString() !== "%PDF-")
    throw new HttpError(400, "This file is not a PDF.");
  const id = randomUUID(),
    storagePath = `${businessId}/${id}.pdf`;
  const { error } = await db.storage
    .from("accounting")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  checkDB(error);
  const inserted = await db
    .from("accounting_documents")
    .insert({
      id,
      business_id: businessId,
      name: file.name.slice(0, 200),
      kind,
      storage_path: storagePath,
    })
    .select("*")
    .single();
  if (inserted.error) {
    await db.storage.from("accounting").remove([storagePath]);
    checkDB(inserted.error);
  }
  return Response.json({ document: inserted.data });
});
export const PATCH = api(async (request) => {
  const context = await requireBusiness(request, true);
  const input = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("extract"), id: z.uuid() }),
      z.object({
        action: z.literal("review"),
        id: z.uuid(),
        details: invoiceSchema,
      }),
    ])
    .parse(await jsonBody(request));
  const { data: doc, error } = await context.db
    .from("accounting_documents")
    .select("*")
    .eq("id", input.id)
    .eq("business_id", context.businessId)
    .single();
  if (error || !doc) throw new HttpError(404, "Document not found.");
  if (input.action === "review") {
    if (
      ["Sales invoice", "Purchase bill"].includes(doc.kind) &&
      invoiceIssues(input.details).length
    )
      throw new HttpError(400, invoiceIssues(input.details).join(" "));
    const saved = await context.db
      .from("accounting_documents")
      .update({ details: input.details, reviewed: true })
      .eq("id", input.id)
      .eq("business_id", context.businessId)
      .select("*")
      .single();
    checkDB(saved.error);
    return Response.json({ document: saved.data });
  }
  const download = await context.db.storage
    .from("accounting")
    .download(doc.storage_path);
  checkDB(download.error);
  if (!download.data || download.data.size > 4 * 1024 * 1024)
    throw new HttpError(400, "PDF is missing or exceeds the extraction limit.");
  const result = await generateStructured({
    ...context,
    schema: invoiceSchema,
    instruction:
      "Read the accounting PDF. Copy only explicit invoice fields, including a three-letter currency code when explicitly supported; otherwise currency is null. Missing fields including taxes are null, never zero unless explicitly stated. Copy exact short source evidence. Do not calculate totals or GST. A statement or receipt may not be an invoice; leave unsupported invoice fields null.",
    input: `Document category: ${doc.kind}`,
    pdf: new Uint8Array(await download.data.arrayBuffer()),
  });
  const saved = await context.db
    .from("accounting_documents")
    .update({ details: result.result, reviewed: false })
    .eq("id", input.id)
    .eq("business_id", context.businessId)
    .select("*")
    .single();
  checkDB(saved.error);
  return Response.json({
    document: saved.data,
    issues: invoiceIssues(result.result),
    cached: result.cached,
  });
});
