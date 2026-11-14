import type { ProductAttributes } from './catalog';
/** Pure deterministic business calculations. No file access and no LLM calls. */
export const DEMO_DATE = '2026-11-14';
export const PROMISE_RULES = { graceDays: 2, keptRatio: 0.95 } as const;
export type PromiseStatus = 'kept' | 'partial' | 'pending' | 'potentially_missed' | 'unverified';
export type DeliveryStatus = 'on_time' | 'late' | 'delayed' | 'pending' | 'unverified';
export type StockStatus = 'LOW' | 'OVERSTOCK' | 'OK' | 'unverified';
export type SourceRef = { file: string; id: string };
export type LedgerInvoice = { id: string; party: string; date: string; dueDate: string | null; total: number; source: SourceRef; poId?: string };
export type LedgerPayment = { id: string; party: string; date: string; amount: number; source: SourceRef };
export type PaymentPromise = { id: string; party: string; direction: 'customer_to_owner' | 'owner_to_supplier'; madeOn: string; promisedDate: string | null; amount: number | null; quote: string; viaVoice: boolean; source: SourceRef; chatFile: string };
export type PurchaseOrder = { id: string; supplier: string; orderDate: string; promisedDate: string | null; actualDelivery: string | null; revisedPromisedDate: string | null; source: SourceRef; annotationSource?: SourceRef };
export type PurchaseLine = { poId: string; sku: string; qty: number; rate: number; source: SourceRef };
export type InventoryRow = { sku: string; name: string; unit: string; currentStock: number; reorderLevel: number | null; costPrice: number | null; avgWeeklySales: number | null; reportedWeeksCover: number | null; supplierId: string; source: SourceRef };
export type StockMovement = { id: string; date: string; sku: string; type: 'OPENING' | 'IN' | 'OUT'; qty: number; reference: string; reportedBalance: number; source: SourceRef };
export type OpenQuote = { id: string; customer: string; date: string; taxableValue: number; status: string; items: string; source: SourceRef };
export type SalesLine = { invoiceId: string; customer: string; date: string; sku: string; qty: number; rate: number; amount: number; source: SourceRef };
export type AnalyticsData = {
  salesLines: SalesLine[];
  productAttributes?: ProductAttributes[];
  customerInvoices: LedgerInvoice[]; customerPayments: LedgerPayment[];
  supplierInvoices: LedgerInvoice[]; supplierPayments: LedgerPayment[];
  customerPromises: PaymentPromise[]; ownerPromises: PaymentPromise[];
  purchaseOrders: PurchaseOrder[]; purchaseLines: PurchaseLine[];
  inventory: InventoryRow[]; stockMovements: StockMovement[]; quotes: OpenQuote[];
  customers: { name: string; city: string }[]; suppliers: { id: string; name: string; city: string; contact: string; creditDays: number; skus: string[] }[];
};

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`Invalid date: ${date}`);
}
export function addDays(date: string, days: number): string {
  assertDate(date);
  if (!Number.isInteger(days)) throw new Error('Day offset must be an integer');
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function minor(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new Error('Money must be finite, nonnegative and within the safe range');
  return Math.round(amount * 100);
}
const rupees = (paise: number) => paise / 100;
export function sumMoney<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rupees(rows.reduce((total, row) => total + minor(pick(row)), 0));
}
const unique = (values: string[]) => [...new Set(values)];
export type Allocation = { invoiceId: string; paymentId: string; amount: number; paymentDate: string };

