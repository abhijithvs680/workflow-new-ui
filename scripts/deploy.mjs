#!/usr/bin/env node
/**
 * Copy the built app into the platform document root.
 *
 * Hosting is the only thing the production platform needs: Apache's rewrite
 * rules skip index.php whenever the request resolves to a real file or
 * directory, so `v1-web-app/workflow/debugger/index.html` is served directly.
 *
 *   npm run build
 *   npm run deploy -- ../Vizru-Docker/receiver/volumes/web/app-live/v1-web-app
 *
 * The target may also come from VIZRU_WEBROOT.
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

// Replace only our own directory — never touch anything else in the webroot.
if (await exists(target)) await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(dist, target, { recursive: true });

console.log(`Deployed ${dist}\n      -> ${target}`);
console.log('Open: https://<host>/workflow/debugger/#/<workflowId-or-shortCode>');
