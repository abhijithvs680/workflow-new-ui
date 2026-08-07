import { useCallback, useEffect, useState } from 'react';
import { errorText } from '@/api/http';
import { settingsApi, type WorkflowVersion } from '@/api/workflow';
import { InlineError, Spinner } from './ui/feedback';
import Modal from './ui/Modal';

interface Props {
  workflowId: string;
  shortCode: string;
  onClose: () => void;
  /** Reload the canvas after a version is applied. */
  onVersionApplied: () => void;
  notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

export default function WorkflowSettings({
  shortCode,
  onClose,
  onVersionApplied,
  notify,
}: Props) {

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
            
            {/* Top Icon Tabs */}
            <div className="viz-settings-tabs">
              <button className="viz-settings-tab is-active" type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
              </button>
              <button className="viz-settings-tab" type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"></path><polyline points="3 12 7 12 10 6 14 18 17 12 21 12"></polyline></svg>
              </button>
              <button className="viz-settings-tab" type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M8 10l-2 2 2 2"></path><path d="M16 10l2 2-2 2"></path></svg>
              </button>
              <button className="viz-settings-tab" type="button" style={{fontWeight: 'bold', fontSize: '14px', fontFamily: 'monospace'}}>
                &#123;x&#125;
              </button>
            </div>

            {/* Versions Section */}
            <div className="viz-settings-section">
              <div className="viz-settings-section-header">
                <span className="viz-settings-section-title">Versions</span>
                <button className="viz-btn-outline" onClick={() => setShowCreateVersion(true)}>Create</button>
              </div>
              <div className="viz-settings-history-box" onClick={() => void loadVersions()}>View history</div>
              {versionsBusy ? <div style={{padding: '10px 0'}}><Spinner label="Loading..." /></div> : null}
              {versionsError ? <InlineError>{versionsError}</InlineError> : null}
              <div className="viz-settings-version-list">
                {versions.length === 0 && !versionsBusy && !versionsError ? (
                  <div style={{fontSize: '12px', color: '#6b7280', padding: '8px 0'}}>No saved versions.</div>
                ) : null}
                {versions.map((v: any) => {
                  const id = String(v._id || v.id || '');
                  const dateStr = v['created-at'] ? String(v['created-at']) : id;
                  return (
                    <div className="viz-settings-version-item" key={id}>
                      <div>
                        <div className="viz-settings-version-date">{dateStr}</div>
                        <div className="viz-settings-version-note">{v.note || 'No note provided'}</div>
                      </div>
                      <div className="viz-settings-version-actions">
                        <a onClick={() => void applyVersion(id)}>Apply</a>
                        <a className="is-danger" onClick={() => void deleteVersion(id)}>Delete</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Add to category */}
            <div className="viz-settings-section">
              <span className="viz-settings-section-title" style={{marginBottom: '12px', display: 'block'}}>Add to category</span>
              <div className="viz-settings-row">
                <input placeholder="Add Category" className="viz-input-rounded" />
                <button className="viz-btn-outline">Add Category</button>
              </div>
            </div>
            
            {/* Connect to an App */}
            <div className="viz-settings-section">
              <span className="viz-settings-section-title" style={{marginBottom: '12px', display: 'block'}}>Connect to an App</span>
              <select className="viz-select-rounded">
                <option>Select</option>
              </select>
            </div>
            
            {/* Reusable */}
            <div className="viz-settings-section" style={{borderBottom: 'none'}}>
              <div className="viz-settings-section-header">
                <span className="viz-settings-section-title">Reusable</span>
                <button className="viz-btn-outline">Convert</button>
              </div>
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
