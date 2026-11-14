import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadData, loadChat } from '../lib/data';
import { addDays, inventoryPlan, allAnalytics, cashAnalytics, customerAnalytics, dueInDays, evaluateDelivery, evaluatePromise, inventoryAnalytics, reconcileLedger, supplierAnalytics, type AnalyticsData, type LedgerInvoice, type LedgerPayment, type PaymentPromise, type PurchaseOrder } from '../lib/analytics';

let data: AnalyticsData;
let result: ReturnType<typeof allAnalytics>;
beforeAll(async()=>{ data=await loadData(); result=allAnalytics(data); });
const source={file:'test.csv',id:'test'};
const testPromise:PaymentPromise={id:'promise',party:'Test',direction:'customer_to_owner',madeOn:'2026-11-10',promisedDate:'2026-11-12',amount:100,quote:'kal tak',viaVoice:false,source,chatFile:'test.txt'};
const pay=(id:string,date:string,amount:number,party='Test'):LedgerPayment=>({id,date,amount,party,source});
const inv=(id:string,date:string,total:number,dueDate:string|null='2026-11-13',party='Test'):LedgerInvoice=>({id,date,total,dueDate,party,source});

describe('customer ledger and promise reference values',()=>{
 it('reconciles receivables and overdue, keeping matched payment IDs',()=>{
  expect(result.customers.receivables).toBe(631417);expect(result.customers.overdue).toBe(217892);
  expect(result.customers.topCustomer?.party).toBe('Sharma Textiles');expect(result.customers.topCustomer?.outstanding).toBe(91803);
  expect(result.customers.ledger.find(c=>c.party==='Verma Garments')?.outstanding).toBe(0);
  for(const c of result.customers.ledger){
   expect(c.billed-c.paid+c.credit).toBe(c.outstanding);
   for(const i of c.invoices){
    expect(i.allocations.reduce((s,a)=>s+a.amount,0)).toBe(i.allocated);
    expect(i.allocations.every(a=>c.payments.some(p=>p.id===a.paymentId))).toBe(true);
   }
  }
 });
 it('computes 4 potentially missed, 3 partial, 3 kept and 3 pending',()=>{
  expect(result.customers.promiseCounts).toEqual({potentially_missed:4,partial:3,kept:3,pending:3,unverified:0});
  expect(result.customers.potentiallyMissedAmount).toBe(75000);
  expect(result.customers.promises.find(p=>p.party==='Gupta Fabrics'&&p.viaVoice)?.reviewRequired).toBe(true);
 });
 it('sums open quotes excluding GST',()=>{expect(result.customers.openQuotesTaxable).toBe(275000);expect(result.customers.openQuotes).toHaveLength(5);});
 it('keeps Sharma exact date/amount/quote without replacing it with pitch wording',()=>{
  const sharma=result.customers.promises.filter(p=>p.party==='Sharma Textiles');
  expect(sharma.map(p=>[p.promisedDate,p.amount])).toEqual([['2026-10-26',20000],['2026-11-09',15000]]);
  expect(sharma[1].quote).toBe('9 tarikh ko 15000 UPI kar dunga');
 });
});

