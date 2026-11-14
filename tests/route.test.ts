import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/extract/route';
const request = (body: string) => new Request('http://localhost/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
test('route rejects invalid JSON and traversal', async () => {
  assert.equal((await POST(request('{'))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ customer: '../expected_extraction' })))).status, 400);
});
test('route distinguishes nonexistent chats', async () => {
  assert.equal((await POST(request(JSON.stringify({ customer: 'unknown_customer' })))).status, 404);
});
