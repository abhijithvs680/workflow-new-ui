import { useState } from 'react';
import Modal from './ui/Modal';
import { PlusIcon, TrashIcon } from './ui/icons';

interface Row {
  key: string;
  value: string;
}

/**
 * Input parameters for a test run. These become the entry block's `output`,
 * which is what downstream `{placeholders}` resolve against.
 */
export default function RunDialog({
  onRun,
  onCancel,
  busy,
}: {
  onRun: (params: Record<string, string>) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([{ key: '', value: '' }]);

  const update = (index: number, field: keyof Row, value: string) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    rows.forEach(({ key, value }) => {
      const name = key.trim();
      if (name) params[name] = value;
    });
    onRun(params);
  };

  return (
    <Modal
      title="Run this workflow"
      subtitle="Add any input parameters the workflow expects. Leave empty to run without input."
      size="sm"
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <button type="button" className="viz-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form="viz-run-form" className="viz-btn is-primary" disabled={busy}>
            {busy ? 'Running…' : 'Run'}
          </button>
        </>
      }
    >
      <form id="viz-run-form" onSubmit={submit} className="viz-form">
        <div className="viz-kv-grid">
          {rows.map((row, i) => (
            // Rows are positional and freely reorderable only by add/remove.
            // eslint-disable-next-line react/no-array-index-key
            <div className="viz-kv-row" key={i}>
              <input
                type="text"
                className="viz-input"
                placeholder="name"
                aria-label={`Parameter ${i + 1} name`}
                value={row.key}
                onChange={(e) => update(i, 'key', e.target.value)}
              />
              <input
                type="text"
                className="viz-input"
                placeholder="value"
                aria-label={`Parameter ${i + 1} value`}
                value={row.value}
                onChange={(e) => update(i, 'value', e.target.value)}
              />
              <button
                type="button"
                className="viz-icon-btn"
                title="Remove parameter"
                aria-label="Remove parameter"
                onClick={() => setRows((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : list))}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="viz-link-btn"
          onClick={() => setRows((list) => [...list, { key: '', value: '' }])}
        >
          <PlusIcon size={12} /> Add parameter
        </button>
      </form>
    </Modal>
  );
}