describe('supplier ledger and delivery reference values',()=>{
 it('calculates supplier outstanding, overdue and 14-day dues',()=>{
  expect(result.suppliers.payables).toBe(416265);expect(result.suppliers.overdue).toBe(253394);
  expect(result.suppliers.dueNext14Days.amount).toBe(162871);
  expect(Object.fromEntries(result.suppliers.ledger.map(s=>[s.party,s.outstanding]))).toEqual({'Panipat Garments Unit':101415,'Surat Weave Mills':93516,'Ahmedabad Linen Co':71958,'Jaipur Print House':49770,'Delhi Lining and Trims':43212,'Silk Route Sarees':36654,'Ludhiana Denim Works':19740});
 });
 it('identifies late, delayed and open POs from dates, not supplied status labels',()=>{
  expect(result.suppliers.lateDeliveries.map(p=>p.id).sort()).toEqual(['PO-S01-2','PO-S03-2','PO-S05-3']);
  expect(result.suppliers.delayedPOs.map(p=>p.id)).toEqual(['PO-S01-4']);
  expect(result.suppliers.openPOs.map(p=>p.id).sort()).toEqual(['PO-S03-4','PO-S04-4','PO-S05-4']);
  expect(result.suppliers.delayedPOs[0].revisedPromisedDate).toBe('2026-11-16');
  expect(result.suppliers.reliability.find(s=>s.name==='Surat Weave Mills')?.lateCount).toBe(1);
 });
 it('checks owner promises against outgoing supplier payments',()=>{
  expect(Object.fromEntries(result.suppliers.ownerPromises.map(p=>[p.party,p.status]))).toEqual({'Surat Weave Mills':'potentially_missed','Ludhiana Denim Works':'pending','Silk Route Sarees':'partial','Panipat Garments Unit':'kept','Ahmedabad Linen Co':'partial'});
  expect(result.suppliers.ownerPromises.find(p=>p.party==='Panipat Garments Unit')?.evidence.map(p=>p.id)).toEqual(['SPAY-015']);
 });
});

describe('stock and cross-segment reference values',()=>{
 it('calculates low stock, overstock and inventory cost value',()=>{
  expect(result.inventory.lowStock.map(i=>i.sku).sort()).toEqual(['P01','P03','P05','P07']);
  expect(result.inventory.overstock.map(i=>i.sku).sort()).toEqual(['P08','P09']);
  expect(result.inventory.valueAtCost).toBe(374395);expect(result.inventory.unverifiedValueCount).toBe(0);
  expect(result.inventory.items.find(i=>i.sku==='P08')?.stockValue).toBe(94620);
 });
 it('recomputes every running stock balance without trusting running_balance',()=>{
  expect(result.inventory.movements.negativeRows).toEqual([]);expect(result.inventory.movements.inconsistentRows).toEqual([]);
  expect(result.inventory.items.every(i=>i.snapshotMatches)).toBe(true);
 });
 it('joins P01 low stock to the delayed supplier order',()=>{
  const p=result.inventory.restockAlerts.find(i=>i.sku==='P01');
  expect(p?.weeksCover).toBe(1.2);expect(p?.openPoQty).toBe(600);expect(p?.delayed.map(po=>po.id)).toEqual(['PO-S01-4']);
  expect(p?.supplier?.name).toBe('Surat Weave Mills');
 });
 it('calculates net position, future promise inflow and the cash exposure',()=>{
  expect(result.cash.netPosition).toBe(215152);expect(result.cash.expectedPromiseInflow).toBe(96243);expect(result.cash.supplierDuesNext14Days).toBe(162871);expect(result.cash.shortfall).toBe(66628);
  expect(result.cash.pendingPromises).toHaveLength(3);expect(result.cash.dueInvoices.every(i=>i.source.file==='suppliers/supplier_invoices.csv')).toBe(true);
 });
});

