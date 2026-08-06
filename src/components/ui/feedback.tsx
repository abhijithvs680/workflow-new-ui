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
