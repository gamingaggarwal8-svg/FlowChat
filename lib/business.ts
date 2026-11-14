import { parseCSV } from './csv';
export { parseCSV } from './csv';
import { z } from 'zod';
export const TODAY = '2026-11-14';
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
export const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((s, r) => s + pick(r), 0);
const date = z.iso.date();
const amount = z.number().nonnegative().finite();
export const invoiceSchema = z.object({ invoice_id: z.string().min(1), customer: z.string().min(1), date, due_date: date, total: amount });
export const paymentSchema = z.object({ payment_id: z.string().min(1), customer: z.string().min(1), date, amount, mode: z.string().optional(), bank_narration: z.string().optional() });
export const quoteSchema = z.object({ quote_id: z.string().min(1), customer: z.string().min(1), date, taxable_value: amount, status: z.enum(['open', 'confirmed', 'closed']), items: z.string() });
export type Invoice = z.infer<typeof invoiceSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type Product = { sku: string; name: string; unit: string; list_price: number; floor_price: number };
export type PromiseRecord = { customer: string; made_on: string; promised_date: string | null; amount: number | null; quote: string; via_voice: boolean };
export type Dataset = { invoices: Invoice[]; payments: Payment[]; quotes: Quote[]; customers: { customer: string; city: string; credit_days: number }[]; products: Product[]; promises: PromiseRecord[]; chats: { customer: string; text: string; filename: string }[] };
export function reconcile(data: Dataset, today = TODAY) {
  const customers = [...new Set([...data.customers.map(c => c.customer), ...data.invoices.map(i => i.customer), ...data.payments.map(p => p.customer)])];
  return customers.map(customer => {
    const invoices = data.invoices.filter(i => i.customer === customer && i.date <= today).sort((a, b) => a.date.localeCompare(b.date) || a.invoice_id.localeCompare(b.invoice_id));
    const payments = data.payments.filter(p => p.customer === customer && p.date <= today);
    let credit = sum(payments, p => p.amount);
    const rows = invoices.map(invoice => {
      const allocated = Math.min(invoice.total, credit); credit -= allocated;
      return { ...invoice, allocated, remaining: invoice.total - allocated };
    });
    const outstanding = sum(rows, r => r.remaining);
    const overdue = sum(rows.filter(r => r.due_date < today), r => r.remaining);
    return { customer, city: data.customers.find(c => c.customer === customer)?.city || '—', invoices: rows, payments, billed: sum(rows, r => r.total), paid: sum(payments, p => p.amount), outstanding, overdue, credit };
  }).sort((a, b) => b.outstanding - a.outstanding);
}
export function promiseStatus(p: PromiseRecord, payments: Payment[], today = TODAY) {
  const end = p.promised_date ? new Date(`${p.promised_date}T00:00:00Z`) : null;
  if (end) end.setUTCDate(end.getUTCDate() + 2);
  const cutoff = end ? end.toISOString().slice(0, 10) : today;
  const evidence = payments.filter(pay => pay.customer === p.customer && pay.date >= p.made_on && pay.date <= cutoff && pay.date <= today);
  const paid = sum(evidence, pay => pay.amount);
  const status = p.amount === null || p.promised_date === null ? 'Review' : paid >= p.amount * .95 ? 'Kept' : paid > 0 ? 'Partial' : p.promised_date >= today ? 'Pending' : 'Missed';
  return { ...p, paid, evidence, status, unpaid: p.amount === null ? null : Math.max(0, p.amount - paid) };
}
export function metrics(data: Dataset) {
  const ledger = reconcile(data);
  const promises = data.promises.filter(p => p.made_on <= TODAY).map(p => promiseStatus(p, data.payments));
  return { ledger, promises, outstanding: sum(ledger, c => c.outstanding), overdue: sum(ledger, c => c.overdue), missed: sum(promises.filter(p => p.status === 'Missed'), p => p.amount || 0), openQuotes: sum(data.quotes.filter(q => q.status === 'open' && q.date <= TODAY), q => q.taxable_value) };
}
export type Analysis = { title: string; explanation: string; columns: string[]; rows: (string | number)[][]; methodology: string };
export function answerQuestion(question: string, data: Dataset): Analysis {
  const m = metrics(data); const text = question.toLowerCase().trim();
  const base = { methodology: 'Demo date 14 Nov 2026. Customer-wise FIFO allocation; invoices include GST. All amounts calculated from source rows.' };
  if (/quote|quotation|unconfirmed/.test(text)) return { ...base, title: `${money(m.openQuotes)} quoted, not yet confirmed`, explanation: 'Open quotations are pipeline, not receivables. Values exclude GST.', columns: ['Quote', 'Customer', 'Date', 'Taxable value'], rows: data.quotes.filter(q => q.status === 'open').map(q => [q.quote_id, q.customer, q.date, money(q.taxable_value)]) };
  if (/promise|pakka|waada|vada|broken|missed/.test(text)) return { ...base, title: `${m.promises.filter(p => p.status === 'Missed').length} missed promises · ${money(m.missed)} promised`, explanation: 'Prepared promise annotations checked against payments. A payment window does not prove intent; overlapping windows can share evidence.', columns: ['Customer', 'Promised date', 'Promised', 'Paid in window', 'Status'], rows: m.promises.map(p => [p.customer, p.promised_date || 'Unknown', p.amount === null ? 'Unknown' : money(p.amount), money(p.paid), p.status]), methodology: 'Same-customer payments from made_on through promised_date + 2 days, capped at demo date. ≥95% = kept; unpaid past date = missed; some payment = partial; future/today = pending.' };
  const customer = m.ledger.find(c => text.includes(c.customer.toLowerCase()) || text.includes(c.customer.split(' ')[0].toLowerCase()));
  if (customer || /sabse|highest|top|atka|outstanding|balance|paisa|paid|payer|payment|total|overdue|due|late/.test(text)) {
    const top = customer || m.ledger[0]; const isOverdue = /overdue|late|due/.test(text); const isTotal = /total/.test(text) && !customer;
    const rows = customer || !isTotal && !isOverdue ? top.invoices : m.ledger.flatMap(c => c.invoices);
    return { ...base, title: isTotal ? `${money(m.outstanding)} total outstanding` : isOverdue && !customer ? `${money(m.overdue)} overdue across customers` : `${top.customer}: ${money(top.outstanding)} outstanding`, explanation: customer ? `${money(top.billed)} billed − ${money(top.paid)} paid. ${money(top.overdue)} is overdue.` : isTotal || isOverdue ? 'Payments are allocated to oldest invoices first. Click a customer to inspect invoice and payment source rows.' : `${top.customer} has the most money outstanding. ${money(top.billed)} billed − ${money(top.paid)} paid = ${money(top.outstanding)}.`, columns: ['Invoice', 'Customer', 'Due', 'Invoice total', 'Allocated', 'Outstanding'], rows: rows.filter(r => !isOverdue || r.due_date < TODAY && r.remaining > 0).map(r => [r.invoice_id, r.customer, r.due_date, money(r.total), money(r.allocated), money(r.remaining)]) };
  }
  return { ...base, title: 'Try a supported business question', explanation: 'This demo supports outstanding balances, overdue invoices, payment promises, and open quotations in English or simple Hinglish. Live language understanding is not connected yet.', columns: [], rows: [] };
}
export function bargain(product: Product, offer: number, qty: number) {
  if (!Number.isFinite(offer) || !Number.isFinite(qty) || offer <= 0 || qty <= 0) throw new Error('Enter a positive offer and quantity');
  const belowFloor = offer < product.floor_price;
  const rate = belowFloor ? Math.max(product.floor_price, Math.round(product.list_price * .95)) : offer;
  return { belowFloor, rate, draft: belowFloor ? `Bhaiya, ${product.name} ke ${qty} ${product.unit} ke liye ₹${rate}/${product.unit} kar sakte hain. Aap confirm kar dein?` : `Bhaiya, ${product.name} ke ${qty} ${product.unit} ₹${rate}/${product.unit} par draft kar diya hai. Owner confirmation ke baad hi final hoga.` };
}
export function importCSV(filename: string, text: string, data: Dataset): Dataset {
  const key = filename.toLowerCase().replace(/\.csv$/, '');
  if (!['invoices', 'payments', 'quotes'].includes(key)) throw new Error('Use invoices.csv, payments.csv or quotes.csv');
  const numeric = key === 'invoices' ? 'total' : key === 'payments' ? 'amount' : 'taxable_value';
  const rows = parseCSV(text).map(row => { if (row[numeric] === undefined || !row[numeric].trim()) throw new Error(`Missing ${numeric}`); return { ...row, [numeric]: Number(row[numeric]) }; });
  const schema = key === 'invoices' ? invoiceSchema : key === 'payments' ? paymentSchema : quoteSchema;
  const validated = z.array(schema).parse(rows);
  const id = key === 'invoices' ? 'invoice_id' : key === 'payments' ? 'payment_id' : 'quote_id';
  const ids = validated.map(row => (row as Record<string, unknown>)[id]);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate row IDs are not allowed');
  return { ...data, [key]: validated } as Dataset;
}
