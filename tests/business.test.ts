import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../demo/seed.json';
import { metrics, promiseStatus, importCSV, parseCSV, bargain, answerQuestion, type Dataset } from '../lib/business';
const data = seed as Dataset;
test('ledger reconciles uploaded dataset independently of expected extraction amounts',()=>{
 const m=metrics(data);
 assert.equal(m.outstanding,631417); assert.equal(m.overdue,217892); assert.equal(m.openQuotes,275000);
 assert.equal(m.ledger[0].customer,'Sharma Textiles'); assert.equal(m.ledger[0].outstanding,91803);
 assert.equal(m.ledger.find(c=>c.customer==='Verma Garments')?.outstanding,0);
 for(const c of m.ledger)assert.equal(c.billed-c.paid+c.credit,c.outstanding);
});
test('promise statuses reproduce documented demo counts from payments',()=>{
 const m=metrics(data);
 for(const [status,count] of Object.entries({Missed:4,Partial:3,Kept:3,Pending:3}))assert.equal(m.promises.filter(p=>p.status===status).length,count,status);
 assert.equal(m.missed,75000);
 assert.equal(m.promises.find(p=>p.customer==='Gupta Fabrics'&&p.via_voice)?.status,'Missed');
});
test('future payments are excluded and missing promise dates require review',()=>{
 const p={customer:'Test',made_on:'2026-11-10',promised_date:'2026-11-13',amount:100,quote:'x',via_voice:false};
 assert.equal(promiseStatus(p,[{customer:'Test',payment_id:'p',date:'2026-11-15',amount:100}]).paid,0);
 assert.equal(promiseStatus({...p,promised_date:null},[]).status,'Review');
});
test('CSV supports quotes, BOM, CRLF and rejects invalid dates and duplicates',()=>{
 assert.equal(parseCSV('\uFEFFname,notes\r\nA,"one, two"\r\n')[0].notes,'one, two');
 assert.throws(()=>importCSV('payments.csv','payment_id,customer,date,amount\np,X,2026-02-30,100',data));
 assert.throws(()=>importCSV('payments.csv','payment_id,customer,date,amount\np,X,2026-11-01,10\np,X,2026-11-02,20',data));
 const next=importCSV('payments.csv','payment_id,customer,date,amount\np,Sharma Textiles,2026-11-14,100',data);
 assert.equal(next.payments.length,1); assert.equal(data.payments.length,27);
});
test('below-floor offers are countered without revealing floor in customer reply',()=>{
 const p=data.products[0]; const r=bargain(p,185,100);
 assert.equal(r.belowFloor,true);assert.ok(r.rate>=p.floor_price);assert.ok(!r.draft.includes('floor'));assert.ok(!r.draft.includes(String(p.floor_price)));
 assert.equal(bargain(p,205,100).rate,205);assert.throws(()=>bargain(p,-1,2));
});
test('answers use calculation results, not generated numbers',()=>{
 const a=answerQuestion('Kis customer ka sabse zyada paisa atka hai?',data);
 assert.match(a.title,/Sharma/);assert.equal(a.rows.length,4);
 assert.equal(answerQuestion('Show overdue payments',data).rows.length,7);
 assert.equal(answerQuestion('Make something up',data).rows.length,0);
});