/** Snapshot FIFO: advance payments are credits until applied; future rows are excluded. */
export function reconcileLedger(invoices: readonly LedgerInvoice[], payments: readonly LedgerPayment[], asOf = DEMO_DATE, partyNames: string[] = []) {
  assertDate(asOf);
  return unique([...partyNames, ...invoices.map(i => i.party), ...payments.map(p => p.party)]).map(party => {
    const invoiceRows = invoices.filter(i => i.party === party && i.date <= asOf).toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const paymentRows = payments.filter(p => p.party === party && p.date <= asOf).toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const credits = paymentRows.map(payment => ({ payment, remaining: minor(payment.amount) }));
    let paymentIndex = 0;
    const allocatedInvoices = invoiceRows.map(invoice => {
      let remaining = minor(invoice.total);
      const allocations: Allocation[] = [];
      while (remaining > 0 && paymentIndex < credits.length) {
        const credit = credits[paymentIndex];
        const applied = Math.min(remaining, credit.remaining);
        if (applied > 0) allocations.push({ invoiceId: invoice.id, paymentId: credit.payment.id, amount: rupees(applied), paymentDate: credit.payment.date });
        remaining -= applied; credit.remaining -= applied;
        if (credit.remaining === 0) paymentIndex++;
      }
      return { ...invoice, allocated: rupees(minor(invoice.total) - remaining), remaining: rupees(remaining), allocations };
    });
    return {
      party, invoices: allocatedInvoices, payments: paymentRows,
      billed: sumMoney(invoiceRows, i => i.total), paid: sumMoney(paymentRows, p => p.amount),
      outstanding: sumMoney(allocatedInvoices, i => i.remaining),
      overdue: sumMoney(allocatedInvoices.filter(i => i.dueDate !== null && i.dueDate < asOf), i => i.remaining),
      unverifiedDue: sumMoney(allocatedInvoices.filter(i => i.dueDate === null), i => i.remaining),
      credit: rupees(credits.reduce((s, c) => s + c.remaining, 0)),
    };
  }).toSorted((a, b) => b.outstanding - a.outstanding || a.party.localeCompare(b.party));
}
export type PartyLedger = ReturnType<typeof reconcileLedger>[number];
export function dueInDays(ledger: readonly PartyLedger[], days: number, asOf = DEMO_DATE) {
  const end = addDays(asOf, days);
  const invoices = ledger.flatMap(p => p.invoices).filter(i => i.dueDate !== null && i.dueDate >= asOf && i.dueDate <= end && i.remaining > 0);
  return { amount: sumMoney(invoices, i => i.remaining), from: asOf, through: end, invoices };
}

