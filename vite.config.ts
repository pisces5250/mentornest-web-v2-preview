import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  if (mode === 'production' && process.env.VITE_USE_FIXTURES === 'true') {
    throw new Error('production build 禁止啟用 VITE_USE_FIXTURES');
  }

  return {
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  // Production 預設不公開 source map；只有受控除錯 build 才明確開啟。
  build: { outDir: 'dist', sourcemap: process.env.GENERATE_SOURCEMAP === 'true' },
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
  };
});
