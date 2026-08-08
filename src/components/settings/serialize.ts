/**
 * Convert between stored `block_properties` and the dialog's value map, and
 * back into the exact POST body `customblockPropInsert` expects.
 *
 * The composite kinds are where the legacy forms did their work in inline
 * JavaScript; the shapes below are copied from those handlers:
 *
 *   variables  ->  "name=value;name2=value2"        (setVariableBlock.tpl)
 *   filters    ->  {col: value} + {col: operator}   (ssMultiFilter.tpl)
 *   sort_by    ->  [{sort_column, sort_order}]      (ssMultiFilter.tpl)
 *   params     ->  fields[] + values[]              (customblockpopup save)
 */
import type { FormValue } from '@/api/http';
import type { BlockProperties } from '@/types/workflow';
import type {
  BlockSchema,
  Field,
  FilterRow,
  ParamRow,
  SkillsValue,
  SortRow,
  Values,
  VariablePair,
} from './schema';
import { SKILL_CONFIG_KEYS, type SkillId } from './skills';

function asString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/* -------------------------------------------------------------------------- */
/* Hydrate                                                                    */
/* -------------------------------------------------------------------------- */

function hydrateField(field: Field, props: BlockProperties, defaults: Values): unknown {
  const stored = props[field.name];
  const fallback = defaults[field.name];

  switch (field.kind) {
    case 'checkbox': {
      const truthy = field.trueValue ?? '1';
      if (stored === undefined) return fallback === true || fallback === truthy;
      return (
        stored === true ||
        stored === 1 ||
        asString(stored).toLowerCase() === String(truthy).toLowerCase() ||
        asString(stored).toLowerCase() === 'on' ||
        asString(stored).toLowerCase() === 'true'
      );
    }

    case 'variables': {
      const raw = asString(stored);
      if (!raw) return (fallback as VariablePair[]) ?? [{ key: '', value: '' }];
      const pairs: VariablePair[] = raw
        .split(';')
        .filter((chunk) => chunk !== '')
        .map((chunk) => {
          // Only the first `=` separates; values legitimately contain more.
          const at = chunk.indexOf('=');
          return at === -1
            ? { key: chunk, value: '' }
            : { key: chunk.slice(0, at), value: chunk.slice(at + 1) };
        });
      return pairs.length ? pairs : [{ key: '', value: '' }];
    }

    case 'filters': {
      const filters = asRecord(props.filters);
      const operators = asRecord(props.filter_operators);
      const rows: FilterRow[] = Object.keys(filters).map((key) => ({
        key,
        value: asString(filters[key]),
        operator: asString(operators[key]) || '=',
      }));
      return rows.length ? rows : [{ key: '', operator: '=', value: '' }];
    }

    case 'sort': {
      const raw = props.sort_by;
      const list = Array.isArray(raw) ? raw : [];
      return list
        .map((row) => {
          const r = asRecord(row);
          return {
            sort_column: asString(r.sort_column),
            sort_order: asString(r.sort_order) === 'desc' ? 'desc' : 'asc',
          } as SortRow;
        })
        .filter((r) => r.sort_column);
    }

    case 'params': {
      const stored2 = asRecord(props.reusable_params);
      const rows: ParamRow[] = Object.keys(stored2).map((field2) => ({
        field: field2,
        value: asString(stored2[field2]),
      }));
      return rows;
    }

    case 'rowset': {
      // Stored as `config: [{key, …}, …]` by the PHP handler.
      const raw = props[field.name] ?? props.config;
      const list = Array.isArray(raw) ? raw : [];
      const rows = list.map((row) => {
        const r = asRecord(row);
        const out: Record<string, string> = {};
        field.columns.forEach((col) => {
          out[col.name] = asString(r[col.name]);
        });
        return out;
      });
      return rows.length
        ? rows
        : [Object.fromEntries(field.columns.map((c) => [c.name, c.defaultValue ?? '']))];
    }

    case 'spreadsheetCodes': {
      const raw = asString(stored) || asString(fallback);
      return raw
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean);
    }

    case 'skills': {
      const selected = asString(props.skills)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const configs: Record<string, string> = {};
      (Object.keys(SKILL_CONFIG_KEYS) as SkillId[]).forEach((id) => {
        configs[id] = asString(props[SKILL_CONFIG_KEYS[id]]);
      });
      return { selected, configs } as SkillsValue;
    }

    case 'note':
      return null;

    default: {
      if (stored === undefined || stored === null) return asString(fallback);
      return asString(stored);
    }
  }
}

