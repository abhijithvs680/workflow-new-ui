import RecentLogs from './RecentLogs';
import {
  BlocksIcon,
  CheckIcon,
  CogIcon,
  CopyIcon,
  FitIcon,
  LayoutIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
} from './ui/icons';

export interface ToolbarProps {
  name: string;
  onNameChange: (value: string) => void;
  workflowId: string;
  shortCode: string;
  dirty: boolean;
  busy: boolean;
  editing: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  hasSelection: boolean;
  hasEdgeSelection: boolean;
  activeLogId?: string | number;
  canvasInteraction: number;

  onSave: () => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onRun: () => void;
  onOpenLog: (logId: string | number) => void;
  onAutoLayout: () => void;
  onFit: () => void;
  onTogglePalette: () => void;
  onToggleSettings: () => void;
  onDeleteSelected: () => void;
  onDisconnectSelected: () => void;
  onEditSelected: () => void;
  onCloneSelected: () => void;
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
    shortCode,
    dirty,
    busy,
    editing,
    paletteOpen,
    settingsOpen,
    hasSelection,
    hasEdgeSelection,
    activeLogId,
    canvasInteraction,
  } = props;

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
          {shortCode ? (
            <span className="viz-toolbar-code" title="Workflow short code">
              {shortCode}
            </span>
          ) : null}
          {dirty ? <span className="viz-pill is-dirty">Unsaved</span> : null}
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
        {editing && hasSelection ? (
          <span className="viz-toolbar-selection">
            <button type="button" className="viz-btn is-sm" onClick={props.onEditSelected} title="Edit selected block">
              <PencilIcon /> Edit
            </button>
            <button type="button" className="viz-btn is-sm" onClick={props.onCloneSelected} title="Clone selected block">
              <CopyIcon /> Clone
            </button>
            <button
              type="button"
              className="viz-btn is-sm is-danger"
              onClick={props.onDeleteSelected}
              title="Delete selected block (Del)"
            >
              <TrashIcon /> Delete
            </button>
          </span>
        ) : null}

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
            className={`viz-btn${paletteOpen ? ' is-active' : ''}`}
            onClick={props.onTogglePalette}
            title="Block palette"
          >
            <BlocksIcon /> Blocks
          </button>
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
          <CogIcon /> Settings
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
