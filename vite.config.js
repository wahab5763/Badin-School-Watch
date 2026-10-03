import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        // Monitor performance / attendance reports can call the live MNE API for
        // hundreds of schools when many districts are selected, so give the proxy
        // enough headroom that it doesn't kill the connection (ERR_EMPTY_RESPONSE)
        // before the backend's own request budget (see MNE_API_REPORT_RACE_TIMEOUT_MS).
        timeout: 300000,
        proxyTimeout: 300000
      }
    }
  }
});
