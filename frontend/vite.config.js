import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // The AI endpoint streams back after slow upstream LLM calls
        // (up to ~45s each, primary + fallback). The defaults let the
        // proxy drop these long-lived responses with ECONNRESET.
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  }
});
