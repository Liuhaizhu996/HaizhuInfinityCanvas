import { useMemo } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { stubCatalog } from "@haizhu/node-sdk";
import { validateConnection } from "@haizhu/canvas-core";
import { AgentNode } from "@/components/AgentNode";
import { endNodeDrag, isNodeDrag, nodeDragType } from "@/lib/dnd";
import { AGENT_NODE_TYPE, graphToFlowEdges, graphToFlowNodes } from "@/lib/flow-graph";
import { useCanvasStore } from "@/store/canvas";

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
        const definition = stubCatalog.find((item) => item.type === type);
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
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} size={1} />
        <Controls />
      </ReactFlow>
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-sm rounded-xl border border-dashed border-border bg-background/70 px-6 py-5 text-center">
            <p className="text-sm font-medium">画布是空的</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              从左侧 Agent 库拖到画布，或点击添加。
              <br />
              可以拖动、连线，按 Delete 删除，Ctrl+Z 撤销。节点不会执行。
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasSurface />
    </ReactFlowProvider>
  );
}
