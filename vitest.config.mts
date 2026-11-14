import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/analytics.test.ts','tests/inventory-voice.test.ts','tests/integrations.test.ts','tests/database.test.ts','tests/integration-api.test.ts','tests/gemini.test.ts'],environment:'node',testTimeout:30000,hookTimeout:60000}});
