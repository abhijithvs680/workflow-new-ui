/**
 * Canvas mutations — the `/workflow.savesession` event API.
 *
 * Every edit writes to the PHP session first; `/workflow.save` later commits
 * that session to Mongo. This is exactly what the classic jsPlumb canvas does,
 * so a workflow edited here opens correctly in the classic debugger and vice
 * versa.
 *
 * The session is keyed by workflow id and is seeded by loading a debugger page
 * (see `api/bootstrap`). Posting here before that seed silently creates a
 * *partial* session entry, which is why bootstrap must always run first.
 */
import { postForm, type FormValue } from './http';

const SESSION_URL = '/workflow.savesession';

/** `con_id` is `source-target` everywhere in the platform. */
export function connectionId(source: string, target: string): string {
  return `${source}-${target}`;
}

export interface NewBlock {
  blockId: string;
  objId: string;
  type: string;
  iconPath?: string;
  /** React Flow coordinates; converted to the session's swapped axes here. */
  x: number;
  y: number;
  /** Set to copy another block's properties (clipboard paste equivalent). */
  cloneFrom?: string;
  cloneWorkflowId?: string;
}

export const session = {
  addBlock(workflowId: string, block: NewBlock) {
    const params: Record<string, FormValue> = {
      eventType: 'objectInsert',
      workflow_id: workflowId,
      blockId: block.blockId,
      id: block.objId,
      function_type: block.type,
      iconPath: block.iconPath || '',
      // xPos is CSS top, yPos is CSS left — swapped relative to React Flow.
      xPos: Math.round(block.y),
      yPos: Math.round(block.x),
    };
    if (block.cloneFrom) {
      params.blockOptr = 'clone';
      params.blockParent = block.cloneFrom;
      params.clone_wf_id = block.cloneWorkflowId || workflowId;
    }
    return postForm(SESSION_URL, params);
  },

  deleteBlock(workflowId: string, blockId: string) {
    return postForm(SESSION_URL, {
      eventType: 'objectDelete',
      workflow_id: workflowId,
      blockId,
    });
  },

  moveBlock(workflowId: string, blockId: string, x: number, y: number) {
    return postForm(SESSION_URL, {
      eventType: 'objectDrag',
      workflow_id: workflowId,
      blockId,
      xPos: Math.round(y),
      yPos: Math.round(x),
    });
  },

  connect(workflowId: string, source: string, target: string, conditionType: '' | 'yes' | 'no') {
    return postForm(SESSION_URL, {
      eventType: 'connectionInsert',
      workflow_id: workflowId,
      source,
      target,
      con_id: connectionId(source, target),
      condition_type: conditionType || '',
    });
  },

  disconnect(workflowId: string, conId: string) {
    return postForm(SESSION_URL, {
      eventType: 'connectionDelete',
      workflow_id: workflowId,
      con_id: conId,
    });
  },

  rename(workflowId: string, blockId: string, label: string) {
    return postForm(SESSION_URL, {
      eventType: 'blkNameUpdate',
      workflow_id: workflowId,
      sourceId: blockId,
      label,
    });
  },

  changeIcon(workflowId: string, blockId: string, iconPath: string) {
    return postForm(SESSION_URL, {
      eventType: 'changeBlockIcon',
      workflow_id: workflowId,
      blockId,
      iconPath,
    });
  },

  /**
   * Persist a block's settings.
   *
   * `fields` must use the platform's own input names: the PHP handler copies
   * unknown keys straight into `block_properties` and only special-cases a few
   * block types. Renaming a field here silently drops it at runtime.
   */
  saveBlockProperties(
    workflowId: string,
    blockId: string,
    blockType: string,
    fields: Record<string, FormValue>,
  ) {
    return postForm(SESSION_URL, {
      ...fields,
      eventType: 'customblockPropInsert',
      workflow_id: workflowId,
      workflowId,
      sourceId: blockId,
      blockType,
    });
  },

  /** Connection field mapping (sendmail and other mapped targets). */
  saveConnectionProperties(
    workflowId: string,
    sourceId: string,
    targetId: string,
    connectionAction: 'SENDMAIL' | 'READ',
    fields: Record<string, FormValue>,
  ) {
    return postForm(SESSION_URL, {
      ...fields,
      eventType: 'connectionPropInsert',
      workflow_id: workflowId,
      workflowId,
      sourceId,
      targetId,
      connection_action: connectionAction,
    });
  },
};
