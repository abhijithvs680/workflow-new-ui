#!/usr/bin/env node
/**
 * Copy the built app into the platform document root.
 *
 * Hosting is the only thing the production platform needs — no PHP changes.
 *
 *   npm run build
 *   npm run deploy -- ../Vizru-Docker/receiver/volumes/web/app-live/v1-web-app
 *
 * The target may also come from VIZRU_WEBROOT.
 *
 * Layout produced (matches `base: '/workflow/dist/'` in vite.config):
 *
 *   v1-web-app/workflow/
 *     .htaccess           <- rewrites every non-file request to dist/index.html
 *     dist/index.html     <- the served document
 *     dist/assets/*       <- hashed JS/CSS, referenced as /workflow/dist/assets/*
 *
 * The entry point is no longer lifted out of dist/: the rewrite and
 * DirectoryIndex both point at dist/index.html, so a second copy at the
 * directory root would be dead weight that can drift out of sync. Routing is
 * hash-based (/workflow/#/list), which the rewrite never sees.
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const webroot = process.argv[2] || process.env.VIZRU_WEBROOT;
if (!webroot) {
  console.error('Usage: npm run deploy -- <path-to-v1-web-app>   (or set VIZRU_WEBROOT)');
  process.exit(1);
}

const dist = resolve(projectRoot, process.env.VIZRU_OUT_DIR || 'dist');
const target = resolve(webroot, 'workflow', 'debugger');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(join(dist, 'index.html')))) {
  console.error(`No build found at ${dist}. Run "npm run build" first.`);
  process.exit(1);
}

if (!(await exists(resolve(webroot, 'index.php')))) {
  console.error(`${webroot} does not look like a v1-web-app document root (no index.php).`);
  process.exit(1);
}

// Replace only the build output. `/workflow/` itself is NOT wiped: the
// `.htaccess` that makes this layout work lives there and is maintained by
// hand, so blowing the directory away would take the routing with it.
const distTarget = join(target, 'dist');
if (await exists(distTarget)) await rm(distTarget, { recursive: true, force: true });
await mkdir(distTarget, { recursive: true });
await cp(dist, distTarget, { recursive: true });

if (!(await exists(join(target, '.htaccess')))) {
  console.warn(
    `WARNING: no .htaccess at ${target}.\n` +
      '         Without it /workflow/ will not resolve to dist/index.html. Expected:\n' +
      '           RewriteEngine On\n' +
      '           RewriteCond %{REQUEST_FILENAME} !-f\n' +
      '           RewriteCond %{REQUEST_FILENAME} !-d\n' +
      '           RewriteRule ^.*$ dist/index.html [L]\n' +
      '           DirectoryIndex dist/index.html',
  );
}

console.log(`Deployed ${dist}\n      -> ${distTarget}`);
console.log('Open: https://<host>/workflow/#/list');
