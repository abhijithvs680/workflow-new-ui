/**
 * Saved-workflow-version helpers.
 *
 * `wfsettings.tpl` renders each version stamp with
 * `moment.unix(el.created_at).format("MM-DD-YYYY HH:mm:ss")`, and the classic
 * version canvas titles itself with `date('m-d-Y H:i:s', …)`. Both are the same
 * shape, so the whole app formats version stamps through here.
 */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * URL for the read-only canvas of a saved version.
 *
 * A query parameter rather than a `/version/<id>` path segment: the build ships
 * no `.htaccess` (see `scripts/deploy.mjs`), so a deeper path would fall through
 * to the PHP router and 404 on reload. Lives here rather than in `App.tsx` to
 * keep `App → Studio → WorkflowSettings` from importing back into `App`.
 */
export function versionHref(param: string, versionId: string): string {
  return `/workflow/debugger/${encodeURIComponent(param)}?version=${encodeURIComponent(versionId)}`;
}

/** `MM-DD-YYYY HH:mm:ss`, matching the classic settings panel. */
export function formatVersionStamp(unixSeconds: number): string {
  if (!unixSeconds) return 'Unknown date';
  const d = new Date(unixSeconds * 1000);
  return (
    `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
