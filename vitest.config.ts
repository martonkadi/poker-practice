import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: {
    '@poker/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
    '@poker/poker': fileURLToPath(new URL('./packages/poker/src/index.ts', import.meta.url)),
    '@poker/bots': fileURLToPath(new URL('./packages/bots/src/index.ts', import.meta.url)),
    '@poker/analysis': fileURLToPath(new URL('./packages/analysis/src/index.ts', import.meta.url)),
    '@poker/persistence': fileURLToPath(new URL('./packages/persistence/src/index.ts', import.meta.url))
  } },
  test: { environment: 'node', include: ['packages/**/*.test.ts', 'apps/web/src/**/*.test.ts'] }
});
