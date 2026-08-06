import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';

interface ModalProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** `md` suits most block forms; `lg` is for tabbed / two-column layouts. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Shown as a strip under the header — used for save failures. */
  banner?: ReactNode;
  busy?: boolean;
}

/**
 * Portal dialog with focus trapping and scroll locking.
 *
 * Portalling matters on the canvas: React Flow's transformed panes create
 * containing blocks that would otherwise clip a `position: fixed` overlay.
 */
export default function Modal({
  title,
  subtitle,
  size = 'md',
  onClose,
  children,
  footer,
  banner,
  busy,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<Element | null>(null);

  useEffect(() => {
    restoreFocus.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Focus the first control so keyboard users land inside the dialog.
    const timer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), select, textarea, button',
      );
      first?.focus();
    }, 30);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = overflow;
      (restoreFocus.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  return createPortal(
    <div
      className="viz-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`viz-modal is-${size}${busy ? ' is-busy' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onKeyDown={onKeyDown}
      >
        <header className="viz-modal-head">
          <div className="viz-modal-titles">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="viz-icon-btn" onClick={onClose} title="Close (Esc)">
            <CloseIcon size={15} />
          </button>
        </header>

        {banner ? <div className="viz-modal-banner">{banner}</div> : null}

        <div className="viz-modal-body">{children}</div>

        {footer ? <footer className="viz-modal-foot">{footer}</footer> : null}

        {busy ? <div className="viz-modal-veil" aria-hidden="true" /> : null}
      </div>
    </div>,
    document.body,
  );
}
