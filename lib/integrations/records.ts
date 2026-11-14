import { z } from "zod";
import type { AnalyticsData } from "../analytics";
const amount = z.number().finite().nonnegative().max(1e12);
export const recordSchema = z
  .object({
    kind: z.enum([
      "inventory",
      "payment_received",
      "payment_sent",
      "sales_invoice",
      "purchase_invoice",
    ]),
    id: z.string().trim().min(1).max(120),
    date: z.iso.date(),
    party: z.string().trim().max(160).default(""),
    amount: amount.optional(),
    due_date: z.iso.date().nullable().default(null),
    status: z.enum(["active", "void"]).default("active"),
    sku: z.string().trim().max(100).default(""),
    name: z.string().trim().max(160).default(""),
    qty: amount.optional(),
    reorder_level: amount.nullable().default(null),
    cost_price: amount.nullable().default(null),
    weekly_sales: amount.nullable().default(null),
    unit: z.string().max(20).default(""),
    category: z.string().max(80).default("Unspecified"),
    fabric: z.string().max(80).default("Unspecified"),
    color: z.string().max(80).default("Unspecified"),
    gender: z
      .enum(["Men", "Women", "Unisex", "Kids", "Not applicable", "Unspecified"])
      .default("Unspecified"),
  })
  .strict()
  .superRefine((r, c) => {
    if (r.kind === "inventory" && (r.qty === undefined || !r.unit))
      c.addIssue({
        code: "custom",
        message: "Inventory needs explicit qty and unit",
      });
    if (r.kind !== "inventory" && r.amount === undefined)
      c.addIssue({
        code: "custom",
        message: "Financial records need an explicit amount",
      });
    if (r.kind === "inventory" && (!r.sku || r.id !== r.sku))
      c.addIssue({ code: "custom", message: "Inventory needs a SKU" });
    if (
      ["sales_invoice", "purchase_invoice"].includes(r.kind) &&
      r.due_date === null
    )
      c.addIssue({ code: "custom", message: "Invoice due_date is required" });
    if (r.kind !== "inventory" && !r.party)
      c.addIssue({ code: "custom", message: "Financial records need a party" });
  })
  .transform((r) => ({ ...r, qty: r.qty ?? 0, amount: r.amount ?? 0 }));
export type SyncRecord = z.infer<typeof recordSchema>;
export type RecordVersion = {
  kind: SyncRecord["kind"];
  record_id: string;
  revision: number;
  payload: SyncRecord;
  created_at: string;
};
export function canonical(record: SyncRecord) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}
export function validateBatch(input: unknown): SyncRecord[] {
  const rows = z.array(recordSchema).min(1).max(5000).parse(input);
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key))
      throw new Error(`Duplicate transaction ID in workbook: ${key}`);
    seen.add(key);
  }
  return rows;
}
export function latestRecords(versions: RecordVersion[]): SyncRecord[] {
  const map = new Map<string, RecordVersion>();
  for (const v of versions) {
    const key = `${v.kind}:${v.record_id}`;
    if (!map.has(key) || map.get(key)!.revision < v.revision) map.set(key, v);
  }
  return [...map.values()].map((v) => v.payload);
}
export function applyRecords(
  base: AnalyticsData,
  rows: SyncRecord[],
  source = "Excel",
): AnalyticsData {
  const active = rows.filter((r) => r.status === "active");
  const invoice = (kind: SyncRecord["kind"]) =>
    active
      .filter((r) => r.kind === kind)
      .map((r) => ({
        id: r.id,
        party: r.party,
        date: r.date,
        dueDate: r.due_date,
        total: r.amount,
        source: { file: source, id: r.id },
      }));
  const payment = (kind: SyncRecord["kind"]) =>
    active
      .filter((r) => r.kind === kind)
      .map((r) => ({
        id: r.id,
        party: r.party,
        date: r.date,
        amount: r.amount,
        source: { file: source, id: r.id },
      }));
  const merge = <T>(
    old: T[],
    fresh: T[],
    key: (r: T) => string,
    kind: SyncRecord["kind"],
  ) => {
    const ids = new Set(rows.filter((r) => r.kind === kind).map((r) => r.id));
    return [...old.filter((r) => !ids.has(key(r))), ...fresh];
  };
  const inventory = active
    .filter((r) => r.kind === "inventory")
    .map((r) => ({
      sku: r.sku,
      name: r.name || r.sku,
      unit: r.unit,
      currentStock: r.qty,
      reorderLevel: r.reorder_level,
      costPrice: r.cost_price,
      avgWeeklySales: r.weekly_sales,
      reportedWeeksCover: r.weekly_sales ? r.qty / r.weekly_sales : null,
      supplierId: "",
      source: { file: source, id: r.id },
    }));
  return {
    ...base,
    stockMovements: [
      ...base.stockMovements.filter(
        (m) => !rows.some((r) => r.kind === "inventory" && r.sku === m.sku),
      ),
      ...active
        .filter((r) => r.kind === "inventory")
        .map((r) => ({
          id: `snapshot:${r.sku}`,
          sku: r.sku,
          date: r.date,
          type: "OPENING" as const,
          qty: r.qty,
          reference: `Owner snapshot ${r.id}`,
          reportedBalance: r.qty,
          source: { file: source, id: r.id },
        })),
    ],
    customerInvoices: merge(
      base.customerInvoices,
      invoice("sales_invoice"),
      (r) => r.id,
      "sales_invoice",
    ),
    supplierInvoices: merge(
      base.supplierInvoices,
      invoice("purchase_invoice"),
      (r) => r.id,
      "purchase_invoice",
    ),
    customerPayments: merge(
      base.customerPayments,
      payment("payment_received"),
      (r) => r.id,
      "payment_received",
    ),
    supplierPayments: merge(
      base.supplierPayments,
      payment("payment_sent"),
      (r) => r.id,
      "payment_sent",
    ),
    inventory: merge(base.inventory, inventory, (r) => r.sku, "inventory"),
    productAttributes: [
      ...(base.productAttributes || []).filter(
        (p) => !inventory.some((r) => r.sku === p.sku),
      ),
      ...active
        .filter((r) => r.kind === "inventory")
        .map((r) => ({
          sku: r.sku,
          category: r.category,
          fabric: r.fabric,
          color: r.color,
          gender: r.gender,
          provenance: "Owner Excel classification",
        })),
    ],
  };
}
