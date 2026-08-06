/**
 * Workflow-level operations: commit, run, inspect logs, read/write settings.
 * All of these are the same endpoints the classic debugger toolbar uses.
 */
import {
  envelopeBody,
  getText,
  PlatformError,
  platformMessages,
  platformSaveOk,
  postForm,
  postJson,
} from './http';
import { extractJsonAfter } from './bootstrap';
import type {
  BlockProperties,
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

  /** Runtime settings: execution logging and the schedule. */
  async saveRuntime(
    workflowId: string,
    enableLog: boolean,
    schedule: string | number | null,
    hour?: string,
  ): Promise<void> {
    const body: Record<string, string> = {
      type: 'save',
      // The classic form posts strings, and the PHP compares loosely.
      enablelog: enableLog ? '1' : '0',
      schedule: schedule == null || schedule === '' ? '0' : String(schedule),
    };
    if (String(schedule) === 'day' && hour) body.hour = hour;

    const res = await postForm(`/workflow.settings/${encodeURIComponent(workflowId)}`, body);
    if (res && typeof res === 'object' && !platformSaveOk(res)) {
      const failed = platformMessages(res).find((m) => m.type === 'error' || m.type === 'danger');
      throw new PlatformError(failed?.text || 'Could not save workflow settings.');
    }
  },
};

/* -------------------------------------------------------------------------- */
/* Versions, tags and reusables (settings drawer)                             */
/* -------------------------------------------------------------------------- */

export interface WorkflowVersion {
  _id?: string;
  id?: string;
  note?: string;
  'created-at'?: unknown;
  [key: string]: unknown;
}

export const settingsApi = {
  async versions(shortCode: string): Promise<WorkflowVersion[]> {
    const data = envelopeBody<{ records?: WorkflowVersion[] }>(
      await postJson('/workflow.version', { type: 'list', short_code: shortCode }),
    );
    return Array.isArray(data.records) ? data.records : [];
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

  /** Tag the workflow against a category or an app. */
  tag(shortCode: string, type: string, value: string, mode: 'insert' | 'delete' = 'insert') {
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

/* -------------------------------------------------------------------------- */
/* Per-block properties                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Current `block_properties` for one block, read from the live PHP session.
 *
 * The endpoint renders a JSON viewer page rather than returning JSON, so the
 * payload is lifted out of the `JSONView(...)` call. Reading the *session*
 * (not Mongo) matters: it reflects edits made since the last Save.
 */
export async function fetchBlockProperties(
  workflowId: string,
  blockId: string,
): Promise<BlockProperties> {
  const html = await getText(
    `/workflow.jsoninfo/${encodeURIComponent(workflowId)}/${encodeURIComponent(blockId)}`,
  );
  const raw = extractJsonAfter(html, '$("#json-preview").JSONView(');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
