import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PortDataType } from "@haizhu/canvas-core";
import type { AgentFlowNode } from "@/lib/flow-graph";

const ROW = 20;
const FIRST_CENTER = 64;

const portClass: Record<PortDataType, string> = {
  text: "hz-port hz-port-text",
  image: "hz-port hz-port-image",
  video: "hz-port hz-port-video",
  audio: "hz-port hz-port-audio",
  storyboard: "hz-port hz-port-storyboard",
};

export function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  const inputs = data.ports.filter((port) => port.direction === "input");
  const outputs = data.ports.filter((port) => port.direction === "output");

  return (
    <div className="hz-node min-w-48 rounded-[10px] border border-border bg-card px-3 py-2 text-card-foreground">
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
      <div className="text-sm font-medium leading-5">{data.label}</div>
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
    </div>
  );
}
