import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**','.next/**','dist/**','work/**'] },
  { files: ['lib/analytics.ts','lib/data.ts','lib/csv.ts','lib/catalog.ts','lib/voice.ts','scripts/seed-cache.ts','scripts/check-analytics.ts','tests/analytics.test.ts','tests/inventory-voice.test.ts','vitest.config.mts','app/Operations.tsx','app/Charts.tsx','app/CatalogControls.tsx','app/VoiceNotes.tsx','app/Demo.tsx','app/page.tsx','app/ui.tsx','scripts/prepare-operations.ts','app/FeatureWorkspace.tsx','app/IntegrationAccount.tsx','app/useWorkspace.ts','app/api/account/**/*.ts','app/api/ai/**/*.ts','app/api/billing/**/*.ts','app/api/chats/**/*.ts','app/api/documents/**/*.ts','app/api/excel/**/*.ts','app/api/integrations/**/*.ts','app/api/sync/**/*.ts','app/api/whatsapp/**/*.ts','lib/integrations/**/*.ts','lib/server/**/*.ts','tests/integrations.test.ts','tests/database.test.ts','tests/integration-api.test.ts','tests/gemini.test.ts'], extends: [js.configs.recommended,...tseslint.configs.recommended] }
);
