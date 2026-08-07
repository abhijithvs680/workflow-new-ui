import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  fetchApps,
  fetchDocuments,
  fetchSpreadsheetColumns,
  fetchSpreadsheets,
  searchWorkflows,
  type Option,
} from '@/api/lookups';
import { errorText } from '@/api/http';
import { PlusIcon, TrashIcon } from '../ui/icons';
import { InlineError, Spinner } from '../ui/feedback';
import { AutocompleteInput } from '../ui/AutocompleteInput';
import {
  FILTER_OPERATORS,
  type Field,
  type FilterRow,
  type ParamRow,
  type RowsetColumn,
  type SortRow,
  type Values,
  type VariablePair,
} from './schema';

/* -------------------------------------------------------------------------- */
/* Async option loading                                                       */
/* -------------------------------------------------------------------------- */

function useAsyncOptions(load: () => Promise<Option[]>, deps: unknown[]) {
  const [options, setOptions] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError('');
    load()
      .then((list) => {
        if (!cancelled) setOptions(list);
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e, 'Could not load options.'));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { options, busy, error };
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

function Row({
  id,
  label,
  help,
  required,
  full,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`viz-field${full ? ' is-full' : ''}`}>
      <label className="viz-field-label" htmlFor={id}>
        {label}
        {required ? <abbr title="Required">*</abbr> : null}
      </label>
      <div className="viz-field-control">
        {children}
        {help ? <p className="viz-field-help">{help}</p> : null}
      </div>
    </div>
  );
}

/**
 * A `<select>` whose stored value is no longer in the option list still has to
 * round-trip — otherwise opening and saving a dialog would silently clear it.
 */
function withCurrent(options: Option[], value: string): Option[] {
  if (!value || options.some((o) => o.value === value)) return options;
  return [{ value, label: `${value} (not in this list)` }, ...options];
}

/* -------------------------------------------------------------------------- */
/* Composite editors                                                          */
/* -------------------------------------------------------------------------- */

function VariablesEditor({
  value,
  onChange,
}: {
  value: VariablePair[];
  onChange: (next: VariablePair[]) => void;
}) {
  const rows = value.length ? value : [{ key: '', value: '' }];
  const update = (i: number, patch: Partial<VariablePair>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <div className="viz-repeat">
      {rows.map((row, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="viz-repeat-row" key={i}>
          <input
            className="viz-input"
            placeholder="variable"
            aria-label={`Variable ${i + 1} name`}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <span className="viz-repeat-sep">=</span>
          <input
            className="viz-input"
            placeholder="value"
            aria-label={`Variable ${i + 1} value`}
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button
            type="button"
            className="viz-icon-btn"
            title="Remove variable"
            aria-label="Remove variable"
            onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ key: '', value: '' }])}
          >
            <TrashIcon size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="viz-link-btn" onClick={() => onChange([...rows, { key: '', value: '' }])}>
        <PlusIcon size={12} /> Add variable
      </button>
    </div>
  );
}

