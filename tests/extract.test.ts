import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractChat } from '../lib/extract';

test('validates tool output and retries once, without ledger answers', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-only-not-a-real-key';
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'claude-sonnet-5-5');
    assert.equal(body.tool_choice.name, 'extract_chat');
    const input = calls === 1 ? { customer: 'Example' } : { customer: 'Example', orders: [], promises: [], open_quotes: [] };
    return new Response(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id: 'tool_test', name: 'extract_chat', input }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await extractChat('01/11/2026, 09:00 - Example: Namaste', 'Example');
    assert.equal(calls, 2); assert.deepEqual(result.promises, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
  }
});
