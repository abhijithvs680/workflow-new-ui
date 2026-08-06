/**
 * Option sources for the block settings dialogs.
 *
 * The classic dialogs receive these lists pre-rendered by `Customblockpopup`.
 * Native dialogs fetch the same data from the endpoints the classic forms use
 * for their own cascading dropdowns, so nothing new is required server-side.
 *
 * Several of them answer with `<option>` markup rather than JSON; those are
 * parsed here into plain `{value, label}` pairs.
 */
import { envelopeBody, getText, postJson } from './http';

export interface Option {
  value: string;
  label: string;
  /** Spreadsheet short code, when the platform supplies one. */
  shortCode?: string;
}

/** Small in-memory cache: these lists are stable for the life of a page. */
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const promise = load().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, promise);
  return promise;
}

export function clearLookupCache(): void {
  cache.clear();
}

/** Parse an `<option>` list returned as an Ajax envelope body. */
function parseOptions(html: string): Option[] {
  const doc = new DOMParser().parseFromString(`<select>${html}</select>`, 'text/html');
  const out: Option[] = [];
  doc.querySelectorAll('option').forEach((el) => {
    const value = el.getAttribute('value') || '';
    if (!value) return;
    out.push({
      value,
      label: (el.textContent || value).trim(),
      shortCode: el.getAttribute('data-shortcode') || undefined,
    });
  });
  return out;
}

async function optionEndpoint(url: string): Promise<Option[]> {
  const res = await postJson(url, {});
  const body = (res as { Body?: unknown })?.Body;
  return parseOptions(typeof body === 'string' ? body : '');
}

/* -------------------------------------------------------------------------- */

export interface AppRow {
  lid: string;
  name: string;
  short_code?: string;
}

/** Apps ("livespaces") the current user can pick as a data source. */
export function fetchApps(): Promise<AppRow[]> {
  return cached('apps', async () => {
    const data = envelopeBody<{ result?: unknown }>(await postJson('/workflow.livespacelist', {}));
    const list = Array.isArray(data.result) ? data.result : Array.isArray(data) ? data : [];
    return (list as Array<Record<string, unknown>>)
      .filter((row) => row && row.lid != null)
      .map((row) => ({
        lid: String(row.lid),
        name: String(row.name || row.lid),
        short_code: row.short_code ? String(row.short_code) : undefined,
      }));
  });
}

/** Spreadsheets inside one app. */
export function fetchSpreadsheets(lid: string): Promise<Option[]> {
  if (!lid) return Promise.resolve([]);
  return cached(`ss:${lid}`, () => optionEndpoint(`/ls/livespace.sslist/${encodeURIComponent(lid)}`));
}

/** Every document (spreadsheets, grids, uploads) inside one app. */
export function fetchDocuments(lid: string): Promise<Option[]> {
  if (!lid) return Promise.resolve([]);
  return cached(`doc:${lid}`, () =>
    optionEndpoint(`/ls/livespace.ajaxdoclist/${encodeURIComponent(lid)}`),
  );
}

/**
 * Column keys of one spreadsheet, used for filter-key and mapping
 * autocomplete. `rowID` is appended the way the classic form does.
 */
export function fetchSpreadsheetColumns(dirPath: string): Promise<string[]> {
  if (!dirPath) return Promise.resolve([]);
  return cached(`cols:${dirPath}`, async () => {
    const res = await postJson<{ resultArr?: Record<string, string> | string[] }>(
      `/ls/livespace/spreadsheet.columns/${encodeURIComponent(dirPath)}`,
      {},
    );
    const raw = (res as any)?.resultArr ?? envelopeBody<{ resultArr?: unknown }>(res).resultArr;
    const values = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? Object.values(raw as Record<string, string>)
        : [];
    const columns = values.map((v) => String(v)).filter(Boolean);
    if (!columns.includes('rowID')) columns.push('rowID');
    return columns;
  });
}

/** Live workflow search — backs the "select a workflow" pickers. */
export async function searchWorkflows(term: string): Promise<Option[]> {
  const res = await postJson<Record<string, string>>('/workflow.search', { searchItem: term || '' });
  const map = (res && typeof res === 'object' && !Array.isArray(res) ? res : {}) as Record<string, string>;
  return Object.entries(map).map(([value, label]) => ({ value, label: String(label) }));
}

/** Reusable-workflow input fields, for the Execute Workflow dialog. */
export async function fetchReusableFields(
  objId: string,
  shortCode: string,
): Promise<Array<{ input: string; required: boolean; notes: string }>> {
  const data = envelopeBody<{ result?: unknown; fieldset?: unknown }>(
    await postJson('/workflow.reusables', {
      inputdata: { wid: objId, short_code: shortCode },
      key: 'view',
    }),
  );
  const result = (data.result || data) as Record<string, unknown>;
  const fieldset = (result?.fieldset || result?.input || []) as unknown;
  if (!Array.isArray(fieldset)) return [];
  return fieldset
    .map((f) => {
      if (typeof f === 'string') return { input: f, required: false, notes: '' };
      const row = f as Record<string, unknown>;
      return {
        input: String(row.input ?? row.name ?? ''),
        required: row.required === true || row.required === 'true',
        notes: String(row.notes ?? ''),
      };
    })
    .filter((f) => f.input);
}

/** Tenant user groups / roles for the user-management blocks. */
export function fetchLivespaceRoles(): Promise<Option[]> {
  return cached('lsroles', async () => {
    const data = envelopeBody<{ result?: unknown }>(await postJson('/ls/role.list', {}));
    const list = Array.isArray(data.result) ? data.result : [];
    return (list as Array<Record<string, unknown>>).map((row) => ({
      value: String(row.id ?? row.rid ?? ''),
      label: String(row.name ?? row.title ?? ''),
    }));
  }).catch(() => []);
}

/** Fetch the raw HTML of a legacy dialog. Diagnostics only — never rendered. */
export function fetchLegacyDialogMarkup(
  workflowId: string,
  blockId: string,
  blockType: string,
): Promise<string> {
  return postJson('/workflow.customblockpopup', { workflowId, sourceId: blockId, blockType }).then(
    (res) => String((res as { Body?: unknown })?.Body ?? ''),
  );
}

export { getText };
