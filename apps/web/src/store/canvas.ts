import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type { NodeDefinition } from "@haizhu/node-sdk";

export type StubNodeData = {
  label: string;
  nodeType: string;
};

export type StubNode = Node<StubNodeData, "default">;

type CanvasState = {
  nodes: StubNode[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<StubNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addFromCatalog: (definition: NodeDefinition) => void;
  clear: () => void;
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },
  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) });
  },
  addFromCatalog: (definition) => {
    const index = get().nodes.length;
    const column = index % 3;
    const row = Math.floor(index / 3);
    const node: StubNode = {
      id: `node-${crypto.randomUUID()}`,
      type: "default",
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      position: {
        x: 48 + column * 240,
        y: 48 + row * 150,
      },
      data: {
        label: definition.title,
        nodeType: definition.type,
      },
    };
    set({ nodes: [...get().nodes, node] });
  },
  clear: () => set({ nodes: [], edges: [] }),
}));
