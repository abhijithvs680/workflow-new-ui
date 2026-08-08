/**
 * Workflow-level operations: commit, run, inspect logs, read/write settings.
 * All of these are the same endpoints the classic debugger toolbar uses.
 */
import {
  envelopeBody,
  getHtml,
  getText,
  PlatformError,
  platformMessages,
  platformSaveOk,
  postForm,
  postJson,
} from './http';
import { extractJsonAfter } from './bootstrap';
import type {
  DebugData,
  PlatformEnvelope,
  RecentLogRow,
} from '@/types/workflow';

export const workflowApi = {
  /**
   * Commit the session to Mongo.
   *
   * `ajaxwrkflwIds` is the list of canvases open in the classic multi-tab
   * layout; a standalone canvas always sends just its own id.
   */
  async save(workflowId: string, name: string): Promise<PlatformEnvelope> {
    return postJson<PlatformEnvelope>('/workflow.save', {
      workflow_id: workflowId,
      name,
      ajaxwrkflwIds: workflowId,
    });
  },

  /**
   * Auto-suggestions for one block's outputs, e.g. `{Filter: ['email','name']}`.
   *
   * Three things about `Autosuggestion.php` shape this:
   *
   *  - It reads `post('workflowId')` and `post('blockid')` — **not**
   *    `workflow_id`. Sending the snake_case name leaves both empty and the
   *    controller returns nothing at all, silently.
   *  - It answers for a **single block** (`if ($con['blockId'] == $block_id)`),
   *    so a whole-workflow list means one call per block.
   *  - It `echo`es a bare JSON array and exits — there is no platform envelope,
   *    so nothing is nested under `Result`.
   *
   * It reads the block out of `session('workflow')[$workflowId]`, so the id must
   * be the one the session is keyed by — the Mongo id the canvas booted with.
   */
  async getBlockSuggestions(
    workflowId: string,
    blockId: string,
  ): Promise<Record<string, string[]>[]> {
    const data = await postJson<unknown>('/workflow.autosuggestion', {
      workflowId,
      blockid: blockId,
    });
    return Array.isArray(data) ? (data as Record<string, string[]>[]) : [];
  },

  /** Run the workflow; resolves with the execution log id (0 when logging is off). */
  async run(workflowId: string, params: Record<string, string>): Promise<{ workflow_log_id?: string | number }> {
    const data = await postJson<PlatformEnvelope>(`/workflow.init/${encodeURIComponent(workflowId)}`, {
      data: JSON.stringify([params || {}]),
    });
    let body = data?.Body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    return (body && typeof body === 'object' ? body : {}) as { workflow_log_id?: string | number };
  },

  /** Execution trace for one run. */
  async debugData(logId: string | number): Promise<DebugData> {
    const text = await getText(`/workflow/log.debugdata/${encodeURIComponent(String(logId))}`);
    try {
      return JSON.parse(text) as DebugData;
    } catch {
      throw new PlatformError(`Log ${logId} returned an unreadable response.`);
    }
  },

  /** Same payload as the classic "Recent logs" dropdown. */
  async recentLogs(workflowId: string, length = 10): Promise<RecentLogRow[]> {
    const data = await postForm<RecentLogRow[]>(`/workflow.settings/${encodeURIComponent(workflowId)}`, {
      type: 'log',
      length,
    });
    return Array.isArray(data) ? data : [];
  },

  /**
   * Runtime settings: execution logging and the schedule.
   *
   * Mirrors the classic `wfsettings.tpl` handler exactly — both values are
   * always posted together, because the PHP writes whatever it receives and
   * omitting one would clear it. `hour` is only meaningful for the daily
   * schedule and uses the platform's `"<n>hrs"` format.
   */
  async saveRuntime(
    workflowId: string,
    enableLog: boolean,
    schedule: ScheduleValue,
    hour?: string,
  ): Promise<void> {
    const body: Record<string, string> = {
      type: 'save',
      // The classic form posts "1"/"0" strings and the PHP compares loosely.
      enablelog: enableLog ? '1' : '0',
      schedule: schedule || '0',
    };
    if (schedule === 'day' && hour) body.hour = hour;

    const res = await postForm(`/workflow.settings/${encodeURIComponent(workflowId)}`, body);
    if (res && typeof res === 'object' && !platformSaveOk(res)) {
      const failed = platformMessages(res).find((m) => m.type === 'error' || m.type === 'danger');
      throw new PlatformError(failed?.text || 'Could not save workflow settings.');
    }
  },

  /**
   * The JSON stand-in for `/workflow.connection` + `/workflow/connection.properties`.
   *
   * `Reactconnection.php` resolves both blocks from the live workflow session,
   * so the field lists reflect edits that have not been committed yet — exactly
   * what the classic `Executeaction` controller does.
   */
  async fetchConnectionMappingDetails(
    workflowId: string,
    sourceId: string,
    targetId: string,
  ): Promise<ConnectionMappingDetails> {
    const data = await postJson<PlatformEnvelope>('/workflow.reactconnection', {
      workflowId,
      sourceId,
      targetId,
    });

    // aJsonController renders the controller's own keys, but the platform's
    // ajax layer wraps some responses in an envelope. Accept both.
    let payload = data as Record<string, unknown>;
    if (data && 'Body' in data) {
      if (typeof data.Body === 'string') {
        try {
          payload = JSON.parse(data.Body);
        } catch {
          /* not JSON — keep the outer object */
        }
      } else if (data.Body && typeof data.Body === 'object') {
        payload = data.Body as Record<string, unknown>;
      }
    }

    if (payload.error) throw new PlatformError(String(payload.error));
    return payload as ConnectionMappingDetails;
  },
};

