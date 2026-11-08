import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Same-origin /api in dev so the httpOnly cookie just works.
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
