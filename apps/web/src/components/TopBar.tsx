import { parseGraph } from "@haizhu/canvas-core";
import { Button } from "@haizhu/ui";
import { useCanvasStore } from "@/store/canvas";
import { flowToGraph } from "@/lib/flow-graph";
import { APP_VERSION } from "@/version";

export function TopBar() {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const clear = useCanvasStore((state) => state.clear);
  const parsed = parseGraph(flowToGraph(nodes, edges));

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="truncate text-sm font-semibold tracking-wide">海珠无限画布</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Haizhu Infinity Canvas
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">v{APP_VERSION} · 脚手架，不调用模型</p>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground" role="status">
          {nodes.length} 节点 · {edges.length} 连线 ·{" "}
          {parsed.success ? "图校验通过" : "图校验失败"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={nodes.length === 0 && edges.length === 0}>
          清空
        </Button>
      </div>
    </header>
  );
}
