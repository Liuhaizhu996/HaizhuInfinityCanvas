import type { Graph, GraphEdge, GraphNode, Port, PortDataType } from "@haizhu/canvas-core";
import type { Edge, Node } from "@xyflow/react";
import { portColor } from "@/lib/ports";

export const AGENT_NODE_TYPE = "agent" as const;

export type StoredMediaOutput = {
  relativePath: string;
  mediaType?: string;
};

export type StoredImageOutput = StoredMediaOutput;

export type StoredOutput = {
  text?: string;
  image?: StoredMediaOutput;
  video?: StoredMediaOutput;
  audio?: StoredMediaOutput;
};

export type AgentNodeData = {
  label: string;
  nodeType: string;
  ports: Port[];
  output?: StoredOutput;
};

export type AgentFlowNode = Node<AgentNodeData, typeof AGENT_NODE_TYPE>;

export type MeasuredSize = { width: number; height: number };

export function readLabel(node: GraphNode): string {
  const label = node.data.label;
  return typeof label === "string" && label.trim() ? label : node.type;
}

function readMedia(value: unknown): StoredMediaOutput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.relativePath !== "string" || !record.relativePath) return undefined;
  return {
    relativePath: record.relativePath,
    mediaType: typeof record.mediaType === "string" ? record.mediaType : undefined,
  };
}

export function readOutput(data: Record<string, unknown>): StoredOutput | undefined {
  const output = data.output;
  if (!output || typeof output !== "object") return undefined;
  const record = output as Record<string, unknown>;
  const result: StoredOutput = {};
  if (typeof record.text === "string" && record.text) result.text = record.text;
  const image = readMedia(record.image);
  const video = readMedia(record.video);
  const audio = readMedia(record.audio);
  if (image) result.image = image;
  if (video) result.video = video;
  if (audio) result.audio = audio;
  if (!result.text && !result.image && !result.video && !result.audio) return undefined;
  return result;
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
        output: readOutput(node.data),
      },
    };
  });
}

export function graphToFlowEdges(graph: Graph, selectedEdgeIds: readonly string[]): Edge[] {
  const selected = new Set(selectedEdgeIds);
  return graph.edges.map((edge) => graphEdgeToFlow(graph, edge, selected.has(edge.id)));
}

function sourcePortType(graph: Graph, edge: GraphEdge): PortDataType | undefined {
  const node = graph.nodes.find((item) => item.id === edge.source);
  return node?.ports.find((port) => port.id === edge.sourcePort)?.dataType;
}

function graphEdgeToFlow(graph: Graph, edge: GraphEdge, selected: boolean): Edge {
  const typed = sourcePortType(graph, edge);
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourcePort,
    targetHandle: edge.targetPort,
    selected,
    interactionWidth: 16,
    style: {
      stroke: selected ? "#F43F5E" : typed ? portColor[typed] : "rgba(244,244,245,0.45)",
      strokeWidth: selected ? 1.75 : 1.5,
    },
  };
}
