import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  ConnectionLineType,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { errorText, platformMessages, platformSaveOk } from './api/http';
import { reloadGraph } from './api/bootstrap';
import { session } from './api/session';
import { workflowApi } from './api/workflow';
import { AutoSuggestionProvider } from './contexts/AutoSuggestionContext';
import type { BootData, DebugData, PaletteItem, SessionConnection } from './types/workflow';
import {
  EDGE_COLORS,
  branchOf,
  buildEdge,
  connectionError,
  nextBlockId,
  placeNear,
  toEdges,
  toNodes,
  type VizEdgeType,
  type VizNode,
} from './graph/convert';
import { layout } from './graph/autolayout';
import { blockRunStatus } from './lib/runStatus';

import BlockNode, { nodeSkin } from './components/canvas/BlockNode';
import VizEdge from './components/canvas/VizEdge';
import Toolbar from './components/Toolbar';
import Palette, { BLOCK_DND_TYPE } from './components/Palette';
import DebugPanel from './components/DebugPanel';
import RunDialog from './components/RunDialog';
import WorkflowSettings from './components/WorkflowSettings';
import BlockSettingsDialog from './components/settings/BlockSettingsDialog';
import { ToastStack, useToasts } from './components/ui/feedback';

const nodeTypes = { vizBlock: BlockNode };
const edgeTypes = { vizEdge: VizEdge };

// Keys match the `skin-*` classes from nodeSkin() / studio.css.
const MINIMAP_COLORS: Record<string, string> = {
  dark: '#1e293b',
  condition: '#f97316',
  output: '#0f172a',
  sheet: '#16a34a',
  filter: '#059669',
  file: '#d97706',
  math: '#7c3aed',
  workflow: '#4f46e5',
  action: '#2563eb',
  ai: '#f97316',
  custom: '#475569',
  task: '#64748b',
};

interface StudioProps {
  boot: BootData;
  onReloadRequested: () => void;
}

