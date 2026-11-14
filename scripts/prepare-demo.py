import csv,json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
data=root/'data'
result={}
for name in ['invoices','payments','customers','quotes','products']:
 with (data/(name+'.csv')).open() as f: rows=list(csv.DictReader(f))
 for row in rows:
  for key in ['taxable','gst','total','amount','taxable_value','credit_days','list_price','floor_price','gst_rate']:
   if key in row: row[key]=float(row[key])
 result[name]=rows
truth=json.loads((data/'expected_extraction.json').read_text())
result['promises']=[dict(customer=customer,**{k:v for k,v in promise.items() if k!='expected_status'}) for customer, record in truth.items() for promise in record['promises']]
result['chats']=[{'customer':next(name for name in truth if name.lower().replace(' ','_')==p.stem),'text':p.read_text(),'filename':p.name} for p in sorted((data/'chats').glob('*.txt'))]
(root/'demo'/'seed.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
