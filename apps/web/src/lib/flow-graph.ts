import type { Graph, GraphEdge, GraphNode, Port } from "@haizhu/canvas-core";
import type { Edge, Node } from "@xyflow/react";

export const AGENT_NODE_TYPE = "agent" as const;

export type AgentNodeData = {
  label: string;
  nodeType: string;
  ports: Port[];
};

export type AgentFlowNode = Node<AgentNodeData, typeof AGENT_NODE_TYPE>;

export type MeasuredSize = { width: number; height: number };

export function readLabel(node: GraphNode): string {
  const label = node.data.label;
  return typeof label === "string" && label.trim() ? label : node.type;
}

export function graphToFlowNodes(
  graph: Graph,
  selectedNodeIds: readonly string[],
  measured: Readonly<Record<string, MeasuredSize>>,
): AgentFlowNode[] {
  const selected = new Set(selectedNodeIds);
  return graph.nodes.map((node) => {
    const size = measured[node.id];
    return {
      id: node.id,
      type: AGENT_NODE_TYPE,
      position: { x: node.position.x, y: node.position.y },
      selected: selected.has(node.id),
      ...(size ? { measured: size } : {}),
      data: {
        label: readLabel(node),
        nodeType: node.type,
        ports: node.ports.map((port) => ({ ...port })),
      },
    };
  });
}

export function graphToFlowEdges(graph: Graph, selectedEdgeIds: readonly string[]): Edge[] {
  const selected = new Set(selectedEdgeIds);
  return graph.edges.map((edge) => graphEdgeToFlow(edge, selected.has(edge.id)));
}

function graphEdgeToFlow(edge: GraphEdge, selected: boolean): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourcePort,
    targetHandle: edge.targetPort,
    selected,
  };
}
