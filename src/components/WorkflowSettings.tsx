import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorText } from '@/api/http';
import {
  fetchWorkflowJson,
  fetchWorkflowSettings,
  hourLabel,
  SCHEDULE_OPTIONS,
  settingsApi,
  workflowApi,
  type ScheduleValue,
  type WorkflowSettingsState,
  type WorkflowVersion,
} from '@/api/workflow';
import Modal from './ui/Modal';
import Select from './ui/Select';
import { EmptyState, InlineError, Spinner } from './ui/feedback';
import { PlusIcon, TrashIcon } from './ui/icons';
import { formatVersionStamp } from '@/lib/versions';
import { versionHref } from '@/lib/routes';

interface Props {
  workflowId: string;
  shortCode: string;
  workflowName: string;
  /** Client-side "show block descriptions on the canvas" view toggle. */
  showBlockInfo: boolean;
  onToggleBlockInfo: () => void;
  onClose: () => void;
  /** Reload the canvas after a version is applied. */
  onVersionApplied: () => void;
  notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

interface AppOption {
  shortCode: string;
  name: string;
}

interface ReusableField {
  input: string;
  required: boolean;
  notes: string;
}

const blankField = (): ReusableField => ({ input: '', required: false, notes: '' });

/** `9hrs` <-> 9. The platform stores the suffixed form. */
const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: `${i}hrs`, label: hourLabel(i) }));



/* -------------------------------------------------------------------------- */
/* Action-box icons                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The four controls the classic action box packs into icon buttons:
 * execution log, schedule, "show block descriptions", and view raw JSON.
 * Single-use here, so kept local rather than added to the shared icon set.
 */
function SlidersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function HeartPulseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z" />
      <polyline points="3 12 7 12 10 6 14 18 17 12 21 12" />
    </svg>
  );
}

function CodeBracketsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M8 10l-2 2 2 2" />
      <path d="M16 10l2 2-2 2" />
    </svg>
  );
}

/** `icon-copy-short-code-link` — "Copy workflow Short Code". */
function CopyLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Workflow settings modal.
 *
 * Feature-matched to the classic `wfsettings.tpl`: the log/schedule/block-info
 * action box, the "view workflow JSON" link, versions, categories, the
 * connected app, and reusable conversion. Every control writes through the
 * same endpoint the classic panel uses.
 */
