import { beforeAll, describe, expect, it } from 'vitest';
import { loadData, loadChat } from '../lib/data';
import { qualifyStock, inventoryPlan, groupStockCapital, evaluatePromise, type AnalyticsData } from '../lib/analytics';
import { attributesFor, emptyFilters, filterInventory } from '../lib/catalog';
import { transcriptFileText, voiceEntries } from '../lib/voice';
let data:AnalyticsData;
beforeAll(async()=>{data=await loadData();});
describe('on-hand quantity qualification',()=>{
 it('distinguishes empty, critical, low, adequate and excess at exact boundaries',()=>{
  expect(qualifyStock(0,100,0)).toBe('Out of stock');
  expect(qualifyStock(49,100,1)).toBe('Critical');expect(qualifyStock(50,100,1)).toBe('Low');
  expect(qualifyStock(99,100,2)).toBe('Low');expect(qualifyStock(100,100,3)).toBe('Adequate');
  expect(qualifyStock(200,100,12)).toBe('Excess');
 });
 it('does not mislabel missing/invalid stock as available',()=>{
  expect(qualifyStock(null,100,1)).toBe('Unverified');expect(qualifyStock(-1,100,1)).toBe('Unverified');
  expect(qualifyStock(100,null,1)).toBe('Unverified');expect(qualifyStock(100,50,null)).toBe('Unverified');
 });
 it('qualifies only on-hand P01 quantity, not its 600 metres incoming',()=>{
  const p=inventoryPlan(data).focus!;expect(p.openPoQty).toBe(600);expect(qualifyStock(p.stock,p.reorderLevel,p.weeksCover)).toBe('Critical');
 });
});
describe('catalog segmentation and comparable graph values',()=>{
 const rows=()=>inventoryPlan(data).items.map(i=>({...i,quantityBand:qualifyStock(i.stock,i.reorderLevel,i.weeksCover)}));
 it('combines fabric, colour, audience, type and unit filters',()=>{
  const selected=filterInventory(rows(),data.productAttributes??[],{...emptyFilters,fabric:'Cotton',color:'Blue',gender:'Not applicable',category:'Fabric',unit:'mtr'});
  expect(selected.map(i=>i.sku)).toEqual(['P01']);
 });
 it('filters garment audiences without inventing unspecified colours',()=>{
  expect(filterInventory(rows(),data.productAttributes??[],{...emptyFilters,gender:'Women'}).map(i=>i.sku)).toEqual(['P07']);
  expect(attributesFor('P07',data.productAttributes??[]).color).toBe('Unspecified');
  expect(attributesFor('unknown',[]).gender).toBe('Unspecified');
 });
 it('keeps stock quantity selection separate from unit and empty states',()=>{
  expect(filterInventory(rows(),data.productAttributes??[],{...emptyFilters,band:'Critical'}).map(i=>i.sku)).toEqual(['P01']);
  expect(filterInventory(rows(),data.productAttributes??[],{...emptyFilters,color:'Blue',unit:'pc'})).toEqual([]);
 });
 it('groups capital in rupees, preserving total value across fabric or gender categories',()=>{
  for(const dimension of ['fabric','color','gender','category'] as const){
   expect(groupStockCapital(rows(),data.productAttributes??[],dimension).reduce((s,g)=>s+g.value,0)).toBe(374395);
  }
  expect(groupStockCapital(rows(),data.productAttributes??[],'category').find(g=>g.name==='Ready-made')?.value).toBe(101825);
 });
});
describe('voice transcript evidence and import',()=>{
 it('preserves both supplied voice transcripts and their message dates',async()=>{
  const chats=await Promise.all(data.customers.map(async c=>({party:c.name,segment:'customers' as const,text:await loadChat('customers',c.name),source:`chats/${c.name.toLowerCase().replaceAll(' ','_')}.txt`})));
  const voices=voiceEntries(chats);expect(voices).toHaveLength(2);
  const gupta=voices.find(v=>v.party==='Gupta Fabrics')!;
  expect(gupta.date).toBe('2026-11-11');expect(gupta.text).toBe('kal tak 15000 pakka bhej deta hoon');
  const annotation=data.customerPromises.find(p=>p.party===gupta.party&&p.viaVoice&&p.madeOn===gupta.date&&p.quote===gupta.text)!;
  expect(evaluatePromise(annotation,data.customerPayments).status).toBe('potentially_missed');
 });
 it('does not turn ordinary messages or unmarked text into voice evidence',()=>{
  expect(voiceEntries([{party:'X',segment:'customers',text:'11/11/2026, 15:25 - X: dekhta hoon',source:'x.txt'}])).toEqual([]);
 });
 it('imports transcript text without claiming to transcribe an audio file',()=>{
  expect(transcriptFileText('note.txt',' kal tak bhej dunga ')).toBe('kal tak bhej dunga');
  expect(transcriptFileText('note.vtt','WEBVTT\n\nkal tak')).toContain('WEBVTT');
  expect(()=>transcriptFileText('note.ogg','binary')).toThrow();
  expect(()=>transcriptFileText('note.txt',' ')).toThrow();
 });
});
