"use client";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import {
  qualifyStock,
  groupStockCapital,
  customerAnalytics,
  inventoryAnalytics,
  inventoryPlan,
  supplierAnalytics,
  type AnalyticsData,
} from "../lib/analytics";
import { money } from "../lib/business";
import { AppIcon } from "./ui";
import {
  filterInventory,
  emptyFilters,
  type ProductAttributes,
  type CatalogFilters,
} from "../lib/catalog";

const colours = {
  blue: "#4368d6",
  violet: "#8562bd",
  teal: "#2c8b70",
  coral: "#c96858",
  amber: "#ba8a3f",
  slate: "#9aa9bd",
};
const compact = (n: number) =>
  n >= 100000
    ? `₹${(n / 100000).toFixed(1)}L`
    : n >= 1000
      ? `₹${Math.round(n / 1000)}k`
      : `₹${n}`;
type Slice = { name: string; value: number; colour: string };
function ChartCard({
  title,
  detail,
  children,
  className = "",
}: {
  title: string;
  detail: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`chart-card ${className}`}>
      <div className="chart-card-heading">
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {children}
    </section>
  );
}
/** Slice values are disjoint portions of the total, never outstanding + overdue. */
function Donut({
  slices,
  centre,
  label,
  currency = false,
  onSelect,
}: {
  slices: Slice[];
  centre: string;
  label: string;
  currency?: boolean;
  onSelect?: (name: string) => void;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  return (
    <>
      <div
        className="donut-wrap"
        aria-label={`${label}: ${slices.map((s) => `${s.name} ${currency ? money(s.value) : s.value}`).join(", ")}`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart accessibilityLayer>
            <Tooltip
              formatter={(value) =>
                currency ? money(Number(value)) : String(value)
              }
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e5eaf2",
                fontSize: 13,
              }}
            />
            <Pie
              data={slices.filter((s) => s.value > 0)}
              dataKey="value"
              nameKey="name"
              innerRadius="71%"
              outerRadius="91%"
              paddingAngle={3}
              cornerRadius={5}
              stroke="none"
              isAnimationActive={false}
            >
              {slices
                .filter((s) => s.value > 0)
                .map((s) => (
                  <Cell
                    key={s.name}
                    fill={s.colour}
                    onClick={() => onSelect?.(s.name)}
                    cursor={onSelect ? "pointer" : "default"}
                  />
                ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-centre">
          <strong>{total ? centre : "0"}</strong>
          <span>{label}</span>
        </div>
      </div>
      <ul className="chart-key">
        {slices.map((s) => (
          <li key={s.name}>
            {onSelect ? (
              <button className="donut-filter" onClick={() => onSelect(s.name)}>
                <i style={{ background: s.colour }} />
                {s.name} <AppIcon name="external" size={14} />
              </button>
            ) : (
              <span>
                <i style={{ background: s.colour }} />
                {s.name}
              </span>
            )}
            <strong>
              {currency ? money(s.value) : s.value}
              <small>{total ? Math.round((s.value / total) * 100) : 0}%</small>
            </strong>
          </li>
        ))}
      </ul>
      {!total && <p className="chart-footnote">No data in this selection.</p>}
    </>
  );
}
function BalanceBars({
  rows,
  firstLabel,
  secondLabel,
  firstColour,
  secondColour,
  onSelect,
}: {
  rows: { name: string; notDue: number; overdue: number }[];
  firstLabel: string;
  secondLabel: string;
  firstColour: string;
  secondColour: string;
  onSelect?: (name: string) => void;
}) {
  return (
    <>
      <div className="chart-inline-legend">
        <span>
          <i style={{ background: firstColour }} />
          {firstLabel}
        </span>
        <span>
          <i style={{ background: secondColour }} />
          {secondLabel}
        </span>
      </div>
      <div className="chart-bar-area">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ left: 0, right: 18, top: 8, bottom: 6 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="#edf0f5" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={compact}
              axisLine={false}
              tickLine={false}
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: string) =>
                value.split(" ").slice(0, 2).join(" ")
              }
              fontSize={12}
            />
            <Tooltip
              formatter={(value) => money(Number(value))}
              cursor={{ fill: "#f4f7fb" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e5eaf2",
                fontSize: 13,
              }}
            />
            <Bar
              dataKey="notDue"
              name={firstLabel}
              stackId="balance"
              fill={firstColour}
              barSize={17}
              isAnimationActive={false}
            >
              {rows.map((r) => (
                <Cell
                  key={r.name}
                  onClick={() => onSelect?.(r.name)}
                  cursor={onSelect ? "pointer" : "default"}
                />
              ))}
            </Bar>
            <Bar
              dataKey="overdue"
              name={secondLabel}
              stackId="balance"
              fill={secondColour}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              {rows.map((r) => (
                <Cell
                  key={r.name}
                  onClick={() => onSelect?.(r.name)}
                  cursor={onSelect ? "pointer" : "default"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {onSelect && (
        <div className="chart-evidence-links">
          {rows.map((r) => (
            <button
              key={r.name}
              onClick={() => onSelect(r.name)}
              aria-label={`Open evidence for ${r.name}`}
            >
              {r.name.split(" ")[0]} <AppIcon name="external" size={14} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
export function CustomerVisuals({
  data,
  onSelect,
}: {
  data: AnalyticsData;
  onSelect: (name: string) => void;
}) {
  const c = useMemo(() => customerAnalytics(data), [data]);
  const rows = c.ledger
    .filter((r) => r.outstanding > 0)
    .slice(0, 6)
    .map((r) => ({
      name: r.party,
      notDue: r.outstanding - r.overdue,
      overdue: r.overdue,
    }));
  return (
    <div className="visual-grid customer-visuals">
      <ChartCard
        title="Open customer balances"
        detail="Top six balances, split by invoice due date."
        className="wide-chart"
      >
        <BalanceBars
          rows={rows}
          firstLabel="Not yet due"
          secondLabel="Overdue"
          firstColour={colours.blue}
          secondColour={colours.coral}
          onSelect={onSelect}
        />
        <p className="chart-footnote">
          The full bar is outstanding. The coral portion is already overdue.
        </p>
      </ChartCard>
      <ChartCard
        title="Outstanding, by due date"
        detail="Overdue is a part of outstanding, not an extra balance."
      >
        <Donut
          slices={[
            {
              name: "Not yet due",
              value: c.receivables - c.overdue,
              colour: colours.blue,
            },
            { name: "Overdue", value: c.overdue, colour: colours.coral },
          ]}
          centre={compact(c.receivables)}
          label="outstanding"
          currency
        />
      </ChartCard>
    </div>
  );
}
export function OverviewVisuals({
  data,
  onCustomer,
  onSuppliers,
}: {
  data: AnalyticsData;
  onCustomer: (name: string) => void;
  onSuppliers: () => void;
}) {
  const c = useMemo(() => customerAnalytics(data), [data]),
    s = useMemo(() => supplierAnalytics(data), [data]),
    stock = useMemo(() => inventoryAnalytics(data), [data]);
  const balances = [
    {
      name: "Customers owe us",
      notDue: c.receivables - c.overdue,
      overdue: c.overdue,
    },
    {
      name: "We owe suppliers",
      notDue: s.payables - s.overdue,
      overdue: s.overdue,
    },
  ];
  const slices = [
    {
      name: "Low-stock products",
      value: stock.lowStock.reduce((n, i) => n + (i.stockValue ?? 0), 0),
      colour: colours.coral,
    },
    {
      name: "Healthy stock",
      value: stock.items
        .filter((i) => i.status === "OK")
        .reduce((n, i) => n + (i.stockValue ?? 0), 0),
      colour: colours.teal,
    },
    { name: "Overstock", value: stock.overstockValue, colour: colours.violet },
  ];
  return (
    <div className="visual-grid overview-visuals">
      <ChartCard
        title="Receivables and payables"
        detail="Compare receivables and payables at the same scale."
        className="wide-chart overview-exposure"
      >
        <BalanceBars
          rows={balances}
          firstLabel="Not yet due"
          secondLabel="Already overdue"
          firstColour={colours.teal}
          secondColour={colours.coral}
        />
        <div className="exposure-actions">
          <button
            onClick={() =>
              onCustomer(c.topCustomer?.party || "Sharma Textiles")
            }
          >
            Inspect customer ledger <AppIcon name="external" size={14} />
          </button>
          <button onClick={onSuppliers}>
            Inspect supplier ledger <AppIcon name="external" size={14} />
          </button>
        </div>
        <p className="chart-footnote">
          These are open balances, not cash received or a bank balance.
        </p>
      </ChartCard>
      <ChartCard
        title="Stock capital by condition"
        detail="Each segment is valued at the supplied current cost."
      >
        <Donut
          slices={slices}
          centre={compact(stock.valueAtCost)}
          label="in stock"
          currency
        />
      </ChartCard>
    </div>
  );
}
export function SupplierVisuals({
  data,
  onSelect,
}: {
  data: AnalyticsData;
  onSelect: (name: string) => void;
}) {
  const a = useMemo(() => supplierAnalytics(data), [data]);
  const rows = a.ledger
    .filter((r) => r.outstanding > 0)
    .slice(0, 5)
    .map((r) => ({
      name: r.party,
      notDue: r.outstanding - r.overdue,
      overdue: r.overdue,
    }));
  const slices = [
    {
      name: "On time",
      value: a.deliveries.filter((p) => p.status === "on_time").length,
      colour: colours.teal,
    },
    {
      name: "Delivered late",
      value: a.lateDeliveries.length,
      colour: colours.amber,
    },
    {
      name: "Delayed, not received",
      value: a.delayedPOs.length,
      colour: colours.coral,
    },
    { name: "Upcoming", value: a.openPOs.length, colour: colours.violet },
    ...(a.deliveries.some((p) => p.status === "unverified")
      ? [
          {
            name: "Unverified",
            value: a.deliveries.filter((p) => p.status === "unverified").length,
            colour: colours.slate,
          },
        ]
      : []),
  ];
  return (
    <div className="visual-grid supplier-visuals">
      <ChartCard
        title="Where your payables sit"
        detail="Top five suppliers by unpaid invoice balance."
        className="wide-chart"
      >
        <BalanceBars
          rows={rows}
          firstLabel="Not yet due"
          secondLabel="Overdue"
          firstColour={colours.violet}
          secondColour={colours.coral}
          onSelect={onSelect}
        />
      </ChartCard>
      <ChartCard
        title="Delivery reliability"
        detail="Counts of purchase orders, using original promised dates."
      >
        <Donut
          slices={slices}
          centre={String(a.deliveries.length)}
          label="purchase orders"
        />
      </ChartCard>
    </div>
  );
}
export function InventoryVisuals({
  data,
  weeks,
  onSelect,
  filters = emptyFilters,
  attributes = data.productAttributes ?? [],
  onBandSelect,
  onAttributeFilter,
}: {
  data: AnalyticsData;
  weeks: number;
  onSelect: (sku: string) => void;
  filters?: CatalogFilters;
  attributes?: ProductAttributes[];
  onBandSelect?: (band: string) => void;
  onAttributeFilter?: (
    key: "fabric" | "category" | "color" | "gender",
    value: string,
  ) => void;
}) {
  const [metric, setMetric] = useState("Cover"),
    [dimension, setDimension] = useState<
      "fabric" | "category" | "color" | "gender"
    >("fabric");
  const plan = useMemo(() => inventoryPlan(data, weeks), [data, weeks]);
  const items = filterInventory(
    plan.items.map((i) => ({
      ...i,
      quantityBand: qualifyStock(i.stock, i.reorderLevel, i.weeksCover),
    })),
    attributes,
    filters,
  );
  const ranked = items
    .filter((i) => i.indicativeContribution !== null)
    .toSorted(
      (a, b) =>
        (b.indicativeContribution ?? 0) - (a.indicativeContribution ?? 0),
    )
    .slice(0, 6);
  const bands = [
    "Out of stock",
    "Critical",
    "Low",
    "Adequate",
    "Excess",
    "Unverified",
  ];
  const slices = bands.map((name, index) => ({
    name,
    value: items.filter((i) => i.quantityBand === name).length,
    colour: [
      colours.coral,
      "#d65e70",
      colours.amber,
      colours.teal,
      colours.violet,
      colours.slate,
    ][index],
  }));
  const capital = groupStockCapital(items, attributes, dimension);
  const cover = items.map((i) => ({
    sku: i.sku,
    current: i.weeklyDemand > 0 ? (i.stock ?? 0) / i.weeklyDemand : 0,
    projected: i.coverAfterInbound ?? 0,
    known: i.stock !== null && i.weeklyDemand > 0,
  }));
  return (
    <div className="visual-grid inventory-visuals">
      <ChartCard
        title={
          metric === "Cover"
            ? "Will incoming stock cover demand?"
            : metric === "Capital"
              ? "Where is stock capital allocated?"
              : "Which products earn their space?"
        }
        detail={
          metric === "Cover"
            ? "Weeks of cover from the same 56-day sales window. Incoming quantities are not yet available."
            : metric === "Capital"
              ? "Current stock value at cost, grouped by your catalog labels."
              : "Revenue less current unit-cost estimate; before overheads."
        }
        className="wide-chart"
      >
        <div className="stock-chart-toolbar">
          <div className="tabs">
            {["Cover", "Contribution", "Capital"].map((m) => (
              <button
                key={m}
                className={metric === m ? "selected" : ""}
                onClick={() => setMetric(m)}
              >
                {m}
              </button>
            ))}
          </div>
          {metric === "Capital" && (
            <select
              aria-label="Group stock capital"
              value={dimension}
              onChange={(e) => setDimension(e.target.value as typeof dimension)}
            >
              <option value="fabric">By fabric</option>
              <option value="color">By colour</option>
              <option value="gender">By gender</option>
              <option value="category">By category</option>
            </select>
          )}
        </div>
        {metric === "Cover" ? (
          <>
            <div className="chart-inline-legend">
              <span>
                <i style={{ background: colours.teal }} />
                On hand
              </span>
              <span>
                <i style={{ background: colours.blue }} />
                If all POs arrive
              </span>
              <span>Dashed line: {weeks}-week target</span>
            </div>
            <div className="cover-chart">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={cover.filter((i) => i.known)}
                  layout="vertical"
                  margin={{ left: 0, right: 15, top: 8, bottom: 5 }}
                  accessibilityLayer
                >
                  <CartesianGrid horizontal={false} stroke="#edf0f5" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${Number(v).toFixed(0)}w`}
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="sku"
                    width={40}
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => `${Number(value).toFixed(1)} weeks`}
                    contentStyle={{ fontSize: 13, borderRadius: 10 }}
                  />
                  <ReferenceLine
                    x={weeks}
                    stroke="#bc9154"
                    strokeDasharray="4 4"
                  />
                  <Bar
                    name="On-hand cover"
                    dataKey="current"
                    fill={colours.teal}
                    barSize={8}
                    radius={[0, 3, 3, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    name="Cover after all POs"
                    dataKey="projected"
                    fill={colours.blue}
                    barSize={8}
                    radius={[0, 3, 3, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-evidence-links">
              {items.map((i) => (
                <button key={i.sku} onClick={() => onSelect(i.sku)}>
                  {i.sku} evidence <AppIcon name="external" size={14} />
                </button>
              ))}
            </div>
            {cover.some((i) => !i.known) && (
              <p className="chart-footnote">
                Products without verified stock or observed sales are excluded
                from the cover graph.
              </p>
            )}
          </>
        ) : metric === "Capital" ? (
          <div className="contribution-bars">
            {capital.map((g, index) => (
              <button
                key={g.name}
                onClick={() => onAttributeFilter?.(dimension, g.name)}
              >
                <div>
                  <span>
                    {g.name} · {g.skus.length} SKUs
                  </span>
                  <strong>{money(g.value)}</strong>
                </div>
                <div className="contribution-track">
                  <span
                    style={{
                      width: `${(g.value / Math.max(1, capital[0]?.value ?? 1)) * 100}%`,
                      background: Object.values(colours)[index % 6],
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="contribution-bars">
            {ranked.map((item, index) => (
              <button key={item.sku} onClick={() => onSelect(item.sku)}>
                <div>
                  <span>
                    <b>{item.sku}</b>
                    {item.name}
                  </span>
                  <strong>{money(item.indicativeContribution ?? 0)}</strong>
                </div>
                <div className="contribution-track">
                  <span
                    style={{
                      width: `${Math.max(0, ((item.indicativeContribution ?? 0) / Math.max(1, ranked[0]?.indicativeContribution ?? 1)) * 100)}%`,
                      background: Object.values(colours)[index % 6],
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
        {!items.length && (
          <div className="empty">
            No products match these filters. Reset filters to compare all stock.
          </div>
        )}
        <p className="chart-footnote">
          Charts and sheet use the same filters. We compare cover in weeks and
          capital in rupees; metres and pieces are never added together.
        </p>
      </ChartCard>
      <ChartCard
        title="What is actually available?"
        detail="Click a quantity band to filter the sheet. Incoming stock is excluded."
      >
        <Donut
          slices={slices}
          centre={String(items.length)}
          label="matching SKUs"
          onSelect={onBandSelect}
        />
        <p className="chart-footnote">
          Critical: below half the reorder level. Low: below reorder level.
          Excess: at least 12 weeks of cover.
        </p>
      </ChartCard>
    </div>
  );
}
export function PromiseVisuals({
  data,
  onFilter,
}: {
  data: AnalyticsData;
  onFilter: (filter: string) => void;
}) {
  const c = useMemo(() => customerAnalytics(data), [data]);
  const slices = [
    { name: "Kept", value: c.promiseCounts.kept, colour: colours.teal },
    { name: "Partial", value: c.promiseCounts.partial, colour: colours.amber },
    { name: "Pending", value: c.promiseCounts.pending, colour: colours.blue },
    {
      name: "Potentially missed",
      value: c.promiseCounts.potentially_missed,
      colour: colours.coral,
    },
    ...(c.promiseCounts.unverified
      ? [
          {
            name: "Unverified",
            value: c.promiseCounts.unverified,
            colour: colours.slate,
          },
        ]
      : []),
  ];
  return (
    <div className="visual-grid promise-visuals">
      <ChartCard
        title="Customer promise status"
        detail="A promise date and a payment record, checked together."
      >
        <Donut
          slices={slices}
          centre={String(c.promises.length)}
          label="promises"
        />
      </ChartCard>
      <section className="promise-story-panel">
        <h2>
          {c.promiseCounts.potentially_missed} promises need a closer look.
        </h2>
        <p>
          No matching payments were found in their configured windows. Review
          the evidence before following up.
        </p>
        <div className="promise-story-amount">
          {money(c.potentiallyMissedAmount)}
          <small>promised across potentially missed commitments</small>
        </div>
        <button className="primary" onClick={() => onFilter("Missed")}>
          Review these promises <AppIcon name="arrow" size={14} />
        </button>
        <div className="promise-story-note">
          A missed promise and an overdue invoice are separate signals. A
          payment match does not prove intent.
        </div>
      </section>
    </div>
  );
}
