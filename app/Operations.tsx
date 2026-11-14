"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  qualifyStock,
  inventoryPlan,
  supplierAnalytics,
  type AnalyticsData,
  type PartyLedger,
} from "../lib/analytics";
import { money } from "../lib/business";
import { SupplierVisuals, InventoryVisuals } from "./Charts";
import CatalogControls from "./CatalogControls";
import { AppIcon } from "./ui";
import { z } from "zod";
import {
  attributeSchema,
  attributesFor,
  filterInventory,
  emptyFilters,
  type ProductAttributes,
  type CatalogFilters,
} from "../lib/catalog";

export type OperationsData = AnalyticsData & {
  supplierChats?: { supplier: string; text: string }[];
  workspaceId?: string;
};
type Props = {
  data: OperationsData;
  onDraft: (name: string, text: string, kind: "Supplier" | "Purchase") => void;
};
function Table({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th scope="col" key={c}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">No matching records.</div>}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const label =
    value === "potentially_missed"
      ? "Potentially missed"
      : value.replaceAll("_", " ");
  return (
    <span className={`ops-badge status-${value.toLowerCase()}`}>
      {label}
      {value === "potentially_missed" && <b> · Review</b>}
    </span>
  );
}
function downloadCSV(name: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const blob = new Blob(
    ["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function OperationsOverview({
  data,
  onOpen,
}: {
  data: OperationsData;
  onOpen: (page: "Suppliers" | "Inventory & growth") => void;
}) {
  const plan = useMemo(() => inventoryPlan(data), [data]);
  const focus = plan.focus;
  const cash = plan.cash;
  const positionMax = Math.max(
    focus?.targetStock ?? 0,
    focus?.afterInbound ?? 0,
    1,
  );
  return (
    <div className="daily-brief">
      <section className="stock-brief">
        <div className="brief-title-row">
          <h2>The next move is in your stock.</h2>
          {focus && (
            <span
              className="quantity-band"
              data-band={qualifyStock(
                focus.stock,
                focus.reorderLevel,
                focus.weeksCover,
              )}
            >
              {qualifyStock(focus.stock, focus.reorderLevel, focus.weeksCover)}
            </span>
          )}
        </div>
        <div className="brief-product">
          <span className="product-code">{focus?.sku || "—"}</span>
          <div>
            <h3>{focus?.name || "Review your stock plan"}</h3>
            <p>
              {focus
                ? `${focus.weeksCover?.toFixed(1)} weeks on hand · ${focus.supplier?.name || "Supplier not assigned"}`
                : "No low-stock product with observed sales is selected."}
            </p>
          </div>
        </div>
        {focus && (
          <>
            <div className="stock-position-labels">
              <span>
                <i className="on-hand-dot" /> On hand{" "}
                <strong>
                  {focus.stock} {focus.unit}
                </strong>
              </span>
              <span>
                <i className="inbound-dot" /> Incoming{" "}
                <strong>
                  {focus.openPoQty} {focus.unit}
                </strong>
              </span>
            </div>
            <div
              className="stock-position"
              aria-label={`${focus.stock} ${focus.unit} on hand, ${focus.openPoQty} incoming, target ${focus.targetStock}`}
            >
              <span
                className="position-on-hand"
                style={{
                  width: `${((focus.stock ?? 0) / positionMax) * 100}%`,
                }}
              />
              <span
                className="position-inbound"
                style={{ width: `${(focus.openPoQty / positionMax) * 100}%` }}
              />
              <span
                className="position-target"
                style={{ left: `${(focus.targetStock / positionMax) * 100}%` }}
              />
            </div>
            <div className="stock-position-caption">
              <span>Available now</span>
              <span>
                6-week target: {focus.targetStock} {focus.unit}
              </span>
            </div>
            <div className="brief-decision">
              <AppIcon name={focus.delayed ? "alert" : "check"} size={19} />
              <p>
                {focus.delayed
                  ? "The restock delivery is delayed. Confirm its arrival before placing another order."
                  : focus.openPoQty > 0
                    ? "Stock is already on order. Confirm the delivery before buying more."
                    : "Review the measured top-up before committing to a purchase."}
              </p>
            </div>
          </>
        )}
        <div className="brief-actions">
          <button
            className="primary"
            onClick={() => onOpen("Inventory & growth")}
          >
            Open inventory plan <AppIcon name="arrow" size={16} />
          </button>
          <button className="text-btn" onClick={() => onOpen("Suppliers")}>
            Review supplier <AppIcon name="external" size={14} />
          </button>
        </div>
      </section>
      <section className="cash-brief">
        <h2>Before the next commitment</h2>
        <p className="cash-brief-period">Today through {cash.through}</p>
        <div className="cash-brief-row">
          <span>Supplier invoices falling due</span>
          <strong>{money(cash.supplierDuesNext14Days)}</strong>
        </div>
        <div className="cash-brief-row">
          <span>Possible customer inflow</span>
          <strong>{money(cash.expectedPromiseInflow)}</strong>
        </div>
        <div className="cash-gap">
          <span>Potential gap</span>
          <strong>{money(cash.shortfall)}</strong>
        </div>
        <p className="cash-brief-note">
          Customer promises are uncertain. This excludes your opening bank
          balance and already-overdue supplier dues.
        </p>
        <button className="inline-link" onClick={() => onOpen("Suppliers")}>
          Inspect the due invoices <AppIcon name="arrow" size={15} />
        </button>
      </section>
    </div>
  );
}
export function SupplierSheet({ data, onDraft }: Props) {
  const a = useMemo(() => supplierAnalytics(data), [data]);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<PartyLedger | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const supplierInfo = (party: string) =>
    data.suppliers.find((s) => s.name === party);
  const filtered = a.ledger
    .filter((s) =>
      `${s.party} ${supplierInfo(s.party)?.city}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter(
      (s) =>
        filter === "All" ||
        (filter === "Overdue" && s.overdue > 0) ||
        (filter === "Delivery risk" &&
          a.delayedPOs.some((po) => po.supplier === s.party)),
    );
  function draft(name: string) {
    const pos = a.deliveries.filter(
      (p) => p.supplier === name && p.actualDelivery === null,
    );
    const text = pos.length
      ? `Namaste ${supplierInfo(name)?.contact || "ji"}, ${pos.map((p) => p.id).join(", ")} ki delivery ka update chahiye. Kripya confirmed dispatch date, ETA aur available quantity bata dein. Rakesh.`
      : `Namaste ${supplierInfo(name)?.contact || "ji"}, aapke saath stock aur pending invoices ka reconciliation karna hai. Kripya latest statement aur availability bhej dein. Rakesh.`;
    onDraft(name, text, "Supplier");
  }
  return (
    <>
      <SupplierVisuals
        data={data}
        onSelect={(name) =>
          setSelected(a.ledger.find((s) => s.party === name) ?? null)
        }
      />
      <div className="ops-stat-row">
        <div>
          <small>Supplier payables</small>
          <strong>{money(a.payables)}</strong>
        </div>
        <div>
          <small>Already overdue</small>
          <strong>{money(a.overdue)}</strong>
        </div>
        <div>
          <small>Due in next 14 days</small>
          <strong>{money(a.dueNext14Days.amount)}</strong>
        </div>
        <div>
          <small>Awaiting delivery</small>
          <strong>{a.openPOs.length + a.delayedPOs.length} POs</strong>
        </div>
      </div>
      <section className="panel supplier-sheet">
        <div className="supplier-sheet-banner">
          <AppIcon name="Suppliers" size={22} />
          <div>
            <strong>Purchase partners</strong>
            <span>
              Your supplier register · {data.suppliers.length} partners
            </span>
          </div>
        </div>
        <div className="section-head">
          <div>
            <h2>Supplier workspace sheet</h2>
            <p>
              Contacts, terms, commitments and balances in one place. Click a
              supplier to inspect the source rows.
            </p>
          </div>
          <button
            className="text-btn"
            onClick={() =>
              downloadCSV("flowchat-suppliers-v2.csv", [
                [
                  "Supplier",
                  "Contact",
                  "City",
                  "Credit days",
                  "SKUs",
                  "Payable",
                  "Overdue",
                  "Open PO IDs",
                  "Late deliveries",
                ],
                ...a.ledger.map((s) => [
                  s.party,
                  supplierInfo(s.party)?.contact || "",
                  supplierInfo(s.party)?.city || "",
                  supplierInfo(s.party)?.creditDays || 0,
                  supplierInfo(s.party)?.skus.join(" ") || "",
                  s.outstanding,
                  s.overdue,
                  a.deliveries
                    .filter(
                      (p) =>
                        p.supplier === s.party && p.actualDelivery === null,
                    )
                    .map((p) => p.id)
                    .join(" "),
                  a.reliability.find((r) => r.name === s.party)?.lateCount || 0,
                ]),
              ])
            }
          >
            Download supplier sheet
          </button>
        </div>
        <div className="sheet-toolbar">
          <input
            className="search"
            aria-label="Search suppliers"
            placeholder="Find a supplier or city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="tabs">
            {["All", "Overdue", "Delivery risk"].map((f) => (
              <button
                className={filter === f ? "selected" : ""}
                key={f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <Table
          columns={[
            "SUPPLIER / CONTACT",
            "CITY / TERMS",
            "PRODUCTS",
            "PAYABLE",
            "OVERDUE",
            "INCOMING POs",
            "LATE / RECEIVED",
            "ACTION",
          ]}
          rows={filtered.map((s) => {
            const info = supplierInfo(s.party),
              reliability = a.reliability.find((r) => r.name === s.party);
            return [
              <button
                key="name"
                className="supplier-name"
                onClick={() => setSelected(s)}
              >
                {s.party}
                <small>{info?.contact}</small>
              </button>,
              <span key="city">
                {info?.city}
                <small>{info?.creditDays} days credit</small>
              </span>,
              info?.skus.join(", "),
              money(s.outstanding),
              money(s.overdue),
              a.deliveries
                .filter(
                  (p) => p.supplier === s.party && p.actualDelivery === null,
                )
                .map((p) => (
                  <div key={p.id} className="po-cell">
                    <span>{p.id}</span>
                    <Status value={p.status} />
                  </div>
                )),
              `${reliability?.lateCount ?? 0} / ${reliability?.receivedCount ?? 0}`,
              <button
                key="draft"
                className="text-btn"
                onClick={() => draft(s.party)}
              >
                Draft follow-up <AppIcon name="external" size={14} />
              </button>,
            ];
          })}
        />
        <p className="methodology">
          Payables use supplier-wise FIFO. “Late / received” counts historical
          delivered POs, not a predictive supplier score. All figures are as of
          14 Nov 2026.
        </p>
      </section>
      <div className="ops-overview">
        <section className="panel delivery-board">
          <div className="section-head">
            <div>
              <h2>Delivery watch</h2>
              <p>Arrivals that deserve a closer look.</p>
            </div>
            <span className="delivery-board-count">
              {a.deliveries.filter((po) => po.status !== "on_time").length}
            </span>
          </div>
          <div className="delivery-card-list">
            {a.deliveries
              .filter((po) => po.status !== "on_time")
              .map((po) => (
                <button
                  key={po.id}
                  className={`delivery-watch-card delivery-${po.status}`}
                  onClick={() =>
                    setSelected(
                      a.ledger.find((s) => s.party === po.supplier) ?? null,
                    )
                  }
                >
                  <span className="delivery-watch-line" />
                  <div>
                    <div className="delivery-watch-header">
                      <strong>{po.id}</strong>
                      <Status value={po.status} />
                    </div>
                    <span className="delivery-supplier">{po.supplier}</span>
                    <div className="delivery-dates">
                      <span>
                        Original ETA<b>{po.promisedDate}</b>
                      </span>
                      <span className="delivery-date-arrow">
                        <AppIcon name="arrow" size={15} />
                      </span>
                      <span>
                        {po.actualDelivery
                          ? "Arrived"
                          : po.revisedPromisedDate
                            ? "Revised ETA"
                            : "Awaiting arrival"}
                        <b>
                          {po.actualDelivery ||
                            po.revisedPromisedDate ||
                            "Not received"}
                        </b>
                      </span>
                    </div>
                  </div>
                  <span className="delivery-evidence-arrow">
                    <AppIcon name="external" size={16} />
                  </span>
                </button>
              ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>Our promises to suppliers</h2>
          </div>
          <Table
            columns={[
              "SUPPLIER / EXACT QUOTE",
              "PROMISED",
              "MATCHED PAID",
              "STATUS",
            ]}
            rows={a.ownerPromises.map((p) => [
              <button
                className="supplier-name"
                key="name"
                onClick={() =>
                  setSelected(a.ledger.find((s) => s.party === p.party) ?? null)
                }
              >
                {p.party}
                <small>“{p.quote}”</small>
              </button>,
              money(p.amount ?? 0),
              money(p.paid),
              <Status key="status" value={p.status} />,
            ])}
          />
          <p className="methodology">
            Prepared chat annotations checked against outgoing payments.
            Candidate matches require review.
          </p>
        </section>
      </div>
      <dialog
        aria-label="Supplier evidence"
        className="ops-dialog"
        ref={dialog}
        onCancel={() => setSelected(null)}
      >
        <button
          className="close"
          aria-label="Close supplier evidence"
          onClick={() => setSelected(null)}
        >
          <AppIcon name="close" size={20} />
        </button>
        {selected && (
          <>
            <h2>{selected.party}</h2>
            <p>
              {money(selected.billed)} invoiced − {money(selected.paid)} paid ={" "}
              {money(selected.outstanding)} outstanding.
            </p>
            <h3>Invoices and exact payment allocations</h3>
            <Table
              columns={[
                "INVOICE",
                "DUE",
                "TOTAL",
                "REMAINING",
                "MATCHED PAYMENT IDS",
              ]}
              rows={selected.invoices.map((i) => [
                i.id,
                i.dueDate,
                money(i.total),
                money(i.remaining),
                i.allocations
                  .map((x) => `${x.paymentId}: ${money(x.amount)}`)
                  .join("; ") || "None",
              ])}
            />
            <h3>Outgoing payment rows</h3>
            <Table
              columns={["PAYMENT", "DATE", "AMOUNT"]}
              rows={selected.payments.map((p) => [
                p.id,
                p.date,
                money(p.amount),
              ])}
            />
            <h3>Purchase orders</h3>
            <Table
              columns={["PO", "ORIGINAL DUE", "ACTUAL", "REVISED", "STATUS"]}
              rows={a.deliveries
                .filter((p) => p.supplier === selected.party)
                .map((p) => [
                  p.id,
                  p.promisedDate,
                  p.actualDelivery || "Not received",
                  p.revisedPromisedDate || "None",
                  <Status key="status" value={p.status} />,
                ])}
            />
            <h3>Owner promise evidence</h3>
            {a.ownerPromises
              .filter((p) => p.party === selected.party)
              .map((p) => (
                <div className="supplier-promise" key={p.id}>
                  <blockquote>“{p.quote}”</blockquote>
                  <p>
                    Made {p.madeOn} · Due {p.promisedDate} ·{" "}
                    {money(p.amount ?? 0)}
                  </p>
                  <Status value={p.status} />
                  <p>
                    Matched:{" "}
                    {p.evidence
                      .map(
                        (pay) =>
                          `${pay.id} (${pay.date}): ${money(pay.amount)}`,
                      )
                      .join("; ") || "No payment within configured window"}
                  </p>
                </div>
              ))}
            <details>
              <summary>Original supplier chat</summary>
              <pre className="supplier-source">
                {data.supplierChats?.find((c) => c.supplier === selected.party)
                  ?.text || "Chat not available in this view"}
              </pre>
            </details>
            <button
              className="primary"
              onClick={() => {
                draft(selected.party);
                setSelected(null);
              }}
            >
              Draft supplier follow-up <AppIcon name="arrow" size={14} />
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
export function InventoryGrowth({ data, onDraft }: Props) {
  const [weeks, setWeeks] = useState(6),
    [selectedSku, setSelectedSku] = useState<string | null>(null);
  const plan = useMemo(() => inventoryPlan(data, weeks), [data, weeks]);
  const [filters, setFilters] = useState<CatalogFilters>(emptyFilters),
    [attributes, setAttributes] = useState<ProductAttributes[]>(
      data.productAttributes ?? [],
    ),
    [catalogReady, setCatalogReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(
        data.workspaceId
          ? `flowchat-catalog-v1:${data.workspaceId}`
          : "flowchat-catalog-v1",
      );
      if (raw) setAttributes(z.array(attributeSchema).parse(JSON.parse(raw)));
    } catch {
      /* Use the supplied catalog if local edits are invalid. */
    }
    setCatalogReady(true);
  }, []);
  useEffect(() => {
    if (catalogReady)
      try {
        localStorage.setItem(
          data.workspaceId
            ? `flowchat-catalog-v1:${data.workspaceId}`
            : "flowchat-catalog-v1",
          JSON.stringify(attributes),
        );
      } catch {
        /* Session remains usable when browser storage is unavailable. */
      }
  }, [attributes, catalogReady]);
  const qualified = plan.items.map((i) => ({
    ...i,
    quantityBand: qualifyStock(i.stock, i.reorderLevel, i.weeksCover),
  }));
  const visibleItems = filterInventory(qualified, attributes, filters);
  const visiblePriorities = plan.priorities.filter((p) =>
    visibleItems.some((i) => i.sku === p.sku),
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = plan.items.find((i) => i.sku === selectedSku);
  useEffect(() => {
    if (selectedSku) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selectedSku]);
  const focus = visiblePriorities[0];
  function draft(sku: string) {
    const item = plan.items.find((i) => i.sku === sku);
    if (!item) return;
    const supplier = item.supplier?.name || "Supplier";
    const text =
      item.openPoQty > 0
        ? `Namaste ${item.supplier?.contact || "ji"}, ${item.name} (${item.sku}) ke ${item.openPoQty} ${item.unit} already order par hain (${item.poEvidence.map((p) => p.id).join(", ")}). Current stock ${item.stock} ${item.unit} hai. Kripya quantity aur dispatch ETA confirm karein. Yeh naya order nahi hai. Rakesh.`
        : `Namaste ${item.supplier?.contact || "ji"}, ${item.name} (${item.sku}) ke ${item.incrementalQty} ${item.unit} ki availability aur best rate bata dein. Yeh sirf quotation request hai; order owner approval aur cash review ke baad confirm hoga. Rakesh.`;
    onDraft(supplier, text, "Purchase");
  }
  return (
    <>
      <section className="growth-intro panel">
        <div>
          <h2>
            {focus
              ? `Focus on ${focus.name}.`
              : "Review the selected catalog segment."}
          </h2>
          <p>
            {focus
              ? `Highest indicative sales contribution among low-stock products in the last 56 days: ${money(focus.indicativeContribution ?? 0)}. ${focus.action}. ${focus.incrementalQty === 0 ? "Its existing PO covers the chosen target, so do not duplicate the order." : ""}`
              : "Review stock cover, sales contribution and inbound orders before increasing purchasing."}
          </p>
          <button
            className="primary"
            disabled={!focus}
            onClick={() => focus && setSelectedSku(focus.sku)}
          >
            See why this product <AppIcon name="arrow" size={14} />
          </button>
        </div>
        <div className="scenario-control">
          <label htmlFor="target-weeks">
            Planning target <strong>{weeks} weeks</strong>
          </label>
          <input
            id="target-weeks"
            type="range"
            min="3"
            max="12"
            step="1"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
          />
          <small>Scenario assumption, not a demand forecast.</small>
          <strong className="scenario-cost">
            {money(
              visibleItems.reduce((s, i) => s + (i.indicativeCost ?? 0), 0),
            )}
          </strong>
          <small>Indicative cost of all extra top-ups · before GST</small>
        </div>
      </section>
      <div className="ops-stat-row">
        <div>
          <small>Stock valued at current cost</small>
          <strong>
            {money(visibleItems.reduce((s, i) => s + (i.stockValue ?? 0), 0))}
          </strong>
        </div>
        <div>
          <small>Products below reorder level</small>
          <strong>
            {visibleItems.filter((i) => i.status === "LOW").length} SKUs
          </strong>
        </div>
        <div>
          <small>Capital in overstock</small>
          <strong>
            {money(
              visibleItems
                .filter((i) => i.status === "OVERSTOCK")
                .reduce((s, i) => s + (i.stockValue ?? 0), 0),
            )}
          </strong>
        </div>
        <div>
          <small>Business-wide 14-day cash gap</small>
          <strong>{money(plan.cash.shortfall)}</strong>
        </div>
      </div>
      <CatalogControls
        attributes={attributes}
        filters={filters}
        onFilter={setFilters}
        onSave={setAttributes}
        shown={visibleItems.length}
        total={plan.items.length}
      />
      <InventoryVisuals
        data={data}
        weeks={weeks}
        onSelect={setSelectedSku}
        filters={filters}
        attributes={attributes}
        onBandSelect={(band) =>
          setFilters((prev) => ({
            ...prev,
            band: prev.band === band ? "All" : band,
          }))
        }
        onAttributeFilter={(key, value) =>
          setFilters((prev) => ({ ...prev, [key]: value }))
        }
      />
      <div className="stock-priority-grid">
        {visiblePriorities.map((p, index) => (
          <section className="panel priority-card" key={p.sku}>
            <div className="priority-rank">
              PRIORITY {index + 1} <Status value={p.status} />
            </div>
            <h3>{p.name}</h3>
            <p>
              {p.sku} · {p.weeksCover?.toFixed(1)} weeks of current cover
            </p>
            <div className="priority-numbers">
              <div>
                <small>On hand</small>
                <strong>
                  {p.stock} {p.unit}
                </strong>
              </div>
              <div>
                <small>Already ordered</small>
                <strong>
                  {p.openPoQty} {p.unit}
                </strong>
              </div>
            </div>
            <div className="priority-action">{p.action}</div>
            <p>
              {p.delayed
                ? `Delayed: ${p.poEvidence
                    .filter((po) => po.status === "delayed")
                    .map((po) => po.id)
                    .join(", ")}. `
                : ""}
              Extra buy at {weeks}-week target:{" "}
              <strong>
                {p.incrementalQty} {p.unit}
              </strong>
              .
            </p>
            <div className="priority-buttons">
              <button
                className="text-btn"
                onClick={() => setSelectedSku(p.sku)}
              >
                Evidence
              </button>
              <button className="primary" onClick={() => draft(p.sku)}>
                {p.openPoQty > 0 ? "Chase delivery" : "Draft quote request"}{" "}
                <AppIcon name="external" size={14} />
              </button>
            </div>
          </section>
        ))}
      </div>
      <section className="panel inventory-workbench">
        <div className="inventory-workbench-banner">
          <span>Stock planning sheet</span>
          <strong>{weeks}-week target</strong>
        </div>
        <div className="section-head">
          <div>
            <h2>Inventory planning sheet</h2>
            <p>
              Extra buy deducts all incoming quantities, including delayed POs.
              Verify supplier ETAs first.
            </p>
          </div>
          <button
            className="text-btn"
            onClick={() =>
              downloadCSV("flowchat-stock-plan.csv", [
                [
                  "SKU",
                  "Product",
                  "Status",
                  "Stock",
                  "Unit",
                  "Weekly demand",
                  "Open PO qty",
                  "Target weeks",
                  "Target stock",
                  "Extra buy",
                  "Indicative cost",
                  "Action",
                ],
                ...visibleItems.map((i) => [
                  i.sku,
                  i.name,
                  i.quantityBand,
                  i.stock ?? "Unverified",
                  i.unit,
                  i.weeklyDemand,
                  i.openPoQty,
                  weeks,
                  i.targetStock,
                  i.incrementalQty ?? "Unverified",
                  i.indicativeCost ?? "Unverified",
                  i.action,
                ]),
              ])
            }
          >
            Download stock plan
          </button>
        </div>
        <Table
          columns={[
            "PRODUCT / CATALOG",
            "QUANTITY BAND",
            "ON HAND / COVER",
            "SALES: 56 DAYS",
            "CONTRIBUTION*",
            "INCOMING",
            "TARGET STOCK",
            "EXTRA BUY",
            "NEXT ACTION",
          ]}
          rows={visibleItems.map((i) => [
            <button
              key="p"
              className="supplier-name"
              onClick={() => setSelectedSku(i.sku)}
            >
              {i.name}
              <small>
                {i.sku} · {i.supplier?.name}
              </small>
              <small>
                {attributesFor(i.sku, attributes).category} ·{" "}
                {attributesFor(i.sku, attributes).fabric} ·{" "}
                {attributesFor(i.sku, attributes).color} ·{" "}
                {attributesFor(i.sku, attributes).gender}
              </small>
            </button>,
            <div key="s">
              <span className="quantity-band" data-band={i.quantityBand}>
                {i.quantityBand}
              </span>
              <small>Policy: {i.status}</small>
            </div>,
            <span key="stock">
              {i.stock ?? "Unknown"} {i.unit}
              <small>
                Reorder: {i.reorderLevel ?? "Unknown"} {i.unit}
              </small>
              <small>{i.weeksCover?.toFixed(1) ?? "Unknown"} weeks cover</small>
            </span>,
            <span key="sales">
              {i.unitsSold} {i.unit}
              <small>{money(i.revenue)} ex GST</small>
            </span>,
            i.indicativeContribution === null
              ? "Unverified"
              : money(i.indicativeContribution),
            `${i.openPoQty} ${i.unit}`,
            `${i.targetStock} ${i.unit}`,
            <span key="buy">
              {i.incrementalQty ?? "Unknown"} {i.unit}
              <small>
                {i.indicativeCost === null
                  ? "Unverified"
                  : money(i.indicativeCost)}{" "}
                est. before GST
              </small>
            </span>,
            <span key="a">
              {i.action}
              {i.needsCashReview && (
                <small className="cash-warning">Cash review required</small>
              )}
            </span>,
          ])}
        />
        <div className="quantity-rules">
          <strong>On-hand quantity rules</strong>
          <p>
            Out of stock = 0. Critical = below 50% of reorder level. Low = below
            reorder level. Adequate = at or above reorder level with less than
            12 weeks cover. Excess = at least 12 weeks cover. Unknown inputs =
            Unverified. Incoming POs are not available stock.
          </p>
        </div>
        <p className="methodology">{plan.methodology}</p>
        <p className="methodology">
          Current cash gap: {money(plan.cash.shortfall)}. Top-up quantities are
          scenarios, not approved orders. Received stock, bank balance, supplier
          availability and actual lead times need confirmation before
          purchasing.
        </p>
      </section>
      <section className="panel">
        <h2 className="future-heading">
          A daily trading copilot, beyond collections.
        </h2>
        <div className="future-grid">
          {[
            {
              stage: "WORKING NOW",
              title: "Connected stock decisions",
              text: "Sales, on-hand stock, open orders and supplier dues combine into an evidence-backed stock plan.",
            },
            {
              stage: "NEXT · NEEDS PILOT DATA",
              title: "Reorder timing & lead times",
              text: "Measure delivery variability, set safety-stock targets, and alert before the next shortage. Not a trained forecast yet.",
            },
            {
              stage: "NEXT · NEEDS VALIDATION",
              title: "Demand & assortment planning",
              text: "Compare product contribution and repeat orders, then test seasonal forecasts against actual demand.",
            },
            {
              stage: "ROADMAP",
              title: "Supplier options & purchase approvals",
              text: "Compare quotes and reliability, propose a supplier switch, and let the owner approve purchase and payment commitments.",
            },
          ].map((f) => (
            <div key={f.title}>
              <h3>{f.title}</h3>
              <span className="roadmap-stage">{f.stage}</span>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>
      <dialog
        aria-label="Stock and product evidence"
        className="ops-dialog"
        ref={dialog}
        onCancel={() => setSelectedSku(null)}
      >
        <button
          className="close"
          aria-label="Close stock evidence"
          onClick={() => setSelectedSku(null)}
        >
          <AppIcon name="close" size={20} />
        </button>
        {selected && (
          <>
            <h2>
              {selected.name} · {selected.sku}
            </h2>
            <p>
              {selected.action}. Target {selected.targetStock} − stock{" "}
              {selected.stock} − incoming {selected.openPoQty} ={" "}
              {selected.incrementalQty} extra units after flooring at zero.
            </p>
            <h3>Why focus here?</h3>
            <p>
              Products below reorder level are ranked by 56-day sales
              contribution at current cost, not by mixing metres and pieces.{" "}
              {money(selected.revenue)} revenue − {selected.unitsSold} ×{" "}
              {money(selected.costPrice ?? 0)} current unit cost ={" "}
              {selected.indicativeContribution === null
                ? "unverified"
                : money(selected.indicativeContribution)}{" "}
              indicative contribution. This is not audited profit.
            </p>
            <h3>
              Sales source: {plan.windowStart} → {plan.asOf}
            </h3>
            <Table
              columns={["INVOICE", "CUSTOMER", "DATE", "QTY", "RATE", "AMOUNT"]}
              rows={selected.salesEvidence.map((s) => [
                s.invoiceId,
                s.customer,
                s.date,
                s.qty,
                money(s.rate),
                money(s.amount),
              ])}
            />
            <h3>Incoming purchase orders</h3>
            <Table
              columns={[
                "PO",
                "SUPPLIER",
                "QTY",
                "ORIGINAL DUE",
                "REVISED",
                "STATUS",
              ]}
              rows={selected.poEvidence.map((po) => [
                po.id,
                po.supplier,
                data.purchaseLines
                  .filter((l) => l.poId === po.id && l.sku === selected.sku)
                  .reduce((s, l) => s + l.qty, 0),
                po.promisedDate,
                po.revisedPromisedDate || "None",
                <Status key="s" value={po.status} />,
              ])}
            />
            <h3>Stock movement evidence</h3>
            <Table
              columns={["DATE", "TYPE", "QTY", "REFERENCE", "RUNNING STOCK"]}
              rows={selected.movementEvidence.map((m) => [
                m.date,
                m.type,
                m.qty,
                m.reference,
                m.balance,
              ])}
            />
            <button
              className="primary"
              disabled={
                selected.openPoQty === 0 && (selected.incrementalQty ?? 0) === 0
              }
              onClick={() => {
                draft(selected.sku);
                setSelectedSku(null);
              }}
            >
              Draft supplier request <AppIcon name="arrow" size={14} />
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
