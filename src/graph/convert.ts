/**
 * Translation between the platform's session shape and React Flow.
 *
 * The classic canvas writes `style.left = yPos` and `style.top = xPos`, and
 * `objectDrag` posts `xPos = top, yPos = left`. React Flow uses the ordinary
 * `{x: left, y: top}`, so:
 *
 *     RF.x = yPos      RF.y = xPos
 *
 * Every conversion goes through this module so the swap exists in exactly one
 * place. Getting it wrong silently transposes whole diagrams.
 */
import { MarkerType, type Edge, type Node } from 'reactflow';
import type {
  BlockNodeData,
  BlockProperties,
  EdgeBranch,
  PaletteGroup,
  SessionBlock,
  SessionConnection,
  VizEdgeData,
} from '@/types/workflow';

export const CONDITION_TYPE = 'condition';

export type VizNode = Node<BlockNodeData>;
export type VizEdgeType = Edge<VizEdgeData>;

/** Blocks that start a workflow: they accept no incoming connection. */
const ENTRY_TYPES = new Set(['datatransfer', 'genericpost', 'genericget']);

export function isEntryType(type: string): boolean {
  return ENTRY_TYPES.has(type);
}

export const EDGE_COLORS = {
  yes: '#22c55e',
  no: '#ef4444',
  plain: '#000000',
  taken: '#1e3a8a',
} as const;

