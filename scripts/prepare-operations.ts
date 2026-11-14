import { writeFile, readFile } from 'node:fs/promises';
import { loadData } from '../lib/data';
async function main() {
 const data=await loadData();
 const supplierChats=await Promise.all(data.suppliers.map(async s=>({supplier:s.name,text:await readFile(`data/suppliers/chats/${s.name.toLowerCase().replaceAll(' ','_')}.txt`,'utf8')})));
 await writeFile('demo/operations.json',JSON.stringify({...data,supplierChats},null,2)+'\n');
 console.log('Prepared v2 customer, supplier, inventory and sales rows for the static demo.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
