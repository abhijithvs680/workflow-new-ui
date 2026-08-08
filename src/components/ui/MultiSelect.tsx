/**
 * Themed multi-select dropdown.
 *
 * Same construction as `Select`: a listbox built from regular elements and
 * portalled to `document.body`, because React Flow's transformed panes and the
 * dialog's scrolling body both clip an absolutely positioned child.
 *
 * The control shows the current picks as removable chips, and the panel adds a
 * filter box — a workspace can have a lot of spreadsheets.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronIcon } from './icons';
import type { SelectOption } from './Select';

export interface MultiSelectProps {
  value: string[];
  options: SelectOption[];
  onChange: (next: string[]) => void;
  /** Shown when nothing is picked. */
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown in the panel when the option list is empty. */
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  below: number;
  above: number;
}

const MAX_PANEL = 300;

export default function MultiSelect({
  value,
  options,
  onChange,
  placeholder = '— Select —',
  searchPlaceholder = 'Filter…',
  emptyText = 'Nothing to choose from.',
  disabled,
  id,
  'aria-label': ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const labels = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle),
    );
  }, [options, query]);

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
    // Focus the filter box, so typing narrows the list immediately.
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);

    const close = () => setOpen(false);
    // Any scroll or resize invalidates the measured rect; closing is cheaper
    // and less jarring than chasing the trigger around.
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const toggle = (option: string) => {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      (triggerRef.current as HTMLElement | null)?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = matches[active];
      if (row) toggle(row.value);
    }
  };

  const flip = !!rect && rect.below < Math.min(MAX_PANEL, 220) && rect.above > rect.below;

  return (
    <>
      <div
        ref={triggerRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className={`viz-select-btn viz-multiselect${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {value.length === 0 ? (
          <span className="viz-select-value is-placeholder">{placeholder}</span>
        ) : (
          <span className="viz-multiselect-chips">
            {value.map((v) => (
              <span className="viz-chip" key={v}>
                {labels.get(v) || v}
                <button
                  type="button"
                  aria-label={`Remove ${labels.get(v) || v}`}
                  onClick={(e) => {
                    // The chip sits inside the trigger, which would reopen.
                    e.stopPropagation();
                    toggle(v);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </span>
        )}
        <ChevronIcon open={open} size={11} />
      </div>

      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              className="viz-select-panel viz-multiselect-panel"
              style={{
                left: rect.left,
                width: rect.width,
                maxHeight: MAX_PANEL,
                ...(flip ? { bottom: window.innerHeight - rect.above + 4 } : { top: rect.top + 4 }),
              }}
              onKeyDown={onPanelKeyDown}
            >
              <input
                ref={searchRef}
                className="viz-input viz-multiselect-search"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <div className="viz-multiselect-list" role="listbox" aria-multiselectable="true">
                {options.length === 0 ? (
                  <p className="viz-multiselect-empty">{emptyText}</p>
                ) : matches.length === 0 ? (
                  <p className="viz-multiselect-empty">No match for “{query}”.</p>
                ) : (
                  matches.map((option, i) => {
                    const checked = value.includes(option.value);
                    return (
                      <div
                        key={option.value}
                        role="option"
                        aria-selected={checked}
                        className={`viz-select-option viz-multiselect-option${i === active ? ' is-active' : ''}${
                          checked ? ' is-selected' : ''
                        }`}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          toggle(option.value);
                        }}
                      >
                        <input type="checkbox" checked={checked} readOnly tabIndex={-1} />
                        <span className="viz-multiselect-label">{option.label}</span>
                        {option.value !== option.label ? (
                          <em className="viz-multiselect-hint">{option.value}</em>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
