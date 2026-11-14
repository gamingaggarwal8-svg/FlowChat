import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import ExcelJS from "exceljs";
import { parseWhatsApp, readChatExport } from "../lib/integrations/chat";
import {
  applyRecords,
  canonical,
  latestRecords,
  validateBatch,
  type RecordVersion,
} from "../lib/integrations/records";
import { emptyAnalytics } from "../lib/server/workspace";
import {
  invoiceIssues,
  invoiceSchema,
  accountingCSV,
} from "../lib/integrations/accounting";
import { accountingPDF } from "../lib/integrations/pdf";
import { parseWorkbook, workbookTemplate } from "../lib/integrations/workbook";
import { validSignature } from "../lib/server/razorpay";
import { createHmac } from "node:crypto";
import { answerQuestion, type Dataset } from "../lib/business";
import { inventoryAnalytics, reconcileLedger } from "../lib/analytics";
const chat =
  "14/11/2026, 10:05 - Rakesh: Rate 180\n14/11/2026, 10:06 - Sharma: kal tak 5000 pakka\nUPI karunga";
const payment = (amount = 100) =>
  validateBatch([
    {
      kind: "payment_received",
      id: "PAY-001",
      date: "2026-11-14",
      party: "Sharma",
      amount,
    },
  ])[0];
describe("WhatsApp exports", () => {
  it("parses Android/iOS Hinglish exports while preserving multiline evidence", () => {
    expect(parseWhatsApp(chat)[1]).toMatchObject({
      date: "2026-11-14",
      speaker: "Sharma",
      text: "kal tak 5000 pakka\nUPI karunga",
    });
    expect(
      parseWhatsApp("[14/11/2026, 10:06:00 AM] Sharma: woh wala")[0].text,
    ).toBe("woh wala");
  });
  it("rejects impossible dates and files without messages", () => {
    expect(() => parseWhatsApp("31/02/2026, 10:00 - A: done")).toThrow(
      "Invalid",
    );
    expect(() => parseWhatsApp("random text")).toThrow("No WhatsApp");
  });
  it("reads only safe txt entries and rejects zip bombs", async () => {
    const files = await readChatExport(
      zipSync({
        "_chat.txt": strToU8(chat),
        "photo.jpg": strToU8("ignored"),
        "../bad.txt": strToU8("bad"),
      }),
      "chat.zip",
    );
    expect(files).toEqual([{ name: "_chat.txt", text: chat }]);
    await expect(
      readChatExport(
        zipSync({ "chat.txt": new Uint8Array(5 * 1024 * 1024) }),
        "large.zip",
      ),
    ).rejects.toThrow("exceeds");
  });
});
describe("ledger sync and accounting", () => {
  it("requires permanent IDs and rejects duplicates, negatives and missing invoice due dates", () => {
    expect(() => validateBatch([payment(), payment()])).toThrow("Duplicate");
    expect(() => validateBatch([{ ...payment(), amount: -1 }])).toThrow();
    expect(() =>
      validateBatch([
        {
          kind: "sales_invoice",
          id: "INV-1",
          date: "2026-11-14",
          party: "X",
          amount: 500,
        },
      ]),
    ).toThrow();
  });
  it("keeps revisions and makes a void remove the old economic effect", () => {
    const a = payment(100),
      b = payment(200),
      voided = { ...b, status: "void" as const };
    const versions: RecordVersion[] = [a, b, voided].map((payload, i) => ({
      kind: payload.kind,
      record_id: payload.id,
      payload,
      revision: i + 1,
      created_at: "2026-11-14",
    }));
    expect(latestRecords(versions)).toEqual([voided]);
    const base = applyRecords(emptyAnalytics(), [a]);
    expect(
      applyRecords(base, latestRecords(versions)).customerPayments,
    ).toEqual([]);
    expect(versions).toHaveLength(3);
    expect(canonical(a)).not.toBe(canonical(b));
  });
  it("recalculates balances without double-counting a repeated payment", () => {
    const invoice = validateBatch([
      {
        kind: "sales_invoice",
        id: "INV-1",
        date: "2026-11-01",
        due_date: "2026-11-10",
        party: "Sharma",
        amount: 500,
      },
    ])[0];
    let data = applyRecords(emptyAnalytics(), [invoice, payment()]);
    data = applyRecords(data, [payment()]);
    expect(
      reconcileLedger(data.customerInvoices, data.customerPayments)[0]
        .outstanding,
    ).toBe(400);
  });
  it("uses an owner snapshot as stock evidence without adding unreceived orders", () => {
    const rows = validateBatch([
      {
        kind: "inventory",
        id: "SKU-1",
        sku: "SKU-1",
        date: "2026-11-14",
        name: "Cotton",
        unit: "m",
        qty: 13,
        cost_price: 50,
        reorder_level: 20,
        weekly_sales: 10,
      },
    ]);
    const data = applyRecords(emptyAnalytics(), rows);
    const stock = inventoryAnalytics(data);
    expect(stock.items[0]).toMatchObject({
      stock: 13,
      stockValue: 650,
      weeksCover: 1.3,
      status: "LOW",
    });
  });
  it("handles an empty connected ledger in the original Ask interface", () => {
    const data: Dataset = {
      invoices: [],
      payments: [],
      quotes: [],
      customers: [],
      products: [],
      promises: [],
      chats: [],
    };
    expect(answerQuestion("highest outstanding", data).title).toBe(
      "No recorded customer balances",
    );
  });
  it("round trips the actual workbook template and rejects formulas", async () => {
    const bytes = await workbookTemplate();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    book
      .getWorksheet("PaymentsReceived")!
      .addRow(["PAY-001", "2026-11-14", "Sharma", 100, "", "active"]);
    const parsed = await parseWorkbook(
      new Uint8Array(await book.xlsx.writeBuffer()),
    );
    expect(parsed[0]).toMatchObject({ id: "PAY-001", amount: 100 });
    book.getWorksheet("PaymentsReceived")!.getCell("D2").value = {
      formula: "1+1",
      result: 2,
    };
    await expect(
      parseWorkbook(new Uint8Array(await book.xlsx.writeBuffer())),
    ).rejects.toThrow("formulas");
  });
  it("flags inconsistent taxes and neutralizes spreadsheet formula injection", async () => {
    const details = invoiceSchema.parse({
      invoice_number: "INV-1",
      party: '=HYPERLINK("bad")',
      date: "2026-11-14",
      gstin: null,
      taxable_value: 100,
      cgst: 9,
      sgst: 9,
      igst: 0,
      total: 110,
      evidence: "Invoice 1",
    });
    expect(invoiceIssues({ ...details, currency: "INR", total: 118 })).toEqual(
      [],
    );
    expect(invoiceIssues(details)).toContain(
      "Taxable value plus taxes does not match total.",
    );
    const docs = [
      {
        id: "1",
        name: "invoice.pdf",
        kind: "Sales invoice" as const,
        created_at: "2026-11-14",
        details,
        reviewed: false,
      },
    ];
    expect(accountingCSV(docs)).toContain("'=HYPERLINK");
    expect(
      new TextDecoder().decode((await accountingPDF(docs)).slice(0, 5)),
    ).toBe("%PDF-");
  });
  it("checks webhook HMACs including invalid length without throwing", () => {
    const signature = createHmac("sha256", "secret")
      .update("body")
      .digest("hex");
    expect(validSignature("body", signature, "secret")).toBe(true);
    expect(validSignature("tampered", signature, "secret")).toBe(false);
    expect(validSignature("body", "bad", "secret")).toBe(false);
  });
});
