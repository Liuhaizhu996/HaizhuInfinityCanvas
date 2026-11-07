import { useEffect, useState, type ReactNode } from "react";
import { FilmStrip, Image as ImageIcon, TextT } from "@phosphor-icons/react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Port, PortDataType } from "@haizhu/canvas-core";
import { nodeCatalog, type NodeCategory } from "@haizhu/node-sdk";
import { assetUrl } from "@/lib/engine-client";
import type { AgentFlowNode, StoredOutput } from "@/lib/flow-graph";
import { runStatusClass, runStatusLabel } from "@/lib/run-status";
import { useRunStore } from "@/store/run";

const widthFor: Record<NodeCategory, string> = {
  llm: "w-[252px]",
  image: "w-[288px]",
  video: "w-[288px]",
  audio: "w-[272px]",
  storyboard: "w-[252px]",
};

export function AgentNode({ id, data }: NodeProps<AgentFlowNode>) {
  const live = useRunStore((state) => state.run?.nodes[id]);
  const definition = nodeCatalog.find((item) => item.type === data.nodeType);
  const kind: NodeCategory = definition?.category ?? "llm";
  const inputs = data.ports.filter((port) => port.direction === "input");
  const outputs = data.ports.filter((port) => port.direction === "output");
  const tone =
    live?.status === "failed" ? "hz-node-failed" : live?.status === "running" ? "hz-node-running" : "";

  return (
    <div className={`hz-node text-card-foreground ${widthFor[kind]} ${tone}`}>
      <header className="flex items-start justify-between gap-2 px-3 pt-2.5">
        <h3 className="truncate font-display text-[13px] font-medium leading-5">{data.label}</h3>
        {live ? (
          <span className={`shrink-0 text-[11px] leading-5 ${runStatusClass(live.status)}`}>
            {runStatusLabel[live.status]}
          </span>
        ) : null}
      </header>
      <div className="mt-0.5 flex items-center gap-2 px-3">
        <p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" translate="no">
          {data.nodeType}
        </p>
        {definition && !definition.executable ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">占位</span>
        ) : null}
      </div>
      <div className="px-3 pt-2">
        <MediaWell kind={kind} output={data.output} label={data.label} />
      </div>
      {live?.error ? (
        <p className="mt-2 line-clamp-3 px-3 text-[11px] leading-4 text-danger">{live.error}</p>
      ) : null}
      <PortColumns inputs={inputs} outputs={outputs} />
    </div>
  );
}

function MediaWell({
  kind,
  output,
  label,
}: {
  kind: NodeCategory;
  output?: StoredOutput;
  label: string;
}) {
  if (kind === "image") {
    return output?.image ? (
      <div className="hz-well aspect-[16/10]">
        <PreviewImage path={output.image.relativePath} alt={`${label}的画面`} />
      </div>
    ) : (
      <EmptyWell aspect="aspect-[16/10]" icon={<ImageIcon size={20} aria-hidden />} label="尚无画面" />
    );
  }
  if (kind === "video") {
    return output?.video ? (
      <div className="hz-well aspect-[16/10]">
        <video
          src={assetUrl(output.video.relativePath)}
          className="h-full w-full bg-background object-contain"
          controls
          playsInline
          preload="metadata"
          aria-label={`${label}的视频`}
        />
      </div>
    ) : (
      <EmptyWell aspect="aspect-[16/10]" icon={<FilmStrip size={20} aria-hidden />} label="尚无视频" />
    );
  }
  if (kind === "audio") {
    return output?.audio ? (
      <div className="hz-well flex min-h-[76px] items-center px-2.5">
        <audio
          src={assetUrl(output.audio.relativePath)}
          className="w-full"
          controls
          preload="metadata"
          aria-label={`${label}的音频`}
          style={{ colorScheme: "dark", height: 32 }}
        />
      </div>
    ) : (
      <EmptyWell aspect="min-h-[84px]" icon={<AudioBars />} label="尚无音频" />
    );
  }
  if (kind === "storyboard") {
    return output?.text ? (
      <TextWell text={output.text} />
    ) : (
      <EmptyWell aspect="min-h-[88px]" icon={<StoryFrames />} label="尚无分镜" />
    );
  }
  return output?.text ? <TextWell text={output.text} /> : (
    <EmptyWell aspect="min-h-[96px]" icon={<TextT size={18} aria-hidden />} label="尚无文本" />
  );
}

