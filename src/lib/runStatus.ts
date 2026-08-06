/**
 * Debug payloads mix casings — the engine emits `"Success"` / `"Yes"` on some
 * paths and lowercase on others. Normalize before painting any ok/failed UI.
 */
import type { DebugBlockInfo, RunStatus } from '@/types/workflow';

const TRUTHY = new Set(['yes', 'true', '1', 'ok', 'completed', 'success']);

export function blockCompleted(completed: unknown): boolean {
  return TRUTHY.has(String(completed ?? '').trim().toLowerCase());
}

export type StatusKind = 'ok' | 'failed' | 'running';

export function runStatusKind(status: unknown): StatusKind {
  const s = String(status ?? '').trim().toLowerCase();
  if (!s) return 'failed';
  if (s === 'success' || s === 'completed' || s === 'ok' || s === 'done') return 'ok';
  if (s === 'running' || s === 'pending' || s === 'in progress') return 'running';
  return 'failed';
}

export function blockRunStatus(hit: DebugBlockInfo | undefined): RunStatus {
  if (!hit) return 'skipped';
  return blockCompleted(hit.completed) ? 'ok' : 'failed';
}

/** Relative time for the recent-logs list; falls back to the raw value. */
export function fromNow(dateStr?: string): string {
  if (!dateStr) return '—';
  const iso = String(dateStr).includes('T') ? dateStr : `${dateStr}Z`;
  const t = Date.parse(iso) || Date.parse(dateStr);
  if (!Number.isFinite(t)) return String(dateStr);

  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

export function absoluteTime(dateStr?: string): string {
  if (!dateStr) return '';
  const iso = String(dateStr).includes('T') ? dateStr : `${dateStr}Z`;
  const t = Date.parse(iso) || Date.parse(dateStr);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : String(dateStr);
}
