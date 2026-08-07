/**
 * Themed dropdown.
 *
 * A native `<select>` renders its open list as OS chrome — on Windows a blue
 * system popup — so the expanded state ignores the app's theme entirely. This
 * is a listbox built from regular elements instead, which means the panel,
 * hover and selected states follow the same tokens as everything else.
 *
 * The popup is portalled to `document.body` and positioned from the trigger's
 * viewport rect: inside the canvas, React Flow's transformed panes create
 * containing blocks that would otherwise clip or mis-place an absolutely
 * positioned child, and inside a dialog the scrolling body would crop it.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Shown when nothing is selected; also the first, empty-valued row. */
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Compact variant, matching `.viz-select.is-sm`. */
  small?: boolean;
  'aria-label'?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  /** Space below the trigger, so a long list can flip above it. */
  below: number;
  above: number;
}

const MAX_PANEL = 260;

export default function Select({
  value,
  options,
  onChange,
  placeholder = '— Select —',
  disabled,
  id,
  className,
  small,
  'aria-label': ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * A stored value that is no longer offered still has to round-trip, so it is
   * shown rather than silently reset to the placeholder.
   */
  const rows = useMemo<SelectOption[]>(() => {
    const list: SelectOption[] = [{ value: '', label: placeholder }, ...options];
    if (value && !options.some((o) => o.value === value)) {
      list.push({ value, label: `${value} (not in this list)` });
    }
    return list;
  }, [options, placeholder, value]);

  const selected = rows.find((o) => o.value === value);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({
      top: r.bottom,
      left: r.left,
      width: r.width,
      below: window.innerHeight - r.bottom,
      above: r.top,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    // Any scroll or resize invalidates the measured rect; closing is both
    // cheaper and less jarring than chasing the trigger around.
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActive(Math.max(0, rows.findIndex((o) => o.value === value)));
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(rows.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const row = rows[active];
      if (row) commit(row.value);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  // Flip above the trigger when the list would not fit below it.
  const flip = !!rect && rect.below < Math.min(MAX_PANEL, rows.length * 30 + 8) && rect.above > rect.below;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`viz-select-btn${small ? ' is-sm' : ''}${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setActive(Math.max(0, rows.findIndex((o) => o.value === value)));
          setOpen((v) => !v);
        }}
        onKeyDown={onKeyDown}
      >
        <span className={`viz-select-value${selected && selected.value ? '' : ' is-placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              className="viz-select-panel"
              role="listbox"
              tabIndex={-1}
              style={{
                left: rect.left,
                width: rect.width,
                maxHeight: MAX_PANEL,
                // `rect.above` is the trigger's top edge, so anchoring the
                // panel's bottom there lifts it clear of the trigger.
                ...(flip
                  ? { bottom: window.innerHeight - rect.above + 4 }
                  : { top: rect.top + 4 }),
              }}
            >
              {rows.map((o, i) => (
                <div
                  key={`${o.value}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  className={`viz-select-option${i === active ? ' is-active' : ''}${
                    o.value === value ? ' is-selected' : ''
                  }${o.value === '' ? ' is-placeholder' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(o.value);
                  }}
                >
                  {o.label}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