function num(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/**
 * A block carrying only auto-added keys has never been configured.
 * `label`/`description` are written by the rename path, and `blockType` /
 * `dynamic_flag` / `debug_mode` are added by every save.
 */
const AUTO_KEYS = new Set(['label', 'description', 'blockType', 'dynamic_flag', 'debug_mode']);

export function hasConfig(props: BlockProperties | '' | undefined): boolean {
  if (!props || typeof props !== 'object') return false;
  return Object.entries(props).some(
    ([key, value]) => !AUTO_KEYS.has(key) && value !== '' && value != null,
  );
}

export function toNodes(blocks: SessionBlock[], palette: PaletteGroup[]): VizNode[] {
  const displayNames = new Map<string, string>();
  palette.forEach((group) => {
    group.items.forEach((item) => {
      if (!displayNames.has(item.objType)) displayNames.set(item.objType, item.label);
    });
  });

  return (blocks || []).map((b) => {
    const props = (b.block_properties || {}) as BlockProperties;
    const label = String(props.label || b.obj_name || b.type);
    return {
      id: b.blockId,
      type: 'vizBlock',
      position: { x: num(b.yPos), y: num(b.xPos) },
      data: {
        blockId: b.blockId,
        objId: String(b.obj_id ?? ''),
        blockType: b.type,
        label,
        displayName: b.obj_name || displayNames.get(b.type) || '',
        description: String(props.description || ''),
        iconPath: b.iconPath || '',
        isCondition: b.type === CONDITION_TYPE,
        isEntry: isEntryType(b.type),
        configured: hasConfig(props),
        shortcode: b.short_code || '',
        reusable: !!b.reusable,
        // The session serialises an absent map as `""`; `props` is already
        // normalised to an object, and node data is typed as one.
        block_properties: props,
        properties: typeof b.properties === 'object' && b.properties ? b.properties : undefined,
      },
    };
  });
}

/**
 * Convert session connections to edges.
 *
 * `blocks` is required to identify condition sources: the classic canvas
 * defaults every new connection to `condition_type=yes`, so `targetYes` also
 * appears on ordinary edges. A Yes/No label only means something when the
 * source really is a condition.
 */
export function toEdges(connections: SessionConnection[], blocks: SessionBlock[]): VizEdgeType[] {
  const typeById = new Map((blocks || []).map((b) => [b.blockId, b.type]));

  return (connections || []).map((c) => {
    const sourceIsCondition = typeById.get(c.sourceId) === CONDITION_TYPE;
    const branch: EdgeBranch = sourceIsCondition
      ? c.targetNo
        ? 'no'
        : c.targetYes
          ? 'yes'
          : null
      : null;
    return buildEdge(
      {
        source: c.sourceId,
        target: c.targetId,
        sourceHandle: branch === 'no' ? 'no' : branch === 'yes' ? 'yes' : 'out',
        targetHandle: 'in',
      },
      branch,
      c.conId || `${c.sourceId}-${c.targetId}`,
      c.properties
    );
  });
}

export interface ConnectParams {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** Single place that builds an edge so styling never drifts between paths. */
export function buildEdge(params: ConnectParams, branch: EdgeBranch, id?: string, properties?: Record<string, unknown>): VizEdgeType {
  const color = EDGE_COLORS[branch ?? 'plain'];
  return {
    id: id || `${params.source}-${params.target}`,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle || (branch === 'no' ? 'no' : branch === 'yes' ? 'yes' : 'out'),
    targetHandle: params.targetHandle || 'in',
    type: 'vizEdge',
    animated: false,
    data: { branch, properties },
    className: branch ? `viz-edge viz-edge-${branch}` : 'viz-edge',
    style: { stroke: color, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
  };
}

/**
 * Next instance id for a palette block, mirroring the classic
 * `{objId}_{counter}` scheme where the counter is unique across the canvas.
 */
export function nextBlockId(existingIds: string[], objId: string): string {
  let max = 1;
  existingIds.forEach((id) => {
    const suffix = parseInt(String(id).split('_').pop() || '', 10);
    if (Number.isFinite(suffix) && suffix > max) max = suffix;
  });
  return `${objId}_${max + 1}`;
}

/** Which branch a new edge represents; non-conditions send an empty type. */
export function branchOf(sourceNode: VizNode | undefined, sourceHandle?: string | null): '' | 'yes' | 'no' {
  if (!sourceNode?.data.isCondition) return '';
  return sourceHandle === 'no' ? 'no' : 'yes';
}

/**
 * Reject connections the engine cannot represent. Checked before the edge is
 * added so an invalid link never reaches the session.
 */
export function connectionError(
  params: ConnectParams,
  nodes: VizNode[],
  edges: VizEdgeType[],
): string | null {
  const { source, target, sourceHandle } = params;
  if (source === target) return 'A block cannot connect to itself.';

  const targetNode = nodes.find((n) => n.id === target);
  if (targetNode?.data.isEntry) return 'The entry block cannot have an incoming connection.';

  const sourceNode = nodes.find((n) => n.id === source);
  const existing = edges.filter((e) => e.source === source);
  if (existing.some((e) => e.target === target)) return 'These blocks are already connected.';

  if (sourceNode?.data.isCondition) {
    const branch = sourceHandle === 'no' ? 'no' : 'yes';
    if (existing.some((e) => e.data?.branch === branch)) {
      return `The ${branch === 'no' ? 'No' : 'Yes'} branch is already connected.`;
    }
  } else if (existing.length > 0) {
    return 'This block already has an outgoing connection. Delete it first, or use a Conditional Block to branch.';
  }
  return null;
}

/**
 * Flatten `window.w_leftBlockArray` into searchable groups.
 *
 * PHP JSON-encodes numerically keyed `items` as an object (`{"0": …}`) rather
 * than an array whenever the keys are sparse, so both shapes must be handled.
 */
export function flattenPalette(leftBlockArray: Record<string, unknown> | null): PaletteGroup[] {
  const groups: PaletteGroup[] = [];

  Object.entries(leftBlockArray || {}).forEach(([category, value]) => {
    const entry = (value || {}) as { items?: unknown };
    const raw = entry.items;
    if (raw == null) return;
    const list = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>);

    const items = list
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !!(i as any).objType)
      .map((i) => ({
        label: String(i.label || i.objType),
        objId: String(i.id ?? ''),
        objType: String(i.objType),
        iconPath: String(i.iconPath || ''),
        alias: String(i.alias || ''),
        shortcode: String(i.shortcode || ''),
        wfType: i.wfType ? String(i.wfType) : undefined,
      }));

    if (items.length) groups.push({ category, items });
  });

  return groups;
}

/** Place a new block to the right of `anchor`, or at a sensible default. */
export function placeNear(anchor: VizNode | null | undefined, index = 0): { x: number; y: number } {
  if (anchor?.position) {
    return {
      x: Math.round(anchor.position.x + 240),
      y: Math.round(anchor.position.y + index * 40),
    };
  }
  return { x: 120 + index * 40, y: 120 + index * 30 };
}