export default function WorkflowSettings({
  workflowId,
  shortCode,
  workflowName,
  showBlockInfo,
  onToggleBlockInfo,
  onClose,
  onVersionApplied,
  notify,
}: Props) {
  /* ---- loaded state ---- */
  const [state, setState] = useState<WorkflowSettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  /* ---- runtime ---- */
  const [enableLog, setEnableLog] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>('0');
  const [hour, setHour] = useState('0hrs');
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false);
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [runtimeError, setRuntimeError] = useState('');

  /* ---- versions ---- */
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [versionsError, setVersionsError] = useState('');
  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [note, setNote] = useState('');

  /* ---- categories ---- */
  const [categories, setCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);

  /* ---- app ---- */
  const [apps, setApps] = useState<AppOption[]>([]);
  const [connectedApp, setConnectedApp] = useState('');
  const [appBusy, setAppBusy] = useState(false);

  /* ---- reusable ---- */
  const [reusable, setReusable] = useState(false);
  const [showReusableEditor, setShowReusableEditor] = useState(false);

  /* ---- workflow JSON viewer ---- */
  const [showJson, setShowJson] = useState(false);
  const [json, setJson] = useState('');
  const [jsonBusy, setJsonBusy] = useState(false);
  const [jsonError, setJsonError] = useState('');

  /* ------------------------------------------------------------------ load */

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await fetchWorkflowSettings(workflowId);
      setState(next);
      setEnableLog(next.enableLog);
      setSchedule(next.schedule);
      setHour(next.hour || '0hrs');
      setCategories(next.categories);
      setAllCategories(next.allCategories);
      setConnectedApp(next.connectedApp);
      setReusable(next.reusable);
    } catch (e) {
      setLoadError(errorText(e, 'Could not load workflow settings.'));
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The app list and version history are independent of the settings page —
  // classic fetches both immediately when the panel opens, so this does too.
  useEffect(() => {
    let cancelled = false;
    settingsApi
      .apps()
      .then((list) => {
        if (cancelled) return;
        setApps(list.map((a) => ({ shortCode: a.short_code, name: String(a.name ?? a.short_code) })));
      })
      .catch(() => {
        /* the picker simply stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  /* ---------------------------------------------------------------- actions */

  /**
   * Logging and schedule share one endpoint and are always posted together —
   * sending only one of them would clear the other.
   */
  const saveRuntime = useCallback(
    async (nextLog: boolean, nextSchedule: ScheduleValue, nextHour: string) => {
      setSavingRuntime(true);
      setRuntimeError('');
      try {
        await workflowApi.saveRuntime(workflowId, nextLog, nextSchedule, nextHour);
        notify('Workflow settings saved.', 'success');
      } catch (e) {
        setRuntimeError(errorText(e, 'Could not save workflow settings.'));
        // Put the controls back to what the server still holds.
        if (state) {
          setEnableLog(state.enableLog);
          setSchedule(state.schedule);
          setHour(state.hour || '0hrs');
        }
      } finally {
        setSavingRuntime(false);
      }
    },
    [notify, state, workflowId],
  );

  const toggleLog = () => {
    const next = !enableLog;
    setEnableLog(next);
    void saveRuntime(next, schedule, hour);
  };

  const applySchedule = () => {
    void saveRuntime(enableLog, schedule, hour);
    setSchedulePanelOpen(false);
  };

  const createVersion = async () => {
    setVersionsBusy(true);
    try {
      await settingsApi.createVersion(shortCode, note);
      setNote('');
      setShowCreateVersion(false);
      notify('Version created.', 'success');
      await loadVersions();
    } catch (e) {
      setVersionsError(errorText(e, 'Could not create a version.'));
      setVersionsBusy(false);
    }
  };

  const applyVersion = async (id: string) => {
    if (!window.confirm('Replace the current workflow with this saved version?')) return;
    setVersionsBusy(true);
    try {
      await settingsApi.applyVersion(shortCode, id);
      notify('Version restored.', 'success');
      onVersionApplied();
    } catch (e) {
      setVersionsError(errorText(e, 'Could not restore the version.'));
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

  const addCategory = async (value: string) => {
    const name = value.trim();
    if (!name || categories.includes(name)) {
      setNewCategory('');
      return;
    }
    setCategoryBusy(true);
    setCategories((list) => [...list, name]);
    setNewCategory('');
    try {
      await settingsApi.tag(shortCode, 'category', name, 'insert');
    } catch (e) {
      setCategories((list) => list.filter((c) => c !== name));
      notify(errorText(e, 'Could not add the category.'), 'error');
    } finally {
      setCategoryBusy(false);
    }
  };

  const removeCategory = async (name: string) => {
    setCategoryBusy(true);
    setCategories((list) => list.filter((c) => c !== name));
    try {
      await settingsApi.tag(shortCode, 'category', name, 'delete');
    } catch (e) {
      setCategories((list) => [...list, name]);
      notify(errorText(e, 'Could not remove the category.'), 'error');
    } finally {
      setCategoryBusy(false);
    }
  };

  const connectApp = async (value: string) => {
    const previous = connectedApp;
    setConnectedApp(value);
    setAppBusy(true);
    try {
      await settingsApi.tag(shortCode, 'livespace', value, 'insert');
      notify(value ? 'Connected to the app.' : 'Disconnected from the app.', 'success');
    } catch (e) {
      setConnectedApp(previous);
      notify(errorText(e, 'Could not update the connected app.'), 'error');
    } finally {
      setAppBusy(false);
    }
  };

  const suggestions = useMemo(
    () => allCategories.filter((c) => !categories.includes(c)),
    [allCategories, categories],
  );

  /**
   * The classic button is a `copy-to-clipboard` with
   * `data-message="Short code has copied to clipboard"`.
   */
  const copyShortCode = useCallback(async () => {
    if (!shortCode) return;
    try {
      await navigator.clipboard.writeText(shortCode);
      notify('Short code has copied to clipboard', 'success');
    } catch {
      // Clipboard access is denied outside a secure context; showing the value
      // at least keeps it copyable by hand.
      notify(`Short code: ${shortCode}`, 'info');
    }
  }, [notify, shortCode]);

  // Same endpoint the classic panel loads into its modal.
  useEffect(() => {
    if (!showJson || !shortCode) return;
    let cancelled = false;
    setJsonBusy(true);
    setJsonError('');
    fetchWorkflowJson(shortCode)
      .then((text) => {
        if (!cancelled) setJson(text);
      })
      .catch((e) => {
        if (!cancelled) setJsonError(errorText(e, 'Could not load the workflow JSON.'));
      })
      .finally(() => {
        if (!cancelled) setJsonBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showJson, shortCode]);

  /* ----------------------------------------------------------------- render */

  return (
    <>
      {/* Docked right at full height, as the classic settings sidebar is. */}
      <Modal
        title="Settings"
        size="sm"
        placement="right"
        onClose={onClose}
      >
        {loading ? (
          <div className="viz-modal-loading">
            <Spinner label="Loading settings…" />
          </div>
        ) : loadError ? (
          <>
            <InlineError>{loadError}</InlineError>
            <button type="button" className="viz-btn" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          <div className="viz-settings">
            {runtimeError ? <InlineError>{runtimeError}</InlineError> : null}

            {/* ------------------------------------------------- action box */}
            <div className="viz-settings-actions">
              <button
                type="button"
                className={`viz-settings-action${enableLog ? ' is-active' : ''}`}
                title="Execution log — record a log for every run"
                aria-pressed={enableLog}
                disabled={savingRuntime}
                onClick={toggleLog}
              >
                <SlidersIcon />
              </button>

              <button
                type="button"
                className={`viz-settings-action${schedule !== '0' ? ' is-active' : ''}`}
                title="Schedule — run this workflow on a time interval"
                aria-pressed={schedulePanelOpen}
                onClick={() => setSchedulePanelOpen((v) => !v)}
              >
                <HeartPulseIcon />
              </button>

              <button
                type="button"
                className={`viz-settings-action${showBlockInfo ? ' is-active' : ''}`}
                title="Show descriptions on all stencil blocks"
                aria-pressed={showBlockInfo}
                onClick={onToggleBlockInfo}
              >
                <CodeBracketsIcon />
              </button>

              {/* Classic action box item 4: copy the workflow short code. */}
              <button
                type="button"
                className="viz-settings-action"
                title="Copy workflow Short Code"
                disabled={!shortCode}
                onClick={() => void copyShortCode()}
              >
                <CopyLinkIcon />
              </button>

              {/*
                Classic opens this through its ajax modal loader
                (`data-class="studioModel wfjson-model"`), not a new tab.
              */}
              <button
                type="button"
                className={`viz-settings-action${showJson ? ' is-active' : ''}`}
                title="Show workflow JSON data"
                aria-pressed={showJson}
                disabled={!shortCode}
                onClick={() => setShowJson(true)}
              >
                {'{x}'}
              </button>
            </div>

            {schedulePanelOpen ? (
              <div className="viz-settings-schedule">
                <div className="viz-radio-group is-stacked" role="radiogroup" aria-label="Schedule">
                  {SCHEDULE_OPTIONS.map((o) => (
                    <label className="viz-radio" key={o.value}>
                      <input
                        type="radio"
                        name="viz-schedule"
                        checked={schedule === o.value}
                        onChange={() => setSchedule(o.value)}
                      />
                      <span>{o.label}</span>
                      {o.value === 'day' && schedule === 'day' ? (
                        <span onClick={(e) => e.stopPropagation()}>
                          <Select
                            small
                            aria-label="Hour (UTC)"
                            value={hour}
                            options={HOURS}
                            placeholder="Hour"
                            onChange={setHour}
                          />
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="viz-btn is-primary is-sm"
                  onClick={applySchedule}
                  disabled={savingRuntime}
                >
                  {savingRuntime ? 'Saving…' : 'Apply'}
                </button>
              </div>
            ) : null}

            {/* -------------------------------------------------- versions */}
            <section className="viz-settings-section">
              <div className="viz-settings-section-head">
                <span className="viz-settings-title">Versions</span>
                <button
                  type="button"
                  className="viz-btn is-outline is-sm"
                  onClick={() => setShowCreateVersion(true)}
                  disabled={!shortCode}
                >
                  Create
                </button>
              </div>

              <div className="viz-settings-history-label">View history</div>

              <div className="viz-settings-versions">
                {versionsError ? <InlineError>{versionsError}</InlineError> : null}
                {versionsBusy ? <Spinner label="Loading…" /> : null}
                {!versionsBusy && !versionsError && versions.length === 0 ? (
                  <EmptyState>No saved versions.</EmptyState>
                ) : null}

                {versions.map((v) => (
                  <div className="viz-settings-version" key={v.id}>
                    <div className="viz-settings-version-row">
                      {/*
                        Classic renders this as
                        `<a href="#workflow.versiondebugger/{id}" target="_blank">`,
                        which leaves the app. Same new-tab behaviour, but the
                        version canvas now opens inside this UI.
                      */}
                      <a
                        className="viz-settings-version-date"
                        href={versionHref(workflowId, v.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open this version on the canvas"
                      >
                        {formatVersionStamp(v.createdAt)}
                      </a>
                      <span className="viz-settings-version-links">
                        <button
                          type="button"
                          className="viz-link-btn"
                          onClick={() => void applyVersion(v.id)}
                          disabled={versionsBusy}
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          className="viz-link-btn is-danger"
                          onClick={() => void deleteVersion(v.id)}
                          disabled={versionsBusy}
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                    <p className="viz-settings-version-note">
                      {v.note || <em className="viz-null">No note</em>}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <hr className="viz-settings-rule" />

            {/* ------------------------------------------------ categories */}
            <section className="viz-settings-section">
              <span className="viz-settings-title">Add to category</span>

              {categories.length ? (
                <div className="viz-chips">
                  {categories.map((c) => (
                    <span className="viz-chip" key={c}>
                      {c}
                      <button
                        type="button"
                        aria-label={`Remove ${c}`}
                        disabled={categoryBusy}
                        onClick={() => void removeCategory(c)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <form
                className="viz-settings-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addCategory(newCategory);
                }}
              >
                <input
                  className="viz-input"
                  list="viz-category-options"
                  placeholder="Add Category"
                  aria-label="Add category"
                  value={newCategory}
                  disabled={categoryBusy}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <datalist id="viz-category-options">
                  {suggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <button
                  type="submit"
                  className="viz-btn is-outline"
                  disabled={categoryBusy || !newCategory.trim()}
                >
                  Add Category
                </button>
              </form>
            </section>

            {/* ------------------------------------------------ connect app */}
            <section className="viz-settings-section">
              <span className="viz-settings-title">Connect to an App</span>
              <Select
                aria-label="Connected app"
                value={connectedApp}
                options={apps.map((a) => ({ value: a.shortCode, label: a.name }))}
                disabled={appBusy}
                placeholder="Select"
                onChange={(next) => void connectApp(next)}
              />
            </section>

            {/* --------------------------------------------------- reusable */}
            <section className="viz-settings-section">
              <div className="viz-settings-section-head">
                <span className="viz-settings-title">Reusable</span>
                {reusable ? (
                  <span className="viz-settings-reusable-actions">
                    <button
                      type="button"
                      className="viz-link-btn"
                      onClick={() => setShowReusableEditor(true)}
                    >
                      Unset
                    </button>
                    <button
                      type="button"
                      className="viz-btn is-outline is-sm"
                      onClick={() => setShowReusableEditor(true)}
                    >
                      Edit
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="viz-btn is-outline is-sm"
                    onClick={() => setShowReusableEditor(true)}
                  >
                    Convert
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </Modal>

      {showCreateVersion ? (
        <Modal
          title="Create version"
          size="sm"
          onClose={() => setShowCreateVersion(false)}
          busy={versionsBusy}
          footer={
            <>
              <button type="button" className="viz-btn" onClick={() => setShowCreateVersion(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="viz-btn is-primary"
                onClick={() => void createVersion()}
                disabled={versionsBusy}
              >
                {versionsBusy ? 'Creating…' : 'Create version'}
              </button>
            </>
          }
        >
          <div className="viz-form">
            <label className="viz-field-label" htmlFor="viz-version-note">
              Version note
            </label>
            <textarea
              id="viz-version-note"
              className="viz-textarea"
              rows={4}
              placeholder="e.g. Version 3.1 (BR 5.6)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
          </div>
        </Modal>
      ) : null}

      {showJson ? (
        <Modal
          title="Workflow JSON"
          subtitle={workflowName ? `(${workflowName})` : shortCode ? `(${shortCode})` : undefined}
          size="lg"
          onClose={() => setShowJson(false)}
          footer={
            <>
              <button
                type="button"
                className="viz-btn"
                disabled={!json}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(json)
                    .then(() => notify('Workflow JSON copied to clipboard.', 'success'))
                    .catch(() => notify('Could not copy to the clipboard.', 'error'));
                }}
              >
                Copy
              </button>
              <button type="button" className="viz-btn is-primary" onClick={() => setShowJson(false)}>
                Close
              </button>
            </>
          }
        >
          {jsonBusy ? (
            <div className="viz-modal-loading">
              <Spinner label="Loading workflow JSON…" />
            </div>
          ) : jsonError ? (
            <InlineError>{jsonError}</InlineError>
          ) : (
            <pre className="viz-json-plain">{json}</pre>
          )}
        </Modal>
      ) : null}

      {showReusableEditor ? (
        <ReusableEditor
          workflowId={workflowId}
          reusable={reusable}
          onClose={() => setShowReusableEditor(false)}
          onChanged={(next) => {
            setReusable(next);
            setShowReusableEditor(false);
          }}
          notify={notify}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Reusable conversion                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Convert / edit / unset reusable status.
 *
 * Mirrors the classic "Convert workflow as Reusable" modal: a description plus
 * a repeating {input, required, notes} row set, posted as parallel arrays.
 */
function ReusableEditor({
  workflowId,
  reusable,
  onClose,
  onChanged,
  notify,
}: {
  workflowId: string;
  reusable: boolean;
  onClose: () => void;
  onChanged: (nextReusable: boolean) => void;
  notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}) {
  const [loading, setLoading] = useState(reusable);
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<ReusableField[]>([blankField()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!reusable) return;
    let cancelled = false;
    setLoading(true);
    settingsApi
      .reusable(workflowId)
      .then((result) => {
        if (cancelled) return;
        const raw = (result as { fieldset?: unknown; description?: unknown }) || {};
        const fieldset = Array.isArray(raw.fieldset) ? raw.fieldset : [];
        const loaded = fieldset
          .map((row) => {
            const r = (row || {}) as Record<string, unknown>;
            return {
              input: String(r.input ?? ''),
              required: r.required === true || r.required === 'true',
              notes: String(r.notes ?? ''),
            };
          })
          .filter((f) => f.input);
        setFields(loaded.length ? loaded : [blankField()]);
        setDescription(String(raw.description ?? ''));
      })
      .catch((e) => setError(errorText(e, 'Could not load the current reusable configuration.')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reusable, workflowId]);

  const update = (i: number, patch: Partial<ReusableField>) =>
    setFields((list) => list.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const save = async () => {
    const used = fields.filter((f) => f.input.trim());
    if (!used.length) {
      setError('Add at least one input field.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await settingsApi.saveReusable(workflowId, used, description);
      notify('Reusable configuration saved.', 'success');
      onChanged(true);
    } catch (e) {
      setError(errorText(e, 'Could not save the reusable configuration.'));
    } finally {
      setBusy(false);
    }
  };

  const unset = async () => {
    if (!window.confirm('Stop treating this workflow as reusable?')) return;
    setBusy(true);
    setError('');
    try {
      await settingsApi.unsetReusable(workflowId);
      notify('Reusable configuration removed.', 'success');
      onChanged(false);
    } catch (e) {
      setError(errorText(e, 'Could not unset reusable.'));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={reusable ? 'Edit reusable inputs' : 'Convert workflow as reusable'}
      size="md"
      onClose={onClose}
      busy={busy || loading}
      banner={error ? <InlineError>{error}</InlineError> : null}
      footer={
        <>
          {reusable ? (
            <button type="button" className="viz-btn is-danger" onClick={() => void unset()} disabled={busy}>
              Unset reusable
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <button type="button" className="viz-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="viz-btn is-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="viz-modal-loading">
          <Spinner label="Loading…" />
        </div>
      ) : (
        <div className="viz-form">
          <div className="viz-field is-full">
            <label className="viz-field-label" htmlFor="viz-reusable-desc">
              Description
            </label>
            <textarea
              id="viz-reusable-desc"
              className="viz-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this workflow does when called as reusable."
            />
          </div>

          <div className="viz-repeat">
            <div className="viz-repeat-head">
              <span>Input field</span>
              <span>Required</span>
              <span>Notes</span>
              <span />
            </div>
            {fields.map((f, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div className="viz-repeat-row is-reusable-field" key={i}>
                <input
                  className="viz-input"
                  placeholder="input name"
                  aria-label={`Input ${i + 1} name`}
                  value={f.input}
                  onChange={(e) => update(i, { input: e.target.value })}
                />
                <label className="viz-checkbox is-center">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                </label>
                <input
                  className="viz-input"
                  placeholder="notes"
                  aria-label={`Input ${i + 1} notes`}
                  value={f.notes}
                  onChange={(e) => update(i, { notes: e.target.value })}
                />
                <button
                  type="button"
                  className="viz-icon-btn"
                  title="Remove field"
                  aria-label="Remove field"
                  onClick={() => setFields((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [blankField()]))}
                >
                  <TrashIcon size={13} />
                </button>
              </div>
            ))}
            <button type="button" className="viz-link-btn" onClick={() => setFields((list) => [...list, blankField()])}>
              <PlusIcon size={12} /> Add input
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