/** Candidate evidence, not proof of intent: a payment can appear in overlapping windows. */
export function evaluatePromise(promise: PaymentPromise, payments: readonly LedgerPayment[] | null, asOf = DEMO_DATE) {
  assertDate(asOf);
  const end = promise.promisedDate ? addDays(promise.promisedDate, PROMISE_RULES.graceDays) : null;
  const evidence = payments?.filter(p => p.party === promise.party && p.date >= promise.madeOn && p.date <= asOf && (end === null || p.date <= end)) ?? [];
  const paid = sumMoney(evidence, p => p.amount);
  let status: PromiseStatus = 'unverified';
  if (payments !== null && promise.promisedDate !== null && promise.amount !== null && promise.amount > 0 && promise.madeOn <= asOf) {
    // Use the configured order: some payment is partial even before its due date.
    status = minor(paid) >= minor(promise.amount) * PROMISE_RULES.keptRatio ? 'kept' : paid > 0 ? 'partial' : promise.promisedDate >= asOf ? 'pending' : 'potentially_missed';
  }
  return { ...promise, status, label: status === 'potentially_missed' ? 'Potentially missed' : status, reviewRequired: status === 'potentially_missed' || status === 'unverified', paid, unpaid: promise.amount === null ? null : rupees(Math.max(0, minor(promise.amount) - minor(paid))), evidence, window: { from: promise.madeOn, through: end === null ? null : end < asOf ? end : asOf }, candidateMatchOnly: true as const };
}
export function evaluateDelivery(po: PurchaseOrder, asOf = DEMO_DATE) {
  assertDate(asOf);
  const actual = po.actualDelivery !== null && po.actualDelivery <= asOf ? po.actualDelivery : null;
  const status: DeliveryStatus = !po.promisedDate || po.orderDate > asOf ? 'unverified' : actual ? actual > po.promisedDate ? 'late' : 'on_time' : po.promisedDate < asOf ? 'delayed' : 'pending';
  // A revised date is evidence, not permission to erase a missed original commitment.
  return { ...po, actualDelivery: actual, status, daysLate: status === 'late' || status === 'delayed' ? Math.round((Date.parse(`${actual ?? asOf}T00:00:00Z`) - Date.parse(`${po.promisedDate}T00:00:00Z`)) / 86_400_000) : 0 };
}
export function customerAnalytics(data: AnalyticsData, asOf = DEMO_DATE) {
  const ledger = reconcileLedger(data.customerInvoices, data.customerPayments, asOf, data.customers.map(c => c.name));
  const promises = data.customerPromises.filter(p => p.madeOn <= asOf).map(p => evaluatePromise(p, data.customerPayments, asOf));
  const openQuotes = data.quotes.filter(q => q.status === 'open' && q.date <= asOf);
  return { ledger, promises, receivables: sumMoney(ledger, c => c.outstanding), overdue: sumMoney(ledger, c => c.overdue), topCustomer: ledger[0] ?? null, openQuotes, openQuotesTaxable: sumMoney(openQuotes, q => q.taxableValue), promiseCounts: countPromises(promises), potentiallyMissedAmount: sumMoney(promises.filter(p => p.status === 'potentially_missed'), p => p.amount ?? 0) };
}
function countPromises(promises: { status: PromiseStatus }[]) {
  return Object.fromEntries((['kept', 'partial', 'pending', 'potentially_missed', 'unverified'] as const).map(status => [status, promises.filter(p => p.status === status).length])) as Record<PromiseStatus, number>;
}
export function supplierAnalytics(data: AnalyticsData, asOf = DEMO_DATE) {
  const ledger = reconcileLedger(data.supplierInvoices, data.supplierPayments, asOf, data.suppliers.map(s => s.name));
  const deliveries = data.purchaseOrders.filter(p => p.orderDate <= asOf).map(p => evaluateDelivery(p, asOf));
  const ownerPromises = data.ownerPromises.filter(p => p.madeOn <= asOf).map(p => evaluatePromise(p, data.supplierPayments, asOf));
  return {
    ledger, ownerPromises, deliveries, payables: sumMoney(ledger, s => s.outstanding), overdue: sumMoney(ledger, s => s.overdue),
    dueNext14Days: dueInDays(ledger, 14, asOf), dueNext7Days: dueInDays(ledger, 7, asOf),
    lateDeliveries: deliveries.filter(p => p.status === 'late'), delayedPOs: deliveries.filter(p => p.status === 'delayed'), openPOs: deliveries.filter(p => p.status === 'pending'),
    reliability: data.suppliers.map(s => ({ ...s, lateCount: deliveries.filter(p => p.supplier === s.name && p.status === 'late').length, delayedCount: deliveries.filter(p => p.supplier === s.name && p.status === 'delayed').length, receivedCount: deliveries.filter(p => p.supplier === s.name && p.actualDelivery !== null).length, evidence: deliveries.filter(p => p.supplier === s.name) })),
  };
}
export function movementBalances(movements: readonly StockMovement[], asOf = DEMO_DATE) {
  assertDate(asOf);
  const balances = new Map<string, number>();
  // Preserve input order for same-day events, as supplied in the source ledger.
  const rows = movements.filter(m => m.date <= asOf).toSorted((a, b) => a.date.localeCompare(b.date)).map(m => {
    const balance = (balances.get(m.sku) ?? 0) + (m.type === 'OUT' ? -m.qty : m.qty);
    balances.set(m.sku, balance);
    return { ...m, balance, matchesReported: balance === m.reportedBalance, negative: balance < 0 };
  });
  return { rows, balances, negativeRows: rows.filter(r => r.negative), inconsistentRows: rows.filter(r => !r.matchesReported) };
}
export function inventoryAnalytics(data: AnalyticsData, asOf = DEMO_DATE) {
  const movements = movementBalances(data.stockMovements, asOf);
  const deliveries = data.purchaseOrders.filter(p => p.orderDate <= asOf).map(p => evaluateDelivery(p, asOf));
  const items = data.inventory.map(item => {
    // Historical quantities come from movements; the supplied snapshot is evidence to cross-check.
    const hasMovements = movements.balances.has(item.sku);
    const stock = hasMovements ? movements.balances.get(item.sku)! : null;
    const weeksCover = stock !== null && item.avgWeeklySales !== null && item.avgWeeklySales > 0 ? stock / item.avgWeeklySales : null;
    const stockValue = stock !== null && item.costPrice !== null && stock >= 0 ? rupees(minor(stock * item.costPrice)) : null;
    const status: StockStatus = stock === null || stock < 0 || item.reorderLevel === null ? 'unverified' : stock < item.reorderLevel ? 'LOW' : weeksCover === null ? 'unverified' : weeksCover >= 12 ? 'OVERSTOCK' : 'OK';
    const poEvidence = deliveries.filter(po => po.actualDelivery === null && data.purchaseLines.some(line => line.poId === po.id && line.sku === item.sku));
    const openPoQty = data.purchaseLines.filter(line => line.sku === item.sku && poEvidence.some(po => po.id === line.poId)).reduce((total, l) => total + l.qty, 0);
    return { ...item, stock, weeksCover, stockValue, status, snapshotMatches: stock === item.currentStock, openPoQty, poEvidence, movementEvidence: movements.rows.filter(m => m.sku === item.sku), supplier: data.suppliers.find(s => s.id === item.supplierId) ?? null };
  });
  return { items, lowStock: items.filter(i => i.status === 'LOW'), overstock: items.filter(i => i.status === 'OVERSTOCK'), valueAtCost: sumMoney(items, i => i.stockValue ?? 0), unverifiedValueCount: items.filter(i => i.stockValue === null).length, overstockValue: sumMoney(items.filter(i => i.status === 'OVERSTOCK'), i => i.stockValue ?? 0), restockAlerts: items.filter(i => i.status === 'LOW').map(i => ({ sku: i.sku, name: i.name, weeksCover: i.weeksCover, stock: i.stock, reorderLevel: i.reorderLevel, supplier: i.supplier, openPoQty: i.openPoQty, delayed: i.poEvidence.filter(po => po.status === 'delayed'), source: i.source, movementEvidence: i.movementEvidence })), movements };
}
export function cashAnalytics(data: AnalyticsData, asOf = DEMO_DATE) {
  const customers = customerAnalytics(data, asOf), suppliers = supplierAnalytics(data, asOf);
  const through = addDays(asOf, 14);
  const pendingPromises = customers.promises.filter(p => p.status === 'pending' && p.promisedDate !== null && p.promisedDate >= asOf && p.promisedDate <= through);
  const expectedInflow = sumMoney(pendingPromises, p => p.unpaid ?? 0);
  return { asOf, through, receivables: customers.receivables, payables: suppliers.payables, netPosition: rupees(minor(customers.receivables) - minor(suppliers.payables)), supplierDuesNext14Days: suppliers.dueNext14Days.amount, expectedPromiseInflow: expectedInflow, shortfall: rupees(Math.max(0, minor(suppliers.dueNext14Days.amount) - minor(expectedInflow))), pendingPromises, dueInvoices: suppliers.dueNext14Days.invoices, customerEvidence: customers.ledger, supplierEvidence: suppliers.ledger, note: 'Promise inflow is uncertain. Net position is receivables minus payables, not a bank balance or a cash-flow forecast; overdue supplier dues are shown separately.' };
}
export function allAnalytics(data: AnalyticsData, asOf = DEMO_DATE) {
  return { asOf, customers: customerAnalytics(data, asOf), suppliers: supplierAnalytics(data, asOf), inventory: inventoryAnalytics(data, asOf), cash: cashAnalytics(data, asOf) };
}

