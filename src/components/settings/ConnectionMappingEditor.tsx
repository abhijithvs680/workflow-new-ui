/**
 * Field mapping carried on a connection.
 *
 * The platform stores this on the *target* block as
 * `properties['field-mapping'] = [{keyvalue, insertcolumn}, …]`, and writes it
 * through `connectionPropInsert` with parallel `mapleft[]` / `mapright[]`
 * arrays. `keyvalue` is the source expression, `insertcolumn` the destination
 * name.
 */
import type { FormValue } from '@/api/http';
import { PlusIcon, TrashIcon } from '../ui/icons';

export interface MappingRow {
  /** Source value or `{placeholder}` — posted as `mapleft[]`. */
  left: string;
  /** Destination field name — posted as `mapright[]`. */
  right: string;
}

export function mappingFromProperties(properties?: Record<string, unknown>): MappingRow[] {
  const list = properties?.['field-mapping'];
  if (!Array.isArray(list)) return [{ left: '', right: '' }];
  const rows = list
    .map((entry) => {
      const row = (entry || {}) as Record<string, unknown>;
      return { left: String(row.keyvalue ?? ''), right: String(row.insertcolumn ?? '') };
    })
    .filter((r) => r.left || r.right);
  return rows.length ? rows : [{ left: '', right: '' }];
}

export function mappingToPayload(rows: MappingRow[]): Record<string, FormValue> {
  const used = rows.filter((r) => r.left.trim() !== '' || r.right.trim() !== '');
  return {
    mapleft: used.map((r) => r.left),
    mapright: used.map((r) => r.right),
  };
}

export default function ConnectionMappingEditor({
  rows,
  onChange,
  readOnly,
  sourceId,
  targetId,
}: {
  rows: MappingRow[];
  onChange: (next: MappingRow[]) => void;
  readOnly: boolean;
  sourceId: string;
  targetId: string;
}) {
  const list = rows.length ? rows : [{ left: '', right: '' }];
  const update = (i: number, patch: Partial<MappingRow>) =>
    onChange(list.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <fieldset className="viz-form" disabled={readOnly}>
      <p className="viz-field-note">
        Maps values coming from <code>{sourceId}</code> into <code>{targetId}</code>. The left side accepts a
        literal or a <code>{'{placeholder}'}</code>; the right side is the destination field name.
      </p>

      <div className="viz-repeat">
        <div className="viz-repeat-head">
          <span>Source value</span>
          <span />
          <span>Destination field</span>
          <span />
        </div>

        {list.map((row, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div className="viz-repeat-row" key={i}>
            <input
              className="viz-input"
              placeholder="{block.field} or a literal"
              aria-label={`Mapping ${i + 1} source`}
              value={row.left}
              onChange={(e) => update(i, { left: e.target.value })}
            />
            <span className="viz-repeat-sep">→</span>
            <input
              className="viz-input"
              placeholder="destination field"
              aria-label={`Mapping ${i + 1} destination`}
              value={row.right}
              onChange={(e) => update(i, { right: e.target.value })}
            />
            <button
              type="button"
              className="viz-icon-btn"
              title="Remove mapping"
              aria-label="Remove mapping"
              onClick={() => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [{ left: '', right: '' }])}
            >
              <TrashIcon size={13} />
            </button>
          </div>
        ))}

        <button type="button" className="viz-link-btn" onClick={() => onChange([...list, { left: '', right: '' }])}>
          <PlusIcon size={12} /> Add mapping
        </button>
      </div>
    </fieldset>
  );
}
