import { z } from 'zod';

const date = z.iso.date();
export const extractionSchema = z.object({
  customer: z.string().min(1),
  orders: z.array(z.object({
    invoice_id: z.string().nullable(),
    chat_date: date,
    items: z.array(z.object({
      name: z.string().min(1),
      qty: z.number().nonnegative().nullable(),
      rate: z.number().nonnegative().nullable(),
    }).strict()),
    status: z.enum(['inquiry', 'negotiating', 'confirmed']),
    ambiguous: z.boolean(),
    evidence_quote: z.string().min(1),
  }).strict()),
  promises: z.array(z.object({
    made_on: date,
    promised_date: date.nullable(),
    amount: z.number().nonnegative().nullable(),
    quote: z.string().min(1),
    via_voice: z.boolean(),
    confidence: z.number().min(0).max(1),
  }).strict()),
  open_quotes: z.array(z.object({
    date,
    items_text: z.string().min(1),
    status: z.literal('open'),
  }).strict()),
}).strict();

export type ChatExtraction = z.infer<typeof extractionSchema>;
// Generated from the same schema so runtime validation and tool shape stay aligned.
const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(extractionSchema);
export const extractionJsonSchema = jsonSchema;
