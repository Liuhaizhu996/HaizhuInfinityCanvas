import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PortDataType } from "@haizhu/canvas-core";
import { assetUrl, type NodeRunStatus } from "@/lib/engine-client";
import type { AgentFlowNode } from "@/lib/flow-graph";
import { useRunStore } from "@/store/run";

const ROW = 20;
const FIRST_CENTER = 64;

const portClass: Record<PortDataType, string> = {
  text: "hz-port hz-port-text",
  image: "hz-port hz-port-image",
  video: "hz-port hz-port-video",
  audio: "hz-port hz-port-audio",
  storyboard: "hz-port hz-port-storyboard",
};

const statusLabel: Record<NodeRunStatus, string> = {
  pending: "等待",
  running: "运行中",
  succeeded: "完成",
  failed: "失败",
  cancelled: "已取消",
  skipped: "已跳过",
};

export function AgentNode({ id, data }: NodeProps<AgentFlowNode>) {
  const live = useRunStore((state) => state.run?.nodes[id]);
  const inputs = data.ports.filter((port) => port.direction === "input");
  const outputs = data.ports.filter((port) => port.direction === "output");

  return (
    <div className="hz-node w-56 rounded-[10px] border border-border bg-card px-3 py-2 text-card-foreground">
      {inputs.map((port, index) => (
        <Handle
          key={port.id}
          type="target"
          position={Position.Left}
          id={port.id}
          className={portClass[port.dataType]}
          style={{ top: FIRST_CENTER + index * ROW }}
        />
      ))}
      {outputs.map((port, index) => (
        <Handle
          key={port.id}
          type="source"
          position={Position.Right}
          id={port.id}
          className={portClass[port.dataType]}
          style={{ top: FIRST_CENTER + index * ROW }}
        />
      ))}
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-5">{data.label}</div>
        {live ? (
          <span
            className={`shrink-0 text-[10px] ${live.status === "failed" ? "text-destructive" : "text-primary"}`}
          >
            {statusLabel[live.status]}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 font-mono text-[10px] leading-4 text-muted-foreground">{data.nodeType}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-4">
        <div>
          {inputs.map((port) => (
            <div key={port.id} className="flex h-5 items-center text-[10px] text-muted-foreground">
              {port.name}
            </div>
          ))}
        </div>
        <div>
          {outputs.map((port) => (
            <div
              key={port.id}
              className="flex h-5 items-center justify-end text-[10px] text-muted-foreground"
            >
              {port.name}
            </div>
          ))}
        </div>
      </div>
      {live?.error ? (
        <p className="mt-2 line-clamp-3 text-[10px] leading-4 text-destructive">{live.error}</p>
      ) : null}
      {data.output?.text ? (
        <p className="mt-2 max-h-16 overflow-hidden whitespace-pre-wrap text-[11px] leading-4 text-foreground/90">
          {data.output.text}
        </p>
      ) : null}
      {data.output?.image ? (
        <img
          src={assetUrl(data.output.image.relativePath)}
          alt="生成的图像"
          className="hz-preview mt-2"
        />
      ) : null}
    </div>
  );
}
