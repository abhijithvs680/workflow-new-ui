import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaletteGroup, PaletteItem } from '@/types/workflow';
import BlockIcon from './ui/BlockIcon';
import { BlocksIcon, ChevronIcon, CloseIcon } from './ui/icons';
import { EmptyState } from './ui/feedback';

/** MIME type for the palette → canvas drag payload. */
export const BLOCK_DND_TYPE = 'application/viz-block';

interface PaletteProps {
  groups: PaletteGroup[];
  open: boolean;
  onToggle: () => void;
  onAdd: (item: PaletteItem) => void;
  /** Set while "Add next" is waiting for a pick; the new block gets wired up. */
  pendingSourceId: string | null;
  onCancelPending: () => void;
}

/**
 * Floating block picker. Drag an entry onto the canvas, or click it to drop
 * beside the current selection.
 */
export default function Palette({
  groups,
  open,
  onToggle,
  onAdd,
  pendingSourceId,
  onCancelPending,
}: PaletteProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            i.objType.toLowerCase().includes(q) ||
            i.alias.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length);
  }, [groups, query]);

  const searching = query.trim().length > 0;
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  if (!open) {
    return (
      <button type="button" className="viz-float-launcher" onClick={onToggle} title="Open blocks">
        <BlocksIcon />
        <span>Blocks</span>
      </button>
    );
  }

  return (
    <aside className="viz-palette" role="dialog" aria-label="Blocks">
      <header className="viz-palette-head">
        <span>
          Blocks{total ? <em>{total}</em> : null}
        </span>
        <button type="button" className="viz-icon-btn" onClick={onToggle} title="Close">
          <CloseIcon />
        </button>
      </header>

      {pendingSourceId ? (
        <div className="viz-palette-pending">
          <span>Pick a block to connect next</span>
          <button type="button" className="viz-link-btn" onClick={onCancelPending}>
            Cancel
          </button>
        </div>
      ) : null}

      <div className="viz-palette-search">
        <input
          ref={searchRef}
          className="viz-input"
          style={{ width: '100%' }}
          type="search"
          value={query}
          placeholder="Search blocks…"
          aria-label="Search blocks"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="viz-palette-list">
        {filtered.length === 0 ? (
          <EmptyState>
            {total === 0
              ? 'No blocks were returned by the platform. Check that you can open this workflow in the classic canvas.'
              : `No blocks match “${query}”.`}
          </EmptyState>
        ) : null}

        {filtered.map((group) => {
          const isOpen = searching || !!pendingSourceId || !collapsed[group.category];
          return (
            <section className="viz-palette-group" key={group.category}>
              <button
                type="button"
                className="viz-palette-group-head"
                aria-expanded={isOpen}
                onClick={() =>
                  setCollapsed((s) => ({ ...s, [group.category]: !s[group.category] }))
                }
              >
                <ChevronIcon open={isOpen} />
                <span>{group.category}</span>
                <em>{group.items.length}</em>
              </button>

              {isOpen ? (
                <ul>
                  {group.items.map((item) => (
                    <li key={`${group.category}:${item.objId}:${item.objType}:${item.label}`}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(BLOCK_DND_TYPE, JSON.stringify(item));
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => onAdd(item)}
                        title={`${item.label} (${item.objType}) — click to add, or drag onto the canvas`}
                      >
                        <span className="viz-palette-icon">
                          <BlockIcon
                            iconPath={item.iconPath}
                            label={item.alias || item.label}
                            fallback={item.objType}
                          />
                        </span>
                        <span className="viz-palette-label">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>

      <p className="viz-palette-hint">
        {pendingSourceId
          ? 'Click a block to add and connect it.'
          : 'Drag onto the canvas, or click to add beside the selection.'}
      </p>
    </aside>
  );
}
