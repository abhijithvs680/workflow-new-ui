/**
 * Field mapping carried on a connection — the React port of the classic
 * Connection Mapping tab.
 *
 * Two shapes exist server-side, chosen by `connection_action` in
 * `connection.tpl`:
 *
 *   READ      `connection/executeaction.tpl` — free rows, Source ⇄ Target. The
 *             Target side is a `<select>` over the target block's
 *             `output_fields`, and falls back to a free text box when the
 *             target picks its sheet by shortcode (`dynamic_flag == "true"`)
 *             or exposes no fields.
 *   SENDMAIL  `connection/sendmail.tpl` — a fixed row per mail field. The
 *             destination names are not editable and rows cannot be added or
 *             removed; only the source expression is.
 *
 * Both post parallel `mapleft[]` / `mapright[]` arrays through
 * `connectionPropInsert`, which stores them on the *target* block as
 * `properties['field-mapping'] = [{keyvalue, insertcolumn}, …]`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormValue } from '@/api/http';
import { PlusIcon, TrashIcon } from '../ui/icons';
import { workflowApi, type ConnectionMappingDetails } from '@/api/workflow';
import { AutocompleteInput } from '../ui/AutocompleteInput';
import Select from '../ui/Select';
import { Spinner } from '../ui/feedback';

export interface MappingRow {
  /** Source value or `{placeholder}` — posted as `mapleft[]`. */
  left: string;
  /** Destination field name — posted as `mapright[]`. */
  right: string;
}

/**
 * The rows `connection/sendmail.tpl` renders for a brand-new Send Mail
 * connection, in its order. `insertcolumn` is fixed; only the left side is
 * editable.
 */
const SENDMAIL_FIELDS: Array<{ name: string; label: string; kind?: 'textarea' | 'email' }> = [
  { name: 'mail_from', label: 'Mail From', kind: 'email' },
  { name: 'from_name', label: 'From Name' },
  { name: 'alias_email', label: 'Alias Email' },
  { name: 'alias_name', label: 'Alias Name' },
  { name: 'mail_to', label: 'Mail To' },
  { name: 'mail_subject', label: 'Mail Subject' },
  { name: 'mail_bcc', label: 'Mail Bcc' },
  { name: 'mail_cc', label: 'Mail Cc' },
  { name: 'attachment_file', label: 'File Attachment' },
  { name: 'mail_content', label: 'Mail Content', kind: 'textarea' },
];

/**
 * Read a stored mapping out of a `properties` bag.
 *
 * **This must be the *target block's* `properties`, not the connection's.**
 * `connectionPropInsert` writes `field-mapping` to both, but `Save.php` copies
 * only `id`/`source`/`target`/`target_yes`/`target_no` into each Mongo
 * connection — `properties` is dropped, and the branch that would have moved it
 * under the target block is commented out. Block `properties` *are* persisted,
 * so the block is the only copy that survives a save/reload.
 */
export function mappingFromProperties(properties?: Record<string, unknown>): MappingRow[] {
  return normaliseMapping(properties?.['field-mapping']);
}

function normaliseMapping(list: unknown): MappingRow[] {
  if (!Array.isArray(list)) return [{ left: '', right: '' }];
  const rows = list
    .map((entry) => {
      const row = (entry || {}) as Record<string, unknown>;
      return { left: String(row.keyvalue ?? ''), right: String(row.insertcolumn ?? '') };
    })
    .filter((r) => r.left || r.right);
  return rows.length ? rows : [{ left: '', right: '' }];
}

/** True when nothing has been entered yet, so seeding cannot lose an edit. */
function isPristine(rows: MappingRow[]): boolean {
  return rows.every((r) => !r.left.trim() && !r.right.trim());
}

export function mappingToPayload(rows: MappingRow[]): Record<string, FormValue> {
  const used = rows.filter((r) => r.left.trim() !== '' || r.right.trim() !== '');
  return {
    mapleft: used.map((r) => r.left),
    mapright: used.map((r) => r.right),
  };
}

/**
 * Send Mail always posts the full fixed row set, so a field cleared in the
 * dialog is actually cleared on the connection.
 */
export function sendmailMappingToPayload(rows: MappingRow[]): Record<string, FormValue> {
  const byName = new Map(rows.map((r) => [r.right, r.left]));
  return {
    mapleft: SENDMAIL_FIELDS.map((f) => byName.get(f.name) ?? ''),
    mapright: SENDMAIL_FIELDS.map((f) => f.name),
  };
}

export function isSendmailMapping(details: ConnectionMappingDetails | null): boolean {
  return details?.connectionAction === 'SENDMAIL' || details?.targetType === 'sendmail';
}

