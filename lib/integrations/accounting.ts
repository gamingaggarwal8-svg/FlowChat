import { z } from "zod";
export const invoiceSchema = z
  .object({
    invoice_number: z.string().max(120).nullable(),
    party: z.string().max(160).nullable(),
    date: z.iso.date().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .default(null),
    gstin: z
      .string()
      .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
      .nullable(),
    taxable_value: z.number().nonnegative().nullable(),
    cgst: z.number().nonnegative().nullable(),
    sgst: z.number().nonnegative().nullable(),
    igst: z.number().nonnegative().nullable(),
    total: z.number().nonnegative().nullable(),
    evidence: z.string().max(3000),
  })
  .strict();
export type InvoiceDetails = z.infer<typeof invoiceSchema>;
export const documentKinds = [
  "Sales invoice",
  "Purchase bill",
  "Payment receipt",
  "GST document",
] as const;
export type AccountingDocument = {
  id: string;
  name: string;
  kind: (typeof documentKinds)[number];
  created_at: string;
  details: InvoiceDetails | null;
  reviewed: boolean;
  storage_path?: string;
};
export function invoiceIssues(v: InvoiceDetails): string[] {
  const issues: string[] = [];
  if (v.currency !== "INR")
    issues.push(
      "Confirm INR currency before reviewing this invoice for the GST summary.",
    );
  if (!v.invoice_number || !v.party || !v.date || v.total === null)
    issues.push("Invoice number, party, date and total need review.");
  if (
    v.taxable_value !== null &&
    v.total !== null &&
    [v.cgst, v.sgst, v.igst].every((n) => n !== null)
  ) {
    const tax = Math.round(
      (v.taxable_value + v.cgst! + v.sgst! + v.igst!) * 100,
    );
    if (Math.abs(tax - Math.round(v.total * 100)) > 2)
      issues.push("Taxable value plus taxes does not match total.");
  }
  return issues;
}
export function csvSafe(value: unknown): string {
  const s = String(value ?? "");
  return `"${(/^[\s]*[=+@-]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`;
}
export function accountingCSV(docs: AccountingDocument[]): string {
  return [
    [
      "Document",
      "Type",
      "Invoice",
      "Party",
      "Date",
      "Currency",
      "Taxable",
      "CGST",
      "SGST",
      "IGST",
      "Total",
      "Review",
    ],
    ...docs.map((d) => [
      d.name,
      d.kind,
      d.details?.invoice_number,
      d.details?.party,
      d.details?.date,
      d.details?.currency,
      d.details?.taxable_value,
      d.details?.cgst,
      d.details?.sgst,
      d.details?.igst,
      d.details?.total,
      d.reviewed ? "Reviewed by owner" : "Needs review",
    ]),
  ]
    .map((r) => r.map(csvSafe).join(","))
    .join("\r\n");
}
