import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on the web and inside the Capacitor webview.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { host: true, port: 5173 },
});