/** Forward planning scenario, not an AI forecast. Margin uses today's supplied cost basis. */
export function inventoryPlan(data: AnalyticsData, targetWeeks = 6, asOf = DEMO_DATE) {
  if (!Number.isFinite(targetWeeks) || targetWeeks < 1 || targetWeeks > 12) throw new Error('Target cover must be 1–12 weeks');
  const inventory = inventoryAnalytics(data, asOf);
  const cash = cashAnalytics(data, asOf);
  const windowStart = addDays(asOf, -55);
  const items = inventory.items.map(item => {
    const sales = data.salesLines.filter(s => s.sku === item.sku && s.date >= windowStart && s.date <= asOf);
    const unitsSold = sales.reduce((total, s) => total + s.qty, 0);
    const weeklyDemand = unitsSold / 8;
    const revenue = sumMoney(sales, s => s.amount);
    const indicativeContribution = item.costPrice === null ? null : rupees(minor(revenue) - minor(unitsSold * item.costPrice));
    const targetStock = Math.ceil(weeklyDemand * targetWeeks);
    const afterInbound = item.stock === null ? null : item.stock + item.openPoQty;
    const incrementalQty = afterInbound === null ? null : Math.max(0, targetStock - afterInbound);
    const indicativeCost = incrementalQty === null || item.costPrice === null ? null : rupees(minor(incrementalQty * item.costPrice));
    const delayed = item.poEvidence.some(po => po.status === 'delayed');
    const action = item.status === 'OVERSTOCK' ? 'Sell through; pause restocking' : item.stock === null ? 'Verify stock first' : item.status === 'LOW' && item.openPoQty > 0 ? delayed ? 'Expedite delayed stock' : 'Confirm incoming stock' : incrementalQty !== null && incrementalQty > 0 ? 'Review measured top-up' : 'Maintain current stock';
    return { ...item, salesEvidence: sales, unitsSold, weeklyDemand, revenue, indicativeContribution, targetStock, afterInbound, incrementalQty, indicativeCost, delayed, action, coverAfterInbound: afterInbound !== null && weeklyDemand > 0 ? afterInbound / weeklyDemand : null, needsCashReview: cash.shortfall > 0 && (incrementalQty ?? 0) > 0 };
  });
  // First defend proven contribution in scarce products. Do not compare mtr and pc volumes.
  const priorities = items.filter(i => i.status === 'LOW' && i.unitsSold > 0).toSorted((a,b) => (b.indicativeContribution ?? -Infinity) - (a.indicativeContribution ?? -Infinity) || (a.weeksCover ?? Infinity) - (b.weeksCover ?? Infinity));
  return { asOf, windowStart, targetWeeks, items, priorities, focus: priorities[0] ?? null, cash, overstockValue: inventory.overstockValue, totalIndicativeCost: sumMoney(items, i => i.indicativeCost ?? 0), methodology: '56-day sales window. Indicative contribution = ex-GST sales minus units sold × current unit cost; excludes overheads and historic cost changes. Target = ceiling(weekly units × chosen weeks). Extra buy = max(0, target − on hand − all open/delayed PO quantities). Incoming stock is uncertain until received. Planning scenario, not a forecast or purchase authorization.' };
}


