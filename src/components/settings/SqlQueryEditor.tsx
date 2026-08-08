/**
 * Relational Filter → SQL Query.
 *
 * Two things the plain textarea cannot do on its own, both carried over from
 * `relationalFilterBlock.tpl`:
 *
 *  - typing `{!` offers the spreadsheets of the selected app, and inserts
 *    `{!SHORT_CODE!}` — which `RelationalFilterBlock` rewrites to the `ss_*`
 *    mirror table before the query runs;
 *  - a one-click copy of the query-writing rules, for pasting into whatever is
 *    drafting the SQL.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchSpreadsheets, type Option } from '@/api/lookups';
import { CopyIcon } from '../ui/icons';

/**
 * Kept in step with `SqlReadGuard::check()` — every rule below is one the
 * server actually enforces, so a query that follows them will run.
 */
const QUERY_INSTRUCTIONS = [
  'RELATIONAL FILTER — QUERY-WRITING INSTRUCTIONS',
  '',
  '1. Write exactly one read-only PostgreSQL statement. It must start with SELECT (or WITH … SELECT). No trailing semicolon.',
  '2. Reference every spreadsheet as {!SHORT_CODE!}, using its short code rather than its display name or a raw ss_* table name. Type {! to autocomplete. The block rewrites {!CODE!} to ss_CODE.',
  '3. Insert workflow data with {variable}, {BlockLabel.field}, or system values such as {viz-uuid} and {viz-timestamp}. Substitution is raw SQL: quote text, date, timestamp and UUID placeholders; leave numeric and boolean placeholders unquoted.',
  '4. Double-quote column names containing spaces, mixed case, or reserved words. Mirror tables also carry _row_id (spreadsheet row identity) and _synced_at (sync metadata).',
  '5. WHERE, JOIN, subqueries, CTEs, DISTINCT, aggregates, GROUP BY, HAVING, ORDER BY and PostgreSQL functions are all available. Results are capped at 500 rows; add LIMIT for fewer.',
  "6. Do not use brace array literals like '{a,b}' — braces are read as placeholders. Use ARRAY['a', 'b'].",
  '7. Writes and DDL are refused: no INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, EXECUTE or COMMENT ON, no multiple statements, and no SQL comments.',
  '',
  'EXAMPLES',
  "SELECT: SELECT p.* FROM {!PRODUCTS!} p WHERE p.status = '{status}' AND p.stock < {minimum_stock} ORDER BY p.stock LIMIT 100",
  'JOIN/AGGREGATE: SELECT v.vendor_name, COUNT(*) AS product_count, SUM(p.stock) AS total_stock FROM {!PRODUCTS!} p JOIN {!VENDORS!} v ON v._row_id = p.vendor_id GROUP BY v.vendor_name HAVING SUM(p.stock) < {threshold}',
].join('\n');

export interface SqlQueryEditorProps {
  id: string;
  value: string;
  /** App id whose spreadsheets back the `{!` autocomplete. */
  appId: string;
  rows?: number;
  placeholder?: string;
  onChange: (next: string) => void;
}

