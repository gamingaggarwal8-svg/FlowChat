# FlowChat integrations: setup and operating guide

The original synthetic dashboard, analytics, charts, customer/supplier/inventory screens, voice-transcript workflow, bargains and approvals are retained. New workflows are available in navigation and at `/import-chats`, `/accounting`, `/sync`, `/pricing`, `/copilot` and `/settings`.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

No credentials are needed for the offline synthetic demo. Do not commit `.env.local`. Replace any credential shared in a screenshot before use.

## What works without credentials

- Parse Android and iOS WhatsApp `.txt` exports and `.zip` archives, including multiline Hinglish messages. ZIP archives containing several chats offer a conversation selector. The date convention is day/month/year; ambiguous US-style exports must be converted first.
- Exact supplied synthetic chats can show prepared annotations from `data/extracted/customers`. This is labelled cached demo data, never a live AI response. Arbitrary chats receive structural parsing only until Gemini is connected; there are no promise-detection regex shortcuts.
- Upload/search/preview/download PDFs in browser IndexedDB; edit and review invoice details; export CSV and CA-review PDF summaries. These files are local, not backed up or stored in Supabase.
- Download a real `.xlsx` template and sync workbook rows locally. Revisions remain in browser storage; the dashboard recalculates over the original synthetic dataset, clearly labelled as a local workbook + demo view.
- Demo plan selection, simulated billing history and cancellation/reset. No card fields, real payment or real entitlement.

The static Sites publication supports these local workflows only. Live APIs require the full Next.js server deployment, e.g. Vercel or another Node host. Its API routes are not present in the static bundle.

## Supabase authentication and isolation

1. Create a Supabase project; apply all SQL files in `supabase/migrations/` in filename order in its SQL editor or through your migration workflow.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. These two are intentionally public identifiers; all data access is protected by RLS and authentication.
3. Set `SUPABASE_SERVICE_ROLE_KEY` **server-side only** for signed billing/Meta webhooks and scheduled Excel sync. Never name it `NEXT_PUBLIC_*`.
4. Configure Supabase Auth email confirmation and your deployment's allowed redirect URLs. Create/confirm an account through a new page, sign in, and create a business workspace. Select it in the account panel.
5. In Workspace Settings, owners can add existing confirmed users as accountants or viewers. Owners cannot be demoted with this flow. User IDs are shown in the roster; invite delivery is not implemented.

Roles: owners manage billing, cloud workbook connections and memberships; owners/accountants can extract chats, sync financial records and review documents; viewers can read authorised business data. APIs verify the bearer token with Supabase, then check membership for the selected business. Browser-supplied business IDs are never sufficient authorisation. Private storage paths begin with the business UUID. Financial records cannot be directly updated or deleted by authenticated roles.

A connected workspace starts with its own empty ledger. It does not inherit synthetic invoices or inventory. The dashboard polls committed workspace records every 30 seconds while visible and refreshes immediately after manual sync. A failed cloud read displays an explicit synthetic fallback warning. The existing demo date remains 14 November 2026; this release does not migrate the historical demo's as-of-date rules.

## Gemini

Set:

```dotenv
GEMINI_API_KEY=your_replacement_key
GEMINI_MODEL=gemini-3.8-flash
```

The official `@google/genai` SDK runs only on the server. The default Flash model appears in Google's current free-tier model/pricing documentation; eligibility, quotas and availability depend on your project, and model choice is configurable. A Gemini consumer subscription does not provide an API quota automatically.

- Import Chats: structured orders, quantities, final rates, resolved dates, payment promises and ambiguity flags are Zod-validated. Quote evidence must occur verbatim in the source. The owner name is configurable. Results are saved as review material and do not automatically create invoices, receipts or stock.
- AI Copilot: Gemini classifies a question into a supported analytics view; TypeScript calculates facts; Gemini explains those facts. Numeric evidence is returned separately so the owner can check it. Reminder drafts use recorded outstanding balances and are never auto-sent.
- Documents: Gemini reads an authorised PDF and extracts supported invoice fields; missing fields remain null. Format/tax consistency checks and owner review are required. The model's evidence is a candidate quote and is not independently OCR-verified.

