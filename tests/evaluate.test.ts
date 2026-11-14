import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRows, evaluate } from '../lib/evaluate';
import { extractionSchema } from '../lib/schema';

test('duplicate predictions cannot inflate recall', () => {
  const r = scoreRows([1, 1], [1], (a, b) => a === b);
  assert.equal(r.precision, 0.5); assert.equal(r.recall, 1); assert.equal(r.extra.length, 1);
});
test('matching reassigns pairs rather than losing a valid match', () => {
  const r = scoreRows(['broad', 'only-first'], [0, 1], (a, b) => a === 'broad' || b === 0);
  assert.equal(r.tp, 2);
});
test('schema rejects impossible dates, missing keys and invalid confidence', () => {
  const p = { customer: 'X', orders: [], open_quotes: [], promises: [{ made_on: '2026-02-30', promised_date: null, amount: null, quote: 'x', via_voice: false, confidence: 1.1 }] };
  assert.equal(extractionSchema.safeParse(p).success, false);
  assert.equal(extractionSchema.safeParse({ customer: 'X' }).success, false);
});
test('voice mismatch is reported even when promise identity matches', () => {
  const p = { made_on: '2026-11-11', promised_date: '2026-11-12', amount: 15000, quote: 'kal tak', via_voice: false, confidence: 1 };
  const r = evaluate({ customer: 'X', orders: [], open_quotes: [], promises: [p] }, { orders: [], promises: [{ ...p, via_voice: true }] });
  assert.equal(r.promises.recall, 1); assert.match(r.mismatches[0], /via_voice/);
});
