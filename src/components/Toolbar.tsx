import RecentLogs from './RecentLogs';
import { formatVersionStamp } from '@/lib/versions';
import { debuggerHref } from '@/lib/routes';
import {
  CheckIcon,
  CogIcon,
  FitIcon,
  LayoutIcon,
  PencilIcon,
  PlayIcon,
} from './ui/icons';

export interface ToolbarProps {
  name: string;
  onNameChange: (value: string) => void;
  workflowId: string;
  shortCode: string;
  dirty: boolean;
  busy: boolean;
  editing: boolean;
  settingsOpen: boolean;
  hasEdgeSelection: boolean;
  activeLogId?: string | number;
  canvasInteraction: number;
  /**
   * Present when the canvas is showing a saved version. The classic
   * `/workflow.versiondebugger/{id}` page has no edit, save or run controls, so
   * neither does this — only a way back to the live workflow.
   */
  version?: {
    createdAt: number;
    note: string;
    parentWorkflowId: string;
    parentName: string;
  };

  onSave: () => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onRun: () => void;
  onOpenLog: (logId: string | number) => void;
  onAutoLayout: () => void;
  onFit: () => void;
  onToggleSettings: () => void;
  onDisconnectSelected: () => void;
}

/**
 * Top bar. Mirrors the classic debugger's model: the canvas is read-only until
 * **Edit** is pressed, which is what prevents two people silently overwriting
 * each other's work through the shared PHP session.
 */
export default function Toolbar(props: ToolbarProps) {
  const {
    name,
    onNameChange,
    workflowId,
    busy,
    editing,
    settingsOpen,
    hasEdgeSelection,
    activeLogId,
    canvasInteraction,
    version,
  } = props;

  if (version) {
    return (
      <div className="viz-toolbar is-version">
        <div className="viz-toolbar-main">
          <div className="viz-toolbar-identity">
            <span className="viz-toolbar-name is-static" title={name}>
              {version.parentName || name}
            </span>
            <span className="viz-pill is-info">Version</span>
            {version.createdAt ? (
              <span className="viz-toolbar-version-stamp">
                {formatVersionStamp(version.createdAt)}
              </span>
            ) : null}
          </div>

          <div className="viz-toolbar-edit-cluster">
            {version.note ? <span className="viz-toolbar-version-note">{version.note}</span> : null}
            {version.parentWorkflowId ? (
              <a
                className="viz-btn is-primary"
                href={debuggerHref(version.parentWorkflowId)}
              >
                Back to workflow
              </a>
            ) : null}
          </div>
        </div>

        <div className="viz-toolbar-actions">
          <button type="button" className="viz-btn" onClick={props.onFit} title="Fit the graph to the viewport">
            <FitIcon /> Fit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="viz-toolbar">
      <div className="viz-toolbar-main">
        <div className="viz-toolbar-identity">
          <label className="viz-visually-hidden" htmlFor="viz-wf-name">
            Workflow name
          </label>
          <input
            id="viz-wf-name"
            className="viz-toolbar-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Untitled workflow"
            disabled={!editing}
            spellCheck={false}
          />

        </div>

        <div className="viz-toolbar-edit-cluster">
          {!editing ? (
            <button
              type="button"
              className="viz-btn is-primary"
              onClick={props.onStartEdit}
              disabled={busy}
              title="Unlock this workflow for editing"
            >
              <PencilIcon /> Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                className="viz-btn is-primary"
                onClick={props.onSave}
                disabled={busy}
                title="Save (Ctrl+S)"
              >
                {busy ? 'Working…' : 'Save'}
              </button>
              <button
                type="button"
                className="viz-btn"
                onClick={props.onFinishEdit}
                disabled={busy}
                title="Save and return to read-only"
              >
                <CheckIcon /> Finish editing
              </button>
            </>
          )}

          <div className="viz-run-group">
            <button type="button" className="viz-btn" onClick={props.onRun} disabled={busy} title="Run a test execution">
              <PlayIcon /> Run
            </button>
            <RecentLogs
              workflowId={workflowId}
              activeLogId={activeLogId}
              dismissKey={canvasInteraction}
              onOpenLog={props.onOpenLog}
              disabled={busy}
            />
          </div>
        </div>
      </div>

      <div className="viz-toolbar-actions">


        {editing && hasEdgeSelection ? (
          <span className="viz-toolbar-selection">
            <button
              type="button"
              className="viz-btn is-sm is-danger"
              onClick={props.onDisconnectSelected}
              title="Remove the selected connection (Del)"
            >
              Disconnect
            </button>
          </span>
        ) : null}

        {editing ? (
          <button
            type="button"
            className="viz-btn"
            onClick={props.onAutoLayout}
            disabled={busy}
            title="Arrange left-to-right and save, so the classic canvas matches"
          >
            <LayoutIcon /> Arrange
          </button>
        ) : null}

        <button type="button" className="viz-btn" onClick={props.onFit} title="Fit the graph to the viewport">
          <FitIcon /> Fit
        </button>

        <button
          type="button"
          className={`viz-btn${settingsOpen ? ' is-active' : ''}`}
          onClick={props.onToggleSettings}
          title="Workflow settings"
        >
          <CogIcon />
        </button>

        <a
          className="viz-btn"
          href={`/workflow.debugger/${encodeURIComponent(workflowId)}`}
          title="Open this workflow in the classic canvas"
        >
          Classic
        </a>
      </div>
    </div>
  );
}
