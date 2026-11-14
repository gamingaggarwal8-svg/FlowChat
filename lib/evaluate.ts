import type { ChatExtraction } from './schema';
export type Expected = {
  orders: Array<Omit<ChatExtraction['orders'][number], 'evidence_quote'> & { evidence_quote?: string }>;
  promises: Array<Omit<ChatExtraction['promises'][number], 'confidence'> & { confidence?: number; expected_status?: string }>;
  open_quotes?: unknown[];
};
export function scoreRows<T, U>(actual: T[], expected: U[], matches: (a: T, e: U) => boolean) {
  // Maximum one-to-one matching: duplicate predictions cannot claim the same truth row.
  const owners = new Map<number, number>();
  function augment(ai: number, seen: Set<number>): boolean {
    for (let ei = 0; ei < expected.length; ei++) {
      if (seen.has(ei) || !matches(actual[ai], expected[ei])) continue;
      seen.add(ei);
      const prior = owners.get(ei);
      if (prior === undefined || augment(prior, seen)) { owners.set(ei, ai); return true; }
    }
    return false;
  }
  actual.forEach((_, ai) => augment(ai, new Set()));
  const pairs = [...owners].map(([ei, ai]) => ({ ai, ei }));
  const used = new Set(pairs.map(p => p.ai));
  return {
    tp: pairs.length,
    precision: actual.length ? pairs.length / actual.length : expected.length ? 0 : 1,
    recall: expected.length ? pairs.length / expected.length : 1,
    pairs,
    extra: actual.filter((_, i) => !used.has(i)),
    missing: expected.filter((_, i) => !owners.has(i)),
  };
}
export function itemSignature(items: Array<{ qty: number | null; rate: number | null }>) {
  return JSON.stringify(items.map(i => [i.qty, i.rate]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export function evaluate(actual: ChatExtraction, expected: Expected) {
  const promises = scoreRows(actual.promises, expected.promises, (a, e) => a.promised_date === e.promised_date && a.amount === e.amount);
  const orders = scoreRows(actual.orders, expected.orders, (a, e) =>
    a.invoice_id && e.invoice_id ? a.invoice_id === e.invoice_id :
      a.items.length > 0 && e.items.length > 0 && a.items.every(i => i.qty !== null && i.rate !== null) && e.items.every(i => i.qty !== null && i.rate !== null) && itemSignature(a.items) === itemSignature(e.items));
  const mismatches: string[] = [];
  for (const [label, result] of [['promise', promises], ['order', orders]] as const) {
    result.missing.forEach(row => mismatches.push(`MISSING ${label}: ${JSON.stringify(row)}`));
    result.extra.forEach(row => mismatches.push(`EXTRA ${label}: ${JSON.stringify(row)}`));
  }
  for (const { ai, ei } of promises.pairs) {
    const a = actual.promises[ai], e = expected.promises[ei];
    for (const key of ['made_on', 'quote', 'via_voice'] as const) {
      if (a[key] !== e[key]) mismatches.push(`promise[${ei}].${key}: expected ${JSON.stringify(e[key])}; got ${JSON.stringify(a[key])}`);
    }
  }
  for (const { ai, ei } of orders.pairs) {
    const a = actual.orders[ai], e = expected.orders[ei];
    for (const key of ['invoice_id', 'chat_date', 'status', 'ambiguous'] as const) {
      if (a[key] !== e[key]) mismatches.push(`order[${ei}].${key}: expected ${JSON.stringify(e[key])}; got ${JSON.stringify(a[key])}`);
    }
    // Compare all names/qty/rates, ignoring expected-only sku and array order.
    const canonical = (items: typeof a.items) => JSON.stringify(items.map(({ name, qty, rate }) => ({ name, qty, rate })).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
    if (canonical(a.items) !== canonical(e.items)) mismatches.push(`order[${ei}].items: expected ${canonical(e.items)}; got ${canonical(a.items)}`);
  }
  // Expected open quotes contain quote_id/taxable_value rather than items_text/status.
  // Dates/count can still be checked without inventing comparable fields.
  if (expected.open_quotes) {
    const dates = (rows: unknown[]) => JSON.stringify(rows.map(row => (row as { date: string }).date).sort());
    if (dates(actual.open_quotes) !== dates(expected.open_quotes)) mismatches.push(`open_quotes dates: expected ${dates(expected.open_quotes)}; got ${dates(actual.open_quotes)}`);
  }
  return { promises, orders, mismatches };
}
