import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * The app is hosted as plain static files inside the platform document root at
 * `v1-web-app/workflow/debugger/`. Apache's rewrite only forwards to index.php
 * when the request does not resolve to a real file or directory, so no PHP
 * change is needed — but every asset URL must be prefixed with that directory.
 */
export const APP_BASE = '/workflow/debugger/';

/**
 * Platform prefixes the dev server must forward so the browser stays
 * same-origin (session cookie + no CORS). `/workflow/` is included for
 * `log.debugdata`, but the app's own base lives under it, so the filter below
 * excludes it explicitly.
 */
const PLATFORM_PREFIXES = [
  '/workflow.',
  '/workflow/',
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
    // under /workflow/ would swallow Vite's own HMR socket, which lives under
    // the app base.
    cookieDomainRewrite: '',
  };

  const rules: Record<string, ProxyOptions> = {};
  for (const prefix of PLATFORM_PREFIXES) {
    rules[prefix] = prefix === '/workflow/'
      // The app's own base sits under /workflow/ — serve those from Vite.
      ? { ...base, bypass: (req) => (req.url?.startsWith(APP_BASE) ? req.url : undefined) }
      : base;
  }
  return rules;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VIZRU_');
  const target = env.VIZRU_PLATFORM_URL || 'https://127.0.0.1';
  const outDir = env.VIZRU_OUT_DIR || 'dist';

  return {
    base: mode === 'development' ? APP_BASE : '/workflow/debugger/dist/',
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
