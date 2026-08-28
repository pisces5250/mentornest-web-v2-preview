import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  build: { outDir: 'dist', sourcemap: true },
  resolve: {
    alias: {
      // Browser shims for node built-ins so the plugin's storage layer can
      // resolve in the bundle.  No filesystem IO actually runs in the
      // browser; all persistence happens server-side via the plugin's
      // OpenClaw tool surface (see src/session/learning-director-adapter.mjs).
      'node:assert/strict':   path.resolve(__dirname, 'src/vite-shims/assert-strict.mjs'),
      'node:fs/promises':     path.resolve(__dirname, 'src/vite-shims/fs-promises.mjs'),
      'node:fs':              path.resolve(__dirname, 'src/vite-shims/fs.mjs'),
      'node:path':            path.resolve(__dirname, 'src/vite-shims/path.mjs'),
    },
  },
});
