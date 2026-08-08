/**
 * Workflow list, backed by the classic `workflow.all` controller.
 *
 * Two things about that endpoint shape the client:
 *
 *  1. It reads its filters from `php://input`, so the request must carry a real
 *     JSON body (see `postJsonBody`).
 *  2. **It has no pagination.** It returns every workflow the tenant can see in
 *     one array, and does a tag lookup plus one or two user lookups per row on
 *     the way. So the response is fetched once and everything after that —
 *     search, filtering, sorting, windowing — happens in the browser.
 */
import { postJsonBody } from './http';

export interface WorkflowListRow {
  id: string;
  title: string;
  shortCode: string;
  owner: string;
  lastActionBy: string;
  /** Unix milliseconds; 0 when the platform sent nothing usable. */
  lastActionAt: number;
  reusable: boolean;
  /** The controller sets this when logging is *disabled*. */
  logDisabled: boolean;
  recent: boolean;
  hasSubItem: boolean;
  apps: Array<{ id: string; name: string }>;
}

export interface WorkflowListResult {
  rows: WorkflowListRow[];
  canDelete: boolean;
}

export interface WorkflowListFilters {
  searchItem?: string;
  leftPanelTag?: string;
  leftPanelCategory?: string;
  leftPanelApp?: string;
  leftPanelReusable?: string;
  leftPanelLogStatus?: string;
}

/**
 * Mongo dates reach JSON in several shapes depending on driver and encoder:
 * a raw millisecond number, `{$date: …}`, or an ISO string.
 */
function toMillis(value: unknown): number {
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n > 1e12 ? n : n * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const inner = rec.$date ?? rec.sec ?? rec.milliseconds ?? rec.numberLong;
    if (inner !== undefined) return toMillis(inner);
  }
  return 0;
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export async function fetchWorkflowList(
  filters: WorkflowListFilters = {},
  appShortCode = '',
): Promise<WorkflowListResult> {
  const url = appShortCode ? `/workflow.all/${encodeURIComponent(appShortCode)}` : '/workflow.all';
  // The controller only reads filter keys, so with none set there is nothing to
  // send — an empty body keeps the request clean.
  const hasFilters = Object.values(filters).some((v) => v !== undefined && v !== '');
  const data = await postJsonBody<{
    workflows?: Array<Record<string, unknown>>;
    delete_flag?: unknown;
  }>(url, hasFilters ? filters : undefined);

  const list = Array.isArray(data.workflows) ? data.workflows : [];
  const rows: WorkflowListRow[] = list
    .map((r) => ({
      id: String(r.Id ?? ''),
      title: String(r.Title ?? ''),
      shortCode: String(r.ShortCode ?? ''),
      owner: String(r.Owner ?? ''),
      lastActionBy: String(r.Last_action_by ?? ''),
      lastActionAt: toMillis(r.Last_action_date),
      reusable: asBool(r.Reusable),
      logDisabled: asBool(r.Workflow_log),
      recent: asBool(r.Recent),
      hasSubItem: asBool(r.HasSubItem),
      apps: Array.isArray(r.App)
        ? (r.App as Array<Record<string, unknown>>).map((a) => ({
            id: String(a.Id ?? ''),
            name: String(a.Name ?? a.Id ?? ''),
          }))
        : [],
    }))
    .filter((r) => r.id);

  return { rows, canDelete: asBool(data.delete_flag) };
}
