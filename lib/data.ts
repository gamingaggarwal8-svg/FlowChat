/** Server-only file loading. Reference metrics are never inputs to analytics. */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parseCSV } from './csv';
import { attributeSchema } from './catalog';
import type { AnalyticsData, PaymentPromise, SourceRef } from './analytics';

const text = z.string().trim().min(1);
const date = z.iso.date();
const nullableDate = z.union([date, z.literal('').transform(() => null), z.null()]);
const number = text.transform(Number).pipe(z.number().finite().nonnegative());
const maybeNumber = z.union([number, z.literal('').transform(() => null)]);
const invoice = z.object({ date, due_date: nullableDate, total: number });
const supplierInvoice = invoice.extend({ supplier_invoice_id: text, supplier: text, po_id: text });
const customerInvoice = invoice.extend({ invoice_id: text, customer: text });
const payment = z.object({ payment_id: text, date, amount: number });
const customerPayment = payment.extend({ customer: text });
const supplierPayment = payment.extend({ supplier: text });
const quote = z.object({ quote_id: text, customer: text, date, taxable_value: number, status: z.enum(['open', 'confirmed', 'closed']), items: text });
const salesLine = z.object({ invoice_id:text, customer:text, date, sku:text, qty:number, rate:number, amount:number });
const customer = z.object({ customer: text, city: text });
const supplier = z.object({ supplier_id: text, supplier: text, city: text, contact:text, credit_days:number, skus:text });
const purchaseOrder = z.object({ po_id: text, supplier: text, order_date: date, promised_delivery: nullableDate, actual_delivery: nullableDate });
const purchaseLine = z.object({ po_id: text, sku: text, qty: number, rate: number });
const inventory = z.object({ sku: text, name: text, unit: text, current_stock: number, reorder_level: maybeNumber, cost_price: maybeNumber, avg_weekly_sales_8w: maybeNumber, weeks_cover: maybeNumber, supplier_id: text });
const stockMovement = z.object({ date, sku: text, type: z.enum(['OPENING','IN','OUT']), qty: number, reference: text, running_balance: text.transform(Number).pipe(z.number().finite()) });
// Only the fields consumed by Stage 1 are validated here. Unknown extraction fields are
// retained in cache files for later extraction stages, not used as money/stock truth.
const promise = z.object({ made_on: date, promised_date: date.nullable(), amount: z.number().finite().nonnegative().nullable(), quote: text, via_voice: z.boolean().optional().default(false) });
const customerCache = z.object({ promises: z.array(promise) });
const supplierCache = z.object({ owner_payment_promises: z.array(promise), purchase_orders: z.array(z.object({ po_id: text.nullable(), delivery_promise: z.object({ promised_date: nullableDate, revised_promised_date: nullableDate.optional() }) })) });
export const slug = (name: string) => name.toLowerCase().replaceAll(' ', '_');
const ref = (file: string, id: string): SourceRef => ({ file, id });

