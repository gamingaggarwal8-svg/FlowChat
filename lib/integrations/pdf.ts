import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { AccountingDocument } from "./accounting";
export async function accountingPDF(docs: AccountingDocument[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]),
    y = 798;
  const line = (text: string) => {
    const safe = text.replace(/[^\x20-\x7E]/g, "?");
    for (let offset = 0; offset < safe.length; offset += 95) {
      if (y < 45) {
        page = pdf.addPage([595, 842]);
        y = 798;
      }
      page.drawText(safe.slice(offset, offset + 95), {
        x: 40,
        y,
        size: 10,
        font,
        color: rgb(0.1, 0.17, 0.27),
      });
      y -= 16;
    }
  };
  line("FlowChat - Accounting summary for CA review");
  line(`Generated: ${new Date().toISOString()}`);
  line(
    "Document currency is shown. Totals include owner-reviewed INR records only.",
  );
  line("Not a GST return, tax advice, or proof of automatic filing.");
  line("");
  const totals = new Map<string, number>();
  for (const d of docs) {
    line(
      `${d.kind} | ${d.name} | ${d.reviewed ? "Owner reviewed" : "NEEDS REVIEW"}`,
    );
    line(
      `Invoice: ${d.details?.invoice_number ?? "Unknown"} | Party: ${d.details?.party ?? "Unknown"} | Date: ${d.details?.date ?? "Unknown"}`,
    );
    line(
      `GSTIN: ${d.details?.gstin ?? "Unknown"} | Total ${d.details?.currency || "unknown currency"}: ${d.details?.total ?? "Unknown"}`,
    );
    line(
      `Taxable: ${d.details?.taxable_value ?? "?"} CGST: ${d.details?.cgst ?? "?"} SGST: ${d.details?.sgst ?? "?"} IGST: ${d.details?.igst ?? "?"}`,
    );
    line("");
    if (
      d.reviewed &&
      d.details?.currency === "INR" &&
      d.details?.total !== null &&
      d.details?.total !== undefined
    )
      totals.set(
        d.kind,
        (totals.get(d.kind) || 0) + Math.round(d.details.total * 100),
      );
  }
  for (const [kind, total] of totals)
    line(`Reviewed ${kind} total INR ${(total / 100).toFixed(2)}`);
  line(
    "Names unsupported by the PDF font are replaced with ?. CSV preserves original Unicode.",
  );
  return pdf.save();
}
