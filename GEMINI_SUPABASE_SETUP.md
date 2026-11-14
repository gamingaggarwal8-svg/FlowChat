# Connect Gemini + Supabase to FlowChat

FlowChat uses **Supabase**. Gemini understands the conversation; Supabase stores it. On the next question, the server retrieves recent messages, computes current business facts and passes that context to Gemini. This is database-backed recall, not permanent training of the Gemini model.

## 1. Prepare the two services

- Create a Supabase project at https://supabase.com/dashboard.
- In its project settings, copy the **Project URL** and **publishable/anon key**.
- Create a replacement Gemini API key at https://aistudio.google.com/api-keys. Do not reuse a key shared in a screenshot.

The app uses Google's official `@google/genai` SDK and a configurable Flash model. Free-tier eligibility and quotas belong to your AI Studio project; the code does not automatically switch to a paid model.

## 2. Create the database tables and policies

In Supabase → SQL Editor, run these repository files **in order** for a new project:

1. `supabase/migrations/202611140001_flowchat.sql`
2. `supabase/migrations/202611140002_private_accounting_bucket.sql`
3. `supabase/migrations/202611140003_conversation_memory.sql`

If this FlowChat project already has the first two migrations applied, run **only the third**. Do not re-run the original table-creation migration over an existing installation.

This creates business memberships, private storage, append-only ledger revisions, AI threads/messages and a user-scoped cache. RLS isolates business data. Assistant history and AI caches are also private to the signed-in user within that business.

## 3. Configure the Next.js server

From the repository:

```sh
npm ci
cp .env.example .env.local
```

Fill these values in `.env.local`:

```dotenv
GEMINI_API_KEY=your_replacement_google_key
GEMINI_MODEL=gemini-3.8-flash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
APP_URL=http://localhost:3000
```

The Gemini key must stay server-side. The Supabase publishable/anon key is intentionally public and protected by Auth/RLS. Never put the Supabase service-role secret in a `NEXT_PUBLIC_*` variable, browser code or Git.

Restart the server after changing environment variables:

```sh
npm run dev
```

Open http://localhost:3000. Guests see the new login; **Explore the synthetic demo** opens the original demo without an account. `/login` also opens the account page directly.

## 4. Configure sign-in and password-reset redirects

In Supabase → Authentication:

- Enable email/password sign-in.
- Set Site URL to `http://localhost:3000` for local work.
- Add allowed redirect URLs `http://localhost:3000/login` and `http://localhost:3000/login?reset=1`.
- For production, use your real HTTPS app URL and add the corresponding two login URLs.
- Keep email confirmation configured as appropriate for your deployment; production email delivery may require your own SMTP configuration.

Create/confirm an account from the login page. Continue to **Create your business workspace**, then create/select a business in Workspace Settings. A connected business starts with its own ledger, not the synthetic demo's balances.

## 5. Test extraction and remembered conversations

1. In **Import Chats**, upload an authorised WhatsApp TXT/ZIP export, confirm customer and owner names, then extract. The original chat and structured result are saved to Supabase for review; this never invents a receipt or modifies money/stock automatically.
2. In **Excel Sync**, upload valid ledger/inventory records if you want financial or stock questions answered from real records.
3. Open **AI Copilot** and ask a supported question, such as a customer's outstanding balance or a commitment from an imported chat.
4. Ask a follow-up, such as “Aur Gupta ka?”. The server reads the last ten messages in that conversation to resolve context, but recalculates financial facts from current records.
5. Reload or return later. Your most recent conversation reopens; other saved threads are available in the history list. **New** starts a separate thread without deleting older ones.

Supabase → Table Editor lets you verify:

| Stored data | Location |
| --- | --- |
| Original WhatsApp imports + extraction | `chat_imports` |
| Your assistant conversation list | `ai_threads` |
| Questions, replies + historical evidence snapshots | `ai_turns` |
| Disposable per-user model cache | `ai_cache` |
| Versioned financial/stock records | `record_versions` |
| Original accounting PDFs | private `accounting` Storage bucket |

The app lists the latest 100 conversations, shows the latest 100 messages of a selected conversation and passes the latest ten messages as model context. It does not implement vector search or unlimited-history model context. Past answer evidence is historical; follow-up questions use newly computed ledger facts under the existing analytics rules. The financial demo as-of date remains 14 November 2026; adding chat memory does not change those calculation rules.

## 6. Enable safe cache cleanup (optional)

For scheduled cache cleanup, also set these **server-only** variables:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=your_service_role_or_server_secret_key
CRON_SECRET=a_long_random_secret
```

Schedule an HTTPS request to:

```text
GET https://YOUR_APP/api/sync/cron
Authorization: Bearer YOUR_CRON_SECRET
```

The authenticated job removes model caches older than 24 hours and quota counters older than 48 hours. It then checks connected Excel workbooks, if any. Without a scheduler, expired caches stop being read but remain stored until cleanup runs.

**Cleanup never deletes saved conversations, imported chats, PDFs or financial history.** A user can delete an individual personal conversation through the explicit confirmation in AI Copilot; only that thread and its messages are removed. Business records remain intact.

## Production hosting

Deploy the full Next.js repository to a Node-capable host such as Vercel and configure the same environment variables in its server environment settings. Set `APP_URL` and Supabase Auth redirects to your actual HTTPS domain. Run `npm run build`, then serve with `npm start` where applicable.

The existing static Sites publication supports the login preview and local demo workflows, including browser-local conversation history. **It cannot run Gemini or Supabase-backed API routes.** Cloud sign-in, extraction, durable private history and scheduled cleanup require the Next.js server deployment.

The server routes, migrations and access rules are implemented and tested locally. Live provider credentials and browser interaction checks still need verification in your configured deployment.