export function hydrate(schema: BlockSchema, props: BlockProperties): Values {
  const defaults = schema.defaults || {};
  const values: Values = {};
  schema.groups.forEach((group) => {
    group.fields.forEach((field) => {
      values[field.name] = hydrateField(field, props, defaults);
    });
  });
  // Values that live under a different property name than their control.
  Object.assign(values, schema.hydrateExtra?.(props) || {});
  return values;
}

/* -------------------------------------------------------------------------- */
/* Serialize                                                                  */
/* -------------------------------------------------------------------------- */

function serializeField(field: Field, values: Values, out: Record<string, FormValue>): void {
  const value = values[field.name];

  // A leading underscore marks a UI-only control (mode switches and the like)
  // whose real effect is produced by `extraPayload`.
  if (field.name.startsWith('_')) return;

  switch (field.kind) {
    case 'note':
      return;

    case 'checkbox':
      out[field.name] = value ? (field.trueValue ?? '1') : (field.falseValue ?? '0');
      return;

    case 'variables': {
      const pairs = (Array.isArray(value) ? value : []) as VariablePair[];
      out.variables = pairs
        .filter((p) => p.key.trim() !== '')
        .map((p) => `${p.key.trim()}=${p.value}`)
        .join(';');
      return;
    }

    case 'filters': {
      const rows = (Array.isArray(value) ? value : []) as FilterRow[];
      const filters: Record<string, FormValue> = {};
      const operators: Record<string, FormValue> = {};
      rows.forEach((row) => {
        const key = row.key.trim();
        if (!key) return;
        filters[key] = row.value;
        operators[key] = row.operator || '=';
      });
      out.filters = filters;
      out.filter_operators = operators;
      return;
    }

    case 'sort': {
      const rows = (Array.isArray(value) ? value : []) as SortRow[];
      out.sort_by = rows
        .filter((r) => r.sort_column.trim() !== '')
        .map((r) => ({ sort_column: r.sort_column.trim(), sort_order: r.sort_order }));
      return;
    }

    case 'params': {
      const rows = (Array.isArray(value) ? value : []) as ParamRow[];
      const used = rows.filter((r) => r.field.trim() !== '');
      // The PHP zips these two arrays by index into `reusable_params`.
      out.fields = used.map((r) => r.field.trim());
      out.values = used.map((r) => r.value);
      return;
    }

    case 'rowset': {
      const rows = (Array.isArray(value) ? value : []) as Array<Record<string, string>>;
      // The handler iterates `count($p[firstColumn])`, so a row is only usable
      // when its first column is filled in.
      const first = field.columns[0]?.name;
      const used = first ? rows.filter((r) => String(r[first] ?? '').trim() !== '') : rows;
      field.columns.forEach((col) => {
        out[col.name] = used.map((r) => String(r[col.name] ?? ''));
      });
      return;
    }

    case 'spreadsheetCodes': {
      const codes = (Array.isArray(value) ? value : []) as string[];
      out[field.name] = codes.map((code) => code.trim()).filter(Boolean).join(',');
      return;
    }

    case 'skills': {
      const skills = (value || { selected: [], configs: {} }) as SkillsValue;
      out.skills = skills.selected.join(',');
      // Every config property is written on every save, including the empty
      // ones: `customblockPropInsert` replaces `block_properties` wholesale, so
      // a key left out is a key deleted from the workflow.
      (Object.keys(SKILL_CONFIG_KEYS) as SkillId[]).forEach((id) => {
        out[SKILL_CONFIG_KEYS[id]] = skills.configs[id] || '';
      });
      return;
    }

    default:
      out[field.name] = value == null ? '' : String(value);
  }
}

/**
 * Build the POST body.
 *
 * Hidden fields (`workflowId`, `sourceId`, `blockType`, `eventType`) are added
 * by `session.saveBlockProperties`, so they are deliberately absent here.
 */
export function serialize(schema: BlockSchema, values: Values): Record<string, FormValue> {
  const out: Record<string, FormValue> = {};

  schema.groups.forEach((group) => {
    group.fields.forEach((field) => {
      // A hidden conditional row must not overwrite whatever is stored, but the
      // legacy forms did post them, so keep the behaviour identical.
      serializeField(field, values, out);
    });
  });

  Object.assign(out, schema.extraPayload?.(values) || {});
  return out;
}

/** Fields whose values must never be blanked by an empty form control. */
export function isVisible(field: Field, values: Values): boolean {
  return !field.when || field.when(values);
}