function TextWell({ text }: { text: string }) {
  return (
    <div className="hz-well min-h-[96px] px-2.5 py-2">
      <p className="line-clamp-6 whitespace-pre-wrap text-[12px] leading-5 text-foreground/90">{text}</p>
    </div>
  );
}

function PreviewImage({ path, alt }: { path: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [path]);
  if (broken) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
        <ImageIcon size={20} aria-hidden />
        <span className="text-[11px]">画面没有加载</span>
      </div>
    );
  }
  return (
    <img
      src={assetUrl(path)}
      alt={alt}
      draggable={false}
      className="h-full w-full object-contain"
      onError={() => setBroken(true)}
    />
  );
}

function EmptyWell({
  aspect,
  icon,
  label,
}: {
  aspect: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className={`hz-well flex flex-col items-center justify-center gap-1.5 text-muted-foreground ${aspect}`}>
      {icon}
      <span className="text-[11px]">{label}</span>
    </div>
  );
}

function AudioBars() {
  const bars = [10, 18, 28, 14, 36, 22, 12, 30, 16, 24, 11, 20];
  return (
    <span className="flex h-9 items-end gap-[3px]" aria-hidden>
      {bars.map((height, index) => (
        <span key={index} className="w-[3px] rounded-full bg-white/25" style={{ height }} />
      ))}
    </span>
  );
}

function StoryFrames() {
  return (
    <span className="flex gap-1.5" aria-hidden>
      {[0, 1, 2].map((frame) => (
        <span key={frame} className="h-8 w-10 rounded-[4px] border border-white/15 bg-white/[0.03]" />
      ))}
    </span>
  );
}

function PortColumns({ inputs, outputs }: { inputs: Port[]; outputs: Port[] }) {
  if (inputs.length === 0 && outputs.length === 0) return null;
  const rows = Math.max(inputs.length, outputs.length);
  return (
    <div className="mt-2 grid grid-cols-2 pb-2">
      <div>
        {Array.from({ length: rows }, (_, index) => {
          const port = inputs[index];
          return port ? (
            <PortRow key={port.id} port={port} side="input" />
          ) : (
            <div key={`in-${index}`} className="h-6" />
          );
        })}
      </div>
      <div>
        {Array.from({ length: rows }, (_, index) => {
          const port = outputs[index];
          return port ? (
            <PortRow key={port.id} port={port} side="output" />
          ) : (
            <div key={`out-${index}`} className="h-6" />
          );
        })}
      </div>
    </div>
  );
}

function PortRow({ port, side }: { port: Port; side: "input" | "output" }) {
  const output = side === "output";
  return (
    <div className={`relative flex h-6 items-center ${output ? "justify-end pr-3" : "pl-3"}`}>
      <Handle
        type={output ? "source" : "target"}
        position={output ? Position.Right : Position.Left}
        id={port.id}
        className={`hz-port hz-port-${port.dataType satisfies PortDataType}`}
        style={
          output
            ? { right: 0, top: "50%", left: "auto", transform: "translate(50%, -50%)" }
            : { left: 0, top: "50%", right: "auto", transform: "translate(-50%, -50%)" }
        }
        title={`${port.name} · ${port.dataType}`}
        aria-label={`${output ? "输出" : "输入"} ${port.name} ${port.dataType}`}
      />
      <span className="truncate text-[11px] text-muted-foreground">{port.name}</span>
    </div>
  );
}
