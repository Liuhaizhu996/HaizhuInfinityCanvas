import { useMemo } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeCatalog } from "@haizhu/node-sdk";
import { validateConnection } from "@haizhu/canvas-core";
import { AgentNode } from "@/components/AgentNode";
import { endNodeDrag, isNodeDrag, nodeDragType } from "@/lib/dnd";
import { AGENT_NODE_TYPE, graphToFlowEdges, graphToFlowNodes } from "@/lib/flow-graph";
import { useCanvasStore } from "@/store/canvas";
import { useRunStore } from "@/store/run";

const nodeTypes = { [AGENT_NODE_TYPE]: AgentNode };

function CanvasSurface() {
  const project = useCanvasStore((state) => state.project);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useCanvasStore((state) => state.selectedEdgeIds);
  const measured = useCanvasStore((state) => state.measured);
  const onNodesChange = useCanvasStore((state) => state.onNodesChange);
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const onConnect = useCanvasStore((state) => state.onConnect);
  const addFromCatalog = useCanvasStore((state) => state.addFromCatalog);
  const banner = useRunStore((state) => state.banner);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useMemo(
    () => graphToFlowNodes(project.graph, selectedNodeIds, measured),
    [project.graph, selectedNodeIds, measured],
  );
  const edges = useMemo(
    () => graphToFlowEdges(project.graph, selectedEdgeIds),
    [project.graph, selectedEdgeIds],
  );

  return (
    <main
      className="relative min-w-0 flex-1"
      aria-label="无限画布"
      onDragOverCapture={(event) => {
        if (!isNodeDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDropCapture={(event) => {
        if (!isNodeDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const type = nodeDragType(event.dataTransfer);
        endNodeDrag();
        if (!type) return;
        const definition = nodeCatalog.find((item) => item.type === type);
        if (!definition) return;
        // Top-left of the new node, in flow space (pan and zoom included).
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addFromCatalog(definition, position);
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        isValidConnection={(connection) => {
          if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
            return false;
          }
          return validateConnection(project.graph, {
            source: connection.source,
            sourcePort: connection.sourceHandle,
            target: connection.target,
            targetPort: connection.targetHandle,
          }).success;
        }}
        colorMode="dark"
        connectionRadius={40}
        defaultEdgeOptions={{ style: { stroke: "oklch(0.82 0.11 200)", strokeWidth: 2 } }}
        connectionLineStyle={{ stroke: "oklch(0.82 0.11 200)", strokeWidth: 2 }}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} size={1} />
        <Controls />
      </ReactFlow>
      {banner && !(banner.tone === "empty" && nodes.length > 0) ? (
        <div
          id="canvas-banner"
          role="status"
          className={`pointer-events-none absolute left-3 right-3 top-3 z-10 rounded-md border px-3 py-2 text-xs leading-relaxed ${bannerClass(banner.tone)}`}
        >
          {banner.text}
        </div>
      ) : null}
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-sm rounded-xl border border-dashed border-border bg-background/70 px-6 py-5 text-center">
            <p className="text-sm font-medium">画布是空的</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              从左侧把节点拖到画布。对话的 text 可以连到图像、ComfyUI 或视频的 prompt。
              <br />
              右侧填参数，「设置」里把密钥交给本地引擎，然后点「运行」。视频会计费，只跑一次。
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function bannerClass(tone: "offline" | "error" | "empty" | "info" | "running"): string {
  if (tone === "offline" || tone === "error") {
    return "border-destructive/50 bg-background/90 text-destructive";
  }
  if (tone === "empty") return "border-dashed border-border bg-background/90 text-muted-foreground";
  if (tone === "running") return "border-primary/40 bg-background/90 text-primary";
  return "border-border bg-background/90 text-muted-foreground";
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasSurface />
    </ReactFlowProvider>
  );
}
