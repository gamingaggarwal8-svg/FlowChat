import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { extractChat, EXTRACTION_MODEL } from '../lib/extract';
import { evaluate, type Expected } from '../lib/evaluate';

async function main() {
  const data = path.join(process.cwd(), 'data');
  const expected: Record<string, Expected> = JSON.parse(await readFile(path.join(data, 'expected_extraction.json'), 'utf8'));
  const available = (await readdir(path.join(data, 'chats'))).filter(f => f.endsWith('.txt')).map(f => f.slice(0, -4)).sort();
  const selected = process.argv.slice(2);
  const slugs = selected.length ? selected : available;
  console.log(`FlowChat extraction eval | demo date 2026-11-14 | model ${EXTRACTION_MODEL}`);
  let failures = 0;
  for (const slug of slugs) {
    if (!available.includes(slug)) { console.log(`\n${slug}: ERROR unknown customer`); failures++; continue; }
    const name = Object.keys(expected).find(name => name.toLowerCase().replaceAll(' ', '_') === slug);
    if (!name) { console.log(`\n${slug}: ERROR missing expected record`); failures++; continue; }
    try {
      const actual = await extractChat(await readFile(path.join(data, 'chats', `${slug}.txt`), 'utf8'), name);
      const result = evaluate(actual, expected[name]);
      console.log(`\n${slug}`);
      for (const label of ['promises', 'orders'] as const) {
        const r = result[label];
        console.log(`  ${label}: precision=${(100 * r.precision).toFixed(1)}% recall=${(100 * r.recall).toFixed(1)}% matched=${r.tp} predicted=${actual[label].length} expected=${expected[name][label].length}`);
      }
      console.log(`  mismatches: ${result.mismatches.length}`);
      result.mismatches.forEach(m => console.log(`    ${m}`));
    } catch (error) {
      failures++;
      console.log(`\n${slug}: ERROR ${error instanceof Error ? error.message : String(error)}`);
      console.log('  precision/recall: NOT SCORED; mismatch list unavailable (no model output)');
    }
  }
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