describe('boundary rules and evidence integrity',()=>{
 it('does FIFO across multiple payments while preserving customer isolation and credit',()=>{
  const rows=reconcileLedger([inv('I1','2026-11-01',100),inv('I2','2026-11-02',100)],[pay('A','2026-11-03',70),pay('B','2026-11-04',80),pay('C','2026-11-04',999,'Other')]);
  const test=rows.find(r=>r.party==='Test')!;
  expect(test.invoices.map(i=>i.remaining)).toEqual([0,50]);expect(test.invoices[0].allocations.map(a=>a.paymentId)).toEqual(['A','B']);expect(test.invoices[1].allocations).toEqual([{invoiceId:'I2',paymentId:'B',paymentDate:'2026-11-04',amount:50}]);
  expect(rows.find(r=>r.party==='Other')?.credit).toBe(999);
 });
 it('excludes future ledger entries and keeps due-today outside overdue',()=>{
  const rows=reconcileLedger([inv('today','2026-11-14',100,'2026-11-14'),inv('future','2026-11-15',100)],[pay('future','2026-11-15',100)]);
  expect(rows[0].outstanding).toBe(100);expect(rows[0].overdue).toBe(0);expect(dueInDays(rows,14).amount).toBe(100);
 });
 it('defines next 14 days inclusively and excludes overdue dues',()=>{
  const rows=reconcileLedger([inv('past','2026-11-01',1,'2026-11-13'),inv('start','2026-11-01',2,'2026-11-14'),inv('end','2026-11-01',3,'2026-11-28'),inv('later','2026-11-01',4,'2026-11-29')],[]);
  expect(dueInDays(rows,14).amount).toBe(5);
 });
 it('matches payments at 95%, includes grace-day boundary and ignores future/wrong-party payments',()=>{
  expect(evaluatePromise(testPromise,[pay('p','2026-11-14',95)]).status).toBe('kept');
  expect(evaluatePromise(testPromise,[pay('p','2026-11-14',94.99)]).status).toBe('partial');
  expect(evaluatePromise(testPromise,[pay('p','2026-11-15',100)]).status).toBe('potentially_missed');
  expect(evaluatePromise(testPromise,[pay('p','2026-11-12',100,'Other')]).paid).toBe(0);
 });
 it('uses partial before pending when some money has already arrived',()=>{
  const future={...testPromise,promisedDate:'2026-11-16'};
  expect(evaluatePromise(future,[pay('p','2026-11-12',20)]).status).toBe('partial');
  expect(evaluatePromise(future,[]).status).toBe('pending');
  expect(evaluatePromise({...testPromise,promisedDate:'2026-11-14'},[]).status).toBe('pending');
 });
 it('labels missing evidence/data unverified, never missed or kept',()=>{
  expect(evaluatePromise({...testPromise,amount:null},[]).status).toBe('unverified');
  expect(evaluatePromise({...testPromise,promisedDate:null},[]).status).toBe('unverified');
  expect(evaluatePromise(testPromise,null).status).toBe('unverified');
  const ledger=reconcileLedger([inv('i','2026-11-01',100,null)],[]);
  expect(ledger[0].unverifiedDue).toBe(100);expect(ledger[0].overdue).toBe(0);
 });
 it('does not hide a delay when a later delivery date is promised',()=>{
  const po:PurchaseOrder={id:'PO',supplier:'Test',orderDate:'2026-11-01',promisedDate:'2026-11-12',actualDelivery:null,revisedPromisedDate:'2026-11-16',source};
  expect(evaluateDelivery(po).status).toBe('delayed');
  expect(evaluateDelivery({...po,actualDelivery:'2026-11-12'}).status).toBe('on_time');
  expect(evaluateDelivery({...po,actualDelivery:'2026-11-13'}).status).toBe('late');
  expect(evaluateDelivery({...po,promisedDate:null}).status).toBe('unverified');
 });
 it('keeps decimal money exact and date math independent of local timezone',()=>{
  expect(reconcileLedger([inv('i','2026-11-01',0.3)],[pay('a','2026-11-02',0.1),pay('b','2026-11-02',0.2)])[0].outstanding).toBe(0);
  expect(addDays('2026-12-31',2)).toBe('2027-01-02');expect(()=>addDays('2026-02-30',1)).toThrow();
 });
 it('marks stock missing movement or sales evidence unverified rather than trusting snapshot status',()=>{
  const changed={...data,stockMovements:data.stockMovements.filter(m=>m.sku!=='P01')};
  const item=inventoryAnalytics(changed).items.find(i=>i.sku==='P01');expect(item?.status).toBe('unverified');expect(item?.stockValue).toBeNull();
 });
 it('responds to changed source data; reference totals are not embedded in calculations',()=>{
  const changed={...data,customerPayments:[...data.customerPayments,pay('NEW','2026-11-14',1000,'Sharma Textiles')]};
  expect(customerAnalytics(changed).receivables).toBe(630417);expect(cashAnalytics(changed).netPosition).toBe(214152);
  const supplied={...data,supplierPayments:[...data.supplierPayments,pay('NEW','2026-11-14',1000,'Surat Weave Mills')]};
  expect(supplierAnalytics(supplied).payables).toBe(415265);
 });
});

