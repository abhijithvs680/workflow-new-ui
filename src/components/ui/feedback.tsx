import { useCallback, useRef, useState, type ReactNode } from 'react';
import { WarningIcon } from './icons';

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

/** Errors stay up longer — they usually carry something to read. */
const TTL: Record<ToastKind, number> = { info: 3000, success: 3000, error: 7000 };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (text: string, kind: ToastKind = 'info') => {
      const id = nextId.current;
      nextId.current += 1;
      // Cap the stack so a failing loop cannot bury the canvas.
      setToasts((list) => [...list.slice(-3), { id, kind, text }]);
      window.setTimeout(() => dismiss(id), TTL[kind]);
      return id;
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="viz-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`viz-toast is-${t.kind}`}>
          <span>{t.text}</span>
          <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading and error states                                                   */
/* -------------------------------------------------------------------------- */

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="viz-spinner-wrap">
      <span className="viz-spinner" aria-hidden="true" />
      {label ? <span className="viz-spinner-label">{label}</span> : null}
    </span>
  );
}

export function FullPageLoader({ message }: { message: string }) {
  return (
    <div className="viz-fullpage">
      <span className="viz-spinner is-lg" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function FullPageError({
  title,
  message,
  detail,
  onRetry,
}: {
  title: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="viz-fullpage is-error" role="alert">
      <span className="viz-fullpage-icon">
        <WarningIcon size={30} />
      </span>
      <h1>{title}</h1>
      <p>{message}</p>
      {detail ? <pre className="viz-fullpage-detail">{detail}</pre> : null}
      {onRetry ? (
        <button type="button" className="viz-btn is-primary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p className="viz-inline-error" role="alert">
      <WarningIcon size={14} />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="viz-empty">{children}</p>;
}

/* -------------------------------------------------------------------------- */
/* Skeletons                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A shimmering placeholder block. Skeletons stand in for a spinner because they
 * show the shape of what is coming, so the layout does not jump when the data
 * lands.
 */
export function Skeleton({
  width,
  height,
  radius,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}) {
  return (
    <span
      className="viz-skel"
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** Placeholder for the workflow list: rail entries plus grouped rows. */
export function ListSkeleton() {
  return (
    <div className="viz-wl" aria-busy="true" aria-label="Loading workflows">
      <header className="viz-wl-top">
        <Skeleton width={92} height={18} />
        <span style={{ marginLeft: 'auto' }}>
          <Skeleton width={320} height={34} radius={4} />
        </span>
        <Skeleton width={80} height={32} radius={4} />
      </header>

      <div className="viz-wl-body">
        <aside className="viz-wl-rail">
          <div className="viz-wl-rail-head">
            <Skeleton width={96} height={16} />
          </div>
          <div className="viz-wl-rail-list">
            {Array.from({ length: 9 }, (_, i) => (
              <div className="viz-skel-rail-item" key={i}>
                <Skeleton width={`${55 + ((i * 13) % 35)}%`} height={13} />
              </div>
            ))}
          </div>
        </aside>

        <main className="viz-wl-main">
          <div className="viz-wl-main-head">
            <Skeleton width={190} height={22} />
          </div>
          <div className="viz-skel-rows">
            {Array.from({ length: 10 }, (_, i) => (
              <div className="viz-skel-row" key={i}>
                <Skeleton width={`${32 + ((i * 17) % 40)}%`} height={14} />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Placeholder for the canvas: a toolbar bar and a few block-shaped tiles. */
export function CanvasSkeleton() {
  const spots = [
    { top: 18, left: 8 },
    { top: 18, left: 26 },
    { top: 18, left: 44 },
    { top: 46, left: 35 },
    { top: 46, left: 53 },
    { top: 30, left: 68 },
  ];
  return (
    <div className="viz-skel-canvas" aria-busy="true" aria-label="Loading workflow">
      <div className="viz-skel-toolbar">
        <Skeleton width={180} height={20} />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Skeleton width={72} height={32} radius={4} />
          <Skeleton width={72} height={32} radius={4} />
        </span>
      </div>
      <div className="viz-skel-stage">
        {spots.map((p, i) => (
          <div className="viz-skel-node" key={i} style={{ top: `${p.top}%`, left: `${p.left}%` }}>
            <Skeleton width={96} height={96} radius={8} />
            <Skeleton width={70} height={11} />
          </div>
        ))}
      </div>
    </div>
  );
}
