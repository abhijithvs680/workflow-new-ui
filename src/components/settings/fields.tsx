import { useEffect, useId, useMemo, useState } from 'react';
import {
  fetchApps,
  fetchDocuments,
  fetchSpreadsheetColumns,
  fetchSpreadsheets,
  type Option,
} from '@/api/lookups';
import { errorText } from '@/api/http';
import { PlusIcon, TrashIcon } from '../ui/icons';
import { InlineError, Spinner } from '../ui/feedback';
import { AutocompleteInput } from '../ui/AutocompleteInput';
import Select from '../ui/Select';
import WorkflowPicker from '../ui/WorkflowPicker';
import SkillsEditor, { SecretInput } from './SkillsEditor';
import SqlQueryEditor from './SqlQueryEditor';
import {
  FILTER_OPERATORS,
  type Field,
  type FilterRow,
  type ParamRow,
  type RowsetColumn,
  type SkillsValue,
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
  half,
  labelExtra,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
  full?: boolean;
  half?: boolean;
  /** Rendered under the label, as the classic "Click to Generate" link is. */
  labelExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`viz-field${full ? ' is-full' : ''}${half ? ' is-half' : ''}`}>
      <label className="viz-field-label" htmlFor={id}>
        {label}
        {required ? <abbr title="Required">*</abbr> : null}
        {labelExtra}
      </label>
      <div className="viz-field-control">
        {children}
        {help ? <p className="viz-field-help">{help}</p> : null}
      </div>
    </div>
  );
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

      {/*
        `ssMultiFilter.tpl` labels each row inline —
        "Filter Column : [key] [op] Filter Value : [value]" — and puts a single
        right-aligned Add button underneath, so the rows read the same here.
      */}
      {rows.map((row, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="viz-filter-row" key={i}>
          <span className="viz-filter-label">Filter Column :</span>
          <input
            className="viz-input"
            list={listId}
            aria-label={`Filter ${i + 1} column`}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <Select
            className="viz-filter-op"
            aria-label={`Filter ${i + 1} operator`}
            value={row.operator || '='}
            options={FILTER_OPERATORS}
            placeholder="="
            onChange={(op) => update(i, { operator: op })}
          />
          <span className="viz-filter-label">Filter Value :</span>
          <input
            className="viz-input"
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

      <div className="viz-filter-actions">
        <button
          type="button"
          className="viz-btn is-outline is-sm"
          onClick={() => onChange([...rows, { key: '', operator: '=', value: '' }])}
        >
          Add
        </button>
      </div>
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

      {/*
        The template shows the accumulated chips first (its "Sort Order" row),
        then the "Sort Column" input with ASC/DESC radios and an Add button.
      */}
      <div className="viz-chips">
        {value.length === 0 ? <span className="viz-chips-empty">No sorting added</span> : null}
        {value.map((row) => (
          <span className="viz-chip" key={row.sort_column}>
            {row.sort_column}-{row.sort_order}
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

      <div className="viz-sort-row">
        <span className="viz-filter-label">Sort Column :</span>
        <input
          className="viz-input"
          list={listId}
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
        <span className="viz-radio-inline" role="radiogroup" aria-label="Sort direction">
          <label className="viz-radio">
            <input
              type="radio"
              name={`${listId}-order`}
              checked={order === 'asc'}
              onChange={() => setOrder('asc')}
            />
            <span>ASC</span>
          </label>
          <label className="viz-radio">
            <input
              type="radio"
              name={`${listId}-order`}
              checked={order === 'desc'}
              onChange={() => setOrder('desc')}
            />
            <span>DESC</span>
          </label>
        </span>
        <button type="button" className="viz-btn is-outline is-sm" onClick={add}>
          Add
        </button>
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
                  <Select
                    key={col.name}
                    aria-label={`${col.label} ${i + 1}`}
                    value={cell}
                    options={(col.options || []).filter((o) => o.value !== '')}
                    placeholder={(col.options || []).find((o) => o.value === '')?.label ?? '—'}
                    onChange={(next) => update(i, col.name, next)}
                  />
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

/**
 * Multi-select over an app's spreadsheets, storing their short codes.
 *
 * The Agent Node keys its data access off short codes rather than sheet ids,
 * because that is what the MCP mirror tables are named after.
 */
function SpreadsheetCodesEditor({
  appId,
  value,
  onChange,
}: {
  appId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { options: sheets, busy, error } = useAsyncOptions(() => fetchSpreadsheets(appId), [appId]);

  const withCodes = useMemo(() => sheets.filter((s) => s.shortCode), [sheets]);
  const labels = useMemo(
    () => new Map(withCodes.map((s) => [s.shortCode as string, s.label])),
    [withCodes],
  );

  const toggle = (code: string, on: boolean) =>
    onChange(on ? [...value.filter((c) => c !== code), code] : value.filter((c) => c !== code));

  return (
    <div className="viz-ss-codes">
      <div className="viz-chips">
        {value.length === 0 ? <span className="viz-chips-empty">No spreadsheets selected</span> : null}
        {value.map((code) => (
          <span className="viz-chip" key={code}>
            {labels.get(code) || code}
            <button type="button" aria-label={`Remove ${code}`} onClick={() => toggle(code, false)}>
              ×
            </button>
          </span>
        ))}
      </div>

      {!appId ? (
        <p className="viz-field-help">Choose an app first.</p>
      ) : busy ? (
        <Spinner label="Loading spreadsheets…" />
      ) : (
        <div className="viz-ss-list">
          {withCodes.length === 0 ? (
            <p className="viz-field-help">This app has no spreadsheets.</p>
          ) : (
            withCodes.map((sheet) => {
              const code = sheet.shortCode as string;
              return (
                <label className="viz-checkbox" key={sheet.value}>
                  <input
                    type="checkbox"
                    checked={value.includes(code)}
                    onChange={(e) => toggle(code, e.target.checked)}
                  />
                  <span>
                    {sheet.label} <em className="viz-ss-code">{code}</em>
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}

      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}

/** Textarea for a JSON property, reporting a parse error as you leave the box. */
function JsonEditor({
  id,
  value,
  rows,
  placeholder,
  expect,
  onChange,
}: {
  id: string;
  value: string;
  rows: number;
  placeholder?: string;
  expect?: 'array' | 'object';
  onChange: (next: string) => void;
}) {
  const [error, setError] = useState('');

  const validate = (raw: string) => {
    const text = raw.trim();
    if (!text) {
      setError('');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    if (expect === 'array' && !Array.isArray(parsed)) {
      setError('This must be a JSON array.');
      return;
    }
    if (expect === 'object' && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
      setError('This must be a JSON object.');
      return;
    }
    setError('');
  };

  return (
    <>
      <textarea
        id={id}
        className="viz-textarea is-mono"
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (error) setError('');
        }}
        onBlur={(e) => validate(e.target.value)}
      />
      {error ? <InlineError>{error}</InlineError> : null}
    </>
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
  /**
   * The form's `fieldset[disabled]` covers every control it contains, but a
   * field that opens a portalled dialog renders outside it — so those have to
   * be told directly.
   */
  readOnly?: boolean;
}

export default function FieldRenderer({ field, values, onChange, columns, readOnly }: FieldRendererProps) {
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
        <Row
          id={id}
          label={field.label}
          help={field.help}
          required={field.required}
          full
          labelExtra={
            field.generate === 'columnAlias' ? (
              <button
                type="button"
                className="viz-generate-link"
                disabled={!columns.length}
                title={
                  columns.length
                    ? 'Fill with "column as column" for every column'
                    : 'Choose a spreadsheet first'
                }
                onClick={() => set(columns.map((c) => `${c} as ${c}`).join(','))}
              >
                Click to Generate
              </button>
            ) : null
          }
        >
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
        <Row id={id} label={field.label} help={field.help} full={field.full} half={field.half}>
          <label className="viz-checkbox">
            <input id={id} type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
            <span>{field.checkboxLabel || 'Enabled'}</span>
          </label>
        </Row>
      );

    case 'radio':
      return (
        <Row id={id} label={field.label} help={field.help} full={field.full} half={field.half}>
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
          <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full} half={field.half}>
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
        <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full} half={field.half}>
          <Select id={id} value={current} options={field.options} onChange={set} />
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
        <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full} half={field.half}>
          <WorkflowPicker id={id} value={String(value ?? '')} onChange={(shortCode) => set(shortCode)} />
        </Row>
      );

    case 'sql':
      return (
        <Row id={id} label={field.label} help={field.help} required={field.required} full>
          <SqlQueryEditor
            id={id}
            value={String(value ?? '')}
            appId={String(values[field.dependsOn] ?? '')}
            rows={field.rows}
            placeholder={field.placeholder}
            onChange={set}
          />
        </Row>
      );

    case 'spreadsheetCodes':
      return (
        <Row id={id} label={field.label} help={field.help} required={field.required} full>
          <SpreadsheetCodesEditor
            appId={String(values[field.dependsOn] ?? '')}
            value={(value as string[]) || []}
            onChange={set}
          />
        </Row>
      );

    case 'skills':
      return (
        <Row id={id} label={field.label} help={field.help} full>
          <SkillsEditor
            value={(value as SkillsValue) || { selected: [], configs: {} }}
            onChange={set}
            readOnly={readOnly}
          />
        </Row>
      );

    case 'json':
      return (
        <Row id={id} label={field.label} help={field.help} required={field.required} full>
          <JsonEditor
            id={id}
            value={String(value ?? '')}
            rows={field.rows || 5}
            placeholder={field.placeholder}
            expect={field.expect}
            onChange={set}
          />
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
      // A credential is masked behind a reveal toggle rather than autocompleted:
      // there is nothing useful to suggest, and shoulder-surfing a pasted key is
      // the more likely problem.
      if (field.kind === 'text' && field.secret) {
        return (
          <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full} half={field.half}>
            <SecretInput id={id} secret placeholder={field.placeholder} value={String(value ?? '')} onChange={set} />
          </Row>
        );
      }
      return (
        <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full} half={field.half}>
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
    <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full} half={field.half}>
      <Select
        id={id}
        value={value}
        options={apps}
        disabled={busy}
        placeholder={busy ? 'Loading apps…' : '— Select —'}
        onChange={onChange}
      />
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
    <Row id={id} label={field.label} help={field.help} required={field.required} full={field.full} half={field.half}>
      <Select
        id={id}
        value={value}
        options={list}
        disabled={busy || !parent}
        placeholder={!parent ? emptyHint : busy ? 'Loading…' : '— Select —'}
        onChange={onChange}
      />
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
