import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  build: { outDir: 'dist', sourcemap: true },
  resolve: {
    alias: {
      // Browser shim for node:assert/strict so math_validator.mjs can run in
      // the bundle.  math_validator is the only file in Phase 5B's bundle
      // path that imports node:assert.  Other plugin files use node:fs/path
      // but they are NOT imported from the browser bundle.
      'node:assert/strict': path.resolve(__dirname, 'src/vite-shims/assert-strict.mjs'),
    },
  },
});