async function readJSON(file: string): Promise<unknown> { return JSON.parse(await readFile(file, 'utf8')); }
async function csv<T>(root: string, file: string, schema: z.ZodType<T>): Promise<T[]> {
  try { return z.array(schema).parse(parseCSV(await readFile(path.join(root, file), 'utf8'))); }
  catch (cause) { throw new Error(`Invalid or missing dataset file: ${file}`, { cause }); }
}
function assertUnique<T>(rows: T[], key: (row: T) => string, file: string): void {
  const ids = rows.map(key);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate IDs in ${file}`);
}
async function cached<T>(root: string, segment: 'customers'|'suppliers', name: string, schema: z.ZodType<T>, fallback: unknown, warnings: string[]) {
  const relative = `extracted/${segment}/${slug(name)}.json`;
  try { return { value: schema.parse(await readJSON(path.join(root, relative))), file: relative }; }
  catch (error) {
    // Missing/invalid cache must not prevent a reliable demo. Corrupt data isn't silent.
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) warnings.push(`${relative}: invalid cache; using supplied demo annotations`);
    return { value: schema.parse(fallback), file: segment === 'customers' ? 'expected_extraction.json' : 'suppliers/expected_extraction_suppliers.json' };
  }
}
export async function loadData(root = path.join(process.cwd(), 'data')): Promise<AnalyticsData & { warnings: string[] }> {
  const [ci, cp, si, sp, quotes, customers, suppliers, pos, lines, stock, moves, customerTruth, supplierTruth, salesLines, productAttributes] = await Promise.all([
    csv(root,'invoices.csv',customerInvoice), csv(root,'payments.csv',customerPayment),
    csv(root,'suppliers/supplier_invoices.csv',supplierInvoice), csv(root,'suppliers/supplier_payments.csv',supplierPayment),
    csv(root,'quotes.csv',quote), csv(root,'customers.csv',customer), csv(root,'suppliers/suppliers.csv',supplier),
    csv(root,'suppliers/purchase_orders.csv',purchaseOrder), csv(root,'suppliers/purchase_lines.csv',purchaseLine),
    csv(root,'inventory/inventory_snapshot.csv',inventory), csv(root,'inventory/stock_movements.csv',stockMovement),
    readJSON(path.join(root,'expected_extraction.json')).then(v => z.record(z.string(), z.unknown()).parse(v)),
    readJSON(path.join(root,'suppliers/expected_extraction_suppliers.json')).then(v => z.record(z.string(), z.unknown()).parse(v)),
    csv(root,'order_lines.csv',salesLine),
    csv(root,'product_attributes.csv',attributeSchema),
  ]);
  for (const [rows, field, file] of [[ci,'invoice_id','invoices.csv'],[cp,'payment_id','payments.csv'],[si,'supplier_invoice_id','suppliers/supplier_invoices.csv'],[sp,'payment_id','suppliers/supplier_payments.csv'],[pos,'po_id','suppliers/purchase_orders.csv'],[stock,'sku','inventory/inventory_snapshot.csv']] as const) {
    assertUnique(rows as Record<string,unknown>[], r => String(r[field]), file);
  }
  const warnings: string[] = [];
  const customerPromises: PaymentPromise[] = [], ownerPromises: PaymentPromise[] = [];
  const revisions = new Map<string, { date: string|null; source: SourceRef }>();
  // Load annotations with cache precedence. Statuses in reference files are deliberately ignored.
  for (const c of customers) {
    const cache = await cached(root,'customers',c.customer,customerCache,customerTruth[c.customer],warnings);
    cache.value.promises.forEach((p, index) => customerPromises.push({ id:`${slug(c.customer)}:promise:${index}`,party:c.customer,direction:'customer_to_owner',madeOn:p.made_on,promisedDate:p.promised_date,amount:p.amount,quote:p.quote,viaVoice:p.via_voice,source:ref(cache.file,`${c.customer}:promises[${index}]`),chatFile:`chats/${slug(c.customer)}.txt` }));
  }
  for (const s of suppliers) {
    const cache = await cached(root,'suppliers',s.supplier,supplierCache,supplierTruth[s.supplier],warnings);
    cache.value.owner_payment_promises.forEach((p, index) => ownerPromises.push({ id:`${slug(s.supplier)}:promise:${index}`,party:s.supplier,direction:'owner_to_supplier',madeOn:p.made_on,promisedDate:p.promised_date,amount:p.amount,quote:p.quote,viaVoice:p.via_voice,source:ref(cache.file,`${s.supplier}:owner_payment_promises[${index}]`),chatFile:`suppliers/chats/${slug(s.supplier)}.txt` }));
    cache.value.purchase_orders.forEach(p => {if(p.po_id)revisions.set(p.po_id,{date:p.delivery_promise.revised_promised_date??null,source:ref(cache.file,p.po_id)});});
  }
  return {
    salesLines:salesLines.map((s,index)=>({invoiceId:s.invoice_id,customer:s.customer,date:s.date,sku:s.sku,qty:s.qty,rate:s.rate,amount:s.amount,source:ref('order_lines.csv',`${s.invoice_id}:${s.sku}:${index}`)})),
    customerInvoices:ci.map(i=>({id:i.invoice_id,party:i.customer,date:i.date,dueDate:i.due_date,total:i.total,source:ref('invoices.csv',i.invoice_id)})),
    customerPayments:cp.map(p=>({id:p.payment_id,party:p.customer,date:p.date,amount:p.amount,source:ref('payments.csv',p.payment_id)})),
    supplierInvoices:si.map(i=>({id:i.supplier_invoice_id,party:i.supplier,date:i.date,dueDate:i.due_date,total:i.total,poId:i.po_id,source:ref('suppliers/supplier_invoices.csv',i.supplier_invoice_id)})),
    supplierPayments:sp.map(p=>({id:p.payment_id,party:p.supplier,date:p.date,amount:p.amount,source:ref('suppliers/supplier_payments.csv',p.payment_id)})),
    quotes:quotes.map(q=>({id:q.quote_id,customer:q.customer,date:q.date,taxableValue:q.taxable_value,status:q.status,items:q.items,source:ref('quotes.csv',q.quote_id)})),
    customers:customers.map(c=>({name:c.customer,city:c.city})), suppliers:suppliers.map(s=>({id:s.supplier_id,name:s.supplier,city:s.city,contact:s.contact,creditDays:s.credit_days,skus:s.skus.split(' ')})),
    purchaseOrders:pos.map(p=>({id:p.po_id,supplier:p.supplier,orderDate:p.order_date,promisedDate:p.promised_delivery,actualDelivery:p.actual_delivery,revisedPromisedDate:revisions.get(p.po_id)?.date??null,source:ref('suppliers/purchase_orders.csv',p.po_id),annotationSource:revisions.get(p.po_id)?.source})),
    purchaseLines:lines.map((l,index)=>({poId:l.po_id,sku:l.sku,qty:l.qty,rate:l.rate,source:ref('suppliers/purchase_lines.csv',`${l.po_id}:${l.sku}:${index}`)})),
    inventory:stock.map(i=>({sku:i.sku,name:i.name,unit:i.unit,currentStock:i.current_stock,reorderLevel:i.reorder_level,costPrice:i.cost_price,avgWeeklySales:i.avg_weekly_sales_8w,reportedWeeksCover:i.weeks_cover,supplierId:i.supplier_id,source:ref('inventory/inventory_snapshot.csv',i.sku)})),
    stockMovements:moves.map((m,index)=>({id:`movement:${index+2}`,date:m.date,sku:m.sku,type:m.type,qty:m.qty,reference:m.reference,reportedBalance:m.running_balance,source:ref('inventory/stock_movements.csv',`row:${index+2}`)})),
    customerPromises, ownerPromises, productAttributes, warnings,
  };
}

/** Safe server-side chat evidence loader; callers select only real dataset filenames. */
export async function loadChat(segment: 'customers'|'suppliers', name: string, root = path.join(process.cwd(), 'data')) {
  const directory = segment === 'customers' ? path.join(root,'chats') : path.join(root,'suppliers/chats');
  const filename = `${slug(name)}.txt`;
  if (!(await readdir(directory)).includes(filename)) throw new Error('Unknown chat');
  return readFile(path.join(directory,filename),'utf8');
}
