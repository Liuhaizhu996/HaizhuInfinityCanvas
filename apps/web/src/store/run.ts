import { create } from "zustand";
import {
  EngineOfflineError,
  EngineRequestError,
  cancelRun,
  createRun,
  getCredentialState,
  getHealth,
  getRun,
  type RunSnapshot,
} from "@/lib/engine-client";
import { useCanvasStore } from "@/store/canvas";

export type CanvasBanner = {
  tone: "offline" | "error" | "empty" | "info" | "running";
  text: string;
};

export type CredentialState = "unknown" | "ready" | "needs_key";

type RunState = {
  phase: "checking" | "online" | "offline";
  credentials: CredentialState;
  run: RunSnapshot | null;
  banner: CanvasBanner | null;
  settingsOpen: boolean;
  refreshHealth: () => Promise<void>;
  startRun: (scope?: "all" | "selection") => Promise<void>;
  cancel: () => Promise<void>;
  setSettingsOpen: (open: boolean) => void;
  clearRunBanner: () => void;
};

const OFFLINE_TEXT =
  "引擎未连接。在 engine 目录启动 sidecar（127.0.0.1:8787）后再运行。密钥写在本机 engine/.env，不要写进画布文件。";

const ERROR_TEXT: Record<string, string> = {
  cycle: "图里有环。文件可以保存环，但这次运行被拒绝。",
  empty_graph: "画布是空的，没有可运行的节点。",
  empty_selection: "没有选中要运行的节点。",
  missing_credentials: "引擎还没有 API Key。打开「设置」，写入本地 engine/.env。",
  run_in_progress: "上一次运行还没结束。可以取消后再试。",
  unknown_node: "所选节点不在当前图里。",
  invalid_graph: "图无法运行。",
  not_found: "找不到这次运行。",
};

let pollToken = 0;

function credentialsBanner(message: string): CanvasBanner {
  if (message.includes("WAN_API_KEY")) {
    return {
      tone: "error",
      text: "引擎还没有 Wan 的 API Key。打开「设置」写入本地 engine/.env。只有点击运行才会提交，不会自动重试。",
    };
  }
  if (message.includes("Kling")) {
    return {
      tone: "error",
      text: "引擎还没有 Kling 密钥。打开「设置」，填写 API Key，或同时填写 Access Key 和 Secret Key。",
    };
  }
  return { tone: "error", text: ERROR_TEXT.missing_credentials ?? message };
}

function bannerFor(run: RunSnapshot): CanvasBanner {
  if (run.status === "succeeded") return { tone: "info", text: "运行完成。" };
  if (run.status === "cancelled") return { tone: "info", text: "已取消。" };
  const failed = Object.values(run.nodes).find((node) => node.status === "failed" && node.error);
  return { tone: "error", text: failed?.error || run.error || "运行失败。" };
}

function failureBanner(error: unknown): { phase: RunState["phase"]; banner: CanvasBanner } {
  if (error instanceof EngineOfflineError) {
    return { phase: "offline", banner: { tone: "offline", text: OFFLINE_TEXT } };
  }
  if (error instanceof EngineRequestError) {
    if (error.code === "empty_graph" || error.code === "empty_selection") {
      return {
        phase: "online",
        banner: { tone: "empty", text: ERROR_TEXT[error.code] ?? error.message },
      };
    }
    if (error.code === "missing_credentials") {
      return { phase: "online", banner: credentialsBanner(error.message) };
    }
    const known = ERROR_TEXT[error.code];
    const text = known && error.code !== "invalid_graph" ? known : error.message || known || "运行没有完成。";
    return { phase: "online", banner: { tone: "error", text } };
  }
  return { phase: "online", banner: { tone: "error", text: "运行没有完成。" } };
}

function watch(runId: string) {
  const token = ++pollToken;
  const tick = async () => {
    if (token !== pollToken) return;
    try {
      const run = await getRun(runId);
      if (token !== pollToken) return;
      if (run.status === "running") {
        useRunStore.setState({ phase: "online", run, banner: { tone: "running", text: "正在运行…" } });
        window.setTimeout(() => void tick(), 400);
        return;
      }
      useRunStore.setState({ phase: "online", run, banner: bannerFor(run) });
      useCanvasStore.getState().applyRunResult(run);
    } catch (error) {
      if (token !== pollToken) return;
      const failed = failureBanner(error);
      useRunStore.setState(failed);
    }
  };
  window.setTimeout(() => void tick(), 200);
}

export const useRunStore = create<RunState>((set, get) => ({
  phase: "checking",
  credentials: "unknown",
  run: null,
  banner: null,
  settingsOpen: false,

  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  clearRunBanner: () =>
    set((state) => ({
      banner: state.banner?.tone === "running" ? state.banner : null,
    })),

  refreshHealth: async () => {
    try {
      await getHealth();
      let credentials: CredentialState = "unknown";
      try {
        credentials = await getCredentialState();
      } catch {
        credentials = "unknown";
      }
      set((state) => ({
        phase: "online",
        credentials,
        banner: state.banner?.tone === "offline" ? null : state.banner,
      }));
    } catch {
      set({
        phase: "offline",
        credentials: "unknown",
        banner: { tone: "offline", text: OFFLINE_TEXT },
      });
    }
  },

  startRun: async (scope = "all") => {
    if (get().run?.status === "running") return;
    const { project, selectedNodeIds } = useCanvasStore.getState();
    if (project.graph.nodes.length === 0) {
      set({ banner: { tone: "empty", text: ERROR_TEXT.empty_graph ?? "画布是空的。" } });
      return;
    }
    if (scope === "selection" && selectedNodeIds.length === 0) {
      set({ banner: { tone: "empty", text: ERROR_TEXT.empty_selection ?? "没有选中要运行的节点。" } });
      return;
    }
    const nodeIds = scope === "selection" ? selectedNodeIds : undefined;
    set({
      banner: {
        tone: "running",
        text: nodeIds ? "正在提交选中的节点（含上游）…" : "正在提交整张图…",
      },
    });
    try {
      const run = await createRun(project.graph, nodeIds);
      set({ phase: "online", run, banner: { tone: "running", text: "正在运行…" } });
      watch(run.id);
    } catch (error) {
      set(failureBanner(error));
    }
  },

  cancel: async () => {
    const current = get().run;
    if (!current || current.status !== "running") return;
    try {
      const next = await cancelRun(current.id);
      if (next.status === "running") {
        set({ phase: "online", run: next, banner: { tone: "running", text: "正在取消…" } });
        return;
      }
      pollToken += 1;
      set({ phase: "online", run: next, banner: bannerFor(next) });
      useCanvasStore.getState().applyRunResult(next);
    } catch (error) {
      set(failureBanner(error));
    }
  },
}));
