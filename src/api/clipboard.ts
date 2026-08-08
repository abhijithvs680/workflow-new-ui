/**
 * Block clipboard, backed by the classic `workflow.favourite` controller.
 *
 * No platform change is involved — this is the same store the classic studio
 * uses for its "Add to Clipboard" action and its palette Clipboard group:
 *
 *   insert  POST mode=insert type=clipboard data=<json array> clone_wf_id=<src>
 *   list    POST mode=list   type=clipboard        -> { records: [...] }
 *   delete  POST mode=delete type=clipboard data=<json array>
 *
 * An entry is a **reference**, not a copy: `{source, obj_id}` points at a block
 * that still lives in its origin workflow. `Favourite::listClipboard()` drops
 * entries whose block no longer exists there, so a clipboard item can go stale
 * if the source block is deleted — that is the platform's own behaviour.
 *
 * Pasting is therefore an `objectInsert` carrying `blockOptr=clone`,
 * `blockParent=<obj_id>` and `clone_wf_id=<source>`, which copies the block's
 * properties across workflows. `session.addBlock` already speaks that shape.
 */
import { postForm } from './http';
import type { PlatformEnvelope } from '@/types/workflow';

const URL = '/workflow.favourite';

export interface ClipboardEntry {
  /** Workflow the block lives in — `clone_wf_id` when pasting. */
  source: string;
  /** Block id within that workflow — `blockParent` when pasting. */
  obj_id: string;
  /** Block type, so the palette can render an icon without a lookup. */
  type: string;
  label: string;
  iconPath: string;
  /**
   * Stable id for the entry. The classic reducer de-duplicates on this, so a
   * block copied twice replaces rather than doubles.
   */
  clone_id: string;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function toEntry(raw: unknown): ClipboardEntry | null {
  const r = asRecord(raw);
  const source = String(r.source ?? '');
  const objId = String(r.obj_id ?? '');
  if (!source || !objId) return null;
  return {
    source,
    obj_id: objId,
    type: String(r.type ?? ''),
    label: String(r.label ?? objId),
    iconPath: String(r.iconPath ?? ''),
    clone_id: String(r.clone_id ?? `${source}:${objId}`),
  };
}

export const clipboardApi = {
  async list(): Promise<ClipboardEntry[]> {
    const res = await postForm<PlatformEnvelope>(URL, { mode: 'list', type: 'clipboard' });
    // postForm resolves to the parsed envelope, or the raw text when the reply
    // is not JSON — only the object form carries records.
    const body = res && typeof res === 'object' ? (res as Record<string, unknown>) : {};
    // The controller assigns `$this['records']`, which the ajax envelope nests
    // under `Body`; tolerate either shape.
    const inner = asRecord(body.Body);
    const records = (Array.isArray(body.records) && body.records) ||
      (Array.isArray(inner.records) && inner.records) ||
      [];
    return (records as unknown[]).map(toEntry).filter((e): e is ClipboardEntry => !!e);
  },

  /**
   * Append to the clipboard. `clone_wf_id` mirrors the classic reducer.
   *
   * Takes an array because that is the wire shape, but the controller keeps
   * only `[0]` — so pass exactly one entry.
   */
  add(entries: ClipboardEntry[]) {
    if (!entries.length) return Promise.resolve(null);
    return postForm<PlatformEnvelope>(URL, {
      mode: 'insert',
      type: 'clipboard',
      data: JSON.stringify(entries),
      clone_wf_id: entries[0].source,
    });
  },

  /** The classic "Clear All" — the controller empties the whole clipboard. */
  clear() {
    return postForm<PlatformEnvelope>(URL, {
      mode: 'delete',
      type: 'clipboard',
      data: JSON.stringify([]),
    });
  },
};
