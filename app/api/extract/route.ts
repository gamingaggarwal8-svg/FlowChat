import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { extractChat } from '../../../lib/extract';

export const runtime = 'nodejs';
export const maxDuration = 180;
const bodySchema = z.object({ customer: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/) }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'customer must be a chat slug, e.g. sharma_textiles' }, { status: 400 });
  const directory = path.join(process.cwd(), 'data', 'chats');
  const filename = `${parsed.data.customer}.txt`;
  try {
    if (!(await readdir(directory)).includes(filename)) return Response.json({ error: 'Customer chat not found' }, { status: 404 });
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'Extraction is not configured: missing ANTHROPIC_API_KEY' }, { status: 503 });
    const chatText = await readFile(path.join(directory, filename), 'utf8');
    const customerName = parsed.data.customer.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
    return Response.json(await extractChat(chatText, customerName));
  } catch {
    // Do not return provider errors or customer chat content to API callers.
    return Response.json({ error: 'Extraction failed; check server configuration and retry.' }, { status: 502 });
  }
}
