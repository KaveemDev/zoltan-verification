import { readFileSync, writeFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Production builds write dist/.htaccess for Hostinger (page routing + security headers), filling in
 * the API and file-storage addresses from .env.production, so the whole dist folder can be uploaded as is.
 */
function hostingerHtaccess(env: Record<string, string>): Plugin {
  return {
    name: 'hostinger-htaccess',
    apply: 'build',
    configResolved() {
      if (env.VITE_DEMO === 'true') return; // demo build talks to no API or storage
      for (const key of ['VITE_API_URL', 'VITE_STORAGE_ORIGIN']) {
        if (!/^https:\/\/[^/]+$/.test(env[key] ?? '')) {
          throw new Error(
            `${key} must be set in frontend/.env.production as https://host (no trailing slash)`,
          );
        }
      }
    },
    closeBundle() {
      const htaccess = readFileSync('htaccess.template', 'utf8')
        .replaceAll('${API_ORIGIN}', env.VITE_API_URL ?? '')
        .replaceAll('${S3_PUBLIC_ORIGIN}', env.VITE_STORAGE_ORIGIN ?? "'self'");
      writeFileSync('dist/.htaccess', htaccess);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [react(), tailwindcss(), ...(mode === 'production' ? [hostingerHtaccess(env)] : [])],
    // Same-origin /api in dev so the httpOnly cookie just works.
    server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  };
});
