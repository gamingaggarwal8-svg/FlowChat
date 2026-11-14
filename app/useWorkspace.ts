"use client";
import { useEffect, useState } from "react";
import type { Dataset } from "../lib/business";
import type { OperationsData } from "./Operations";
import {
  applyRecords,
  latestRecords,
  type RecordVersion,
} from "../lib/integrations/records";
import { apiRequest, selectedBusiness } from "../lib/integrations/browser";
export function useWorkspace(demo: Dataset, base: OperationsData) {
  const [workspace, setWorkspace] = useState<{
    analytics: OperationsData | null;
    dataset: Dataset | null;
    businessId: string;
    label: string;
    error: string;
  }>({
    analytics: null,
    dataset: null,
    businessId: "",
    label: "Synthetic demo",
    error: "",
  });
  useEffect(() => {
    let active = true;
    let generation = 0;
    async function refresh() {
      const version = ++generation;
      const business = selectedBusiness();
      try {
        if (business) {
          const result = await apiRequest("/api/sync");
          if (!active || version !== generation) return;
          const analytics = result.analytics as OperationsData;
          const dataset: Dataset = {
            invoices: analytics.customerInvoices.map((i) => ({
              invoice_id: i.id,
              customer: i.party,
              date: i.date,
              due_date: i.dueDate!,
              total: i.total,
            })),
            payments: analytics.customerPayments.map((p) => ({
              payment_id: p.id,
              customer: p.party,
              date: p.date,
              amount: p.amount,
            })),
            customers: analytics.customers.map((c) => ({
              customer: c.name,
              city: c.city,
              credit_days: 0,
            })),
            products: [],
            promises: [],
            quotes: [],
            chats: [],
          };
          setWorkspace({
            analytics,
            dataset,
            businessId: business,
            label: "Connected Excel ledger",
            error: "",
          });
        } else {
          const versions = JSON.parse(
            localStorage.getItem("flowchat-local-record-versions") || "[]",
          ) as RecordVersion[];
          if (!active || version !== generation) return;
          if (!versions.length) {
            setWorkspace({
              analytics: null,
              dataset: null,
              businessId: "",
              label: "Synthetic demo",
              error: "",
            });
            return;
          }
          const analytics = applyRecords(
            base,
            latestRecords(versions),
            "Local workbook over synthetic demo",
          );
          const names = [
            ...new Set([
              ...demo.customers.map((c) => c.customer),
              ...analytics.customerInvoices.map((i) => i.party),
              ...analytics.customerPayments.map((p) => p.party),
            ]),
          ];
          setWorkspace({
            analytics,
            dataset: {
              ...demo,
              invoices: analytics.customerInvoices.map((i) => ({
                invoice_id: i.id,
                customer: i.party,
                date: i.date,
                due_date: i.dueDate!,
                total: i.total,
              })),
              payments: analytics.customerPayments.map((p) => ({
                payment_id: p.id,
                customer: p.party,
                date: p.date,
                amount: p.amount,
              })),
              customers: names.map(
                (customer) =>
                  demo.customers.find((c) => c.customer === customer) || {
                    customer,
                    city: "",
                    credit_days: 0,
                  },
              ),
            },
            businessId: "",
            label: "Local workbook + synthetic demo",
            error: "",
          });
        }
      } catch (e) {
        if (active && version === generation)
          setWorkspace({
            analytics: null,
            dataset: null,
            businessId: "",
            label: "Synthetic demo fallback",
            error: e instanceof Error ? e.message : "Workspace unavailable.",
          });
      }
    }
    void refresh();
    const listener = () => {
      void refresh();
    };
    window.addEventListener("flowchat-workspace", listener);
    window.addEventListener("storage", listener);
    const timer = window.setInterval(() => {
      if (selectedBusiness() && document.visibilityState === "visible")
        void refresh();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("flowchat-workspace", listener);
      window.removeEventListener("storage", listener);
    };
  }, [demo, base]);
  return workspace;
}
