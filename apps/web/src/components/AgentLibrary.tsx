import { nodeCatalog, type NodeDefinition } from "@haizhu/node-sdk";
import { beginNodeDrag, endNodeDrag } from "@/lib/dnd";
import { useCanvasStore } from "@/store/canvas";

const categoryLabel: Record<NodeDefinition["category"], string> = {
  llm: "LLM",
  image: "Image",
  video: "Video",
  audio: "Audio",
  storyboard: "Board",
};

export function AgentLibrary() {
  const addFromCatalog = useCanvasStore((state) => state.addFromCatalog);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Agent 库</h2>
        <p className="text-[11px] text-muted-foreground">拖到画布，或点击添加</p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {nodeCatalog.map((item) => (
          <button
            key={item.type}
            type="button"
            draggable
            title="拖到画布，或点击添加"
            onDragStart={(event) => beginNodeDrag(event.dataTransfer, item.type)}
            onDragEnd={() => endNodeDrag()}
            onClick={() => addFromCatalog(item)}
            className="w-full cursor-grab rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{item.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-primary">
                {categoryLabel[item.category]}
                {item.executable ? " · 可运行" : " · 占位"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
            <ul className="mt-2 flex flex-wrap gap-1">
              {item.ports.map((port) => (
                <li
                  key={port.id}
                  className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground"
                >
                  {port.direction === "input" ? "in" : "out"}:{port.dataType}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        对话、OpenAI 图像、ComfyUI 和 Wan/Kling 由本地引擎执行。视频会计费，只有点「运行」才提交一次。语音和分镜仍是占位。
      </p>
    </aside>
  );
}
