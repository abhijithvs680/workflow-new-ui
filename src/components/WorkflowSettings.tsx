import { useCallback, useEffect, useState } from 'react';
import { errorText } from '@/api/http';
import { settingsApi, workflowApi, type WorkflowVersion } from '@/api/workflow';
import Modal from './ui/Modal';
import { EmptyState, InlineError, Spinner } from './ui/feedback';
import { TrashIcon } from './ui/icons';

const SCHEDULES: Array<[string, string]> = [
  ['0', 'Not scheduled'],
  ['minute', 'Every minute'],
  ['hour', 'Hourly'],
  ['day', 'Daily'],
  ['week', 'Weekly'],
  ['month', 'Monthly'],
];

type Tab = 'runtime' | 'versions';

interface Props {
  workflowId: string;
  shortCode: string;
  onClose: () => void;
  /** Reload the canvas after a version is applied. */
  onVersionApplied: () => void;
  notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

/**
 * Workflow-level settings: execution logging, schedule, and saved versions.
 * These write through the same endpoints as the classic settings drawer.
 */
export default function WorkflowSettings({
  workflowId,
  shortCode,
  onClose,
  onVersionApplied,
  notify,
}: Props) {
  const [tab, setTab] = useState<Tab>('runtime');

  const [enableLog, setEnableLog] = useState(true);
  const [schedule, setSchedule] = useState('0');
  const [hour, setHour] = useState('');
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [runtimeError, setRuntimeError] = useState('');

  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [versionsError, setVersionsError] = useState('');
  const [note, setNote] = useState('');

  const loadVersions = useCallback(async () => {
    if (!shortCode) return;
    setVersionsBusy(true);
    setVersionsError('');
    try {
      setVersions(await settingsApi.versions(shortCode));
    } catch (e) {
      setVersionsError(errorText(e, 'Could not load versions.'));
    } finally {
      setVersionsBusy(false);
    }
  }, [shortCode]);

  useEffect(() => {
    if (tab === 'versions') void loadVersions();
  }, [tab, loadVersions]);

  const saveRuntime = async () => {
    setSavingRuntime(true);
    setRuntimeError('');
    try {
      await workflowApi.saveRuntime(workflowId, enableLog, schedule, hour);
      notify('Workflow settings saved.', 'success');
    } catch (e) {
      setRuntimeError(errorText(e, 'Could not save workflow settings.'));
    } finally {
      setSavingRuntime(false);
    }
  };

  const createVersion = async () => {
    setVersionsBusy(true);
    try {
      await settingsApi.createVersion(shortCode, note);
      setNote('');
      notify('Version saved.', 'success');
      await loadVersions();
    } catch (e) {
      setVersionsError(errorText(e, 'Could not save a version.'));
      setVersionsBusy(false);
    }
  };

  const applyVersion = async (id: string) => {
    if (!window.confirm('Replace the current workflow with this saved version?')) return;
    setVersionsBusy(true);
    try {
      await settingsApi.applyVersion(shortCode, id);
      notify('Version applied.', 'success');
      onVersionApplied();
    } catch (e) {
      setVersionsError(errorText(e, 'Could not apply the version.'));
    } finally {
      setVersionsBusy(false);
    }
  };

  const deleteVersion = async (id: string) => {
    if (!window.confirm('Delete this saved version?')) return;
    setVersionsBusy(true);
    try {
      await settingsApi.deleteVersion(id);
      await loadVersions();
    } catch (e) {
      setVersionsError(errorText(e, 'Could not delete the version.'));
      setVersionsBusy(false);
    }
  };

  return (
    <Modal
      title="Workflow settings"
      subtitle={shortCode ? `Short code ${shortCode}` : undefined}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="viz-btn" onClick={onClose}>
            Close
          </button>
          {tab === 'runtime' ? (
            <button type="button" className="viz-btn is-primary" onClick={() => void saveRuntime()} disabled={savingRuntime}>
              {savingRuntime ? 'Saving…' : 'Save settings'}
            </button>
          ) : null}
        </>
      }
    >
      <div className="viz-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'runtime'}
          className={`viz-tab${tab === 'runtime' ? ' is-active' : ''}`}
          onClick={() => setTab('runtime')}
        >
          Runtime
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'versions'}
          className={`viz-tab${tab === 'versions' ? ' is-active' : ''}`}
          onClick={() => setTab('versions')}
        >
          Versions
        </button>
      </div>

      <div className="viz-tabpanel" role="tabpanel">
        {tab === 'runtime' ? (
          <div className="viz-form">
            {runtimeError ? <InlineError>{runtimeError}</InlineError> : null}

            <div className="viz-field-grid">
              <div className="viz-field">
                <span className="viz-field-label">Execution log</span>
                <div className="viz-field-control">
                  <label className="viz-checkbox">
                    <input type="checkbox" checked={enableLog} onChange={(e) => setEnableLog(e.target.checked)} />
                    <span>Record a log for every run</span>
                  </label>
                  <p className="viz-field-help">
                    Runs cannot be inspected in the debug dock while logging is off.
                  </p>
                </div>
              </div>

              <div className="viz-field">
                <label className="viz-field-label" htmlFor="viz-schedule">
                  Schedule
                </label>
                <div className="viz-field-control">
                  <select
                    id="viz-schedule"
                    className="viz-select"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                  >
                    {SCHEDULES.map(([value, labelText]) => (
                      <option key={value} value={value}>
                        {labelText}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {schedule === 'day' ? (
                <div className="viz-field">
                  <label className="viz-field-label" htmlFor="viz-hour">
                    Hour
                  </label>
                  <div className="viz-field-control">
                    <input
                      id="viz-hour"
                      className="viz-input"
                      type="number"
                      min={0}
                      max={23}
                      value={hour}
                      onChange={(e) => setHour(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <p className="viz-field-note">
              Category, connected app and reusable-input settings are not duplicated here — open them from the
              classic settings drawer, which remains available.
            </p>
          </div>
        ) : (
          <div className="viz-form">
            {versionsError ? <InlineError>{versionsError}</InlineError> : null}

            <div className="viz-repeat-row">
              <input
                className="viz-input"
                placeholder="Note for this version (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="Version note"
              />
              <button type="button" className="viz-btn" onClick={() => void createVersion()} disabled={versionsBusy || !shortCode}>
                Save version
              </button>
            </div>

            {versionsBusy ? <Spinner label="Working…" /> : null}

            {!versionsBusy && versions.length === 0 ? (
              <EmptyState>No saved versions yet.</EmptyState>
            ) : null}

            {versions.length > 0 ? (
              <table className="viz-table">
                <thead>
                  <tr>
                    <th scope="col">Note</th>
                    <th scope="col">Id</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => {
                    const id = String(v._id || v.id || '');
                    return (
                      <tr key={id}>
                        <td>{v.note || <em className="viz-null">no note</em>}</td>
                        <td className="viz-mono">{id}</td>
                        <td className="viz-table-actions">
                          <button type="button" className="viz-btn is-sm" onClick={() => void applyVersion(id)}>
                            Restore
                          </button>
                          <button
                            type="button"
                            className="viz-icon-btn"
                            title="Delete version"
                            aria-label="Delete version"
                            onClick={() => void deleteVersion(id)}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
}
