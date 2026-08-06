/**
 * Dagre layout tuned to the classic jsPlumb debugger's spacing.
 *
 * Classic blocks are ~90x90 icon windows about 180–220px apart along the main
 * chain. Studio cards are wider, so `ranksep` stays modest — the positions are
 * saved back to Mongo and must still look natural in the classic canvas.
 *
 * Only runs when the user clicks Arrange, never on load: workflows carry
 * hand-placed coordinates that people recognise.
 */
import dagre from 'dagre';
import type { VizEdgeType, VizNode } from './convert';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 58;
const COND_WIDTH = 132;
const COND_HEIGHT = 130;

function sizeOf(node: VizNode): { w: number; h: number } {
  return node.data?.isCondition
    ? { w: COND_WIDTH, h: COND_HEIGHT }
    : { w: NODE_WIDTH, h: NODE_HEIGHT };
}

export function layout(
  nodes: VizNode[],
  edges: VizEdgeType[],
  direction: 'LR' | 'TB' = 'LR',
): VizNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    // Keeps centre-to-centre near the classic ~200px despite wider cards.
    ranksep: 70,
    nodesep: 60,
    marginx: 80,
    marginy: 60,
  });

  nodes.forEach((n) => {
    const { w, h } = sizeOf(n);
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    const { w, h } = sizeOf(n);
    return {
      ...n,
      position: { x: Math.round(pos.x - w / 2), y: Math.round(pos.y - h / 2) },
    };
  });
}
