import { useMemo, useState, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { CornersOut, Minus, Plus, SquaresFour } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { nodeCatalog, type NodeCategory, type NodeDefinition } from "@haizhu/node-sdk";
import { validateConnection } from "@haizhu/canvas-core";
import { AgentNode } from "@/components/AgentNode";
import { endNodeDrag, isNodeDrag, nodeDragType } from "@/lib/dnd";
import { AGENT_NODE_TYPE, graphToFlowEdges, graphToFlowNodes } from "@/lib/flow-graph";
import { useCanvasStore } from "@/store/canvas";
import { useRunStore } from "@/store/run";

const nodeTypes = { [AGENT_NODE_TYPE]: AgentNode };
const edgeStroke = "rgba(244,244,245,0.55)";

const pickerGroups: { id: NodeCategory; label: string }[] = [
  { id: "llm", label: "对话" },
  { id: "image", label: "图像" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "storyboard", label: "分镜" },
];

type PickerState = {
  x: number;
  y: number;
  flow: { x: number; y: number };
};

function CanvasSurface() {
  const project = useCanvasStore((state) => state.project);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useCanvasStore((state) => state.selectedEdgeIds);
  const measured = useCanvasStore((state) => state.measured);
  const onNodesChange = useCanvasStore((state) => state.onNodesChange);
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const onConnect = useCanvasStore((state) => state.onConnect);
  const addFromCatalog = useCanvasStore((state) => state.addFromCatalog);
  const setLocalPreview = useCanvasStore((state) => state.setLocalPreview);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const banner = useRunStore((state) => state.banner);
  const { screenToFlowPosition } = useReactFlow();
  const [picker, setPicker] = useState<PickerState | null>(null);

  const nodes = useMemo(
    () => graphToFlowNodes(project.graph, selectedNodeIds, measured),
    [project.graph, selectedNodeIds, measured],
  );
  const edges = useMemo(
    () => graphToFlowEdges(project.graph, selectedEdgeIds),
    [project.graph, selectedEdgeIds],
  );

  function placeImages(files: File[], clientX: number, clientY: number) {
    const definition = nodeCatalog.find((item) => item.type === "openai.image");
    if (!definition) return;
    const origin = screenToFlowPosition({ x: clientX, y: clientY });
    files.forEach((file, index) => {
      const id = addFromCatalog(definition, { x: origin.x + index * 36, y: origin.y + index * 28 });
      if (!id) return;
      setLocalPreview(id, URL.createObjectURL(file));
      const label = file.name.replace(/\.[^.]+$/, "") || file.name;
      updateNodeData(id, { label }, false);
    });
  }

  return (
    <main
      className="absolute inset-0 bg-background"
      aria-label="无限画布"
      onDragOverCapture={(event) => {
        const files = event.dataTransfer.types.includes("Files");
        if (!isNodeDrag(event.dataTransfer) && !files) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDropCapture={(event) => {
        if (isNodeDrag(event.dataTransfer)) {
          event.preventDefault();
          event.stopPropagation();
          const type = nodeDragType(event.dataTransfer);
          endNodeDrag();
          if (!type) return;
          const definition = nodeCatalog.find((item) => item.type === type);
          if (!definition) return;
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          addFromCatalog(definition, position);
          return;
        }
        const images = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
        if (images.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        placeImages(images, event.clientX, event.clientY);
      }}
      onDoubleClickCapture={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.classList.contains("react-flow__pane")) return;
        setPicker({
          x: event.clientX,
          y: event.clientY,
          flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        });
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => setPicker(null)}
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
      <ViewCluster />
      <GenerationDock />
      {picker ? (
        <NodePicker
          picker={picker}
          onClose={() => setPicker(null)}
          onPick={(definition) => {
            addFromCatalog(definition, picker.flow);
            setPicker(null);
          }}
        />
      ) : null}
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
            <p className="font-display text-[15px] font-medium text-foreground">拖入图片，或双击画布</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              也可以从左侧节点库拖一个节点进来。点「运行」才会提交。
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

function NodePicker({
  picker,
  onClose,
  onPick,
}: {
  picker: PickerState;
  onClose: () => void;
  onPick: (definition: NodeDefinition) => void;
}) {
  return (
    <div
      className="hz-glass absolute z-30 w-52 overflow-hidden rounded-xl border border-border shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
      style={{ left: Math.min(picker.x, window.innerWidth - 240), top: Math.min(picker.y, window.innerHeight - 280) }}
      role="menu"
      aria-label="创建节点"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[12px] text-muted-foreground">创建节点</p>
        <button
          type="button"
          className="text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
      <div className="hz-scroll max-h-64 overflow-y-auto p-1">
        {pickerGroups.map((group) => {
          const items = nodeCatalog.filter((item) => item.category === group.id);
          if (items.length === 0) return null;
          return (
            <div key={group.id} className="py-1">
              <p className="px-2 py-1 text-[11px] text-muted-foreground">{group.label}</p>
              {items.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => onPick(item)}
                >
                  <span>{item.title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground" translate="no">
                    {item.type.split(".")[0]}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GenerationDock() {
  const project = useCanvasStore((state) => state.project);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const running = useRunStore((state) => state.run?.status === "running");
  const startRun = useRunStore((state) => state.startRun);
  const selected =
    selectedNodeIds.length === 1
      ? project.graph.nodes.find((node) => node.id === selectedNodeIds[0])
      : undefined;
  const definition = selected ? nodeCatalog.find((item) => item.type === selected.type) : undefined;
  const media =
    definition?.category === "image" || definition?.category === "video" || definition?.category === "audio";
  const model = selected && typeof selected.data.model === "string" ? selected.data.model : "";
  const vendor = selected && typeof selected.data.vendor === "string" ? selected.data.vendor : "";
  const meta = [vendor, model].filter(Boolean).join(" · ");
  const label =
    selectedNodeIds.length > 1
      ? `已选 ${selectedNodeIds.length} 个节点`
      : (selected && typeof selected.data.label === "string" && selected.data.label) || definition?.title || "整张图";
  const runSelection = selectedNodeIds.length > 0;

  return (
    <div
      className="pointer-events-none absolute z-20 flex flex-col items-center gap-2"
      style={{ left: "var(--hz-library)", right: "var(--hz-inspector)", bottom: 16 }}
    >
      {media && selected ? (
        <div className="hz-glass pointer-events-auto flex items-center gap-1 rounded-full border border-border px-1.5 py-1">
          <DockButton
            onClick={() => void startRun("selection")}
            disabled={running || !definition.executable}
          >
            运行此节点
          </DockButton>
          <DockButton onClick={focusInspector}>检查器</DockButton>
        </div>
      ) : null}
      <div className="hz-glass pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border px-2 py-1.5">
        <div className="min-w-0 px-1.5">
          <p className="truncate text-[12px] text-foreground">{label}</p>
          {meta ? (
            <p className="truncate font-mono text-[10px] text-muted-foreground" translate="no">
              {meta}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">{runSelection ? "运行所选，含上游" : "运行整张图，只一次"}</p>
          )}
        </div>
        <button
          type="button"
          className="h-8 shrink-0 rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40"
          disabled={running || (runSelection && selectedNodeIds.length === 0)}
          onClick={() => void startRun(runSelection ? "selection" : "all")}
        >
          运行
        </button>
      </div>
    </div>
  );
}

function focusInspector() {
  const panel = document.getElementById("node-inspector");
  const field = panel?.querySelector("textarea, input");
  if (field instanceof HTMLElement) field.focus();
}

function ViewCluster() {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const zoom = useViewport().zoom;
  const arrange = useCanvasStore((state) => state.arrange);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const nodeCount = useCanvasStore((state) => state.project.graph.nodes.length);
  const [menu, setMenu] = useState(false);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = motion ? 0 : 180;
  const percent = `${Math.round(zoom * 100)}%`;
  const canArrange = selectedNodeIds.length > 1 || (selectedNodeIds.length === 0 && nodeCount > 1);

  return (
    <div
      className="hz-glass absolute z-20 flex items-center rounded-[10px] border border-border"
      style={{ right: "calc(var(--hz-inspector) + 12px)", bottom: 12 }}
    >
      <ControlButton
        label="整理位置"
        disabled={!canArrange}
        onClick={() => arrange(selectedNodeIds.length > 1 ? selectedNodeIds : undefined)}
      >
        <SquaresFour size={15} aria-hidden />
      </ControlButton>
      <ControlButton label="缩小" onClick={() => zoomOut({ duration })}>
        <Minus size={15} aria-hidden />
      </ControlButton>
      <div className="relative">
        <button
          type="button"
          className="h-8 min-w-14 px-2 font-mono text-[11px] text-foreground hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-expanded={menu}
          aria-label={`缩放 ${percent}`}
          onClick={() => setMenu((open) => !open)}
        >
          {percent}
        </button>
        {menu ? (
          <div className="absolute bottom-10 right-0 z-30 min-w-28 overflow-hidden rounded-lg border border-border bg-surface py-1">
            {[
              { label: "50%", run: () => zoomTo(0.5, { duration }) },
              { label: "100%", run: () => zoomTo(1, { duration }) },
              { label: "200%", run: () => zoomTo(2, { duration }) },
              { label: "适配画面", run: () => fitView({ padding: 0.28, duration }) },
              {
                label: "适配所选",
                run: () =>
                  fitView({
                    nodes: selectedNodeIds.map((id) => ({ id })),
                    padding: 0.3,
                    duration,
                  }),
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] text-foreground hover:bg-white/[0.06]"
                onClick={() => {
                  item.run();
                  setMenu(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ControlButton label="放大" onClick={() => zoomIn({ duration })}>
        <Plus size={15} aria-hidden />
      </ControlButton>
      <ControlButton label="适配画面" onClick={() => fitView({ padding: 0.28, duration: motion ? 0 : 200 })}>
        <CornersOut size={15} aria-hidden />
      </ControlButton>
    </div>
  );
}

function DockButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-7 rounded-full px-2.5 text-[12px] text-foreground hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center border-r border-border text-foreground last:border-r-0 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-40"
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
