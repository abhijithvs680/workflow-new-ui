import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from 'reactflow';
import type { VizEdgeData } from '@/types/workflow';
import { CloseIcon } from '../ui/icons';

/**
 * Step edge with a mid-point remove control and a Yes/No pill for condition
 * branches. `interactionWidth` is widened well past the stroke so the line is
 * realistically clickable at low zoom.
 */
function VizEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps<VizEdgeData>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    offset: 20,
  });

  const branch = data?.branch;
  const onDelete = data?.onDelete;

  const labelClasses = ['viz-edge-label', 'nodrag', 'nopan'];
  if (selected) labelClasses.push('is-selected');
  if (branch) labelClasses.push(`is-${branch}`);
  if (data?.debugDimmed) labelClasses.push('is-dim');
  // `onDelete` is only ever set while the canvas is in edit mode (see
  // Studio.tsx's decoratedEdges) — reuse that as the "show the × unprompted"
  // signal so every connection gets a visible delete control during editing,
  // not just the one under the cursor.
  if (onDelete) labelClasses.push('is-editable');

  return (
    <>
      {/* The edge's own `className` is applied by React Flow to the wrapping
          <g>, so run/branch styling lives there rather than on the path. */}
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={28} />
      <EdgeLabelRenderer>
        <div
          className={labelClasses.join(' ')}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {branch ? <span className="viz-edge-pill">{branch === 'yes' ? 'Yes' : 'No'}</span> : null}
          {onDelete ? (
            <button
              type="button"
              className="viz-edge-delete"
              title="Remove connection"
              aria-label="Remove connection"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
            >
              <CloseIcon size={11} />
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(VizEdge);
