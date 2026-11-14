import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**','.next/**','dist/**','work/**'] },
  { files: ['lib/analytics.ts','lib/data.ts','lib/csv.ts','lib/catalog.ts','lib/voice.ts','scripts/seed-cache.ts','scripts/check-analytics.ts','tests/analytics.test.ts','tests/inventory-voice.test.ts','vitest.config.mts','app/Operations.tsx','app/Charts.tsx','app/CatalogControls.tsx','app/VoiceNotes.tsx','app/Demo.tsx','app/page.tsx','scripts/prepare-operations.ts'], extends: [js.configs.recommended,...tseslint.configs.recommended] }
);