export default function ConnectionMappingEditor({
  rows,
  onChange,
  readOnly,
  workflowId,
  sourceId,
  targetId,
  onDetails,
}: {
  rows: MappingRow[];
  onChange: (next: MappingRow[]) => void;
  readOnly: boolean;
  workflowId: string;
  sourceId: string;
  targetId: string;
  /** Lets the dialog learn the connection action so it saves the right shape. */
  onDetails?: (details: ConnectionMappingDetails) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<ConnectionMappingDetails | null>(null);
  // Latest rows, so seeding can check for edits without re-running the fetch.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    workflowApi
      .fetchConnectionMappingDetails(workflowId, sourceId, targetId)
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
        onDetails?.(data);

        // The server read is the authoritative copy of the mapping — it comes
        // from the target block, and from the live session when there is one.
        // Only seed a form the user has not touched.
        const stored = normaliseMapping(data.fieldMapping);
        if (!isPristine(stored) && isPristine(rowsRef.current)) onChange(stored);
      })
      // Field discovery is a convenience: without it every side is free text,
      // which is still a usable — and saveable — form.
      .catch(() => {
        if (!cancelled) setDetails(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `onDetails` / `onChange` are fresh closures on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, sourceId, targetId]);

  const targetFields = details?.targetBlockInfo?.output_fields || [];
  const sendmail = isSendmailMapping(details);

  /**
   * `executeaction.tpl` only offers the Target dropdown when the block exposes
   * fields *and* is not resolving its sheet at runtime.
   */
  const targetIsFreeText = details?.dynamicFlag === 'true' || targetFields.length === 0;

  const sendmailRows = useMemo(() => {
    const byName = new Map(rows.map((r) => [r.right, r.left]));
    return SENDMAIL_FIELDS.map((f) => ({ ...f, left: byName.get(f.name) ?? '' }));
  }, [rows]);

  if (loading) {
    return (
      <fieldset className="viz-form" disabled>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Spinner />
          <span className="viz-field-note" style={{ margin: 0 }}>
            Loading available fields…
          </span>
        </div>
      </fieldset>
    );
  }

  /* ---- SENDMAIL: fixed rows, destination is not editable ---- */

  if (sendmail) {
    const setLeft = (name: string, left: string) => {
      const next = SENDMAIL_FIELDS.map((f) => ({
        right: f.name,
        left: f.name === name ? left : (rows.find((r) => r.right === f.name)?.left ?? ''),
      }));
      onChange(next);
    };

    return (
      <fieldset className="viz-form" disabled={readOnly}>
        <div className="viz-map">
          {sendmailRows.map((f) => (
            <div className="viz-map-fixed-row" key={f.name}>
              <span className="viz-map-fixed-label">{f.label}</span>
              {f.kind === 'textarea' ? (
                <textarea
                  className="viz-textarea"
                  rows={4}
                  aria-label={f.label}
                  value={f.left}
                  onChange={(e) => setLeft(f.name, e.target.value)}
                />
              ) : f.kind === 'email' && (details?.allowedEmails?.length ?? 0) > 0 ? (
                <Select
                  aria-label={f.label}
                  value={f.left}
                  options={(details?.allowedEmails || []).map((mail) => ({ value: mail, label: mail }))}
                  onChange={(next) => setLeft(f.name, next)}
                />
              ) : (
                <AutocompleteInput
                  className="viz-input"
                  aria-label={f.label}
                  value={f.left}
                  onValueChange={(next) => setLeft(f.name, next)}
                />
              )}
            </div>
          ))}
        </div>
      </fieldset>
    );
  }

  /* ---- READ: free rows, Source ⇄ Target ---- */

  const list = rows.length ? rows : [{ left: '', right: '' }];
  const update = (i: number, patch: Partial<MappingRow>) =>
    onChange(list.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <fieldset className="viz-form" disabled={readOnly}>
      <div className="viz-map">
        <div className="viz-map-head">
          <span>Source</span>
          <span />
          <span>Target</span>
          <span />
        </div>

        {list.map((row, i) => (
          // Rows are positional; there is no stable key on the wire either.
          // eslint-disable-next-line react/no-array-index-key
          <div className="viz-map-row" key={i}>
            <AutocompleteInput
              className="viz-input"
              placeholder="{Block.field} or a literal"
              aria-label={`Mapping ${i + 1} source`}
              value={row.left}
              onValueChange={(next) => update(i, { left: next })}
            />
            <span className="viz-map-sep" aria-hidden="true">
              →
            </span>
            {targetIsFreeText ? (
              <input
                className="viz-input"
                autoComplete="off"
                placeholder="target field"
                aria-label={`Mapping ${i + 1} target`}
                value={row.right}
                onChange={(e) => update(i, { right: e.target.value })}
              />
            ) : (
              <Select
                aria-label={`Mapping ${i + 1} target`}
                value={row.right}
                options={targetFields.map((f) => ({ value: f, label: f }))}
                placeholder="- select -"
                onChange={(next) => update(i, { right: next })}
              />
            )}
            <button
              type="button"
              className="viz-icon-btn"
              title="Remove mapping"
              aria-label="Remove mapping"
              onClick={() =>
                onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [{ left: '', right: '' }])
              }
            >
              <TrashIcon size={13} />
            </button>
          </div>
        ))}

        <button
          type="button"
          className="viz-link-btn"
          onClick={() => onChange([...list, { left: '', right: '' }])}
        >
          <PlusIcon size={12} /> Add mapping
        </button>
      </div>
    </fieldset>
  );
}
