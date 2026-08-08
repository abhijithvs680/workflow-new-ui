import { useEffect, useRef, useState } from 'react';
import { searchWorkflows, type Option } from '@/api/lookups';
import { Spinner } from './feedback';

export interface WorkflowPickerProps {
  id?: string;
  /** Stored short code. */
  value: string;
  /** Name to show for the stored short code before the user searches again. */
  label?: string;
  placeholder?: string;
  onChange: (shortCode: string, label: string) => void;
}

/**
 * Type-ahead over `/workflow.search`, storing the workflow's short code.
 *
 * The endpoint runs a Mongo scan per call, so keystrokes are debounced rather
 * than searched live.
 */
export default function WorkflowPicker({
  id,
  value,
  label,
  placeholder = 'Search workflows by name…',
  onChange,
}: WorkflowPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setBusy(true);
      searchWorkflows(term)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 280);
    return () => window.clearTimeout(timer.current);
  }, [term]);

  const listId = `${id || 'wf'}-list`;
  // Before the user types, show whichever name we know for the stored code.
  const shown = term || label || value;

  return (
    <div className="viz-combo">
      <input
        id={id}
        className="viz-input"
        list={listId}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          const next = e.target.value;
          setTerm(next);
          // Picking from the datalist yields the short code directly.
          const hit = results.find((r) => r.value === next || r.label === next);
          if (hit) {
            onChange(hit.value, hit.label);
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
    </div>
  );
}
