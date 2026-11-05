import { useRef } from "react";
import { formatIssues, validateGraph, deserializeProject } from "@haizhu/canvas-core";
import { Button } from "@haizhu/ui";
import { downloadTextFile, projectDownload } from "@/lib/download-project";
import { useCanvasStore } from "@/store/canvas";
import { useRunStore } from "@/store/run";
import { APP_VERSION } from "@/version";

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
  const running = useRunStore((state) => state.run?.status === "running");
  const startRun = useRunStore((state) => state.startRun);
  const cancelRun = useRunStore((state) => state.cancel);
  const setSettingsOpen = useRunStore((state) => state.setSettingsOpen);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = validateGraph(project.graph);
  const assetCount = project.assets.entries.length;
  const empty = project.graph.nodes.length === 0 && project.graph.edges.length === 0;

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
    <header className="shrink-0 border-b border-border">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="truncate text-sm font-semibold tracking-wide">海珠无限画布</h1>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Haizhu Infinity Canvas
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            v{APP_VERSION} · 可运行对话、图像、ComfyUI 与视频
            {phase === "online" ? " · 引擎在线" : phase === "offline" ? " · 引擎未连接" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground" role="status">
            {project.graph.nodes.length} 节点 · {project.graph.edges.length} 连线 ·{" "}
            {parsed.success ? "图校验通过" : "图校验失败"}
            {assetCount > 0 ? ` · ${assetCount} 个素材引用` : ""}
          </p>
          <Button
            id="run-graph"
            type="button"
            size="sm"
            onClick={() => void startRun("all")}
            disabled={running}
            title="运行整张图，只跑一次。视频节点会向 Wan 或 Kling 计费，不会自动重试。"
          >
            运行
          </Button>
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
          >
            取消
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            设置
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={save}>
            保存
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            打开
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={undo} disabled={past.length === 0}>
            撤销
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={redo} disabled={future.length === 0}>
            重做
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clear} disabled={empty}>
            清空
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
      </div>
      {notice ? (
        <p
          role="status"
          className={`border-t border-border px-4 py-2 text-xs ${
            notice.tone === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </header>
  );
}
