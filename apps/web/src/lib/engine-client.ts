import type { Graph } from "@haizhu/canvas-core";

const DEFAULT_ORIGIN = "http://127.0.0.1:8787";

export type NodeRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped";

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";

export type RunMediaOutput = {
  relativePath: string;
  mediaType: string;
  url: string;
};

export type RunImageOutput = RunMediaOutput;

export type RunSnapshot = {
  id: string;
  status: RunStatus;
  error: string | null;
  nodeIds: string[];
  nodes: Record<
    string,
    {
      type: string;
      status: NodeRunStatus;
      error: string | null;
      outputs: {
        text?: string;
        image?: RunMediaOutput;
        video?: RunMediaOutput;
      };
    }
  >;
};

export type PublicSettings = {
  openaiBaseUrl: string;
  openaiApiKeySet: boolean;
  comfyuiBaseUrl: string;
  comfyuiApiKeySet: boolean;
  wanBaseUrl: string;
  wanApiKeySet: boolean;
  klingBaseUrl: string;
  klingAccessKeySet: boolean;
  klingSecretKeySet: boolean;
  klingApiKeySet: boolean;
  envFile: string;
};

export class EngineOfflineError extends Error {
  constructor() {
    super("引擎未连接");
    this.name = "EngineOfflineError";
  }
}

export class EngineRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "EngineRequestError";
    this.code = code;
  }
}

export function engineOrigin(): string {
  const configured = import.meta.env.VITE_ENGINE_URL;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim().replace(/\/$/, "");
  }
  return DEFAULT_ORIGIN;
}

export function assetUrl(relativePath: string): string {
  const safe = relativePath
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${engineOrigin()}/assets/${safe}`;
}

export async function getHealth(): Promise<void> {
  const response = await request("/health");
  const body = (await response.json()) as unknown;
  if (!body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true) {
    throw new EngineRequestError("健康检查没有通过。", "health");
  }
}

export async function getSettings(): Promise<PublicSettings> {
  const response = await request("/settings");
  return parseSettings(await response.json());
}

export async function putSettings(input: {
  openaiBaseUrl: string;
  openaiApiKey?: string;
  comfyuiBaseUrl: string;
  comfyuiApiKey?: string;
  wanBaseUrl: string;
  wanApiKey?: string;
  klingBaseUrl: string;
  klingAccessKey?: string;
  klingSecretKey?: string;
  klingApiKey?: string;
}): Promise<PublicSettings> {
  const response = await request("/settings", {
    method: "PUT",
    body: JSON.stringify({
      openaiBaseUrl: input.openaiBaseUrl,
      openaiApiKey: input.openaiApiKey ?? "",
      comfyuiBaseUrl: input.comfyuiBaseUrl,
      comfyuiApiKey: input.comfyuiApiKey ?? "",
      wanBaseUrl: input.wanBaseUrl,
      wanApiKey: input.wanApiKey ?? "",
      klingBaseUrl: input.klingBaseUrl,
      klingAccessKey: input.klingAccessKey ?? "",
      klingSecretKey: input.klingSecretKey ?? "",
      klingApiKey: input.klingApiKey ?? "",
    }),
  });
  return parseSettings(await response.json());
}

export async function createRun(graph: Graph, nodeIds?: readonly string[]): Promise<RunSnapshot> {
  const response = await request("/runs", {
    method: "POST",
    body: JSON.stringify({
      graph,
      ...(nodeIds && nodeIds.length > 0 ? { nodeIds } : {}),
    }),
  });
  return parseRun(await response.json());
}

export async function getRun(runId: string): Promise<RunSnapshot> {
  const response = await request(`/runs/${encodeURIComponent(runId)}`);
  return parseRun(await response.json());
}

export async function cancelRun(runId: string): Promise<RunSnapshot> {
  const response = await request(`/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
  return parseRun(await response.json());
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${engineOrigin()}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new EngineOfflineError();
  }
  if (!response.ok) throw await toError(response);
  return response;
}