function FiltersEditor({
  value,
  onChange,
  columns,
  listId,
}: {
  value: FilterRow[];
  onChange: (next: FilterRow[]) => void;
  columns: string[];
  listId: string;
}) {
  const rows = value.length ? value : [{ key: '', operator: '=', value: '' }];
  const update = (i: number, patch: Partial<FilterRow>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <div className="viz-repeat">
      <datalist id={listId}>
        {columns.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Column / operator / value, the row ssMultiFilter.tpl renders. */}
      <div className="viz-repeat-head is-filter">
        <span>Filter Column</span>
        <span />
        <span>Filter Value</span>
        <span />
      </div>

      {rows.map((row, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="viz-repeat-row is-filter" key={i}>
          <input
            className="viz-input"
            list={listId}
            placeholder="column"
            aria-label={`Filter ${i + 1} column`}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <select
            className="viz-select"
            aria-label={`Filter ${i + 1} operator`}
            value={row.operator || '='}
            onChange={(e) => update(i, { operator: e.target.value })}
          >
            {FILTER_OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className="viz-input"
            placeholder="value"
            aria-label={`Filter ${i + 1} value`}
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button
            type="button"
            className="viz-icon-btn"
            title="Remove filter"
            aria-label="Remove filter"
            onClick={() =>
              onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ key: '', operator: '=', value: '' }])
            }
          >
            <TrashIcon size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="viz-link-btn"
        onClick={() => onChange([...rows, { key: '', operator: '=', value: '' }])}
      >
        <PlusIcon size={12} /> Add filter
      </button>
    </div>
  );
}

function SortEditor({
  value,
  onChange,
  columns,
  listId,
}: {
  value: SortRow[];
  onChange: (next: SortRow[]) => void;
  columns: string[];
  listId: string;
}) {
  const [column, setColumn] = useState('');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  const add = () => {
    const name = column.trim();
    if (!name) return;
    onChange([...value.filter((r) => r.sort_column !== name), { sort_column: name, sort_order: order }]);
    setColumn('');
  };

  return (
    <div className="viz-sort">
      <datalist id={listId}>
        {columns.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="viz-repeat-row is-sort">
        <input
          className="viz-input"
          list={listId}
          placeholder="column"
          aria-label="Sort column"
          value={column}
          onChange={(e) => setColumn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <select
          className="viz-select"
          aria-label="Sort direction"
          value={order}
          onChange={(e) => setOrder(e.target.value === 'desc' ? 'desc' : 'asc')}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        <button type="button" className="viz-btn is-sm" onClick={add}>
          Add
        </button>
      </div>

      <div className="viz-chips">
        {value.length === 0 ? <span className="viz-chips-empty">No sorting added</span> : null}
        {value.map((row) => (
          <span className="viz-chip" key={row.sort_column}>
            {row.sort_column} · {row.sort_order}
            <button
              type="button"
              aria-label={`Remove sort on ${row.sort_column}`}
              onClick={() => onChange(value.filter((r) => r.sort_column !== row.sort_column))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function ParamsEditor({ value, onChange }: { value: ParamRow[]; onChange: (next: ParamRow[]) => void }) {
  const rows = value.length ? value : [{ field: '', value: '' }];
  const update = (i: number, patch: Partial<ParamRow>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <div className="viz-repeat">
      {rows.map((row, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="viz-repeat-row" key={i}>
          <input
            className="viz-input"
            placeholder="input name"
            aria-label={`Input ${i + 1} name`}
            value={row.field}
            onChange={(e) => update(i, { field: e.target.value })}
          />
          <span className="viz-repeat-sep">=</span>
          <input
            className="viz-input"
            placeholder="value or {placeholder}"
            aria-label={`Input ${i + 1} value`}
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button
            type="button"
            className="viz-icon-btn"
            title="Remove input"
            aria-label="Remove input"
            onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ field: '', value: '' }])}
          >
            <TrashIcon size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="viz-link-btn" onClick={() => onChange([...rows, { field: '', value: '' }])}>
        <PlusIcon size={12} /> Add input
      </button>
    </div>
  );
}

function RowsetEditor({
  columns,
  value,
  onChange,
  addLabel,
}: {
  columns: RowsetColumn[];
  value: Array<Record<string, string>>;
  onChange: (next: Array<Record<string, string>>) => void;
  addLabel?: string;
}) {
  const blank = () =>
    Object.fromEntries(columns.map((c) => [c.name, c.defaultValue ?? ''])) as Record<string, string>;
  const rows = value.length ? value : [blank()];
  const update = (i: number, name: string, next: string) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, [name]: next } : row)));

  const template = columns.map((c) => `minmax(0, ${c.grow ?? 1}fr)`).join(' ');

  return (
    <div className="viz-rowset">
      <div className="viz-rowset-head" style={{ gridTemplateColumns: `${template} 32px` }}>
        {columns.map((c) => (
          <span key={c.name}>{c.label}</span>
        ))}
        <span />
      </div>

      {rows.map((row, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="viz-rowset-row" key={i} style={{ gridTemplateColumns: `${template} 32px` }}>
          {columns.map((col) => {
            const cell = row[col.name] ?? '';
            switch (col.kind) {
              case 'select':
                return (
                  <select
                    key={col.name}
                    className="viz-select"
                    aria-label={`${col.label} ${i + 1}`}
                    value={cell}
                    onChange={(e) => update(i, col.name, e.target.value)}
                  >
                    {(col.options || []).some((o) => o.value === '') ? null : <option value="">—</option>}
                    {withCurrent(col.options || [], cell).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                );
              case 'checkbox': {
                const on = col.trueValue ?? '1';
                const off = col.falseValue ?? '0';
                // The header row already names the column.
                return (
                  <label className="viz-checkbox" key={col.name}>
                    <input
                      type="checkbox"
                      aria-label={`${col.label} ${i + 1}`}
                      checked={cell === on || cell === 'true' || cell === '1'}
                      onChange={(e) => update(i, col.name, e.target.checked ? on : off)}
                    />
                  </label>
                );
              }
              case 'textarea':
                return (
                  <textarea
                    key={col.name}
                    className="viz-textarea"
                    rows={2}
                    aria-label={`${col.label} ${i + 1}`}
                    placeholder={col.placeholder}
                    value={cell}
                    onChange={(e) => update(i, col.name, e.target.value)}
                  />
                );
              default:
                return (
                  <input
                    key={col.name}
                    className="viz-input"
                    aria-label={`${col.label} ${i + 1}`}
                    placeholder={col.placeholder}
                    value={cell}
                    onChange={(e) => update(i, col.name, e.target.value)}
                  />
                );
            }
          })}
          <button
            type="button"
            className="viz-icon-btn"
            title="Remove row"
            aria-label="Remove row"
            onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blank()])}
          >
            <TrashIcon size={13} />
          </button>
        </div>
      ))}

      <button type="button" className="viz-link-btn" onClick={() => onChange([...rows, blank()])}>
        <PlusIcon size={12} /> {addLabel || 'Add row'}
      </button>
    </div>
  );
}

function WorkflowSearchField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    window.clearTimeout(timer.current);
    // Debounced: the endpoint runs a Mongo scan per keystroke otherwise.
    timer.current = window.setTimeout(() => {
      setBusy(true);
      searchWorkflows(term)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 280);
    return () => window.clearTimeout(timer.current);
  }, [term]);

  const listId = `${id}-list`;

  return (
    <div className="viz-combo">
      <input
        id={id}
        className="viz-input"
        list={listId}
        placeholder="Search workflows by name…"
        value={term || value}
        onChange={(e) => {
          setTerm(e.target.value);
          // Selecting from the datalist yields the id directly.
          const hit = results.find((r) => r.value === e.target.value || r.label === e.target.value);
          if (hit) {
            onChange(hit.value);
            setTerm(hit.label);
          }
        }}
      />
      <datalist id={listId}>
        {results.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </datalist>
      {busy ? <Spinner /> : null}
      {value ? <p className="viz-field-help">Selected: {value}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field dispatcher                                                           */
/* -------------------------------------------------------------------------- */

export interface FieldRendererProps {
  field: Field;
  values: Values;
  onChange: (name: string, value: unknown) => void;
  /** Columns of the currently selected spreadsheet, for autocomplete. */
  columns: string[];
}

export default function FieldRenderer({ field, values, onChange, columns }: FieldRendererProps) {
  const id = useId();
  const value = values[field.name];
  const set = (next: unknown) => onChange(field.name, next);

  switch (field.kind) {
    case 'note':
      return (
        <div className="viz-field is-full">
          <p className="viz-field-note">{field.text}</p>
        </div>
      );

    case 'textarea':
      return (
        <Row id={id} label={field.label} help={field.help} required={field.required} full>
          <textarea
            id={id}
            className={`viz-textarea${field.monospace ? ' is-mono' : ''}`}
            rows={field.rows || 4}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            onChange={(e) => set(e.target.value)}
          />
        </Row>
      );

    case 'checkbox':
      return (
        <Row id={id} label={field.label} help={field.help} full={field.full}>
          <label className="viz-checkbox">
            <input id={id} type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
            <span>{field.checkboxLabel || 'Enabled'}</span>
          </label>
        </Row>
      );

    case 'radio':
      return (
        <Row id={id} label={field.label} help={field.help} full={field.full}>
          <div className="viz-radio-group" role="radiogroup" aria-label={field.label}>
            {field.options.map((o) => (
              <label className="viz-radio" key={o.value}>
                <input
                  type="radio"
                  name={`${id}-${field.name}`}
                  value={o.value}
                  checked={String(value ?? '') === o.value}
                  onChange={() => set(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </Row>
      );

    case 'select': {
      const current = String(value ?? '');
      if (field.allowCustom) {
        const listId = `${id}-opts`;
        return (
          <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full}>
            <input
              id={id}
              className="viz-input"
              list={listId}
              placeholder={field.placeholder}
              value={current}
              onChange={(e) => set(e.target.value)}
            />
            <datalist id={listId}>
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </datalist>
          </Row>
        );
      }
      return (
        <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full}>
          <select id={id} className="viz-select" value={current} onChange={(e) => set(e.target.value)}>
            <option value="">— Select —</option>
            {withCurrent(field.options, current).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Row>
      );
    }

    case 'app':
      return <AppField id={id} field={field} value={String(value ?? '')} onChange={set} />;

    case 'spreadsheet':
      return (
        <RemoteSelect
          id={id}
          field={field}
          value={String(value ?? '')}
          onChange={set}
          parent={String(values[field.dependsOn] ?? '')}
          load={fetchSpreadsheets}
          emptyHint="Choose an app first."
        />
      );

    case 'document':
      return (
        <RemoteSelect
          id={id}
          field={field}
          value={String(value ?? '')}
          onChange={set}
          parent={String(values[field.dependsOn] ?? '')}
          load={fetchDocuments}
          emptyHint="Choose an app first."
        />
      );

    case 'workflowSearch':
      return (
        <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full}>
          <WorkflowSearchField id={id} value={String(value ?? '')} onChange={set} />
        </Row>
      );

    case 'variables':
      return (
        <Row id={id} label={field.label} help={field.help} full>
          <VariablesEditor value={(value as VariablePair[]) || []} onChange={set} />
        </Row>
      );

    case 'filters':
      return (
        <Row id={id} label={field.label} help={field.help} full>
          <FiltersEditor
            value={(value as FilterRow[]) || []}
            onChange={set}
            columns={columns}
            listId={`${id}-cols`}
          />
        </Row>
      );

    case 'sort':
      return (
        <Row id={id} label={field.label} help={field.help} full>
          <SortEditor value={(value as SortRow[]) || []} onChange={set} columns={columns} listId={`${id}-cols`} />
        </Row>
      );

    case 'params':
      return (
        <Row id={id} label={field.label} help={field.help} full>
          <ParamsEditor value={(value as ParamRow[]) || []} onChange={set} />
        </Row>
      );

    case 'rowset':
      return (
        <Row id={id} label={field.label} help={field.help} full>
          <RowsetEditor
            columns={field.columns}
            value={(value as Array<Record<string, string>>) || []}
            onChange={set}
            addLabel={field.addLabel}
          />
        </Row>
      );

    default: {
      const type = field.kind === 'number' ? 'number' : field.kind === 'email' ? 'email' : 'text';
      return (
        <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full}>
          {type === 'text' ? (
            <AutocompleteInput
              id={id}
              type={type}
              className={`viz-input${field.monospace ? ' is-mono' : ''}`}
              placeholder={field.placeholder}
              value={String(value ?? '')}
              onValueChange={set}
            />
          ) : (
            <input
              id={id}
              type={type}
              className={`viz-input${field.monospace ? ' is-mono' : ''}`}
              placeholder={field.placeholder}
              value={String(value ?? '')}
              onChange={(e) => set(e.target.value)}
            />
          )}
        </Row>
      );
    }
  }
}

function AppField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Field;
  value: string;
  onChange: (next: string) => void;
}) {
  const { options: apps, busy, error } = useAsyncOptions(
    async () => (await fetchApps()).map((a) => ({ value: a.lid, label: a.name })),
    [],
  );

  return (
    <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full}>
      <select
        id={id}
        className="viz-select"
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{busy ? 'Loading apps…' : '— Select —'}</option>
        {withCurrent(apps, value).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <InlineError>{error}</InlineError> : null}
    </Row>
  );
}

function RemoteSelect({
  id,
  field,
  value,
  onChange,
  parent,
  load,
  emptyHint,
}: {
  id: string;
  field: Field;
  value: string;
  onChange: (next: string) => void;
  parent: string;
  load: (parent: string) => Promise<Option[]>;
  emptyHint: string;
}) {
  const { options: list, busy, error } = useAsyncOptions(() => load(parent), [parent]);

  return (
    <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full}>
      <select
        id={id}
        className="viz-select"
        value={value}
        disabled={busy || !parent}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{!parent ? emptyHint : busy ? 'Loading…' : '— Select —'}</option>
        {withCurrent(list, value).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <InlineError>{error}</InlineError> : null}
    </Row>
  );
}

/** Column list for whichever spreadsheet the dialog currently points at. */
export function useSpreadsheetColumns(dirPath: string): string[] {
  const [columns, setColumns] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!dirPath) {
      setColumns([]);
      return undefined;
    }
    fetchSpreadsheetColumns(dirPath)
      .then((list) => {
        if (!cancelled) setColumns(list);
      })
      // Column autocomplete is a convenience; a failure must not block the form.
      .catch(() => {
        if (!cancelled) setColumns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dirPath]);

  return useMemo(() => columns, [columns]);
}
