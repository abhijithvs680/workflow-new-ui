import { useCallback, useEffect, useRef, useState } from 'react';
import Select from './ui/Select';
import { workflowApi } from '@/api/workflow';
import { errorText } from '@/api/http';
import type { RecentLogRow } from '@/types/workflow';
import { absoluteTime, fromNow } from '@/lib/runStatus';
import { RefreshIcon } from './ui/icons';
import { Spinner } from './ui/feedback';

const PAGE_SIZES = [10, 20, 50, 100, 250];

interface RecentLogsProps {
  workflowId: string;
  activeLogId?: string | number;
  onOpenLog: (logId: string | number) => void;
  disabled?: boolean;
  /** Bumped by canvas interaction so the menu closes when attention moves. */
  dismissKey: number;
}

/**
 * Split control beside Run: the classic "Recent logs" list, which loads a past
 * execution into the debug dock.
 */
export default function RecentLogs({
  workflowId,
  activeLogId,
  onOpenLog,
  disabled,
  dismissKey,
}: RecentLogsProps) {
  const [open, setOpen] = useState(false);
  const [length, setLength] = useState(10);
  const [rows, setRows] = useState<RecentLogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (len: number) => {
      if (!workflowId) return;
      setBusy(true);
      setError('');
      try {
        setRows(await workflowApi.recentLogs(workflowId, len));
        setLoaded(true);
      } catch (e) {
        setError(errorText(e, 'Could not load logs.'));
        setRows([]);
      } finally {
        setBusy(false);
      }
    },
    [workflowId],
  );

  useEffect(() => setOpen(false), [dismissKey]);

  useEffect(() => {
    if (!open) return undefined;
    if (!loaded) void load(length);

    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, loaded, load, length]);

  return (
    <div className={`viz-recent-logs${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="viz-btn viz-recent-logs-toggle"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title="Recent logs"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="viz-caret" />
      </button>

      {open ? (
        <div className="viz-recent-logs-menu" role="menu">
          <header className="viz-recent-logs-head">
            <span className="viz-recent-logs-title">Recent logs</span>
            <div className="viz-recent-logs-tools">
              <label className="viz-visually-hidden" htmlFor="viz-log-count">
                Number of logs
              </label>
              <Select
                id="viz-log-count"
                small
                value={String(length)}
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                placeholder={String(length)}
                onChange={(v) => {
                  const n = Number(v) || 10;
                  setLength(n);
                  void load(n);
                }}
              />
              <button
                type="button"
                className="viz-icon-btn"
                title="Refresh"
                onClick={() => void load(length)}
                disabled={busy}
              >
                <RefreshIcon />
              </button>
            </div>
          </header>

          {busy ? (
            <div className="viz-recent-logs-state">
              <Spinner label="Loading…" />
            </div>
          ) : null}
          {error && !busy ? <div className="viz-recent-logs-state is-error">{error}</div> : null}

          {!busy && !error ? (
            <div className="viz-recent-logs-table-wrap">
              <table className="viz-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Executed</th>
                    <th scope="col">Log id</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="viz-recent-logs-state">
                        No logs found.
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((row, i) => {
                    const isActive = String(row.logid) === String(activeLogId);
                    return (
                      <tr
                        key={String(row.logid)}
                        className={isActive ? 'is-active' : ''}
                        onClick={() => {
                          setOpen(false);
                          onOpenLog(row.logid);
                        }}
                      >
                        <td>{i + 1}</td>
                        <td>
                          <span className="viz-recent-logs-when" title={absoluteTime(row.date)}>
                            {fromNow(row.date)}
                          </span>
                          <span className="viz-recent-logs-by">{row.email || 'System'}</span>
                        </td>
                        <td>
                          <span className={`viz-log-id${isActive ? ' is-current' : ''}`}>{row.logid}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