export interface ConnectionBlockInfo {
  name: string;
  /** Plain list, matching the `{$fieldnames}` the classic template renders. */
  output_fields: string[];
}

export interface ConnectionFieldMapping {
  /** Source expression — `mapleft[]`. */
  keyvalue: string;
  /** Destination field name — `mapright[]`. */
  insertcolumn: string;
}

export interface ConnectionMappingDetails {
  sourceBlockInfo?: ConnectionBlockInfo;
  targetBlockInfo?: ConnectionBlockInfo;
  sourceType?: string;
  targetType?: string;
  /** `SENDMAIL` for a Send Mail target, `READ` otherwise. */
  connectionAction?: 'SENDMAIL' | 'READ';
  ConBlockProp?: Record<string, unknown>;
  fieldMapping?: ConnectionFieldMapping[];
  /** `"true"` when the target picks its sheet by shortcode at runtime. */
  dynamicFlag?: string;
  /** Sending addresses offered for `mail_from`. */
  allowedEmails?: string[];
}

/* -------------------------------------------------------------------------- */
/* Settings page state                                                        */
/* -------------------------------------------------------------------------- */

/** Schedule values accepted by the platform, from the classic radio group. */
export type ScheduleValue = '0' | '1' | 'hour' | 'day' | 'week' | 'month';

export const SCHEDULE_OPTIONS: Array<{ value: ScheduleValue; label: string }> = [
  { value: '0', label: 'Disabled' },
  { value: '1', label: 'Every minute' },
  { value: 'hour', label: 'Every hour' },
  { value: 'day', label: 'Every day' },
  { value: 'week', label: 'Every week' },
  { value: 'month', label: 'Every month' },
];

/** `13hrs` -> `1:00 PM`, matching the classic hour dropdown. */
export function hourLabel(index: number): string {
  if (index === 0) return '12:00 AM';
  if (index < 12) return `${index}:00 AM`;
  if (index === 12) return '12:00 PM';
  return `${index - 12}:00 PM`;
}

export interface CategoryTag {
  id?: string;
  tags?: string;
  type?: string;
  [key: string]: unknown;
}

