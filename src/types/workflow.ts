/**
 * Shapes exchanged with the platform.
 *
 * These mirror the PHP session structure (`session('workflow')[workflowId]`)
 * that `/workflow.savesession` reads and `/workflow.save` commits to Mongo.
 * Field names are the platform's, not ours — do not rename them.
 */

/** Raw block properties as stored in Mongo (`w_objects[].block_properties`). */
export type BlockProperties = Record<string, unknown>;

/** One entry of the PHP session `w_objects` array. */
export interface SessionBlock {
  blockId: string;
  /** Block behaviour key, e.g. `condition`, `sendmail`, `executeworkflow`. */
  type: string;
  /** Palette id, or a child workflow's Mongo id for `executeworkflow`. */
  obj_id: string;
  /** CSS **top** — the axes are swapped relative to React Flow. See `graph/convert`. */
  xPos: string | number;
  /** CSS **left**. */
  yPos: string | number;
  block_properties?: BlockProperties | '';
  properties?: Record<string, unknown> | '';
  short_code?: string;
  obj_name?: string;
  iconPath?: string;
  iconClass?: string;
  reusable?: boolean;
  scheduler?: string;
  scheduled_interval?: string;
}

/** One entry of the PHP session `connection` array. */
export interface SessionConnection {
  conId: string;
  sourceId: string;
  targetId: string;
  /** Present when the source is a condition and this is the Yes branch. */
  targetYes?: string;
  /** Present when the source is a condition and this is the No branch. */
  targetNo?: string;
  properties?: Record<string, unknown>;
}

/** One selectable block in the left palette (`window.w_leftBlockArray`). */
export interface PaletteItem {
  label: string;
  objId: string;
  objType: string;
  iconPath: string;
  alias: string;
  shortcode: string;
  /** Reusable workflows are grouped separately by the platform. */
  wfType?: string;
}

export interface PaletteGroup {
  category: string;
  items: PaletteItem[];
}

/** Everything the canvas needs to render a workflow, assembled at bootstrap. */
export interface BootData {
  workflowId: string;
  workflowName: string;
  shortCode: string;
  /** Set when the URL pointed at an execution log rather than a workflow. */
  logId: string;
  blocks: SessionBlock[];
  connections: SessionConnection[];
  palette: PaletteGroup[];
  /** App short code the workflow is tagged to; drives palette scoping. */
  appShortCode: string;
  /**
   * Set when the canvas is showing a saved version rather than the live
   * workflow. The classic `/workflow.versiondebugger/{id}` page is read-only,
   * so this locks editing and reveals the "back to workflow" link.
   */
  version?: {
    versionId: string;
    createdAt: number;
    note: string;
    /** Empty when the parent workflow has since been deleted. */
    parentWorkflowId: string;
    parentName: string;
  };
}

/* -------------------------------------------------------------------------- */
/* React Flow node/edge payloads                                              */
/* -------------------------------------------------------------------------- */

export type RunStatus = 'ok' | 'failed' | 'skipped';

export interface BlockNodeData {
  blockId: string;
  objId: string;
  blockType: string;
  label: string;
  /** Human name from the palette, shown under the label. */
  displayName: string;
  description: string;
  iconPath: string;
  isCondition: boolean;
  isEntry: boolean;
  /** False until someone saves the block's settings at least once. */
  configured: boolean;
  shortcode?: string;
  reusable?: boolean;
  block_properties?: BlockProperties;
  properties?: Record<string, unknown>;

  /* Run/debug overlay */
  debug?: { status: RunStatus; executionTime?: string };
  debugActive?: boolean;
  debugDimmed?: boolean;

  /* Interaction state, injected by the canvas */
  pendingSource?: boolean;
  hasOutgoing?: boolean;
  /** Settings drawer's "show block descriptions" toggle (session-only). */
  showDescription?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopy?: (id: string) => void;
  onAddNext?: (id: string) => void;
  onOpenChild?: (id: string) => void;
}

export type EdgeBranch = 'yes' | 'no' | null;

export interface VizEdgeData {
  branch: EdgeBranch;
  /** True when the last run traversed this connection. */
  runTaken?: boolean;
  debugDimmed?: boolean;
  properties?: Record<string, unknown>;
  onDelete?: (id: string) => void;
}

/* -------------------------------------------------------------------------- */
/* Execution log (`/workflow/log.debugdata/{logId}`)                          */
/* -------------------------------------------------------------------------- */

export interface DebugBlockInfo {
  activityId?: string;
  block_type?: string;
  block_name?: string;
  block_label?: string;
  /** `"Yes"` / `"No"` — see `runStatus.ts`, casing is not stable. */
  completed?: string;
  execution_time?: string;
  /** Block id the engine moved to next; used to paint the taken path. */
  target?: string | number;
  data?: Record<string, unknown>;
}

export interface DebugSummary {
  workflow_log_id?: string | number;
  status?: string;
  execution_time?: string;
  [key: string]: unknown;
}

export interface DebugData {
  summary?: DebugSummary;
  blockInfo?: Record<string, DebugBlockInfo>;
}

/** One row of the classic "Recent logs" dropdown. */
export interface RecentLogRow {
  logid: string | number;
  date?: string;
  email?: string;
  status?: string;
}

/* -------------------------------------------------------------------------- */
/* Platform Ajax envelope                                                     */
/* -------------------------------------------------------------------------- */

export interface PlatformMessage {
  type: string;
  text: string;
}

export interface PlatformEnvelope {
  Body?: unknown;
  Result?: unknown;
  Actions?: { messages?: unknown; [key: string]: unknown };
  Refs?: Record<string, string>;
  [key: string]: unknown;
}