The cache is isolated by business and keyed by model, schema, instructions and input content (including PDF bytes). It expires after 24 hours. A shared database quota allows 10 AI requests/minute and 100/day per business, independently of provisional plans. Provider 429/temporary/validation failures get one bounded retry and a safe error. No fallback switches to a paid model. Outputs and extracted amounts remain untrusted until reviewed.

Google free-tier processing may be used to improve its products under the applicable terms. Review those terms before submitting real customer conversations or accounting PDFs; this is separate from private Supabase storage.

## Accounting and GST documents

The migrations create a private `accounting` bucket and enforce privacy if a bucket with that name already existed. Existing objects are retained. Restrictive policies prevent older permissive storage policies from bypassing business isolation. Legacy objects outside business-prefixed folders need an administrator to assign them to the appropriate business before app access. The upload route checks the PDF signature and a 4 MB file-size limit; signed preview/download links expire after 60 seconds. Search covers filename, category, extracted party and invoice number. PDF text-content search, virus scanning, OCR verification and GST filing are not implemented.

Sales invoices and purchase bills require an invoice number, party, date, total and confirmed INR currency for GST-summary review. Non-INR files can be stored and exported for review but are never converted or added to INR totals. Where taxable value and all tax components are present, integer-paise arithmetic checks their sum against the stated total. GSTIN format is checked, not government registration or checksum verification. Receipts/GST documents can omit invoice-only fields. Reviewing does not insert a financial ledger transaction.

CSV exports preserve Unicode and neutralise spreadsheet formula prefixes. PDF summaries use INR labels and replace unsupported script glyphs with `?`; use CSV for exact Unicode names. Only owner-reviewed document totals enter summary totals, grouped separately by category. A CA should verify originals, input-tax eligibility and return calculations. FlowChat does not submit GST returns.

## Excel workbook sync

The template has these sheets:

| Sheet | Required columns |
| --- | --- |
| Inventory | `id` (equal to `sku`), `date`, `sku`, `qty`, `unit`; optional name/category/reorder_level/cost_price/weekly_sales/fabric/color/gender/status |
| PaymentsReceived | `id`, `date`, `party`, `amount` |
| PaymentsSent | `id`, `date`, `party`, `amount` |
| SalesInvoices | `id`, `date`, `party`, `amount`, `due_date` |
| PurchaseInvoices | `id`, `date`, `party`, `amount`, `due_date` |

IDs must be stable **text** values, not row numbers or formulas. Use `YYYY-MM-DD` strings or Excel dates. Numeric cells must be actual nonnegative numbers. Paste formula results as values. Unknown columns are rejected so spelling errors cannot silently drop financial fields. Uploads are limited to 4 MB (cloud workbooks to 10 MB). Each import is limited to 5,000 rows, 30 columns/sheet and bounded expanded ZIP size. Empty unused template sheets are allowed.

The entire validated batch commits atomically. `(business_id, kind, record_id)` identifies a transaction; canonical content hashes skip duplicates. Corrections append new revisions. Missing workbook rows never delete records; set `status=void` using the same ID to remove their current economic effect while retaining history. A void financial record still requires its original valid fields. Sync runs and per-record versions provide an audit trail. A local browser storage failure is surfaced; it is not a substitute for a durable accounting backup.

Inventory is a point-in-time **on-hand snapshot**, not a stock movement table; do not include unreceived purchase orders. Use one SKU per inventory row and keep metres/pieces separate. List/floor-price synchronisation is not included, so connected bargaining is disabled until a verified price source is added. The original synthetic bargaining demo remains available.

### OneDrive / SharePoint

