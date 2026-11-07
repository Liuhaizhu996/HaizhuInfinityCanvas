import type { GraphEdge, GraphNode } from "@haizhu/canvas-core";

const COLUMN = 380;
const ROW = 240;

/** Layer nodes left to right and keep their edges. Cycles sit in extra columns. */
export function arrangePositions(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): Map<string, { x: number; y: number }> {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) continue;
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const byX = (left: string, right: string) => {
    const a = nodes.find((node) => node.id === left);
    const b = nodes.find((node) => node.id === right);
    return (a?.position.x ?? 0) - (b?.position.x ?? 0) || (a?.position.y ?? 0) - (b?.position.y ?? 0);
  };

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort(byX);
  const rank = new Map<string, number>();
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const parentRanks = edges
      .filter((edge) => edge.target === id && ids.has(edge.source))
      .map((edge) => rank.get(edge.source) ?? 0);
    rank.set(id, parentRanks.length > 0 ? Math.max(...parentRanks) + 1 : 0);
    for (const next of outgoing.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if ((indegree.get(next) ?? 0) <= 0) queue.push(next);
    }
  }

  let extra = Math.max(0, ...rank.values());
  for (const node of [...nodes].sort((a, b) => a.position.x - b.position.x)) {
    if (rank.has(node.id)) continue;
    extra += 1;
    rank.set(node.id, extra);
  }

  const columns = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const column = rank.get(node.id) ?? 0;
    const list = columns.get(column) ?? [];
    list.push(node);
    columns.set(column, list);
  }

  const originX = Math.min(...nodes.map((node) => node.position.x));
  const originY = Math.min(...nodes.map((node) => node.position.y));
  const positions = new Map<string, { x: number; y: number }>();
  [...columns.keys()]
    .sort((a, b) => a - b)
    .forEach((column, columnIndex) => {
      const list = (columns.get(column) ?? []).sort(
        (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
      );
      list.forEach((node, row) => {
        positions.set(node.id, { x: originX + columnIndex * COLUMN, y: originY + row * ROW });
      });
    });
  return positions;
}