export type QuantityBand = 'Out of stock'|'Critical'|'Low'|'Adequate'|'Excess'|'Unverified';
/** Qualify on-hand availability separately from the existing LOW/OK/OVERSTOCK flag. */
export function qualifyStock(stock:number|null,reorderLevel:number|null,weeksCover:number|null):QuantityBand {
 if(stock===null||stock<0||!Number.isFinite(stock))return 'Unverified';
 if(stock===0)return 'Out of stock';
 if(reorderLevel===null||reorderLevel<0||!Number.isFinite(reorderLevel))return 'Unverified';
 if(stock<reorderLevel*.5)return 'Critical';
 if(stock<reorderLevel)return 'Low';
 if(weeksCover===null||!Number.isFinite(weeksCover))return 'Unverified';
 return weeksCover>=12?'Excess':'Adequate';
}

export function groupStockCapital(rows:{sku:string;stockValue:number|null}[],attributes:ProductAttributes[],dimension:'fabric'|'category'|'color'|'gender') {
 const groups=new Map<string,typeof rows>();
 for(const row of rows){const name=attributes.find(a=>a.sku===row.sku)?.[dimension]??'Unspecified';groups.set(name,[...(groups.get(name)??[]),row]);}
 return [...groups].map(([name,items])=>({name,value:sumMoney(items,i=>i.stockValue??0),skus:items.map(i=>i.sku)})).toSorted((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
}
