import { useMemo, useState } from "react";
import {
  ChatCircle,
  FilmStrip,
  Image,
  MagnifyingGlass,
  SquaresFour,
  Waveform,
  type Icon,
} from "@phosphor-icons/react";
import { nodeCatalog, type NodeCategory, type NodeDefinition } from "@haizhu/node-sdk";
import { beginNodeDrag, endNodeDrag } from "@/lib/dnd";
import { portColor } from "@/lib/ports";
import { useCanvasStore } from "@/store/canvas";

const groups: { id: NodeCategory; label: string; icon: Icon }[] = [
  { id: "llm", label: "对话", icon: ChatCircle },
  { id: "image", label: "图像", icon: Image },
  { id: "video", label: "视频", icon: FilmStrip },
  { id: "audio", label: "音频", icon: Waveform },
  { id: "storyboard", label: "分镜", icon: SquaresFour },
];

export function AgentLibrary() {
  const addFromCatalog = useCanvasStore((state) => state.addFromCatalog);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const visible = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: nodeCatalog.filter((item) => {
            if (item.category !== group.id) return false;
            if (!needle) return true;
            return (
              item.title.toLowerCase().includes(needle) ||
              item.type.toLowerCase().includes(needle) ||
              item.summary.toLowerCase().includes(needle)
            );
          }),
        }))
        .filter((group) => group.items.length > 0),
    [needle],
  );

  return (
    <aside className="hz-glass hz-rail absolute bottom-0 left-0 top-[var(--hz-top)] z-20 flex w-[var(--hz-library)] flex-col border-r border-border">
      <div className="px-3 pb-2 pt-3">
        <h2 className="text-[13px] font-medium">节点库</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">拖到画布，或点击添加</p>
        <label className="relative mt-3 block">
          <span className="sr-only">搜索节点</span>
          <MagnifyingGlass
            aria-hidden
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索节点"
            className="hz-field pl-8"
            spellCheck={false}
          />
        </label>
      </div>
      <div className="hz-scroll flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">没有匹配的节点。</p>
        ) : null}
        {visible.map((group) => {
          const Glyph = group.icon;
          return (
            <section key={group.id} aria-label={group.label}>
              <h3 className="flex items-center gap-1.5 px-2 pb-1 pt-3 text-[12px] text-muted-foreground">
                <Glyph aria-hidden size={14} />
                {group.label}
              </h3>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.type}>
                    <CatalogRow item={item} onAdd={() => addFromCatalog(item)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="border-t border-border px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
        对话和图像发给本地引擎。其余节点只保存，不发起请求。
      </p>
    </aside>
  );
}

function CatalogRow({ item, onAdd }: { item: NodeDefinition; onAdd: () => void }) {
  return (
    <button
      type="button"
      draggable
      title="拖到画布，或点击添加"
      onDragStart={(event) => beginNodeDrag(event.dataTransfer, item.type)}
      onDragEnd={() => endNodeDrag()}
      onClick={onAdd}
      className="w-full cursor-grab rounded-lg border border-transparent px-2 py-2 text-left hover:border-border hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-medium">{item.title}</span>
        <span className={item.executable ? "shrink-0 text-[11px] text-success" : "shrink-0 text-[11px] text-muted-foreground"}>
          {item.executable ? "可运行" : "占位"}
        </span>
      </div>
      <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" translate="no">
        {item.type}
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{item.summary}</p>
      <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
        {item.ports.map((port) => (
          <li
            key={port.id}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: portColor[port.dataType] }}
            />
            {port.direction === "input" ? "in" : "out"} {port.name}
          </li>
        ))}
      </ul>
    </button>
  );
}