describe('cache and source loading',()=>{
 it('loads 12 customer caches and 7 supplier caches, retaining source quotes',async()=>{
  expect(data.customerPromises).toHaveLength(13);expect(data.ownerPromises).toHaveLength(5);
  expect(data.customerPromises.every(p=>p.source.file.startsWith('extracted/customers/'))).toBe(true);
  for(const p of [...data.customerPromises,...data.ownerPromises]) {
   expect(await loadChat(p.direction==='customer_to_owner'?'customers':'suppliers',p.party)).toContain(p.quote);
  }
 });
 it('falls back on missing/corrupt caches without using expected_metrics',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'flowchat-test-'));
  try{
   await cp(path.join(process.cwd(),'data'),root,{recursive:true});
   await rm(path.join(root,'expected_metrics.json'));
   await rm(path.join(root,'extracted/customers/sharma_textiles.json'));
   await writeFile(path.join(root,'extracted/suppliers/surat_weave_mills.json'),'{invalid');
   const fallback=await loadData(root);
   expect(customerAnalytics(fallback).receivables).toBe(631417);expect(supplierAnalytics(fallback).payables).toBe(416265);
   expect(fallback.customerPromises.find(p=>p.party==='Sharma Textiles')?.source.file).toBe('expected_extraction.json');
   expect(fallback.warnings).toHaveLength(1);
  } finally{await rm(root,{recursive:true,force:true});}
 });
});


describe('forward-looking stock planning',()=>{
 it('prioritizes proven sales contribution among low-stock SKUs',()=>{
  const p=inventoryPlan(data);
  expect(p.focus?.sku).toBe('P01');expect(p.focus?.indicativeContribution).toBe(48440);
  expect(p.priorities.map(i=>i.sku)).toEqual(['P01','P05','P07','P03']);
  expect(p.focus?.salesEvidence.every(s=>s.date>=p.windowStart&&s.date<=p.asOf)).toBe(true);
 });
 it('avoids a duplicate P01 order while its 600 metres are already inbound',()=>{
  const p=inventoryPlan(data).focus!;
  expect(p.openPoQty).toBe(600);expect(p.incrementalQty).toBe(0);
  expect(p.action).toBe('Expedite delayed stock');expect(p.targetStock).toBe(600);
 });
 it('makes scenario assumptions explicit and flags cash-constrained top-ups',()=>{
  const p=inventoryPlan(data,8); const item=p.items.find(i=>i.sku==='P01')!;
  expect(item.targetStock).toBe(800);expect(item.incrementalQty).toBe(80);
  expect(item.indicativeCost).toBe(12000);expect(item.needsCashReview).toBe(true);
  expect(()=>inventoryPlan(data,0)).toThrow();
 });
 it('pauses purchasing overstock and changes priority when observed sales change',()=>{
  const p=inventoryPlan(data);
  expect(p.items.find(i=>i.sku==='P08')?.action).toBe('Sell through; pause restocking');
  const changed={...data,salesLines:data.salesLines.filter(s=>s.sku!=='P01')};
  expect(inventoryPlan(changed).focus?.sku).toBe('P05');
 });
 it('does not mistake an inbound delay for no stock on order',()=>{
  const withoutOrder={...data,purchaseOrders:data.purchaseOrders.filter(po=>po.id!=='PO-S01-4')};
  const item=inventoryPlan(withoutOrder).items.find(i=>i.sku==='P01')!;
  expect(item.openPoQty).toBe(0);expect(item.incrementalQty).toBe(480);
  expect(item.action).toBe('Review measured top-up');
 });
});
