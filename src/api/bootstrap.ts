/**
 * Assemble the canvas boot payload from endpoints the production platform
 * already serves — no PHP changes, no new controller.
 *
 * Three read-only GETs, all of them pages the classic canvas itself requests:
 *
 *  1. `/workflow.debugger/{idOrShortCode}`
 *       Full page. Yields the resolved Mongo id, name, short code and the
 *       palette (`window.w_leftBlockArray`).
 *  2. `/workflow.debugger/{workflowId}/isChild/`
 *       `content.tpl` fragment. Yields blocks (position, type, icon, label,
 *       description) and connections (from the jsPlumb `connect()` calls).
 *  3. `/workflow.settings/{shortCode}/json`
 *       Full `w_objects` including `block_properties`, used to hydrate the
 *       settings dialogs and the "configured" badge. Optional — a failure here
 *       degrades the badge only.
 *
 * Requests 1 and 2 also re-seed the PHP `workflow` session, which every
 * `/workflow.savesession` call depends on. That side effect is the reason this
 * module fetches pages rather than reaching for a leaner endpoint.
 */
import { getHtml, PlatformError } from './http';
import type {
  BlockProperties,
  BootData,
  PaletteGroup,
  SessionBlock,
  SessionConnection,
} from '@/types/workflow';
import { flattenPalette } from '@/graph/convert';

/* -------------------------------------------------------------------------- */
/* Low-level extraction helpers                                               */
/* -------------------------------------------------------------------------- */

/**
 * Pull a balanced `{…}` or `[…]` literal that follows `marker`.
 *
 * A greedy regex is not safe here: the palette JSON contains braces inside
 * workflow names, so we count depth and respect string quoting.
 */
export function extractJsonAfter(source: string, marker: string): string | null {
  const at = source.indexOf(marker);
  if (at === -1) return null;

  let i = at + marker.length;
  while (i < source.length && /[\s=]/.test(source[i])) i += 1;

  const open = source[i];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let quote: string | null = null;
  for (let j = i; j < source.length; j += 1) {
    const ch = source[j];
    if (quote) {
      if (ch === '\\') {
        j += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(i, j + 1);
    }
  }
  return null;
}

function parseJsonAfter<T>(source: string, marker: string): T | null {
  const raw = extractJsonAfter(source, marker);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** `vizWorkflow.id = "abc";` -> `abc` */
function matchAssignedString(source: string, pattern: RegExp): string {
  const m = source.match(pattern);
  return m ? m[1] : '';
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/* -------------------------------------------------------------------------- */
/* 1 — full debugger page                                                     */
/* -------------------------------------------------------------------------- */

interface ShellInfo {
  workflowId: string;
  shortCode: string;
  workflowName: string;
  appShortCode: string;
  palette: PaletteGroup[];
  /** True when the page rendered the read-only log view (no palette markup). */
  isLogView: boolean;
}

export function parseDebuggerShell(html: string): ShellInfo {
  const workflowId = matchAssignedString(html, /vizWorkflow\.id\s*=\s*"([^"]*)"/);
  const shortCode = matchAssignedString(html, /vizWorkflow\.shortcode\s*=\s*"([^"]*)"/);
  const appShortCode = matchAssignedString(html, /window\.wf_App_Shrtcode\s*=\s*"([^"]*)"/);

  const doc = parseHtml(html);
  const nameInput = doc.querySelector<HTMLInputElement>('#wrkflw_name');
  const editTemp = doc.querySelector<HTMLInputElement>('#edit_temp');

  const raw = parseJsonAfter<Record<string, unknown>>(html, 'window.w_leftBlockArray');
  const palette = raw ? flattenPalette(raw) : [];

  return {
    workflowId: workflowId || editTemp?.value || '',
    shortCode,
    workflowName: nameInput?.getAttribute('value') || '',
    appShortCode,
    palette,
    // The log view hides the toolbar form (and therefore the palette).
    isLogView: !nameInput,
  };
}

/* -------------------------------------------------------------------------- */
/* 2 — canvas fragment                                                        */
/* -------------------------------------------------------------------------- */

