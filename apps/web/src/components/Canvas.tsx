import { useMemo, type ReactNode } from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { CornersOut, Minus, Plus } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { nodeCatalog } from "@haizhu/node-sdk";
import { validateConnection } from "@haizhu/canvas-core";
import { AgentNode } from "@/components/AgentNode";
import { endNodeDrag, isNodeDrag, nodeDragType } from "@/lib/dnd";
import { AGENT_NODE_TYPE, graphToFlowEdges, graphToFlowNodes } from "@/lib/flow-graph";
import { useCanvasStore } from "@/store/canvas";
import { useRunStore } from "@/store/run";

const nodeTypes = { [AGENT_NODE_TYPE]: AgentNode };
const edgeStroke = "rgba(244,244,245,0.55)";

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
      className="absolute inset-0 bg-background"
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
        defaultEdgeOptions={{
          style: { stroke: edgeStroke, strokeWidth: 1.5 },
          interactionWidth: 16,
        }}
        connectionLineStyle={{ stroke: edgeStroke, strokeWidth: 1.5 }}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.15} color="rgba(255,255,255,0.045)" />
      </ReactFlow>
      <CanvasControls />
      {banner && !(banner.tone === "empty" && nodes.length > 0) ? (
        <div
          id="canvas-banner"
          role="status"
          className="pointer-events-none absolute z-10 flex justify-center px-4"
          style={{
            top: "calc(var(--hz-top) + 12px)",
            left: "var(--hz-library)",
            right: "var(--hz-inspector)",
          }}
        >
          <p
            className={`hz-glass max-w-md rounded-xl border border-border px-3.5 py-2.5 text-xs leading-relaxed text-foreground ${bannerEdge(banner.tone)}`}
          >
            {banner.text}
          </p>
        </div>
      ) : null}
      {nodes.length === 0 ? (
        <div
          className="pointer-events-none absolute flex items-center justify-center"
          style={{
            top: "var(--hz-top)",
            left: "var(--hz-library)",
            right: "var(--hz-inspector)",
            bottom: 0,
          }}
        >
          <div className="max-w-[280px] text-center">
            <p className="font-display text-[15px] font-medium text-foreground">拖一个节点到这里</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              从左侧拖到画布上，或在节点库里点一下。
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function bannerEdge(tone: "offline" | "error" | "empty" | "info" | "running"): string {
  if (tone === "offline") return "border-l-2 border-l-warning";
  if (tone === "error") return "border-l-2 border-l-danger";
  if (tone === "running") return "border-l-2 border-l-primary";
  return "";
}

function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = motion ? 0 : 180;

  return (
    <div
      className="hz-glass absolute z-10 flex flex-col overflow-hidden rounded-[10px] border border-border"
      style={{ left: "calc(var(--hz-library) + 12px)", bottom: 12 }}
    >
      <ControlButton label="放大" onClick={() => zoomIn({ duration })}>
        <Plus size={15} aria-hidden />
      </ControlButton>
      <ControlButton label="缩小" onClick={() => zoomOut({ duration })}>
        <Minus size={15} aria-hidden />
      </ControlButton>
      <ControlButton label="适配画面" onClick={() => fitView({ padding: 0.28, duration: motion ? 0 : 200 })}>
        <CornersOut size={15} aria-hidden />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center border-b border-border text-foreground last:border-b-0 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasSurface />
    </ReactFlowProvider>
  );
}
