import {
  createEmptyGraph,
  type Graph,
  type GraphEdge,
  type GraphNode,
} from "@haizhu/canvas-core";
import type { Edge } from "@xyflow/react";
import type { StubNode } from "@/store/canvas";

const LOCAL_GRAPH_ID = "local-canvas";

export function flowToGraph(nodes: StubNode[], edges: Edge[]): Graph {
  const graph = createEmptyGraph(LOCAL_GRAPH_ID, "Untitled");
  const graphNodes: GraphNode[] = nodes.map((node) => ({
    id: node.id,
    type: node.data.nodeType,
    position: { x: node.position.x, y: node.position.y },
    data: {
      label: node.data.label,
      nodeType: node.data.nodeType,
    },
    ports: [],
  }));
  const graphEdges: GraphEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourcePort: edge.sourceHandle ?? "default",
    target: edge.target,
    targetPort: edge.targetHandle ?? "default",
  }));
  return { ...graph, nodes: graphNodes, edges: graphEdges };
}