const ANCHORS = ['RightMiddle', 'BottomCenter', 'LeftMiddle', 'TopCenter'] as const;

function stripAnchor(uuid: string, canvasId: string): { blockId: string; anchor: string } | null {
  const prefix = `${canvasId}_`;
  if (!uuid.startsWith(prefix)) return null;
  const rest = uuid.slice(prefix.length);
  for (const anchor of ANCHORS) {
    if (rest.endsWith(anchor)) {
      return { blockId: rest.slice(0, -anchor.length), anchor };
    }
  }
  return null;
}

function pxValue(style: string, prop: 'left' | 'top'): string {
  const m = style.match(new RegExp(`${prop}\\s*:\\s*(-?[\\d.]+)`));
  return m ? m[1] : '0';
}

/**
 * `content.tpl` also emits a JS array carrying each block's `shortcode`, which
 * the DOM omits for reusable workflows. Values there are plain double-quoted
 * strings, so a per-entry scan is safe.
 */
function parseShortcodeMap(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  const arrayText = extractJsonAfter(html, 'vizWorkflow["blocks"]');
  const source = arrayText ?? html;
  const entry = /obj_id\s*:\s*"([^"]*)"[\s\S]*?shortcode\s*:\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(source)) !== null) {
    if (m[1] && m[2]) map[m[1]] = m[2];
  }
  return map;
}

