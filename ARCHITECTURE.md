# FlowChat: production integration plan

This document records the original production design. The server paths are now implemented; [INTEGRATIONS.md](INTEGRATIONS.md) is the authoritative setup and operating guide. Live connections require your credentials and Supabase migration. The static demo retains synthetic/local workflows. The current Excel integration polls saved file eTags rather than installing Graph notifications; outgoing WhatsApp and automatic audio transcription remain future work.

## Owner workflow

The owner keeps one structured Excel workbook in OneDrive or SharePoint, edits it in desktop Excel with cloud saving or Excel Online, and sees the last successful sync in FlowChat. A local-only spreadsheet cannot notify a cloud service until it is uploaded/synced.

```text
WhatsApp authorised chat exports ────────────────┐
                                               ↓
WhatsApp Business Platform → webhook → message store → extraction/review
                                               ↓
Excel in OneDrive/SharePoint → change notification → sync worker
                                               ↓
                            validation + idempotent transactional updates
                                               ↓
                          Supabase Postgres → deterministic analytics
                                               ↓
                          Realtime → authenticated FlowChat dashboard
```

Chats provide evidence about intentions and commitments. Financial/stock records provide the ledger. A customer saying “payment bhej diya” is not proof of receipt; matching a recorded payment is still a separate operation.

## WhatsApp access

- Initial/historical data: owner-authorised Export chat .txt uploads. Do not scrape WhatsApp Web.
- Ongoing messages: onboard a business number to the WhatsApp Business Platform/Cloud API and subscribe its webhook. Do not promise access to all personal chats, groups or historical messages through one token. History/coexistence capabilities depend on the onboarding path and eligibility.
- Capture approved FlowChat outgoing messages in an outbox. Owner messages sent elsewhere need an explicitly supported integration path before we can claim to track them.
- Voice notes: receive the media reference, fetch the authorised audio server-side, use a speech-to-text provider, retain source identifiers, and let the owner review names, amounts and dates. The current app only provides prepared/imported transcripts, local audio playback, and browser-dependent microphone recognition.
- Sending remains owner-approved. Outside the customer-service window, use the permitted approved template mechanism; business-initiated messaging also needs the relevant opt-in.

Official documentation: https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/

### WhatsApp cost

As of 14 November 2026, the developer pricing documentation reflects changes effective 1 October 2026. Incoming user-to-business messages have no Meta message fee. Each business number has a free tier of 1,000 delivered service messages per month; further service messages are charged. Delivered outbound template pricing depends on category and recipient market, with specific free-entry exceptions. Provider/BSP, hosting and AI-processing charges are separate. Do not assume that every reply inside the 24-hour window is unlimited/free or use an old rate card.

Current pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/

## Excel workbook structure

Use proper Excel tables and permanent record IDs, not row positions.

| Table | Minimum business fields |
|---|---|
| Products | sku, name, category, fabric, color, gender, unit, list_price, floor_price, cost_price |
| Customers | customer_id, name, phone, credit_days |
| Suppliers | supplier_id, name, phone, credit_days |
| SalesInvoices | invoice_id, customer_id, date, due_date, total, status |
| PurchaseInvoices | supplier_invoice_id, supplier_id, po_id, date, due_date, total, status |
| PaymentsReceived | payment_id, customer_id, date, amount, reference, status |
| PaymentsSent | payment_id, supplier_id, date, amount, reference, status |
| PurchaseOrders | po_id, supplier_id, order_date, promised_delivery, actual_delivery, status |
| PurchaseLines | line_id, po_id, sku, qty, rate |
| StockMovements | movement_id, date, sku, type, qty, reference, status |

On-hand stock = opening + actual receipts + returns in − sales/issues − returns out − damage/other approved adjustments. Placing a PO never increases on-hand stock; a receipt does. Do not maintain an independent editable stock total and count the same receipts again as movements.

## Sync strategy

1. Owner explicitly connects a Microsoft account and selects the workbook.
2. Subscribe to appropriate Microsoft Graph drive change notifications; use a delta cursor and periodic reconciliation as a missed-event fallback. Notifications identify a changed file, not every changed cell or individual workbook row.
3. After the saved file settles, download the current version, parse named tables, and validate dates, references, amounts, quantities and IDs. Detect a file version with an eTag/hash.
4. Stage a sync run. Compare rows by `(business_id, source_record_id)` and content checksum. Upsert, rather than insert blindly, so repeat notifications or an edited payment do not duplicate money.
5. Apply a consistent validated batch transaction; keep the prior good state and an understandable error report when validation fails. Record source version, changed fields and sync timestamp.
6. Recompute financial/stock results using deterministic functions, then invalidate relevant UI queries. Supabase Realtime can announce committed database changes.
7. Show Last synced, Syncing, Needs attention and last successful source version. Do not label a failed/stale sync as current.

For the first version, Excel is the source of truth for financial and stock rows. FlowChat financial cells are read-only; drafts/approvals are separate app records. Two-way Excel editing introduces conflict resolution and is deferred. Use explicit Void/Cancelled states for financial corrections with an audit trail; a removed spreadsheet row must not silently erase payment history.

Graph change notifications: https://learn.microsoft.com/en-us/graph/change-notifications-overview
Graph delta tracking: https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0

## Recommended production stack

| Layer | Recommendation |
|---|---|
| App | Next.js 16 App Router, TypeScript, React, Public Sans, CSS design tokens, Recharts |
| Database | Supabase Postgres with business-scoped tables |
| Identity | Supabase Auth and row-level security for every business-owned table |
| Documents/media | Private Supabase Storage buckets with authorised access |
| Live updates | Supabase Realtime, plus explicit query invalidation/recalculation |
| Spreadsheet integration | Microsoft Graph + OneDrive/SharePoint; Power Automate is an alternative with licensing dependent on connectors |
| Background work | A server-side worker/scheduled job for ingestion, retries, subscription renewal and reconciliation |
| WhatsApp | Cloud API webhooks plus an approved outbound-message queue |
| Extraction | Gemini API structured output, validated schemas, retained source evidence |
| Speech | An authorised speech-to-text provider; browser mic is a separate optional feature |
| Calculations | The existing deterministic TypeScript analytics; never delegate money math to the LLM |
| Deployment | Vercel for the full Next.js server application, or another suitable server runtime. The current static Sites build does not include API routes. |

Store provider/refresh/service credentials only server-side. Never expose a Supabase service-role key in a browser bundle. Deduplicate all external events and keep each business isolated by both access policies and database keys.

Supabase Realtime: https://supabase.com/docs/guides/realtime/postgres-changes
Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security

## Implementation order

1. Keep reliable manual imports and deterministic calculations as the demo fallback.
2. Add Supabase schema/Auth/RLS and one-way Excel sync with sync logs and row IDs.
3. Add business-number onboarding and WhatsApp webhooks.
4. Connect Gemini/speech extraction, owner review and approved template sending.
5. Validate supplier lead-time and seasonal-demand models in a pilot before calling inventory scenarios forecasts.
