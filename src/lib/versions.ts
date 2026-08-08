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

/** `MM-DD-YYYY HH:mm:ss`, matching the classic settings panel. */
export function formatVersionStamp(unixSeconds: number): string {
  if (!unixSeconds) return 'Unknown date';
  const d = new Date(unixSeconds * 1000);
  return (
    `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