export function parseCanvasFragment(
  html: string,
  canvasId: string,
): { blocks: SessionBlock[]; connections: SessionConnection[] } {
  const doc = parseHtml(html);
  const shortcodes = parseShortcodeMap(html);

  const blocks: SessionBlock[] = [];
  doc.querySelectorAll<HTMLElement>('li.window[data-blockid]').forEach((el) => {
    const blockId = el.getAttribute('data-blockid') || '';
    const type = el.getAttribute('data-type') || '';
    if (!blockId || !type) return;

    const style = el.getAttribute('style') || '';
    const childLink = el.querySelector<HTMLElement>('.open-child-workflow');
    const objName = el.querySelector('.wLabel')?.textContent?.trim() || '';
    const label = el.querySelector('.wLabel2 b')?.textContent?.trim() || '';
    const note = el.querySelector('.workflowNote');
    const description = note?.classList.contains('hasWorkflowNote')
      ? note.querySelector('.popover-content p')?.textContent?.trim() || ''
      : '';

    const block: SessionBlock = {
      blockId,
      type,
      obj_id: el.getAttribute('data-original-title') || blockId.split('_')[0],
      // style.left is the session's yPos, style.top its xPos — the axes are
      // swapped platform-wide. `graph/convert` is the only place that unswaps.
      yPos: pxValue(style, 'left'),
      xPos: pxValue(style, 'top'),
      obj_name: objName,
      iconPath: el.querySelector<HTMLImageElement>('img.blockImg')?.getAttribute('src') || '',
      short_code: childLink?.getAttribute('data-id') || shortcodes[blockId] || '',
      block_properties: {
        ...(label ? { label } : {}),
        ...(description ? { description } : {}),
      },
      // The template omits the "open child" action for reusable workflows.
      reusable: type === 'executeworkflow' && !childLink,
    };
    blocks.push(block);
  });

  const typeById = new Map(blocks.map((b) => [b.blockId, b.type]));
  const connections: SessionConnection[] = [];
  const seen = new Set<string>();

  // Match jsPlumb connect calls with either single- or double-quoted UUIDs.
  // The platform template may output either quote style, and quotes may be
  // backslash-escaped when the HTML was carried inside a JSON envelope.
  const connectCall = /uuids\s*:\s*\[\s*(?:'|\\?"|&#0?39;)([^'"\]\\]+)(?:'|\\?"|&#0?39;)\s*,\s*(?:'|\\?"|&#0?39;)([^'"\]\\]+)(?:'|\\?"|&#0?39;)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = connectCall.exec(html)) !== null) {
    const from = stripAnchor(m[1], canvasId);
    const to = stripAnchor(m[2], canvasId);
    if (!from || !to) continue;

    const conId = `${from.blockId}-${to.blockId}`;
    if (seen.has(conId)) continue;
    seen.add(conId);

    const con: SessionConnection = {
      conId,
      sourceId: from.blockId,
      targetId: to.blockId,
    };
    // Conditions branch by anchor: BottomCenter is No, RightMiddle is Yes.
    if (typeById.get(from.blockId) === 'condition') {
      if (from.anchor === 'BottomCenter') con.targetNo = to.blockId;
      else con.targetYes = to.blockId;
    }
    connections.push(con);
  }

  return { blocks, connections };
}

/* -------------------------------------------------------------------------- */
/* 3 — stored block properties                                                */
/* -------------------------------------------------------------------------- */

interface MongoWObject {
  id?: string;
  type?: string;
  obj_id?: string;
  short_code?: string;
  block_properties?: BlockProperties;
  properties?: Record<string, unknown>;
}

/** `/workflow.settings/{shortCode}/json` renders the raw `w_objects` array. */
export function parseStoredProperties(html: string): Map<string, MongoWObject> {
  const list = parseJsonAfter<MongoWObject[]>(html, '$("#json-preview").JSONView(');
  const map = new Map<string, MongoWObject>();
  if (!Array.isArray(list)) return map;
  list.forEach((w) => {
    if (w && w.id) map.set(String(w.id), w);
  });
  return map;
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                              */
/* -------------------------------------------------------------------------- */

const NUMERIC = /^\d+$/;
/** A Mongo ObjectId: exactly 24 hex characters. A short code can also be 24
 *  characters long, so length alone never distinguishes them. */
const OBJECT_ID = /^[a-f0-9]{24}$/i;

async function fetchShell(param: string): Promise<ShellInfo> {
  const html = await getHtml(`/workflow.debugger/${encodeURIComponent(param)}`);
  return parseDebuggerShell(html);
}

/**
 * Load everything the canvas needs for `param`, which may be a Mongo id, a
 * short code, or an execution log id — all three keep working in the URL.
 *
 * What the URL accepts and what the controllers accept are two different
 * things, so the boot payload carries **both** identifiers and each call site
 * uses the one its endpoint expects:
 *
 *   id only        `workflow.save` — `new ObjectId($workflow_id)`
 *   id only        `workflow.savesession`, `workflow.reactconnection` — these
 *                  key into the PHP session bucket, which `Debugger.php` seeds
 *                  under whatever parameter the shell was fetched with
 *   short code     `workflow.version` (`short_code`)
 *   short code     `workflow.settings/{sc}/json` — `loadWorkflowByShortcode`
 *                  with no id fallback
 *   either         `workflow.debugger`, `workflow.reactinfo`, `workflow.init`,
 *                  `workflow.settings/{wid}`, `workflow.tags`
 *
 * The session-keyed group is why a short-code URL is resolved to the id and the
 * shell re-fetched with it: the bucket holds the workflow's existing blocks, so
 * writing under a different key would drop every edit to them at save time.
 */
export async function loadWorkflow(param: string): Promise<BootData> {
  const trimmed = String(param || '').trim();
  if (!trimmed) {
    throw new PlatformError('No workflow was specified in the URL.', 400);
  }

  let logId = '';
  let shell = await fetchShell(trimmed);

  if (!shell.workflowId) {
    throw new PlatformError(
      `Workflow "${trimmed}" was not found, or you do not have access to it.`,
      404,
    );
  }

  // A numeric parameter is an execution log; the shell resolves it to the
  // owning workflow but renders the read-only view, so re-fetch by real id to
  // get the palette and the editable toolbar state.
  if (NUMERIC.test(trimmed) && shell.workflowId !== trimmed) {
    logId = trimmed;
    shell = await fetchShell(shell.workflowId);
  }

  let workflowId = shell.workflowId;

  const reactInfoHtml = await getHtml(`/workflow.reactinfo/${encodeURIComponent(workflowId)}`);
  let reactInfo: any = {};
  try {
    reactInfo = JSON.parse(reactInfoHtml);
  } catch (e) {
    // fallback if endpoint not deployed yet or returns error
    reactInfo = { blocks: [], connections: [] };
  }

  /**
   * Normalise to the Mongo id.
   *
   * `Debugger.php` sets `vizWorkflow.id` to the **raw URL parameter**
   * (`$workflowId = $param[0]`), so opening by short code leaves that id as the
   * short code — and it then travels to `workflow.save` as `workflow_id`.
   * `Save.php` guards with `strlen($savedWrkflwid) >= 24` before calling
   * `new ObjectId(...)`, which a 24-character short code passes, so the save
   * dies with "Error parsing ObjectId string".
   *
   * `Reactinfo` resolves either form to `(string) $wrkflwObj['_id']`, so take
   * the id from there. The shell must then be re-fetched with it, because
   * `Debugger.php` also seeds the PHP session under whatever param it was given
   * (`session_set('workflow[' . $workflowId . ']', '')`) and every
   * `savesession` write is keyed by the id the canvas posts.
   */
  const resolvedId = String(reactInfo.workflowId || '');
  if (OBJECT_ID.test(resolvedId) && resolvedId !== workflowId) {
    shell = await fetchShell(resolvedId);
    workflowId = resolvedId;
  }

  const shortCode = String(reactInfo.shortCode || shell.shortCode || '');
  const blocks: SessionBlock[] = Array.isArray(reactInfo.blocks) ? reactInfo.blocks : [];
  const connections: SessionConnection[] = Array.isArray(reactInfo.connections) ? reactInfo.connections : [];

  return {
    workflowId,
    workflowName: shell.workflowName,
    shortCode,
    appShortCode: shell.appShortCode,
    logId,
    blocks,
    connections,
    palette: shell.palette,
  };
}

/**
 * Boot the canvas from a saved version.
 *
 * The React equivalent of `/workflow.versiondebugger/{id}`, which is the classic
 * debugger with `Workflowversion` swapped in for `Workflow`. No shell page is
 * fetched: a version is read-only, so it needs neither the block palette nor the
 * session re-seed that the live canvas depends on — and skipping it keeps the
 * viewer from touching the parent workflow's session at all.
 */
export async function loadWorkflowVersion(versionId: string): Promise<BootData> {
  const raw = await getHtml(`/workflow.reactinfo/version/${encodeURIComponent(versionId)}`);

  let info: Record<string, unknown>;
  try {
    info = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new PlatformError('The saved version could not be read.');
  }
  if (info.error) throw new PlatformError(String(info.error));

  return {
    workflowId: String(info.workflowId || versionId),
    workflowName: String(info.workflowName || 'Workflow version'),
    shortCode: String(info.shortCode || ''),
    appShortCode: '',
    logId: '',
    blocks: Array.isArray(info.blocks) ? (info.blocks as SessionBlock[]) : [],
    connections: Array.isArray(info.connections) ? (info.connections as SessionConnection[]) : [],
    palette: [],
    version: {
      versionId: String(info.versionId || versionId),
      createdAt: Number(info.versionCreatedAt || 0),
      note: String(info.versionNote || ''),
      parentWorkflowId: String(info.parentWorkflowId || ''),
      parentName: String(info.parentName || ''),
    },
  };
}

/** Re-read the graph without a full remount (used after Arrange / external edits). */
export async function reloadGraph(
  workflowId: string,
): Promise<{ blocks: SessionBlock[]; connections: SessionConnection[] }> {
  const reactInfoHtml = await getHtml(`/workflow.reactinfo/${encodeURIComponent(workflowId)}`);
  try {
    const reactInfo = JSON.parse(reactInfoHtml);
    return {
      blocks: Array.isArray(reactInfo.blocks) ? reactInfo.blocks : [],
      connections: Array.isArray(reactInfo.connections) ? reactInfo.connections : []
    };
  } catch {
    return { blocks: [], connections: [] };
  }
}