export default function SqlQueryEditor({
  id,
  value,
  appId,
  rows = 12,
  placeholder,
  onChange,
}: SqlQueryEditorProps) {
  const [sheets, setSheets] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [term, setTerm] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState('');

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const copyTimer = useRef<number>();

  useEffect(() => {
    let cancelled = false;
    if (!appId) {
      setSheets([]);
      return undefined;
    }
    setLoading(true);
    fetchSpreadsheets(appId)
      .then((list) => {
        if (!cancelled) setSheets(list);
      })
      // Autocomplete is a convenience; losing it must not block the query box.
      .catch(() => {
        if (!cancelled) setSheets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  /** Spreadsheets whose title or short code contains what follows the `{!`. */
  const matches = useMemo(() => {
    if (term === null) return [];
    const needle = term.toLowerCase();
    return sheets
      .filter((s) => s.shortCode)
      .filter((s) => s.label.toLowerCase().includes(needle) || (s.shortCode || '').toLowerCase().includes(needle))
      .slice(0, 30);
  }, [sheets, term]);

  // Only a new search term restarts the highlight. Arrow keys re-run
  // `syncSuggestions` on key-up without moving the caret, so resetting there
  // would undo the selection the arrow key just made.
  useEffect(() => {
    setActive(0);
  }, [term]);

  /** Re-read the caret and decide whether it sits inside an open `{!`. */
  const syncSuggestions = () => {
    const area = areaRef.current;
    if (!area) return;
    const before = area.value.slice(0, area.selectionStart ?? 0);
    const open = before.match(/\{!([^!}]*)$/);
    setTerm(open ? open[1] : null);
  };

  const insert = (shortCode: string) => {
    const area = areaRef.current;
    if (!area || !shortCode) return;

    const caret = area.selectionStart ?? 0;
    const before = area.value.slice(0, caret);
    const open = before.match(/\{!([^!}]*)$/);
    if (!open) return;

    const start = caret - open[0].length;
    const token = `{!${shortCode}!}`;
    onChange(area.value.slice(0, start) + token + area.value.slice(caret));
    setTerm(null);

    // Put the caret after the inserted reference on the next frame, once React
    // has written the new value back into the textarea.
    window.requestAnimationFrame(() => {
      const at = start + token.length;
      area.focus();
      area.setSelectionRange(at, at);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (term === null || !matches.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insert(matches[active]?.shortCode || '');
    } else if (e.key === 'Escape') {
      setTerm(null);
    }
  };

  const copyInstructions = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(QUERY_INSTRUCTIONS);
      ok = true;
    } catch {
      ok = false;
    }
    setCopied(ok ? 'Ready to paste' : 'Clipboard unavailable');
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(''), 2200);
  };

  return (
    <div className="viz-sql">
      <div className="viz-sql-bar">
        <span className="viz-sql-ops" aria-label="Supported SQL operations">
          <span>SELECT</span>
          <em>read-only</em>
        </span>

        <span className={`viz-sql-status${sheets.length ? ' is-ready' : ''}`}>
          {!appId
            ? 'Select an app for autocomplete'
            : loading
              ? 'Loading spreadsheets…'
              : `${sheets.length} spreadsheet${sheets.length === 1 ? '' : 's'} available`}
        </span>

        <button type="button" className="viz-btn is-outline is-sm" onClick={() => void copyInstructions()}>
          <CopyIcon size={12} /> Copy query instructions
        </button>
        {copied ? (
          <span className="viz-sql-copied" role="status">
            {copied}
          </span>
        ) : null}
      </div>

      <div className="viz-sql-editor">
        <textarea
          id={id}
          ref={areaRef}
          className="viz-textarea is-mono viz-sql-input"
          rows={rows}
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            syncSuggestions();
          }}
          onClick={syncSuggestions}
          onKeyUp={syncSuggestions}
          onKeyDown={onKeyDown}
          onBlur={() => setTerm(null)}
        />

        {term !== null ? (
          <ul className="viz-autocomplete-dropdown viz-sql-suggestions">
            {matches.length ? (
              matches.map((sheet, i) => (
                <li
                  key={sheet.value}
                  className={i === active ? 'is-active' : ''}
                  onMouseEnter={() => setActive(i)}
                  // mousedown, not click: the textarea must not blur first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insert(sheet.shortCode || '');
                  }}
                >
                  <strong>{sheet.label}</strong>
                  <span className="viz-sql-code">{`{!${sheet.shortCode}!}`}</span>
                </li>
              ))
            ) : (
              <li className="is-empty">No matching spreadsheets.</li>
            )}
          </ul>
        ) : null}
      </div>

      <div className="viz-sql-guides">
        <div>
          <code>{'{variable}'}</code>
          <span>Workflow value</span>
        </div>
        <div>
          <code>{'{!short_code!}'}</code>
          <span>Spreadsheet reference</span>
        </div>
        <div className="is-warning">
          <code>Writes &amp; DDL</code>
          <span>Refused</span>
        </div>
      </div>
    </div>
  );
}