export interface WorkflowSettingsState {
  enableLog: boolean;
  schedule: ScheduleValue;
  /** Platform format, e.g. `9hrs`. Empty when no daily schedule is set. */
  hour: string;
  /** Categories currently applied to this workflow. */
  categories: string[];
  /** Every category defined for the tenant, for the picker. */
  allCategories: string[];
  /** App short code this workflow is connected to, if any. */
  connectedApp: string;
  reusable: boolean;
}

function jsLiteral(html: string, name: string): string | null {
  // Matches `var x = <literal>;` / `window.x = <literal>;` up to the statement
  // end, tolerating the JSON.parse(...) wrapper the template uses.
  const re = new RegExp(`(?:var|let|const|window\\.)\\s*${name}\\s*=\\s*([\\s\\S]*?);\\s*(?:\\n|$)`);
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

/** `JSON.parse({...})` / `$app.stringToJson({...})` / a bare literal. */
function parseJsValue<T>(raw: string | null): T | null {
  if (!raw) return null;
  let body = raw;
  const call = body.match(/^(?:JSON\.parse|\$app\.stringToJson)\s*\(([\s\S]*)\)$/);
  if (call) body = call[1].trim();
  // The template may emit a JSON *string* containing JSON.
  try {
    const once = JSON.parse(body) as unknown;
    if (typeof once === 'string') {
      try {
        return JSON.parse(once) as T;
      } catch {
        return null;
      }
    }
    return once as T;
  } catch {
    return null;
  }
}

function tagNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => (typeof row === 'string' ? row : String((row as CategoryTag)?.tags ?? '')))
    .filter(Boolean);
}

/**
 * Read the current settings by parsing the classic settings page.
 *
 * There is no JSON endpoint for these values — `wfsettings.tpl` renders them
 * into the markup and into a few JS globals, exactly as it does for the
 * classic drawer. Parsing that page is what keeps this drawer in sync with the
 * platform without adding a controller.
 */
export async function fetchWorkflowSettings(workflowId: string): Promise<WorkflowSettingsState> {
  const html = await getHtml(`/workflow.settings/${encodeURIComponent(workflowId)}`);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const logInput = doc.querySelector<HTMLInputElement>('#enableWFlog');
  const checkedRadio = doc.querySelector<HTMLInputElement>('.sh_Radio[checked]');
  const scheduleRaw = checkedRadio?.getAttribute('data-value') || '0';

  const hourMatch = html.match(/window\.scheduleVal\s*=\s*'([^']*)'/);

  return {
    enableLog: logInput?.hasAttribute('checked') ?? false,
    schedule: (SCHEDULE_OPTIONS.some((o) => o.value === scheduleRaw)
      ? scheduleRaw
      : '0') as ScheduleValue,
    hour: hourMatch?.[1] ?? '',
    categories: tagNames(parseJsValue<CategoryTag[]>(jsLiteral(html, 'w_catList'))),
    allCategories: tagNames(parseJsValue<CategoryTag[]>(jsLiteral(html, 'w_tenantCat'))),
    connectedApp: tagNames(parseJsValue<CategoryTag[]>(jsLiteral(html, 'active_ls_app')))[0] || '',
    // The Reusable section renders an Unset control only when one exists.
    reusable: !!doc.querySelector('#unset_reusable'),
  };
}

/* -------------------------------------------------------------------------- */
/* Versions, tags and reusables (settings drawer)                             */
/* -------------------------------------------------------------------------- */

export interface WorkflowVersion {
  /** The platform returns `id`; older payloads used `_id`. */
  id: string;
  note: string;
  /** Unix seconds, as emitted by the classic `moment.unix(...)` call. */
  createdAt: number;
}

