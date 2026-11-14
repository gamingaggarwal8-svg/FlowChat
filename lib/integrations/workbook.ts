import ExcelJS from "exceljs/dist/exceljs.min.js";
import type ExcelTypes from "exceljs";
import { Unzip, UnzipInflate } from "fflate";
import { validateBatch, type SyncRecord } from "./records";
import { HttpError } from "./errors";
export const workbookSheets = {
  Inventory: "inventory",
  PaymentsReceived: "payment_received",
  PaymentsSent: "payment_sent",
  SalesInvoices: "sales_invoice",
  PurchaseInvoices: "purchase_invoice",
} as const;
export async function parseWorkbook(bytes: Uint8Array): Promise<SyncRecord[]> {
  if (bytes.length > 10 * 1024 * 1024)
    throw new HttpError(413, "Workbook limit is 10 MB.");
  let expanded = 0,
    entries = 0;
  const archive = new Unzip((file) => {
    if (file.originalSize !== undefined && file.originalSize > 30 * 1024 * 1024)
      throw new HttpError(413, "Workbook expands beyond 30 MB.");
    if (++entries > 1000)
      throw new HttpError(413, "Too many workbook entries.");
    file.ondata = (error, chunk) => {
      if (error) throw new HttpError(400, "Invalid workbook ZIP.");
      expanded += chunk.length;
      if (expanded > 30 * 1024 * 1024) {
        file.terminate();
        throw new HttpError(413, "Workbook expands beyond 30 MB.");
      }
    };
    file.start();
  });
  archive.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 1024)
    archive.push(
      bytes.subarray(offset, offset + 1024),
      offset + 1024 >= bytes.length,
    );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ExcelTypes.Buffer);
  const rows: unknown[] = [];
  for (const [name, kind] of Object.entries(workbookSheets)) {
    const sheet = book.getWorksheet(name);
    if (!sheet) continue;
    if (sheet.rowCount > 5001 || sheet.columnCount > 30)
      throw new HttpError(400, `${name}: too many rows or columns.`);
    const headers: string[] = [];
    const usedHeaders = new Set<string>();
    sheet.getRow(1).eachCell((c, i) => {
      headers[i] = String(c.value || "").trim();
      if (usedHeaders.has(headers[i]))
        throw new HttpError(400, `${name}: duplicate column ${headers[i]}`);
      usedHeaders.add(headers[i]);
    });
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const data: Record<string, unknown> = { kind };
      row.eachCell((cell, i) => {
        const key = headers[i];
        if (!key) return;
        let value = cell.value;
        if (value && typeof value === "object" && !(value instanceof Date))
          throw new HttpError(
            400,
            `${name} row ${index}: formulas and rich cells are not supported. Paste values.`,
          );
        if (value instanceof Date) value = value.toISOString().slice(0, 10);
        if (value !== null && value !== "") data[key] = value;
      });
      if (Object.keys(data).length > 1) {
        if (!data.id || typeof data.id !== "string")
          throw new HttpError(
            400,
            `${name} row ${index}: id must be permanent text.`,
          );
        if (kind === "inventory" && data.id !== data.sku)
          throw new HttpError(400, "Inventory id must equal sku.");
        rows.push(data);
      }
    });
  }
  return validateBatch(rows);
}
export async function workbookTemplate() {
  const book = new ExcelJS.Workbook();
  for (const [name, kind] of Object.entries(workbookSheets)) {
    const sheet = book.addWorksheet(name);
    const headers =
      kind === "inventory"
        ? [
            "id",
            "date",
            "sku",
            "name",
            "qty",
            "unit",
            "reorder_level",
            "cost_price",
            "weekly_sales",
            "category",
            "fabric",
            "color",
            "gender",
            "status",
          ]
        : ["id", "date", "party", "amount", "due_date", "status"];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((c) => (c.width = 22));
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
