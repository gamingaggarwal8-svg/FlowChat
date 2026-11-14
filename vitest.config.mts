import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/analytics.test.ts','tests/inventory-voice.test.ts'], environment: 'node' } });