1. Register a Microsoft Entra application supporting the account types you need; choose a Web redirect URI: `APP_URL/api/excel/callback`.
2. Configure delegated `Files.Read`, `User.Read`, `offline_access`, with consent appropriate to your tenant. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` (`common` by default), and `APP_URL`.
3. Generate a random 32-byte hex `TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`). Store it as a server secret. Tokens are encrypted with AES-256-GCM before storage. Rotating this key requires reconnecting existing workbooks.
4. Save the workbook in OneDrive or SharePoint. Get its Graph drive ID and item ID from Microsoft Graph Explorer or your administrator. Enter them in Excel Sync and choose Connect Microsoft account.
5. Complete Microsoft consent, then use **Sync Now**. Only the owner connects/syncs the cloud workbook; accountants may upload workbook files manually.
6. For automatic updates, set a strong `CRON_SECRET`; schedule `GET /api/sync/cron` with `Authorization: Bearer <CRON_SECRET>` on your hosting scheduler. It processes up to five least-recently-attempted workbooks per run. Repeated runs rotate through workspaces.

Cloud sync errors and last-attempt time are visible without replacing the last successful ledger. The implementation polls saved workbook eTags; it does not install Microsoft Graph change-notification subscriptions. Unchanged cloud files are skipped. A per-workspace lease prevents overlapping cloud syncs. Expired access tokens are refreshed and rotated; failures retain the previous valid ledger and are retried on a later run. A local-only Excel file must be saved/uploaded to the cloud before sync can see it.

## Razorpay

Set server-only `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and the Supabase service role key. Start with Razorpay test credentials. Optionally set `RAZORPAY_PLAN_STARTER` / `RAZORPAY_PLAN_PRO`; existing plans are checked against the displayed monthly INR prices. If missing, a monthly provider plan is created when purchasing.

Configure signed subscription webhooks at `APP_URL/api/billing/webhook`, including subscription authenticated/activated/charged/pending/halted/cancelled/completed events. Checkout signature verification runs server-side; paid state comes from the verified webhook, never a browser callback alone. Current provider state is fetched to handle out-of-order events, and event/payment IDs deduplicate billing records. Owners can request cancellation at cycle end. History includes status events as well as charges.

Prices (Free 0, Starter 499/month, Pro 999/month, Enterprise custom) are provisional packaging. Paid feature entitlements, proration, upgrades/downgrades, refunds, tax invoices and a customer billing portal are not implemented. Successful provider checkout is real when real credentials are configured. Demo selection never grants a paid entitlement or charges money.

## Official Meta WhatsApp Cloud API

No scraping or WhatsApp Web automation is used. For future live ingestion:

1. Onboard a business number through Meta's official Cloud API.
2. Set `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`; configure `APP_URL/api/whatsapp` as the webhook callback and subscribe to messages.
3. As a server administrator, insert the onboarded `phone_number_id` and its exact `business_id` into `whatsapp_numbers`. Browser users cannot map phone numbers.
4. Signed inbound messages are deduplicated and visible in Workspace Settings. Unknown number IDs are ignored. Voice media references are retained; automatic media download/transcription and outgoing live sends are not connected in this release.

An API token does not grant all personal chats or historical messages. Use authorised exports for history. Owner approvals and a compliant outbound template/opt-in workflow are still required before adding live sending.

## Verification

```sh
npm test
npm run test:legacy
npm run lint
npm run typecheck
npm run build
npm run build:demo
```

Tests include real PostgreSQL policy/function execution in PGlite (with pgcrypto), export/ZIP parsing, workbook round trips, duplicate and void handling, deterministic recalculation, tax checks, PDF output, formula injection prevention, API authentication, signed-event rejection and token encryption. This is not a substitute for testing against your configured Supabase, Microsoft, Gemini and Razorpay test accounts.

No live provider smoke test or rendered browser/keyboard/microphone check is claimed without the corresponding credentials/tools.

Primary references: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Supabase storage policies](https://supabase.com/docs/guides/storage/security/access-control), [Microsoft Graph drive content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content), [Razorpay subscriptions](https://razorpay.com/docs/payments/subscriptions/integration-guide/), [Meta Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/).
