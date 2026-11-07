import { create } from "zustand";
import type { Connection, EdgeChange, NodeChange } from "@xyflow/react";
import {
  createEmptyProject,
  validateConnection,
  validateProjectDocument,
  formatIssues,
  type GraphEdge,
  type GraphNode,
  type ProjectDocument,
} from "@haizhu/canvas-core";
import type { NodeDefinition } from "@haizhu/node-sdk";
import { chrome } from "@/lib/chrome";
import type { RunSnapshot } from "@/lib/engine-client";
import type { AgentFlowNode, MeasuredSize } from "@/lib/flow-graph";

const HISTORY_LIMIT = 50;
const LOCAL_PROJECT_ID = "local-canvas";

export type CanvasNotice = {
  tone: "info" | "error";
  text: string;
};

type CanvasState = {
  project: ProjectDocument;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  measured: Record<string, MeasuredSize>;
  past: ProjectDocument[];
  future: ProjectDocument[];
  dragSnapshotTaken: boolean;
  notice: CanvasNotice | null;
  onNodesChange: (changes: NodeChange<AgentFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addFromCatalog: (definition: NodeDefinition, position?: { x: number; y: number }) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  loadProject: (document: ProjectDocument) => void;
  setNotice: (notice: CanvasNotice | null) => void;
  alignAssetsDirectory: (directory: string) => void;
  updateNodeData: (nodeId: string, patch: Record<string, unknown>, recordHistory: boolean) => void;
  applyRunResult: (run: RunSnapshot) => void;
};

function snapshot(project: ProjectDocument): ProjectDocument {
  return structuredClone(project);
}

function gridPosition(index: number): { x: number; y: number } {
  const column = index % 3;
  const row = Math.floor(index / 3);
  // Land click-to-add inside the visible gap, clear of the overlay rails.
  return {
    x: chrome.library + 40 + column * 360,
    y: chrome.top + 72 + row * 260,
  };
}

function nodeFromDefinition(
  definition: NodeDefinition,
  position: { x: number; y: number },
): GraphNode {
  const data: Record<string, unknown> = { label: definition.title };
  for (const field of definition.fields) {
    if (field.default !== undefined) data[field.key] = field.default;
  }
  return {
    id: `node-${crypto.randomUUID()}`,
    type: definition.type,
    position,
    data,
    ports: definition.ports.map((port) => ({ ...port })),
  };
}

function assetIdFor(runId: string, nodeId: string): string {
  const raw = `asset-${runId}-${nodeId}`.replace(/[^A-Za-z0-9_-]/g, "");
  return (raw || "asset-run").slice(0, 200);
}

function withSelection(
  ids: readonly string[],
  id: string,
  selected: boolean,
): string[] {
  if (selected) return ids.includes(id) ? [...ids] : [...ids, id];
  return ids.filter((item) => item !== id);
}

let lastRemovalAt = 0;

function historyForRemoval(state: CanvasState): Pick<CanvasState, "past" | "future"> {
  const now = Date.now();
  if (now - lastRemovalAt < 50) {
    return { past: state.past, future: state.future };
  }
  lastRemovalAt = now;
  return {
    past: [...state.past, snapshot(state.project)].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  project: createEmptyProject(LOCAL_PROJECT_ID, "Untitled"),
  selectedNodeIds: [],
  selectedEdgeIds: [],
  measured: {},
  past: [],
  future: [],
  dragSnapshotTaken: false,
  notice: null,

  setNotice: (notice) => set({ notice }),

  alignAssetsDirectory: (directory) => {
    const project = get().project;
    if (project.assets.directory === directory) return;
    set({
      project: { ...project, assets: { ...project.assets, directory } },
    });
  },

  onNodesChange: (changes) => {
    set((state) => {
      const removeIds = new Set(
        changes.filter((change) => change.type === "remove").map((change) => change.id),
      );
      const positionUpdates = new Map<string, { x: number; y: number }>();
      let dragStarting = false;
      let dragEnding = false;
      let discreteMove = false;

      for (const change of changes) {
        if (change.type !== "position" || !change.position) continue;
        if (!Number.isFinite(change.position.x) || !Number.isFinite(change.position.y)) continue;
        positionUpdates.set(change.id, { x: change.position.x, y: change.position.y });
        if (change.dragging === true && !state.dragSnapshotTaken) dragStarting = true;
        if (change.dragging === false) dragEnding = true;
        if (change.dragging === undefined) discreteMove = true;
      }

      let project = state.project;
      let past = state.past;
      let future = state.future;
      let dragSnapshotTaken = state.dragSnapshotTaken;
      let selectedNodeIds = state.selectedNodeIds;
      let measured = state.measured;

      const removedNodes = project.graph.nodes.some((node) => removeIds.has(node.id));
      if (removedNodes) {
        const history = historyForRemoval(state);
        past = history.past;
        future = history.future;
        project = {
          ...project,
          graph: {
            ...project.graph,
            nodes: project.graph.nodes.filter((node) => !removeIds.has(node.id)),
            edges: project.graph.edges.filter(
              (edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target),
            ),
          },
        };
        selectedNodeIds = selectedNodeIds.filter((id) => !removeIds.has(id));
        measured = Object.fromEntries(
          Object.entries(measured).filter(([id]) => !removeIds.has(id)),
        );
        dragSnapshotTaken = false;
      }

      if (positionUpdates.size > 0) {
        if ((dragStarting || discreteMove) && !removedNodes) {
          past = [...past, snapshot(project)].slice(-HISTORY_LIMIT);
          future = [];
          lastRemovalAt = 0;
        }
        project = {
          ...project,
          graph: {
            ...project.graph,
            nodes: project.graph.nodes.map((node) => {
              const next = positionUpdates.get(node.id);
              return next ? { ...node, position: next } : node;
            }),
          },
        };
        const stillDragging = changes.some(
          (change) => change.type === "position" && change.dragging === true,
        );
        if (stillDragging) dragSnapshotTaken = true;
        else if (dragEnding || discreteMove) dragSnapshotTaken = false;
      }

      for (const change of changes) {
        if (change.type === "select") {
          selectedNodeIds = withSelection(selectedNodeIds, change.id, change.selected);
        }
        if (change.type === "dimensions" && change.dimensions) {
          measured = {
            ...measured,
            [change.id]: {
              width: change.dimensions.width,
              height: change.dimensions.height,
            },
          };
        }
      }

      const liveIds = new Set(project.graph.nodes.map((node) => node.id));
      selectedNodeIds = selectedNodeIds.filter((id) => liveIds.has(id));

      return {
        project,
        past,
        future,
        dragSnapshotTaken,
        selectedNodeIds,
        measured,
      };
    });
  },

  onEdgesChange: (changes) => {
    set((state) => {
      const removeIds = new Set(
        changes.filter((change) => change.type === "remove").map((change) => change.id),
      );
      let project = state.project;
      let past = state.past;
      let future = state.future;
      let selectedEdgeIds = state.selectedEdgeIds;
      const removed = project.graph.edges.some((edge) => removeIds.has(edge.id));
      if (removed) {
        const history = historyForRemoval(state);
        past = history.past;
        future = history.future;
        project = {
          ...project,
          graph: {
            ...project.graph,
            edges: project.graph.edges.filter((edge) => !removeIds.has(edge.id)),
          },
        };
        selectedEdgeIds = selectedEdgeIds.filter((id) => !removeIds.has(id));
      }
      for (const change of changes) {
        if (change.type === "select") {
          selectedEdgeIds = withSelection(selectedEdgeIds, change.id, change.selected);
        }
      }
      const liveIds = new Set(project.graph.edges.map((edge) => edge.id));
      selectedEdgeIds = selectedEdgeIds.filter((id) => liveIds.has(id));
      return {
        project,
        past,
        future,
        selectedEdgeIds,
        dragSnapshotTaken: removed ? false : state.dragSnapshotTaken,
      };
    });
  },

  onConnect: (connection) => {
    const source = connection.source;
    const target = connection.target;
    const sourcePort = connection.sourceHandle;
    const targetPort = connection.targetHandle;
    if (!source || !target || !sourcePort || !targetPort) {
      set({ notice: { tone: "error", text: "连线需要落到具体端口上。" } });
      return;
    }
    const draft = { source, sourcePort, target, targetPort };
    const current = get().project;
    const check = validateConnection(current.graph, draft);
    if (!check.success) {
      set({ notice: { tone: "error", text: formatIssues(check.issues) } });
      return;
    }
    const edge: GraphEdge = { id: `edge-${crypto.randomUUID()}`, ...draft };
    const next: ProjectDocument = {
      ...current,
      graph: { ...current.graph, edges: [...current.graph.edges, edge] },
    };
    const parsed = validateProjectDocument(next);
    if (!parsed.success) {
      set({ notice: { tone: "error", text: formatIssues(parsed.issues) } });
      return;
    }
    lastRemovalAt = 0;
    set((state) => ({
      project: parsed.data,
      past: [...state.past, snapshot(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      dragSnapshotTaken: false,
      notice: null,
    }));
  },

  addFromCatalog: (definition, position) => {
    const current = get().project;
    const node = nodeFromDefinition(
      definition,
      position ?? gridPosition(current.graph.nodes.length),
    );
    const next: ProjectDocument = {
      ...current,
      graph: { ...current.graph, nodes: [...current.graph.nodes, node] },
    };
    const parsed = validateProjectDocument(next);
    if (!parsed.success) {
      set({ notice: { tone: "error", text: formatIssues(parsed.issues) } });
      return;
    }
    lastRemovalAt = 0;
    set((state) => ({
      project: parsed.data,
      past: [...state.past, snapshot(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      dragSnapshotTaken: false,
      selectedNodeIds: [node.id],
      selectedEdgeIds: [],
      notice: null,
    }));
  },

  clear: () => {
    const current = get().project;
    if (current.graph.nodes.length === 0 && current.graph.edges.length === 0) return;
    const next: ProjectDocument = {
      ...current,
      graph: { ...current.graph, nodes: [], edges: [] },
    };
    const parsed = validateProjectDocument(next);
    if (!parsed.success) {
      set({ notice: { tone: "error", text: formatIssues(parsed.issues) } });
      return;
    }
    lastRemovalAt = 0;
    set((state) => ({
      project: parsed.data,
      past: [...state.past, snapshot(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      dragSnapshotTaken: false,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      measured: {},
      notice: null,
    }));
  },

  undo: () => {
    const { past, project, future } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    lastRemovalAt = 0;
    set({
      past: past.slice(0, -1),
      future: [snapshot(project), ...future].slice(0, HISTORY_LIMIT),
      project: previous,
      dragSnapshotTaken: false,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      notice: null,
    });
  },

  redo: () => {
    const { past, project, future } = get();
    const next = future[0];
    if (!next) return;
    lastRemovalAt = 0;
    set({
      future: future.slice(1),
      past: [...past, snapshot(project)].slice(-HISTORY_LIMIT),
      project: next,
      dragSnapshotTaken: false,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      notice: null,
    });
  },

  updateNodeData: (nodeId, patch, recordHistory) => {
    set((state) => {
      const current = state.project;
      if (!current.graph.nodes.some((node) => node.id === nodeId)) return {};
      const nodes = current.graph.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const data: Record<string, unknown> = { ...node.data };
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) delete data[key];
          else data[key] = value;
        }
        return { ...node, data };
      });
      const next: ProjectDocument = {
        ...current,
        graph: { ...current.graph, nodes },
      };
      const parsed = validateProjectDocument(next);
      if (!parsed.success) {
        return { notice: { tone: "error" as const, text: formatIssues(parsed.issues) } };
      }
      if (JSON.stringify(parsed.data) === JSON.stringify(current)) return {};
      lastRemovalAt = 0;
      return {
        project: parsed.data,
        past: recordHistory ? [...state.past, snapshot(current)].slice(-HISTORY_LIMIT) : state.past,
        future: recordHistory ? [] : state.future,
        dragSnapshotTaken: false,
        notice: null,
      };
    });
  },

  applyRunResult: (run) => {
    set((state) => {
      const current = state.project;
      let entries = current.assets.entries;
      let changedEntries = false;
      const nodes = current.graph.nodes.map((node) => {
        const result = run.nodes[node.id];
        if (!result || result.status !== "succeeded") return node;
        const output: Record<string, unknown> = {};
        if (typeof result.outputs.text === "string") output.text = result.outputs.text;
        const image = result.outputs.image;
        if (image && image.relativePath) {
          output.image = {
            relativePath: image.relativePath,
            mediaType: image.mediaType || "image/png",
          };
          if (!entries.some((entry) => entry.relativePath === image.relativePath)) {
            entries = [
              ...entries,
              {
                id: assetIdFor(run.id, node.id),
                relativePath: image.relativePath,
                kind: "image" as const,
                mediaType: image.mediaType || "image/png",
              },
            ];
            changedEntries = true;
          }
        }
        if (Object.keys(output).length === 0) return node;
        return { ...node, data: { ...node.data, output } };
      });
      if (!changedEntries && nodes.every((node, index) => node === current.graph.nodes[index])) {
        return {};
      }
      const next: ProjectDocument = {
        ...current,
        graph: { ...current.graph, nodes },
        assets: { ...current.assets, entries },
      };
      const parsed = validateProjectDocument(next);
      if (!parsed.success) {
        return {
          notice: {
            tone: "error" as const,
            text: `运行结果无法写入画布：${formatIssues(parsed.issues)}`,
          },
        };
      }
      if (JSON.stringify(parsed.data) === JSON.stringify(current)) return {};
      lastRemovalAt = 0;
      return {
        project: parsed.data,
        past: [...state.past, snapshot(current)].slice(-HISTORY_LIMIT),
        future: [],
        dragSnapshotTaken: false,
      };
    });
  },

  loadProject: (document) => {
    const parsed = validateProjectDocument(document);
    if (!parsed.success) {
      set({ notice: { tone: "error", text: `无法打开：${formatIssues(parsed.issues)}` } });
      return;
    }
    const assetNote =
      parsed.data.assets.entries.length > 0
        ? ` ${parsed.data.assets.entries.length} 个素材引用未加载（浏览器不读取 ${parsed.data.assets.directory}）。`
        : "";
    lastRemovalAt = 0;
    set((state) => ({
      project: parsed.data,
      past: [...state.past, snapshot(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      dragSnapshotTaken: false,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      measured: {},
      notice: { tone: "info", text: `已打开 ${parsed.data.graph.name}。${assetNote}` },
    }));
  },
}));