/**
 * The workflow document as the classic settings panel shows it.
 *
 * `wfsettings.tpl` loads `/workflow.settings/{short_code}/json` into a modal
 * (`data-class="studioModel wfjson-model"`) rather than a new tab, so this is
 * fetched and rendered in place.
 *
 * `settings/view_json.tpl` does not return bare JSON — it returns markup that
 * passes the document to `$("#json-preview").JSONView(…)`, followed by a
 * `<style>` block. Scanning for the outermost braces would therefore run past
 * the end of the data and into the CSS, so the literal is extracted by counting
 * depth from that exact marker.
 */
export async function fetchWorkflowJson(shortCode: string): Promise<string> {
  const raw = await getHtml(`/workflow.settings/${encodeURIComponent(shortCode)}/json`);
  const trimmed = raw.trim();

  const pretty = (value: string): string => {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  };

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return pretty(trimmed);

  const embedded = extractJsonAfter(trimmed, '$("#json-preview").JSONView(');
  if (embedded) return pretty(embedded);

  return trimmed.replace(/<[^>]*>/g, '').trim();
}

export const settingsApi = {
  async versions(shortCode: string): Promise<WorkflowVersion[]> {
    const data = envelopeBody<{ records?: Array<Record<string, unknown>> }>(
      await postJson('/workflow.version', { type: 'list', short_code: shortCode }),
    );
    if (!Array.isArray(data.records)) return [];
    return data.records
      .map((row) => ({
        id: String(row.id ?? row._id ?? ''),
        note: String(row.note ?? ''),
        createdAt: Number(row.created_at ?? row['created-at'] ?? 0) || 0,
      }))
      .filter((v) => v.id);
  },

  createVersion(shortCode: string, note: string) {
    return postJson('/workflow.version', { type: 'insert', short_code: shortCode, note: note || '' });
  },

  deleteVersion(id: string) {
    return postJson('/workflow.version', { type: 'delete', vid: id });
  },

  applyVersion(shortCode: string, id: string) {
    return postJson('/workflow.version', { type: 'apply', short_code: shortCode, vid: id });
  },

  /**
   * Tag the workflow against a category or an app.
   *
   * The platform packs both operands into one field as
   * `<shortCode>_viz_<value>`, which is how `Tags.php` splits them back apart.
   */
  tag(
    shortCode: string,
    type: 'category' | 'livespace' | 'normal',
    value: string,
    mode: 'insert' | 'delete' = 'insert',
  ) {
    return postJson('/workflow.tags', {
      mode,
      tag_type: type,
      obj_id: `${shortCode}_viz_${value || 'null'}`,
    });
  },

  async apps(): Promise<Array<Record<string, unknown> & { short_code: string }>> {
    const data = envelopeBody<{ result?: unknown }>(await postJson('/workflow.livespacelist', {}));
    const list = Array.isArray(data.result) ? data.result : Array.isArray(data) ? data : [];
    return (list as Array<Record<string, unknown>>).filter(
      (item): item is Record<string, unknown> & { short_code: string } =>
        !!item && typeof item.short_code === 'string' && item.short_code !== '',
    );
  },

  async reusable(workflowId: string): Promise<Record<string, unknown>> {
    const data = envelopeBody<{ result?: Record<string, unknown> }>(
      await postJson('/workflow.reusables', { inputdata: { wid: workflowId }, key: 'view' }),
    );
    return data.result || {};
  },

  saveReusable(
    workflowId: string,
    fields: Array<{ input: string; required: boolean; notes?: string }>,
    description: string,
  ) {
    return postJson('/workflow.reusables', {
      inputdata: {
        wid: workflowId,
        input: fields.map((f) => f.input),
        required: fields.map((f) => (f.required ? 'true' : 'false')),
        notes: fields.map((f) => f.notes || ''),
        description: description || '',
        tag: [],
      },
      key: 'insert',
    });
  },

  unsetReusable(workflowId: string) {
    return postJson('/workflow.reusables', { inputdata: { wid: workflowId }, key: 'unset' });
  },
};

