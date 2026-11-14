import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsData } from "../analytics";
import {
  applyRecords,
  latestRecords,
  type RecordVersion,
} from "../integrations/records";
import { checkDB, HttpError } from "./http";
export function emptyAnalytics(): AnalyticsData {
  return {
    salesLines: [],
    productAttributes: [],
    customerInvoices: [],
    customerPayments: [],
    supplierInvoices: [],
    supplierPayments: [],
    customerPromises: [],
    ownerPromises: [],
    purchaseOrders: [],
    purchaseLines: [],
    inventory: [],
    stockMovements: [],
    quotes: [],
    customers: [],
    suppliers: [],
  };
}
export async function workspaceRecords(db: SupabaseClient, businessId: string) {
  const versions: RecordVersion[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await db
      .from("current_record_versions")
      .select("kind,record_id,revision,payload,created_at")
      .eq("business_id", businessId)
      .order("kind")
      .order("record_id")
      .order("revision")
      .range(offset, offset + 999);
    checkDB(error);
    versions.push(...((data || []) as RecordVersion[]));
    if (!data || data.length < 1000) return latestRecords(versions);
  }
  throw new HttpError(
    413,
    "Workspace history needs server-side compaction before reading.",
  );
}
export async function workspaceAnalytics(
  db: SupabaseClient,
  businessId: string,
) {
  const rows = await workspaceRecords(db, businessId);
  const analytics = applyRecords(
    emptyAnalytics(),
    rows,
    "Connected Excel ledger",
  );
  analytics.customers = [
    ...new Set(
      [...analytics.customerInvoices, ...analytics.customerPayments].map(
        (r) => r.party,
      ),
    ),
  ].map((name) => ({ name, city: "" }));
  analytics.suppliers = [
    ...new Set(
      [...analytics.supplierInvoices, ...analytics.supplierPayments].map(
        (r) => r.party,
      ),
    ),
  ].map((name, i) => ({
    id: `supplier-${i}`,
    name,
    city: "",
    contact: "",
    creditDays: 0,
    skus: [],
  }));
  return { rows, analytics };
}
