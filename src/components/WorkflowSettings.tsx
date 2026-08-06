import { useCallback, useEffect, useState } from 'react';
import { errorText } from '@/api/http';
import { settingsApi, workflowApi, type WorkflowVersion } from '@/api/workflow';
import Modal from './ui/Modal';
import { EmptyState, InlineError, Spinner } from './ui/feedback';

const SCHEDULES: Array<[string, string]> = [
  ['0', 'Not scheduled'],
  ['minute', 'Every minute'],
  ['hour', 'Hourly'],
  ['day', 'Daily'],
  ['week', 'Weekly'],
  ['month', 'Monthly'],
];

interface Props {
  workflowId: string;
  shortCode: string;
  onClose: () => void;
  /** Reload the canvas after a version is applied. */
  onVersionApplied: () => void;
  notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

export default function WorkflowSettings({
  workflowId,
  shortCode,
  onClose,
  onVersionApplied,
  notify,
}: Props) {
  // Runtime state
  const [enableLog, setEnableLog] = useState(true);
  const [schedule, setSchedule] = useState('0');
  const [hour, setHour] = useState('');
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [runtimeError, setRuntimeError] = useState('');

  // Versions state
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [versionsError, setVersionsError] = useState('');
  
  // Create Version Modal state
  const [showCreateVersion, setShowCreateVersion] = useState(false);
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
    void loadVersions();
  }, [loadVersions]);

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
      setShowCreateVersion(false);
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
    <>
      <div className="viz-settings-overlay" onClick={onClose}>
        <div className="viz-settings-panel" onClick={(e) => e.stopPropagation()}>
          <div className="viz-settings-header">
            <div>
              <h3>Settings</h3>
              <span className="viz-settings-subtitle">({shortCode})</span>
            </div>
            <button className="viz-settings-close" onClick={onClose}>&times;</button>
          </div>
          
          <div className="viz-settings-body">
            
            {/* Runtime Settings */}
            <div className="viz-settings-section">
              <div className="viz-settings-section-header">
                <span>Runtime Settings</span>
                <button onClick={() => void saveRuntime()} disabled={savingRuntime}>
                  {savingRuntime ? 'Saving...' : 'Save'}
                </button>
              </div>
              {runtimeError ? <InlineError>{runtimeError}</InlineError> : null}
              <div className="viz-field-grid" style={{ gap: '8px 12px' }}>
                <div className="viz-field is-full">
                  <label className="viz-checkbox">
                    <input type="checkbox" checked={enableLog} onChange={(e) => setEnableLog(e.target.checked)} />
                    <span style={{fontSize: '12px'}}>Record execution log</span>
                  </label>
                </div>
                <div className="viz-field is-full">
                  <select
                    className="viz-select is-sm"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                  >
                    {SCHEDULES.map(([value, labelText]) => (
                      <option key={value} value={value}>{labelText}</option>
                    ))}
                  </select>
                </div>
                {schedule === 'day' ? (
                  <div className="viz-field is-full">
                    <input
                      className="viz-input is-sm"
                      type="number"
                      min={0}
                      max={23}
                      placeholder="Hour (0-23)"
                      value={hour}
                      onChange={(e) => setHour(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Versions Section */}
            <div className="viz-settings-section">
              <div className="viz-settings-section-header">
                <span>Versions</span>
                <button onClick={() => setShowCreateVersion(true)}>Create</button>
              </div>
              <a className="viz-settings-link" onClick={() => void loadVersions()}>View history</a>
              
              {versionsError ? <InlineError>{versionsError}</InlineError> : null}
              {versionsBusy && versions.length === 0 ? <Spinner label="Loading..." /> : null}
              {!versionsBusy && versions.length === 0 ? <EmptyState>No saved versions yet.</EmptyState> : null}
              
              {versions.length > 0 ? (
                <div style={{ marginTop: '8px' }}>
                  {versions.map((v) => {
                    const id = String(v._id || v.id || '');
                    const dateStr = v['created-at'] ? String(v['created-at']) : id;
                    return (
                      <div key={id} className="viz-settings-version-item">
                        <div>
                          <div className="viz-settings-version-date">{dateStr}</div>
                          <div className="viz-settings-version-note">{v.note || <em>no note</em>}</div>
                        </div>
                        <div className="viz-settings-version-actions">
                          <a onClick={() => void applyVersion(id)}>Apply</a>
                          <a className="is-danger" onClick={() => void deleteVersion(id)}>Delete</a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            
            {/* Add to category */}
            <div className="viz-settings-section">
              <span className="viz-settings-section-title">Add to category</span>
              <div className="viz-settings-row">
                <input placeholder="Add Category" className="viz-input is-sm" />
                <button>Add Category</button>
              </div>
            </div>
            
            {/* Connect to an App */}
            <div className="viz-settings-section">
              <span className="viz-settings-section-title">Connect to an App</span>
              <select className="viz-select is-sm"><option>Select</option></select>
            </div>
            
            {/* Reusable */}
            <div className="viz-settings-section">
              <span className="viz-settings-section-title">Reusable</span>
              <button>Convert</button>
            </div>
          </div>
        </div>
      </div>

      {showCreateVersion && (
        <Modal
          title="Create version"
          size="sm"
          onClose={() => setShowCreateVersion(false)}
          footer={
            <>
              <button type="button" className="viz-btn" onClick={() => setShowCreateVersion(false)}>
                Cancel
              </button>
              <button type="button" className="viz-btn is-primary" onClick={() => void createVersion()} disabled={versionsBusy}>
                {versionsBusy ? 'Saving...' : 'Create version'}
              </button>
            </>
          }
        >
          <div className="viz-form">
            <textarea
              className="viz-textarea"
              placeholder="e.g: Version 3.1 (BR 5.6)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Version note"
              autoFocus
            />
          </div>
        </Modal>
      )}
    </>
  );
}
