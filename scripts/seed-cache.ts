import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { slug } from '../lib/data';

async function seed() {
  const root=path.join(process.cwd(),'data');
  for(const [segment,file] of [['customers','expected_extraction.json'],['suppliers','suppliers/expected_extraction_suppliers.json']] as const) {
    const records:Record<string,unknown>=JSON.parse(await readFile(path.join(root,file),'utf8'));
    const directory=path.join(root,'extracted',segment);await mkdir(directory,{recursive:true});
    let written=0;
    for(const [name,value] of Object.entries(records)) {
      try { await writeFile(path.join(directory,`${slug(name)}.json`),JSON.stringify(value,null,2)+'\n',{flag:'wx'}); written++; }
      catch(error) { if(!(error instanceof Error&&'code' in error&&error.code==='EEXIST'))throw error; }
    }
    console.log(`${segment}: seeded ${written} files; preserved existing caches`);
  }
}
seed().catch(error=>{console.error(error);process.exitCode=1;});
