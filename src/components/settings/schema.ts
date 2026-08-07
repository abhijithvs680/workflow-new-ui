/**
 * Declarative description of a block's settings form.
 *
 * The platform stores whatever `customblockPropInsert` receives straight into
 * `block_properties`, only special-casing a handful of block types. So a native
 * form is equivalent to the legacy Smarty one as long as it posts the **same
 * field names**. Every `name` below is copied from the corresponding `.tpl` —
 * treat them as a wire contract, not as free-form identifiers.
 */
import type { FormValue } from '@/api/http';
import type { Option } from '@/api/lookups';

export type Values = Record<string, unknown>;

/** Structured values used by the composite field kinds. */
export interface VariablePair {
  key: string;
  value: string;
}

export interface FilterRow {
  key: string;
  operator: string;
  value: string;
}

export interface SortRow {
  sort_column: string;
  sort_order: 'asc' | 'desc';
}

export interface ParamRow {
  field: string;
  value: string;
}

interface FieldBase {
  /** Platform input name. Also the key in the dialog's value map. */
  name: string;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** Render across the full dialog width instead of the label/control grid. */
  full?: boolean;
  /**
   * Share a row with the next field. Only for the handful of places a classic
   * template puts two controls on one line — `Limit From` / `Limit To` and the
   * two Advanced Settings switches in `ssMultiFilter.tpl`.
   */
  half?: boolean;
  /** Hide the row unless this returns true. */
  when?: (values: Values) => boolean;
}

export type Field =
  | (FieldBase & {
      kind: 'text' | 'textarea' | 'number' | 'email' | 'url';
      rows?: number;
      monospace?: boolean;
      /**
       * Renders the template's "Click to Generate" action under the label.
       * `columnAlias` fills the box with `col as col` for every column of the
       * selected spreadsheet, as `ssMultiFilter.tpl`'s `#ColumnAlias` does.
       */
      generate?: 'columnAlias';
    })
  | (FieldBase & { kind: 'select'; options: Option[]; allowCustom?: boolean })
  | (FieldBase & { kind: 'radio'; options: Option[] })
  | (FieldBase & { kind: 'checkbox'; trueValue?: string; falseValue?: string; checkboxLabel?: string })
  /** App ("livespace") picker — usually `d_master_ssid`. */
  | (FieldBase & { kind: 'app' })
  /** Spreadsheet picker filtered by the app chosen in `dependsOn`. */
  | (FieldBase & { kind: 'spreadsheet'; dependsOn: string })
  /** Any document (spreadsheet, grid, upload) in the chosen app. */
  | (FieldBase & { kind: 'document'; dependsOn: string })
  /** Type-ahead against `/workflow.search`; stores the workflow short code. */
  | (FieldBase & { kind: 'workflowSearch' })
  /** `variable=value` pairs, serialized to the `variables` string. */
  | (FieldBase & { kind: 'variables' })
  /** Spreadsheet filter rows -> `filters` + `filter_operators`. */
  | (FieldBase & { kind: 'filters'; columnsFrom?: string })
  /** Sort chips -> `sort_by`. */
  | (FieldBase & { kind: 'sort'; columnsFrom?: string })
  /** Reusable-workflow inputs -> `fields[]` + `values[]`. */
  | (FieldBase & { kind: 'params' })
  /**
   * Repeating row set posted as parallel arrays (`key[]`, `value[]`, …) and
   * reassembled by the PHP handler into `config[i]`. Used by the Date, Math
   * and String blocks.
   */
  | (FieldBase & { kind: 'rowset'; columns: RowsetColumn[]; addLabel?: string })
  /** Read-only explanatory row. */
  | (FieldBase & { kind: 'note'; text: string });

export interface RowsetColumn {
  /** Posted as `name[]`. */
  name: string;
  label: string;
  kind?: 'text' | 'select' | 'checkbox' | 'textarea';
  options?: Option[];
  placeholder?: string;
  /** Relative column width inside the row grid. */
  grow?: number;
  /** `checkbox` only — what is posted when ticked / cleared. */
  trueValue?: string;
  falseValue?: string;
  /** Value a freshly added row starts with. */
  defaultValue?: string;
}

/**
 * Which layout template `Customblockpopup::$templateArray` pairs the block with.
 * It decides the dialog's tab strip and where Label and Description sit — see
 * `blockComponents/blockSettings.tpl` and `tabbedBlockSettings.tpl`.
 *
 *   `tabbed`    Block Settings · Connection Mapping · Notes.
 *               Block Settings runs Label → fields → Description.
 *   `untabbed`  No tabs at all. Label → Description → divider → fields.
 *   `plain`     No tabs and no Description — the Date, Math and String
 *               processors, whose layouts render Label plus their row set only.
 */
export type BlockLayout = 'tabbed' | 'untabbed' | 'plain';

export interface FieldGroup {
  /** Omit for the default ungrouped section. */
  title?: string;
  description?: string;
  fields: Field[];
}

export interface BlockSchema {
  /** Human name shown in the dialog header; falls back to the block type. */
  title: string;
  /** One-line explanation of what the block does. */
  summary?: string;
  /** Mirrors the layout template the classic dialog pairs this block with. */
  layout: BlockLayout;
  groups: FieldGroup[];
  /** Values applied when a property is absent (i.e. a freshly added block). */
  defaults?: Values;
  /**
   * True for `layout: 'tabbed'`, which is the only layout carrying a
   * Connection Mapping tab. Derived from `layout`; never set by hand.
   */
  connectionMapping?: boolean;
  /**
   * Extra fields appended at save time — the legacy forms add several of these
   * from inline JavaScript rather than from a visible input.
   */
  extraPayload?: (values: Values) => Record<string, FormValue>;
  /**
   * Derive values that are not stored under their own property name (for
   * example a radio whose state lives in `dynamic_flag`).
   */
  hydrateExtra?: (props: Record<string, unknown>) => Values;
}

/* -------------------------------------------------------------------------- */
/* Shared option sets                                                         */
/* -------------------------------------------------------------------------- */

export const YES_NO: Option[] = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

/**
 * Filter operators, copied verbatim from `ssMultiFilter.tpl`. The engine
 * compares these strings exactly — `IN` is not interchangeable with `in`.
 */
export const FILTER_OPERATORS: Option[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: '=i', label: '= (ignore case)' },
  { value: 'IN', label: 'IN' },
  { value: 'NOTIN', label: 'NOT IN' },
  { value: 'IN(i)', label: 'IN (ignore case)' },
  { value: 'NOTIN(i)', label: 'NOT IN (ignore case)' },
  { value: 'btwn', label: 'between' },
  { value: 'like', label: 'like' },
  { value: '!like', label: 'not like' },
  { value: 'regex', label: 'regex' },
];

export const HTTP_METHODS: Option[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({
  value: m,
  label: m,
}));

/* -------------------------------------------------------------------------- */
/* Helpers used by the schema definitions                                     */
/* -------------------------------------------------------------------------- */

export function options(...pairs: Array<[string, string]>): Option[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

/** Convenience for the very common "one text input" row. */
export function text(name: string, label: string, extra: Partial<Field> = {}): Field {
  return { kind: 'text', name, label, ...extra } as Field;
}

export function textarea(name: string, label: string, extra: Partial<Field> = {}): Field {
  return { kind: 'textarea', name, label, rows: 4, full: true, ...extra } as Field;
}

export function select(name: string, label: string, opts: Option[], extra: Partial<Field> = {}): Field {
  return { kind: 'select', name, label, options: opts, ...extra } as Field;
}
