import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { BlockNodeData } from '@/types/workflow';
import BlockIcon from '../ui/BlockIcon';
import { CopyIcon, ExternalIcon, PencilIcon, PlusIcon, TrashIcon } from '../ui/icons';

/**
 * Visual family per block type, so a large workflow reads as groups rather
 * than a wall of identical cards. Keys match the classic studio-canvas
 * (`ui-themes/karma/scripts/studio-canvas/studio.css`) skin names one-to-one,
 * so the color rules in styles/index.css are a direct port of that palette.
 * Anything unmapped falls back to `task` (the plain white/default card).
 */
const SKIN_BY_TYPE: Record<string, string> = {
  datatransfer: 'dark',
  genericpost: 'dark',
  genericget: 'dark',
  chatfileupload: 'dark',

  setvariable: 'output',
  customoutput: 'output',
  return: 'output',
  realtimepush: 'output',
  downloadasfile: 'output',
  clearoutput: 'output',

  roverai: 'ai',
  roveragent: 'ai',

  sendmail: 'action',
  notify: 'action',
  twilio: 'action',
  retarusfax: 'action',
  retarussms: 'action',

  condition: 'condition',

  ssdatafilter: 'filter',
  ssadvdatafilter: 'filter',
  uniquevalidator: 'filter',
  formrule: 'filter',
  ruleengine: 'filter',

  insertssdata: 'sheet',
  insertorupdatessdata: 'sheet',
  updatessdata: 'sheet',
  ssdeleterow: 'sheet',
  ssautoincrementcol: 'sheet',
  bulkinsertssdata: 'sheet',
  tospreadsheet: 'sheet',
  livespace: 'sheet',

  getfiles: 'file',
  deletefile: 'file',
  movefile: 'file',
  copyfile: 'file',
  createfile: 'file',
  getfiledetails: 'file',
  processfile: 'file',
  zipfiles: 'file',
  googleocr: 'file',

  math: 'math',
  string: 'math',
  date: 'math',
  arrayextract: 'math',

  executeworkflow: 'workflow',
  reusable: 'workflow',
  backgroundworkflow: 'workflow',
  livecloudfunction: 'workflow',
};

export function nodeSkin(blockType: string, isEntry: boolean, isCondition: boolean): string {
  if (isCondition) return 'condition';
  if (isEntry) return 'dark';
  return SKIN_BY_TYPE[blockType] || 'task';
}

function BlockNode({ id, data, selected }: NodeProps<BlockNodeData>) {
  const {
    label,
    displayName,
    blockType,
    iconPath,
    isCondition,
    isEntry,
    description,
    configured,
    hasOutgoing,
    onEdit,
    onDelete,
    onClone,
    onAddNext,
    onOpenChild,
  } = data;

  // Non-conditions store a single `target`, so a second outgoing edge would be
  // silently discarded on save. Hide the affordance instead.
  const canAddNext = !isEntry && (isCondition || !hasOutgoing);
  const isChild = blockType === 'executeworkflow' || blockType === 'reusable';
  const interactive = !data.debugDimmed;

  const classes = ['viz-node', `skin-${nodeSkin(blockType, isEntry, isCondition)}`];
  if (selected) classes.push('is-selected');
  if (isEntry) classes.push('is-entry');
  if (data.debugActive) classes.push('is-debug-active');
  if (data.debugDimmed) classes.push('is-debug-dim');
  if (data.pendingSource) classes.push('is-pending-source');
  if (data.debug?.status) classes.push(`is-${data.debug.status}`);

  const actions = interactive ? (
    <div
      className="viz-node-actions nodrag nopan"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" title="Edit settings" onClick={() => onEdit?.(id)}>
        <PencilIcon />
        <span>Edit</span>
      </button>
      {canAddNext && (
        <button type="button" title="Add next block" onClick={() => onAddNext?.(id)}>
          <PlusIcon />
          <span>Add</span>
        </button>
      )}
      {!isEntry && (
        <button type="button" title="Clone block" onClick={() => onClone?.(id)}>
          <CopyIcon />
          <span>Clone</span>
        </button>
      )}
      {isChild && (
        <button type="button" title="Open child workflow" onClick={() => onOpenChild?.(id)}>
          <ExternalIcon />
          <span>Open</span>
        </button>
      )}
      {!isEntry && (
        <button type="button" className="is-danger" title="Delete block" onClick={() => onDelete?.(id)}>
          <TrashIcon />
          <span>Delete</span>
        </button>
      )}
    </div>
  ) : null;

  const openOnDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!interactive) return;
    onEdit?.(id);
  };

  const notConfigured = !configured && !isEntry && (
    <span className="viz-node-warn" title="Not configured yet — double-click or use Edit">
      !
    </span>
  );

  if (isCondition) {
    return (
      <div className={classes.join(' ')} title={description || label} onDoubleClick={openOnDoubleClick}>
        {actions}
        <div className="viz-cond-label">
          <span className="viz-node-label">{label}</span>
        </div>
        <div className="viz-cond-body">
          <Handle id="in" type="target" position={Position.Left} className="viz-handle viz-handle-in" />
          <div className="viz-cond-diamond" aria-hidden="true">
            <span className="viz-cond-diamond-face">
              <BlockIcon iconPath={iconPath} label={label} fallback={blockType} />
            </span>
          </div>
          <Handle
            id="yes"
            type="source"
            position={Position.Right}
            className="viz-handle viz-handle-yes"
            title="Yes branch"
          />
          <Handle
            id="no"
            type="source"
            position={Position.Bottom}
            className="viz-handle viz-handle-no"
            title="No branch"
          />
          <span className="viz-cond-branch viz-cond-branch-yes">Yes</span>
          <span className="viz-cond-branch viz-cond-branch-no">No</span>
        </div>
        {notConfigured}
      </div>
    );
  }

  return (
    <div className={classes.join(' ')} title={description || label} onDoubleClick={openOnDoubleClick}>
      {actions}

      {!isEntry && (
        <Handle id="in" type="target" position={Position.Left} className="viz-handle viz-handle-in" />
      )}

      <div className="viz-node-body">
        <span className="viz-node-icon">
          <BlockIcon iconPath={iconPath} label={label} fallback={blockType} />
        </span>
        <span className="viz-node-text">
          <span className="viz-node-label">{label}</span>
          <span className="viz-node-type">{displayName || blockType}</span>
        </span>
        {notConfigured}
        {data.debug?.executionTime ? (
          <span className="viz-node-time" title="Execution time">
            {data.debug.executionTime}s
          </span>
        ) : null}
      </div>

      <Handle id="out" type="source" position={Position.Right} className="viz-handle viz-handle-out" />

      {!hasOutgoing && interactive && (
        <button
          type="button"
          className="viz-add-next nodrag nopan"
          title="Add next block"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAddNext?.(id);
          }}
        >
          <PlusIcon size={12} />
        </button>
      )}
    </div>
  );
}

export default memo(BlockNode);
