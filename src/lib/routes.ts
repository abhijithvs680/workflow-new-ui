/**
 * Hash routing.
 *
 * The app is served from `/workflows/`, whose `.htaccess` rewrites every
 * non-file request to `dist/index.html`. Routing therefore lives entirely in
 * the hash — Apache never sees it, so any route reloads cleanly and no server
 * config has to change when a route is added.
 *
 *   #/list                          workflow list (replaces workflow.html)
 *   #/debugger/<id-or-shortCode>    the canvas
 *   #/debugger/<id>?version=<vid>   read-only canvas for a saved version
 */
export const APP_PATH = '/workflows/';

export type Route =
  | { name: 'list' }
  | { name: 'debugger'; param: string; versionId: string };

/** `#/list` is the landing route when the hash is empty. */
export function readRoute(): Route {
  const raw = window.location.hash.replace(/^#/, '');
  const [path, query] = raw.split('?');
  const parts = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/');

  if (parts[0] === 'debugger') {
    const param = decodeURIComponent(parts.slice(1).join('/') || '');
    const versionId = new URLSearchParams(query || '').get('version') || '';
    return { name: 'debugger', param, versionId };
  }
  return { name: 'list' };
}

export function listHref(): string {
  return `${APP_PATH}#/list`;
}

export function debuggerHref(idOrShortCode: string): string {
  return `${APP_PATH}#/debugger/${encodeURIComponent(idOrShortCode)}`;
}

/** Read-only canvas for a saved version of `idOrShortCode`. */
export function versionHref(idOrShortCode: string, versionId: string): string {
  return `${debuggerHref(idOrShortCode)}?version=${encodeURIComponent(versionId)}`;
}

/** Navigate within the app without a full page load. */
export function go(href: string): void {
  const at = href.indexOf('#');
  window.location.hash = at === -1 ? href : href.slice(at);
}
