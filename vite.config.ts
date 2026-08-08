import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * The app is hosted as plain static files at `v1-web-app/workflows/`, whose own
 * `.htaccess` sends anything that is not a real file to `dist/index.html`:
 *
 *   RewriteCond %{REQUEST_FILENAME} !-f
 *   RewriteCond %{REQUEST_FILENAME} !-d
 *   RewriteRule ^.*$ dist/index.html [L]
 *   DirectoryIndex dist/index.html
 *
 * So the served document lives one level down, and every asset URL has to be
 * absolute against `/workflows/dist/` — a relative base would resolve against
 * whatever path the user happened to land on. Routing is hash-based
 * (`/workflows/#/list`), which the rewrite never sees.
 */
export const APP_BASE = '/workflows/';
const BUILD_BASE = '/workflows/dist/';

/**
 * Platform prefixes the dev server must forward so the browser stays
 * same-origin (session cookie + no CORS). `/workflows/` is included for
 * `log.debugdata`, but the app's own base lives under it, so the filter below
 * excludes it explicitly.
 */
const PLATFORM_PREFIXES = [
  '/workflow.',
  '/workflows/',
  '/ls/',
  '/sys/',
  '/ui-themes/',
  '/data/',
  '/api/',
];

function platformProxy(target: string): Record<string, ProxyOptions> {
  const base: ProxyOptions = {
    target,
    changeOrigin: true,
    // Platform dev certificates are self-signed.
    secure: false,
    // Deliberately no `ws`: the app opens no sockets, and forwarding upgrades
    // under /workflows/ would swallow Vite's own HMR socket, which lives under
    // the app base.
    cookieDomainRewrite: '',
  };

  const rules: Record<string, ProxyOptions> = {};
  for (const prefix of PLATFORM_PREFIXES) {
    rules[prefix] = prefix === '/workflows/'
      // The app base is now `/workflows/` itself, so "starts with the base" no
      // longer separates app from platform. The platform's own endpoints under
      // this prefix are all `<name>.<action>` in the first segment
      // (`log.debugdata`, `connection.properties`); everything else — the shell,
      // `dist/`, and Vite's `@vite` / `@react-refresh` / `src` dev routes —
      // belongs to the app and is served locally.
      ? { ...base, bypass: (req) => (isPlatformPath(req.url || '') ? undefined : req.url) }
      : base;
  }
  return rules;
}

/** Static files the dev server owns even though their names contain a dot. */
const STATIC_EXT = /\.(html|js|mjs|css|map|ico|svg|png|jpe?g|gif|woff2?|ttf|json)$/i;

/** True for `/workflow/<name>.<action>` — a platform controller path. */
function isPlatformPath(url: string): boolean {
  const rest = url.slice(APP_BASE.length).split(/[?#]/)[0];
  const first = rest.split('/')[0];
  if (!first.includes('.')) return false;
  if (first.startsWith('@')) return false;
  return !STATIC_EXT.test(first);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VIZRU_');
  const target = env.VIZRU_PLATFORM_URL || 'https://127.0.0.1';
  const outDir = env.VIZRU_OUT_DIR || 'dist';

  return {
    base: mode === 'development' ? APP_BASE : BUILD_BASE,
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            flow: ['reactflow'],
            layout: ['dagre'],
          },
        },
      },
    },
    server: {
      port: Number(env.VIZRU_DEV_PORT || 5180),
      strictPort: false,
      proxy: platformProxy(target),
    },
    preview: {
      port: Number(env.VIZRU_DEV_PORT || 5180),
      proxy: platformProxy(target),
    },
  };
});