async function toError(response: Response): Promise<EngineRequestError> {
  try {
    const body = (await response.json()) as unknown;
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const message = typeof record.message === "string" ? record.message : `引擎返回 ${response.status}`;
      const code = typeof record.error === "string" ? record.error : "http";
      return new EngineRequestError(message, code);
    }
  } catch {
    // The body was not JSON.
  }
  return new EngineRequestError(`引擎返回 ${response.status}`, "http");
}

function parseSettings(value: unknown): PublicSettings {
  if (!value || typeof value !== "object") {
    throw new EngineRequestError("引擎返回了无法识别的设置。", "invalid_response");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.openaiBaseUrl !== "string" ||
    typeof record.openaiApiKeySet !== "boolean" ||
    typeof record.comfyuiBaseUrl !== "string" ||
    typeof record.comfyuiApiKeySet !== "boolean" ||
    typeof record.wanBaseUrl !== "string" ||
    typeof record.wanApiKeySet !== "boolean" ||
    typeof record.klingBaseUrl !== "string" ||
    typeof record.klingAccessKeySet !== "boolean" ||
    typeof record.klingSecretKeySet !== "boolean" ||
    typeof record.klingApiKeySet !== "boolean"
  ) {
    throw new EngineRequestError("引擎返回了无法识别的设置。", "invalid_response");
  }
  return {
    openaiBaseUrl: record.openaiBaseUrl,
    openaiApiKeySet: record.openaiApiKeySet,
    comfyuiBaseUrl: record.comfyuiBaseUrl,
    comfyuiApiKeySet: record.comfyuiApiKeySet,
    wanBaseUrl: record.wanBaseUrl,
    wanApiKeySet: record.wanApiKeySet,
    klingBaseUrl: record.klingBaseUrl,
    klingAccessKeySet: record.klingAccessKeySet,
    klingSecretKeySet: record.klingSecretKeySet,
    klingApiKeySet: record.klingApiKeySet,
    envFile: typeof record.envFile === "string" ? record.envFile : "engine/.env",
  };
}

const NODE_STATUSES = new Set<NodeRunStatus>([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);

const RUN_STATUSES = new Set<RunStatus>(["running", "succeeded", "failed", "cancelled"]);

function parseRun(value: unknown): RunSnapshot {
  if (!value || typeof value !== "object") {
    throw new EngineRequestError("引擎返回了无法识别的运行状态。", "invalid_response");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !RUN_STATUSES.has(record.status as RunStatus)) {
    throw new EngineRequestError("引擎返回了无法识别的运行状态。", "invalid_response");
  }
  const nodes: RunSnapshot["nodes"] = {};
  if (record.nodes && typeof record.nodes === "object") {
    for (const [id, raw] of Object.entries(record.nodes)) {
      if (!raw || typeof raw !== "object") continue;
      const node = raw as Record<string, unknown>;
      const status = NODE_STATUSES.has(node.status as NodeRunStatus)
        ? (node.status as NodeRunStatus)
        : "failed";
      nodes[id] = {
        type: typeof node.type === "string" ? node.type : "",
        status,
        error: typeof node.error === "string" ? node.error : null,
        outputs: parseOutputs(node.outputs),
      };
    }
  }
  return {
    id: record.id,
    status: record.status as RunStatus,
    error: typeof record.error === "string" ? record.error : null,
    nodeIds: Array.isArray(record.nodeIds)
      ? record.nodeIds.filter((item): item is string => typeof item === "string")
      : [],
    nodes,
  };
}

function parseOutputs(value: unknown): RunSnapshot["nodes"][string]["outputs"] {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const outputs: RunSnapshot["nodes"][string]["outputs"] = {};
  if (typeof record.text === "string") outputs.text = record.text;
  const image = readMedia(record.image, "image/png");
  if (image) outputs.image = image;
  const video = readMedia(record.video, "video/mp4");
  if (video) outputs.video = video;
  return outputs;
}

function readMedia(value: unknown, fallbackType: string): RunMediaOutput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.relativePath !== "string" || typeof record.url !== "string") return undefined;
  return {
    relativePath: record.relativePath,
    mediaType: typeof record.mediaType === "string" ? record.mediaType : fallbackType,
    url: record.url,
  };
}
