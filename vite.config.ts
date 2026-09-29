import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: 'apps/web',
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@poker/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      '@poker/poker': fileURLToPath(new URL('./packages/poker/src/index.ts', import.meta.url)),
      '@poker/bots': fileURLToPath(new URL('./packages/bots/src/index.ts', import.meta.url)),
      '@poker/analysis': fileURLToPath(new URL('./packages/analysis/src/index.ts', import.meta.url)),
      '@poker/persistence': fileURLToPath(new URL('./packages/persistence/src/index.ts', import.meta.url))
    }
  },
  build: { outDir: '../../dist', emptyOutDir: true }
});
