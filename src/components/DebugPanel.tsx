import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DebugBlockInfo, DebugData } from '@/types/workflow';
import { blockCompleted, runStatusKind } from '@/lib/runStatus';
import { CaretIcon, CloseIcon, MaximizeIcon, RestoreIcon } from './ui/icons';
import { EmptyState } from './ui/feedback';

const MIN_HEIGHT = 220;
const DEFAULT_HEIGHT = 360;
const MAX_VIEWPORT_FRACTION = 0.85;

function clampHeight(px: number): number {
  const max = Math.round(window.innerHeight * MAX_VIEWPORT_FRACTION);
  return Math.max(MIN_HEIGHT, Math.min(max, Math.round(px)));
}

/** Tokenize pretty-printed JSON so keys, strings and numbers are legible. */
function highlightJson(text: string): ReactNode[] {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      if (m[2]) {
        nodes.push(
          <span key={key++} className="viz-json-key">
            {m[1]}
          </span>,
        );
        nodes.push(m[2]);
      } else {
        nodes.push(
          <span key={key++} className="viz-json-str">
            {m[1]}
          </span>,
        );
      }
    } else if (m[3] !== undefined) {
      nodes.push(
        <span key={key++} className={m[3] === 'null' ? 'viz-json-null' : 'viz-json-bool'}>
          {m[3]}
        </span>,
      );
    } else {
      nodes.push(
        <span key={key++} className="viz-json-num">
          {m[0]}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Value({ value }: { value: unknown }) {
  if (value == null || value === '') return <em className="viz-null">empty</em>;

  if (typeof value === 'string') {
    // Blocks often log JSON as a string; render it structured when it parses.
    const trimmed = value.trim();
    const looksStructured =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksStructured) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        return <pre className="viz-json">{highlightJson(JSON.stringify(parsed, null, 2))}</pre>;
      } catch {
        /* fall through to plain text */
      }
    }
    return <p className="viz-json-plain">{value}</p>;
  }

  return <pre className="viz-json">{highlightJson(JSON.stringify(value, null, 2))}</pre>;
}

interface DebugPanelProps {
  run: DebugData | null;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onClose: () => void;
}

/**
 * Execution results dock. Resizable from the top edge, with prev/next stepping
 * that also re-centres the canvas on the block (handled by the parent).
 */
export default function DebugPanel({ run, selectedBlockId, onSelectBlock, onClose }: DebugPanelProps) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [maximized, setMaximized] = useState(false);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  const summary = run?.summary;
  const logId = summary?.workflow_log_id;

  const blocks = useMemo<DebugBlockInfo[]>(() => {
    const info = run?.blockInfo || {};
    return Object.keys(info).map((k) => ({ ...info[k], activityId: info[k]?.activityId || k }));
  }, [run]);

  useEffect(() => {
    if (!run) setMaximized(false);
  }, [run, logId]);

  const activeIndex = useMemo(() => {
    if (!blocks.length) return -1;
    if (selectedBlockId == null || selectedBlockId === '') return 0;
    const idx = blocks.findIndex((b) => String(b.activityId) === String(selectedBlockId));
    return idx >= 0 ? idx : 0;
  }, [blocks, selectedBlockId]);

  const active = activeIndex >= 0 ? blocks[activeIndex] : null;

  const selectAt = useCallback(
    (index: number) => {
      if (index < 0 || index >= blocks.length) return;
      onSelectBlock(String(blocks[index].activityId));
    },
    [blocks, onSelectBlock],
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (maximized) return;
      e.preventDefault();
      drag.current = { startY: e.clientY, startH: height };

      const onMove = (ev: MouseEvent) => {
        if (!drag.current) return;
        // Dragging the top edge upwards grows the dock.
        setHeight(clampHeight(drag.current.startH + (drag.current.startY - ev.clientY)));
      };
      const onUp = () => {
        drag.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.classList.remove('viz-resizing');
      };

      document.body.classList.add('viz-resizing');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [height, maximized],
  );

  if (!run) return null;

  const data = active?.data || {};
  const dataKeys = Object.keys(data);
  const statusKind = runStatusKind(summary?.status);

  return (
    <section
      className={`viz-debug${maximized ? ' is-maximized' : ''}`}
      style={maximized ? undefined : { flexBasis: `${height}px`, height: `${height}px` }}
      aria-label="Execution results"
    >
      <div
        className="viz-debug-resizer"
        onMouseDown={onResizeStart}
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize"
      />

      <header className="viz-debug-head">
        <span className={`viz-pill is-${statusKind}`}>{summary?.status || 'unknown'}</span>
        <span className="viz-debug-meta">
          Run #{String(logId ?? '—')} · {blocks.length} block{blocks.length === 1 ? '' : 's'}
          {summary?.execution_time ? ` · ${summary.execution_time}s` : ''}
        </span>

        <div className="viz-debug-controls">
          <button
            type="button"
            className="viz-debug-ctrl"
            disabled={activeIndex <= 0}
            onClick={() => selectAt(activeIndex - 1)}
            title="Previous block"
          >
            <CaretIcon dir="left" />
          </button>
          <button
            type="button"
            className="viz-debug-ctrl"
            disabled={activeIndex >= blocks.length - 1}
            onClick={() => selectAt(activeIndex + 1)}
            title="Next block"
          >
            <CaretIcon dir="right" />
          </button>
          <span className="viz-debug-ctrl-sep" />
          <button
            type="button"
            className="viz-debug-ctrl"
            onClick={() => setMaximized((v) => !v)}
            title={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button type="button" className="viz-debug-ctrl" onClick={onClose} title="Close results">
            <CloseIcon size={12} />
          </button>
        </div>
      </header>

      <div className="viz-debug-body">
        <ul className="viz-debug-blocks">
          {blocks.length === 0 ? <li className="viz-empty">No blocks were executed.</li> : null}
          {blocks.map((b) => (
            <li key={String(b.activityId)} className={b.activityId === active?.activityId ? 'is-active' : ''}>
              <button type="button" onClick={() => onSelectBlock(String(b.activityId))}>
                <span className={`viz-dot is-${blockCompleted(b.completed) ? 'ok' : 'failed'}`} />
                <span className="viz-debug-name">{b.block_label || b.block_name || b.block_type}</span>
                <span className="viz-debug-time">{b.execution_time ? `${b.execution_time}s` : ''}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="viz-debug-detail">
          {!active ? (
            <EmptyState>Select a block to inspect its data.</EmptyState>
          ) : (
            <>
              <h3 className="viz-debug-block-title">
                {active.block_label || active.block_name || active.block_type}
              </h3>
              <dl className="viz-debug-kv">
                <div>
                  <dt>Block id</dt>
                  <dd>{active.activityId}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{active.block_type || '—'}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{active.completed || '—'}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{active.execution_time ? `${active.execution_time}s` : '—'}</dd>
                </div>
              </dl>

              {dataKeys.length === 0 ? (
                <EmptyState>
                  This block logged no data. Turn on debug mode in its settings to capture input and output.
                </EmptyState>
              ) : (
                dataKeys.map((k) => (
                  <details key={k} open={k === 'output'} className="viz-debug-fold">
                    <summary>{k}</summary>
                    <Value value={(data as Record<string, unknown>)[k]} />
                  </details>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