function Canvas({ boot, onReloadRequested }: StudioProps) {
  const { workflowId, shortCode } = boot;

  const [nodes, setNodes] = useState<VizNode[]>(() => toNodes(boot.blocks, boot.palette));
  const [edges, setEdges] = useState<VizEdgeType[]>(() => toEdges(boot.connections, boot.blocks));
  const [connectionProps, setConnectionProps] = useState<Map<string, Record<string, unknown>>>(
    () => connectionPropertyMap(boot.connections),
  );

  const [workflowName, setWorkflowName] = useState(boot.workflowName);
  const [autoSuggestions, setAutoSuggestions] = useState<string[]>([]);
  
  // The classic canvas opens read-only; Edit is what reveals Save.
  // A saved version has no editable state at all — there is nothing to save it
  // back to — so `editing` can never leave `false` there.
  const isVersion = !!boot.version;
  const [editing, setEditingState] = useState(false);
  const setEditing = useCallback(
    (next: boolean) => setEditingState(isVersion ? false : next),
    [isVersion],
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  // Classic's "Show descriptions on all stencil blocks" toggle — a pure
  // client-side view option, not persisted server-side there either.
  const [showBlockInfo, setShowBlockInfo] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [canvasInteraction, setCanvasInteraction] = useState(0);
  const [run, setRun] = useState<DebugData | null>(null);

  const { toasts, notify, dismiss } = useToasts();
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Refs let the async persistence callbacks read current state without
  // re-creating every handler on each render.
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  /* ---------------------------------------------------------------------- */
  /* Persistence helpers                                                     */
  /* ---------------------------------------------------------------------- */

  /** Run a session write, mark the canvas dirty, and surface failures. */
  const persist = useCallback(
    async (fn: () => Promise<unknown>, failure: string): Promise<boolean> => {
      try {
        await fn();
        setDirty(true);
        return true;
      } catch (e) {
        notify(errorText(e, failure), 'error');
        return false;
      }
    },
    [notify],
  );

  const requireEditing = useCallback((): boolean => {
    if (editing) return true;
    notify('Click Edit before changing this workflow.', 'error');
    return false;
  }, [editing, notify]);

  /* ---------------------------------------------------------------------- */
  /* Node actions                                                            */
  /* ---------------------------------------------------------------------- */

  const openSettings = useCallback((blockId: string) => {
    setSettingsFor(blockId);
  }, []);

  const deleteNode = useCallback(
    async (blockId: string) => {
      if (!requireEditing()) return;
      const node = nodesRef.current.find((n) => n.id === blockId);
      if (!node) return;
      if (!window.confirm(`Delete block “${node.data.label}”?`)) return;

      setNodes((list) => list.filter((n) => n.id !== blockId));
      setEdges((list) => list.filter((e) => e.source !== blockId && e.target !== blockId));
      if (selected === blockId) setSelected(null);
      await persist(() => session.deleteBlock(workflowId, blockId), 'Could not delete the block.');
    },
    [notify, persist, requireEditing, selected, workflowId],
  );

  const cloneNode = useCallback(
    async (blockId: string) => {
      if (!requireEditing()) return;
      const source = nodesRef.current.find((n) => n.id === blockId);
      if (!source) return;

      const position = placeNear(source);
      const newId = nextBlockId(nodesRef.current.map((n) => n.id), source.data.objId);
      const node: VizNode = {
        id: newId,
        type: 'vizBlock',
        position,
        data: {
          ...source.data,
          blockId: newId,
          label: `${source.data.label} copy`,
          configured: false,
          isEntry: false,
          pendingSource: false,
          debug: undefined,
        },
      };

      setNodes((list) => [...list, node]);
      setSelected(newId);
      await persist(
        () =>
          session.addBlock(workflowId, {
            blockId: newId,
            objId: source.data.objId,
            type: source.data.blockType,
            iconPath: source.data.iconPath,
            x: position.x,
            y: position.y,
            cloneFrom: source.id,
            cloneWorkflowId: workflowId,
          }),
        'Could not clone the block.',
      );
    },
    [persist, requireEditing, workflowId],
  );

  const openChild = useCallback(
    (blockId: string) => {
      const node = nodesRef.current.find((n) => n.id === blockId);
      if (!node) return;
      // `executeworkflow` stores the child workflow's Mongo id as obj_id.
      const childId = node.data.shortcode || node.data.objId;
      if (!childId) {
        notify('This block has no child workflow linked yet. Configure it first.', 'error');
        return;
      }
      // History routing: the child opens at the app's own path, not a hash.
      window.open(`/workflow/debugger/${encodeURIComponent(childId)}`, '_blank', 'noopener');
    },
    [notify],
  );

  const addNext = useCallback(
    (blockId: string) => {
      if (!requireEditing()) return;
      setPendingSourceId(blockId);
      setPaletteOpen(true);
      setSelected(blockId);
      notify('Pick a block from the palette to add and connect it.');
    },
    [notify, requireEditing],
  );

  const selectBlock = useCallback((id: string | null) => {
    setSelected(id == null || id === '' ? null : String(id));
    setSelectedEdge(null);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Decorated graph                                                         */
  /* ---------------------------------------------------------------------- */

  const decoratedNodes = useMemo<VizNode[]>(() => {
    const outgoing = new Set(edges.map((e) => e.source));
    const logOpen = !!run;

    return nodes.map((n) => {
      const executed = !!n.data.debug;
      // While a run is open, blocks that never executed recede so the taken
      // path is legible at a glance.
      const dimmed = logOpen && !executed;
      return {
        ...n,
        selected: !dimmed && selected === n.id,
        selectable: !dimmed,
        draggable: editing && !dimmed && !logOpen,
        connectable: editing && !dimmed && !logOpen,
        data: {
          ...n.data,
          pendingSource: !dimmed && pendingSourceId === n.id,
          debugDimmed: dimmed,
          debugActive: logOpen && !dimmed && selected === n.id && executed,
          hasOutgoing: outgoing.has(n.id),
          showDescription: showBlockInfo,
          onEdit: dimmed ? undefined : openSettings,
          onDelete: dimmed ? undefined : deleteNode,
          onClone: dimmed ? undefined : cloneNode,
          onAddNext: dimmed ? undefined : addNext,
          onOpenChild: dimmed ? undefined : openChild,
        },
      };
    });
  }, [nodes, edges, run, selected, editing, pendingSourceId, showBlockInfo, openSettings, deleteNode, cloneNode, addNext, openChild]);

  const deleteEdge = useCallback(
    (edgeId: string) => {
      if (!requireEditing()) return;
      setEdges((list) => list.filter((e) => e.id !== edgeId));
      setSelectedEdge(null);
      void persist(() => session.disconnect(workflowId, edgeId), 'Could not delete the connection.');
    },
    [persist, requireEditing, workflowId],
  );

  const decoratedEdges = useMemo<VizEdgeType[]>(
    () =>
      edges.map((e) => {
        const runTaken = !!e.data?.runTaken;
        const dimmed = !!run && !runTaken;
        const branch = e.data?.branch ?? null;
        const color = runTaken ? EDGE_COLORS.taken : EDGE_COLORS[branch ?? 'plain'];
        return {
          ...e,
          type: 'vizEdge',
          selected: !dimmed && e.id === selectedEdge,
          selectable: !dimmed,
          className: [
            branch ? `viz-edge viz-edge-${branch}` : 'viz-edge',
            runTaken ? 'is-debug-executed' : '',
            dimmed ? 'is-debug-dim' : '',
          ]
            .filter(Boolean)
            .join(' '),
          style: { stroke: color, strokeWidth: runTaken ? 3.5 : 1.5, opacity: dimmed ? 0.22 : 1 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: runTaken ? 16 : 14,
            height: runTaken ? 16 : 14,
            color,
          },
          data: {
            ...(e.data || { branch: null }),
            onDelete: dimmed || !editing ? undefined : deleteEdge,
            runTaken,
            debugDimmed: dimmed,
          },
        };
      }),
    [edges, run, selectedEdge, editing, deleteEdge],
  );

  /* ---------------------------------------------------------------------- */
  /* React Flow handlers                                                     */
  /* ---------------------------------------------------------------------- */

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // The entry block must survive even if React Flow emits a remove for it.
    const safe = changes.filter((c) => {
      if (c.type !== 'remove') return true;
      return !nodesRef.current.find((n) => n.id === c.id)?.data.isEntry;
    });
    if (safe.length) setNodes((list) => applyNodeChanges(safe, list) as VizNode[]);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((list) => applyEdgeChanges(changes, list) as VizEdgeType[]);
  }, []);

  // React Flow reports a drag for a plain click too. Comparing against the
  // start position keeps a click from marking the workflow unsaved.
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const onNodeDragStart = useCallback((_e: React.MouseEvent, node: VizNode) => {
    dragStart.current = { ...node.position };
  }, []);

  const onNodeDragStop = useCallback(
    (_e: React.MouseEvent, node: VizNode) => {
      const from = dragStart.current;
      dragStart.current = null;
      if (from && Math.abs(from.x - node.position.x) < 1 && Math.abs(from.y - node.position.y) < 1) {
        return;
      }
      void persist(
        () => session.moveBlock(workflowId, node.id, node.position.x, node.position.y),
        'Could not save the new position.',
      );
    },
    [persist, workflowId],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      const problem = connectionError(
        { source: params.source, target: params.target, sourceHandle: params.sourceHandle },
        nodesRef.current,
        edgesRef.current,
      );
      if (problem) {
        notify(problem, 'error');
        return;
      }

      const source = nodesRef.current.find((n) => n.id === params.source);
      const branch = branchOf(source, params.sourceHandle);
      setEdges((list) =>
        addEdge(
          buildEdge(
            { source: params.source!, target: params.target!, sourceHandle: params.sourceHandle, targetHandle: 'in' },
            branch || null,
          ),
          list,
        ) as VizEdgeType[],
      );
      void persist(
        () => session.connect(workflowId, params.source!, params.target!, branch),
        'Could not save the connection.',
      );
    },
    [notify, persist, workflowId],
  );

  const onNodesDelete = useCallback(
    (removed: VizNode[]) => {
      const doomed = removed;
      if (!doomed.length) return;

      const names = doomed.map((n) => n.data.label).join(', ');
      if (!window.confirm(`Delete ${doomed.length > 1 ? 'these blocks' : 'block'} (${names})?`)) {
        // React Flow already removed them from controlled state — put them back.
        setNodes((list) => {
          const have = new Set(list.map((n) => n.id));
          return [...list, ...doomed.filter((n) => !have.has(n.id))];
        });
        return;
      }

      doomed.forEach((n) => {
        void persist(() => session.deleteBlock(workflowId, n.id), 'Could not delete the block.');
      });
      const ids = new Set(doomed.map((n) => n.id));
      setEdges((list) => list.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    },
    [notify, persist, workflowId],
  );

  const onEdgesDelete = useCallback(
    (removed: VizEdgeType[]) => {
      removed.forEach((e) => {
        void persist(() => session.disconnect(workflowId, e.id), 'Could not delete the connection.');
      });
      setSelectedEdge(null);
    },
    [persist, workflowId],
  );

  /* ---------------------------------------------------------------------- */
  /* Adding blocks                                                           */
  /* ---------------------------------------------------------------------- */

  const createBlock = useCallback(
    async (item: PaletteItem, position: { x: number; y: number }, connectFromId: string | null) => {
      const blockId = nextBlockId(nodesRef.current.map((n) => n.id), item.objId);
      const node: VizNode = {
        id: blockId,
        type: 'vizBlock',
        position,
        data: {
          blockId,
          objId: item.objId,
          blockType: item.objType,
          label: item.label,
          displayName: item.label,
          description: '',
          iconPath: item.iconPath,
          isCondition: item.objType === 'condition',
          isEntry: false,
          configured: false,
          shortcode: item.shortcode,
        },
      };

      setNodes((list) => [...list, node]);
      setSelected(blockId);

      const ok = await persist(
        () =>
          session.addBlock(workflowId, {
            blockId,
            objId: item.objId,
            type: item.objType,
            iconPath: item.iconPath,
            x: position.x,
            y: position.y,
          }),
        'Could not add the block.',
      );
      if (!ok) {
        setNodes((list) => list.filter((n) => n.id !== blockId));
        return null;
      }

      if (connectFromId) {
        const source = nodesRef.current.find((n) => n.id === connectFromId);
        const existing = edgesRef.current.filter((e) => e.source === connectFromId);

        let sourceHandle = 'out';
        let branch: '' | 'yes' | 'no' = '';
        if (source?.data.isCondition) {
          const hasYes = existing.some((e) => e.data?.branch === 'yes');
          const hasNo = existing.some((e) => e.data?.branch === 'no');
          if (!hasYes) {
            sourceHandle = 'yes';
            branch = 'yes';
          } else if (!hasNo) {
            sourceHandle = 'no';
            branch = 'no';
          } else {
            notify('Both the Yes and No branches are already connected.', 'error');
            return blockId;
          }
        } else if (existing.length > 0) {
          notify('That block already has an outgoing connection.', 'error');
          return blockId;
        }

        const params = { source: connectFromId, target: blockId, sourceHandle, targetHandle: 'in' };
        const problem = connectionError(params, [...nodesRef.current, node], edgesRef.current);
        if (problem) {
          notify(problem, 'error');
          return blockId;
        }

        setEdges((list) => addEdge(buildEdge(params, branch || null), list) as VizEdgeType[]);
        await persist(
          () => session.connect(workflowId, connectFromId, blockId, branch),
          'Block added, but the connection could not be saved.',
        );
      }

      return blockId;
    },
    [notify, persist, workflowId],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!requireEditing()) return;
      const raw = event.dataTransfer.getData(BLOCK_DND_TYPE);
      if (!raw) return;

      let item: PaletteItem;
      try {
        item = JSON.parse(raw) as PaletteItem;
      } catch {
        return;
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      void createBlock(item, position, pendingSourceId);
      setPendingSourceId(null);
    },
    [createBlock, pendingSourceId, requireEditing, screenToFlowPosition],
  );

  const onPaletteAdd = useCallback(
    (item: PaletteItem) => {
      if (!requireEditing()) return;
      const anchorId = pendingSourceId || selected;
      const anchor = anchorId ? nodesRef.current.find((n) => n.id === anchorId) : null;
      let position = placeNear(anchor);

      if (!anchor && wrapper.current) {
        // Nothing selected: drop into the middle of the visible canvas.
        const rect = wrapper.current.getBoundingClientRect();
        const centre = screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
        position = { x: Math.round(centre.x - 150), y: Math.round(centre.y - 40) };
      }

      void createBlock(item, position, pendingSourceId);
      setPendingSourceId(null);
    },
    [createBlock, pendingSourceId, requireEditing, screenToFlowPosition, selected],
  );

  /* ---------------------------------------------------------------------- */
  /* Save / edit lifecycle                                                   */
  /* ---------------------------------------------------------------------- */

  const onSave = useCallback(async (): Promise<boolean> => {
    if (!editing) {
      notify('Click Edit before saving.', 'error');
      return false;
    }
    setBusy(true);
    try {
      const res = await workflowApi.save(workflowId, workflowName || boot.workflowName);
      const messages = platformMessages(res);
      if (!platformSaveOk(res)) {
        const failed = messages.find((m) => m.type === 'error' || m.type === 'danger');
        notify(failed?.text || 'Save failed.', 'error');
        return false;
      }
      setDirty(false);
      notify(messages.find((m) => m.type === 'success')?.text || 'Workflow saved.', 'success');
      return true;
    } catch (e) {
      notify(errorText(e, 'Save failed.'), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [boot.workflowName, editing, notify, workflowId, workflowName]);

  const onStartEdit = useCallback(() => {
    setEditing(true);
    notify('Editing unlocked. Remember to save when you are done.');
    
    // Fetch auto-suggestions for block fields
    workflowApi
      .getAutoSuggestions(workflowId)
      .then((res) => {
        const flat: string[] = [];
        res.forEach((obj) => {
          Object.entries(obj).forEach(([blockName, fields]) => {
            fields.forEach((field) => {
              flat.push(`{${blockName}.${field}}`);
            });
          });
        });
        setAutoSuggestions(flat);
      })
      .catch((e) => {
        console.error('Failed to load auto suggestions:', e);
      });
  }, [notify, workflowId]);

  const onFinishEdit = useCallback(async () => {
    if (!(await onSave())) return;
    setEditing(false);
    setPaletteOpen(false);
    setPendingSourceId(null);
  }, [onSave]);

  const onAutoLayout = useCallback(async () => {
    if (!requireEditing()) return;
    const next = layout(nodesRef.current, edgesRef.current, 'LR');
    setNodes(next);
    setBusy(true);
    try {
      // Positions live in the session until /workflow.save commits them, and
      // the classic canvas re-seeds from Mongo — so persist immediately.
      await Promise.all(
        next.map((n) => session.moveBlock(workflowId, n.id, n.position.x, n.position.y)),
      );
      const res = await workflowApi.save(workflowId, workflowName || boot.workflowName);
      if (!platformSaveOk(res)) {
        setDirty(true);
        const failed = platformMessages(res).find((m) => m.type === 'error' || m.type === 'danger');
        notify(failed?.text || 'Arrange saved the layout, but the workflow save failed.', 'error');
        return;
      }
      setDirty(false);
      fitView({ padding: 0.18, duration: 250, maxZoom: 1.2 });
      notify('Arranged and saved.', 'success');
    } catch (e) {
      setDirty(true);
      notify(errorText(e, 'Arrange failed.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [boot.workflowName, fitView, notify, requireEditing, workflowId, workflowName]);

  /* ---------------------------------------------------------------------- */
  /* Running and debugging                                                   */
  /* ---------------------------------------------------------------------- */

  const applyRunToGraph = useCallback((data: DebugData) => {
    const info = data.blockInfo || {};
    const keys = Object.keys(info);

    // The log is keyed by activity id, which may differ from the block id.
    const byId = new Map<string, (typeof info)[string]>();
    keys.forEach((key) => {
      const activity = info[key] || {};
      byId.set(String(key), activity);
      if (activity.activityId != null && activity.activityId !== '') {
        byId.set(String(activity.activityId), activity);
      }
    });

    const firstId = keys.length ? String(info[keys[0]]?.activityId || keys[0]) : null;
    setSelected(firstId);
    setSelectedEdge(null);

    setNodes((list) =>
      list.map((n) => {
        const hit = byId.get(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            debug: hit ? { status: blockRunStatus(hit), executionTime: hit.execution_time } : undefined,
          },
        };
      }),
    );

    setEdges((list) => {
      const outgoing = new Map<string, VizEdgeType[]>();
      list.forEach((edge) => {
        const bucket = outgoing.get(edge.source) || [];
        bucket.push(edge);
        outgoing.set(edge.source, bucket);
      });

      return list.map((edge) => {
        const sourceLog = byId.get(edge.source);
        const targetLog = byId.get(edge.target);
        const rawTarget = sourceLog?.target;
        const hasTarget = rawTarget != null && String(rawTarget) !== '' && String(rawTarget) !== '0';

        let taken = !!(sourceLog && hasTarget && String(rawTarget) === edge.target);
        // Older logs omit `target`; if both ends ran and there is only one way
        // out, that edge was necessarily the one taken.
        if (!taken && sourceLog && targetLog && (outgoing.get(edge.source)?.length ?? 0) === 1) {
          taken = true;
        }
        return { ...edge, data: { ...(edge.data || { branch: null }), runTaken: taken } };
      });
    });
  }, []);

  const openLog = useCallback(
    async (logId: string | number) => {
      if (!logId) return;
      setBusy(true);
      try {
        const data = await workflowApi.debugData(logId);
        setRun(data);
        applyRunToGraph(data);
        notify(`Loaded log #${logId}.`);
      } catch (e) {
        notify(errorText(e, 'Could not open that log.'), 'error');
      } finally {
        setBusy(false);
      }
    },
    [applyRunToGraph, notify],
  );

  const onRun = useCallback(
    async (params: Record<string, string>) => {
      setRunOpen(false);
      setBusy(true);
      try {
        const out = await workflowApi.run(workflowId, params);
        if (!out.workflow_log_id) {
          notify('The workflow ran, but execution logging is off so there is nothing to show.', 'error');
          return;
        }
        const data = await workflowApi.debugData(out.workflow_log_id);
        setRun(data);
        applyRunToGraph(data);
        notify('Run complete.', 'success');
      } catch (e) {
        notify(errorText(e, 'Run failed.'), 'error');
      } finally {
        setBusy(false);
      }
    },
    [applyRunToGraph, notify, workflowId],
  );

  const clearRun = useCallback(() => {
    setRun(null);
    setNodes((list) => list.map((n) => ({ ...n, data: { ...n.data, debug: undefined } })));
    setEdges((list) => list.map((e) => ({ ...e, data: { ...(e.data || { branch: null }), runTaken: false } })));
  }, []);

  // React Flow's `fitView` prop runs before custom nodes report their measured
  // size, so a graph wider than the viewport lands cropped. Refit once the
  // first paint has happened.
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current || !nodes.length) return undefined;
    didFit.current = true;
    const frame = window.requestAnimationFrame(() => {
      fitView({ padding: 0.18, duration: 0, maxZoom: 1.2 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, nodes.length]);

  // Open the log the URL pointed at, once.
  const bootLogLoaded = useRef(false);
  useEffect(() => {
    if (!boot.logId || bootLogLoaded.current) return;
    bootLogLoaded.current = true;
    void openLog(boot.logId);
  }, [boot.logId, openLog]);

  // Centre the canvas on the block being inspected, mirroring the classic
  // debugger's pan-to-block behaviour.
  const activeLogId = run?.summary?.workflow_log_id;
  useEffect(() => {
    if (!activeLogId || !selected) return undefined;
    if (!nodesRef.current.some((n) => n.id === selected)) return undefined;
    const timer = window.setTimeout(() => {
      fitView({ nodes: [{ id: selected }], padding: 2, duration: 300, maxZoom: 0.8, minZoom: 0.3 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [activeLogId, selected, fitView]);

  /* ---------------------------------------------------------------------- */
  /* Graph refresh                                                           */
  /* ---------------------------------------------------------------------- */

  const refreshGraph = useCallback(async () => {
    setBusy(true);
    try {
      const graph = await reloadGraph(workflowId);
      setNodes(toNodes(graph.blocks, boot.palette));
      setEdges(toEdges(graph.connections, graph.blocks));
      setConnectionProps(connectionPropertyMap(graph.connections));
      setDirty(false);
      setRun(null);
      setSelected(null);
      setSelectedEdge(null);
      window.requestAnimationFrame(() => fitView({ padding: 0.18, duration: 300, maxZoom: 1.2 }));
    } catch (e) {
      notify(errorText(e, 'Could not refresh the canvas.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [boot.palette, fitView, notify, workflowId]);

  /* ---------------------------------------------------------------------- */
  /* Keyboard + unload guards                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]');

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (editing) void onSave();
        else onStartEdit();
        return;
      }
      if (e.key === 'Escape') {
        if (pendingSourceId) setPendingSourceId(null);
        else if (paletteOpen) setPaletteOpen(false);
        return;
      }
      if (inField) return;
      if (e.key.toLowerCase() === 'b' && editing) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        fitView({ padding: 0.2, duration: 300 });
      }
      if (e.key === 'Enter' && selected && editing) {
        e.preventDefault();
        openSettings(selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, fitView, onSave, onStartEdit, openSettings, paletteOpen, pendingSourceId, selected]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  const settingsNode = settingsFor ? nodes.find((n) => n.id === settingsFor) : null;
  const incomingEdge = settingsFor ? edges.find((e) => e.target === settingsFor) : undefined;

  const shellClasses = [
    'viz-studio',
    paletteOpen ? 'has-palette' : '',
    editing ? 'is-editing' : 'is-readonly',
    pendingSourceId ? 'is-picking' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <AutoSuggestionProvider suggestions={autoSuggestions}>
      <div className={shellClasses}>
        <Toolbar
          name={workflowName}
          onNameChange={setWorkflowName}
          workflowId={workflowId}
          shortCode={shortCode}
          dirty={dirty}
          busy={busy}
          editing={editing}
          settingsOpen={settingsOpen}
          hasEdgeSelection={!!selectedEdge}
          activeLogId={activeLogId}
          canvasInteraction={canvasInteraction}
          version={boot.version}
          onSave={() => void onSave()}
          onStartEdit={onStartEdit}
          onFinishEdit={() => void onFinishEdit()}
          onRun={() => setRunOpen(true)}
          onOpenLog={(id) => void openLog(id)}
          onAutoLayout={() => void onAutoLayout()}
          onFit={() => fitView({ padding: 0.2, duration: 300 })}
          onToggleSettings={() => setSettingsOpen((v) => !v)}
          onDisconnectSelected={() => selectedEdge && deleteEdge(selectedEdge)}
        />

        <div className="viz-studio-main">
          <div
            className="viz-canvas"
            ref={wrapper}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
          >
            <ReactFlow
              nodes={decoratedNodes}
              edges={decoratedEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionLineType={ConnectionLineType.SmoothStep}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onConnect={onConnect}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_e, node) => {
                if (run && !node.data?.debug) return;
                setCanvasInteraction((v) => v + 1);
                selectBlock(node.id);
              }}
              onNodeDoubleClick={(_e, node) => {
                if (run && !node.data?.debug) return;
                openSettings(node.id);
              }}
              onEdgeClick={(_e, edge) => {
                if (run && !edge.data?.runTaken) return;
                setCanvasInteraction((v) => v + 1);
                setSelectedEdge(edge.id);
                setSelected(null);
              }}
              onPaneClick={() => {
                setCanvasInteraction((v) => v + 1);
                // Keep the log-focused block selected while results are open.
                if (!run) selectBlock(null);
                setSelectedEdge(null);
              }}
              nodesDraggable={editing && !run}
              nodesConnectable={editing && !run}
              connectOnClick
              elementsSelectable
              zoomOnDoubleClick={false}
              deleteKeyCode={editing && !run ? ['Backspace', 'Delete'] : null}
              multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
              connectionRadius={48}
              // Classic positions are exact pixels; a snap grid would shift them.
              snapToGrid={false}
              minZoom={0.2}
              maxZoom={1.8}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 1.2 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} size={1.2} color="#d5dbe5" variant={BackgroundVariant.Dots} />
              <Controls showInteractive={false} position="bottom-right" />
              <MiniMap
                pannable
                zoomable
                position="bottom-left"
                nodeColor={(n) =>
                  MINIMAP_COLORS[
                    nodeSkin(n.data?.blockType || '', !!n.data?.isEntry, !!n.data?.isCondition)
                  ] || MINIMAP_COLORS.task
                }
              />
            </ReactFlow>

            {nodes.length === 0 ? (
              <div className="viz-canvas-hint">
                <p>This workflow has no blocks yet.</p>
                {editing ? (
                  <button type="button" className="viz-btn is-primary" onClick={() => setPaletteOpen(true)}>
                    Open blocks
                  </button>
                ) : (
                  <button type="button" className="viz-btn is-primary" onClick={onStartEdit}>
                    Start editing
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <Palette
            groups={boot.palette}
            open={paletteOpen && editing}
            onToggle={() => {
              if (!requireEditing()) return;
              setPaletteOpen((v) => !v);
            }}
            onAdd={onPaletteAdd}
            pendingSourceId={pendingSourceId}
            onCancelPending={() => setPendingSourceId(null)}
          />
        </div>

        <DebugPanel run={run} selectedBlockId={selected} onSelectBlock={selectBlock} onClose={clearRun} />

        {runOpen ? <RunDialog onRun={(p) => void onRun(p)} onCancel={() => setRunOpen(false)} busy={busy} /> : null}

        {settingsOpen ? (
          <WorkflowSettings
            workflowId={workflowId}
            shortCode={shortCode}
            workflowName={workflowName}
            showBlockInfo={showBlockInfo}
            onToggleBlockInfo={() => setShowBlockInfo((v) => !v)}
            onClose={() => setSettingsOpen(false)}
            onVersionApplied={() => {
              setSettingsOpen(false);
              void refreshGraph();
              onReloadRequested();
            }}
            notify={notify}
          />
        ) : null}

        {settingsNode ? (
          <BlockSettingsDialog
            workflowId={workflowId}
            node={settingsNode}
            incomingSourceId={incomingEdge?.source}
            incomingProperties={incomingEdge ? connectionProps.get(incomingEdge.id) : undefined}
            readOnly={!editing}
            onClose={() => setSettingsFor(null)}
            onSaved={({ label, description, block_properties }) => {
              setNodes((list) =>
                list.map((n) =>
                  n.id === settingsNode.id
                    ? { ...n, data: { ...n.data, label, description, configured: true, block_properties } }
                    : n,
                ),
              );
              setDirty(true);
            }}
            notify={notify}
          />
        ) : null}

        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    </AutoSuggestionProvider>
  );
}

function connectionPropertyMap(connections: SessionConnection[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  connections.forEach((c) => {
    if (c.properties) map.set(c.conId || `${c.sourceId}-${c.targetId}`, c.properties);
  });
  return map;
}

export default function Studio(props: StudioProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
