import { useRef } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  FloppyDisk,
  FolderOpen,
  Gear,
  Play,
  Stop,
  Trash,
} from "@phosphor-icons/react";
import { formatIssues, validateGraph, deserializeProject } from "@haizhu/canvas-core";
import { Button } from "@haizhu/ui";
import { downloadTextFile, projectDownload } from "@/lib/download-project";
import { useCanvasStore } from "@/store/canvas";
import { useRunStore } from "@/store/run";

export function TopBar() {
  const project = useCanvasStore((state) => state.project);
  const past = useCanvasStore((state) => state.past);
  const future = useCanvasStore((state) => state.future);
  const notice = useCanvasStore((state) => state.notice);
  const clear = useCanvasStore((state) => state.clear);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const loadProject = useCanvasStore((state) => state.loadProject);
  const setNotice = useCanvasStore((state) => state.setNotice);
  const alignAssetsDirectory = useCanvasStore((state) => state.alignAssetsDirectory);
  const selectedCount = useCanvasStore((state) => state.selectedNodeIds.length);
  const phase = useRunStore((state) => state.phase);
  const credentials = useRunStore((state) => state.credentials);
  const running = useRunStore((state) => state.run?.status === "running");
  const startRun = useRunStore((state) => state.startRun);
  const cancelRun = useRunStore((state) => state.cancel);
  const setSettingsOpen = useRunStore((state) => state.setSettingsOpen);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = validateGraph(project.graph);
  const assetCount = project.assets.entries.length;
  const empty = project.graph.nodes.length === 0 && project.graph.edges.length === 0;
  const nodeCount = project.graph.nodes.length;

  function save() {
    try {
      const download = projectDownload(project);
      downloadTextFile(download.fileName, download.body);
      alignAssetsDirectory(download.directory);
      setNotice({
        tone: "info",
        text: `已下载 ${download.fileName}。素材目录 ${download.directory} 只是约定，浏览器不会写入文件。`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法保存。";
      setNotice({ tone: "error", text: message });
    }
  }

  async function openFile(file: File) {
    const text = await file.text();
    const result = deserializeProject(text);
    if (!result.success) {
      setNotice({ tone: "error", text: `无法打开：${formatIssues(result.issues)}` });
      return;
    }
    loadProject(result.data);
  }

  return (
    <>
      <header className="hz-glass absolute inset-x-0 top-0 z-30 flex h-[var(--hz-top)] items-center gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="size-2.5 shrink-0 rounded-[3px] bg-primary" />
          <h1 className="shrink-0 text-[15px] font-semibold tracking-tight">海珠</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">无限画布</span>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
          <p className="truncate font-mono text-[12px] text-muted-foreground" translate="no">
            {project.graph.name}
          </p>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto">
          {nodeCount > 0 ? (
            <p className="mr-1 hidden shrink-0 font-mono text-[11px] text-muted-foreground min-[1180px]:block">
              {nodeCount} 节点 · {project.graph.edges.length} 连线
              {assetCount > 0 ? ` · ${assetCount} 素材` : ""}
            </p>
          ) : null}
          {!parsed.success ? (
            <span className="mr-1 shrink-0 text-[11px] text-danger">图校验失败</span>
          ) : null}
          <EnginePill phase={phase} credentials={credentials} />
          <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
          <Button
            id="run-selection"
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void startRun("selection")}
            disabled={running || selectedCount === 0}
            title="运行选中的节点，并带上它们的上游"
          >
            运行所选
          </Button>
          <Button
            id="cancel-run"
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void cancelRun()}
            disabled={!running}
            title="取消这次运行"
            className="border-danger/35 text-danger hover:bg-danger/10"
          >
            <Stop aria-hidden />
            取消
          </Button>
          <Button
            id="run-graph"
            type="button"
            size="sm"
            onClick={() => void startRun("all")}
            disabled={running}
            title="运行整张图，只跑一次"
          >
            <Play aria-hidden />
            运行
          </Button>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
          <Button type="button" variant="ghost" size="sm" onClick={save}>
            <FloppyDisk aria-hidden />
            保存
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
            <FolderOpen aria-hidden />
            打开
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={past.length === 0}
            aria-label="撤销"
            title="撤销"
          >
            <ArrowCounterClockwise aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="重做"
            title="重做"
          >
            <ArrowClockwise aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clear}
            disabled={empty}
            aria-label="清空画布"
            title="清空画布"
          >
            <Trash aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
            title="设置"
          >
            <Gear aria-hidden />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".hzcanvas,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void openFile(file);
            }}
          />
        </div>
      </header>
      {notice ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 w-[min(440px,calc(100%-32px))] -translate-x-1/2">
          <p
            role="status"
            className={`hz-glass rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
              notice.tone === "error" ? "border-danger/40 text-danger" : "border-border text-foreground"
            }`}
          >
            {notice.text}
          </p>
        </div>
      ) : null}
    </>
  );
}

function EnginePill({
  phase,
  credentials,
}: {
  phase: "checking" | "online" | "offline";
  credentials: "unknown" | "ready" | "needs_key";
}) {
  const needsKey = phase === "online" && credentials === "needs_key";
  const label =
    phase === "checking" ? "正在检查" : phase === "offline" ? "引擎离线" : needsKey ? "需要密钥" : "引擎在线";
  const dot =
    phase === "offline"
      ? "bg-danger"
      : needsKey
        ? "bg-warning"
        : phase === "online"
          ? "bg-success"
          : "bg-muted-foreground";

  return (
    <p
      role="status"
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-white/[0.04] px-2.5 text-[12px] text-foreground"
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </p>
  );
}
