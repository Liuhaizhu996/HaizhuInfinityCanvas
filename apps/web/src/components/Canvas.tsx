import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "@/store/canvas";

export function Canvas() {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const onNodesChange = useCanvasStore((state) => state.onNodesChange);
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const onConnect = useCanvasStore((state) => state.onConnect);

  return (
    <main className="relative min-w-0 flex-1" aria-label="无限画布">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={(connection) =>
          Boolean(connection.source && connection.target && connection.source !== connection.target)
        }
        colorMode="dark"
        fitView={nodes.length > 0}
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
              从左侧 Agent 库添加节点。
              <br />
              可以拖动、连线，按 Delete 删除。节点不会执行。
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
