import { useRef, useState } from "react";
import { nodeCatalog, type FieldOption, type NodeField } from "@haizhu/node-sdk";
import { assetUrl } from "@/lib/engine-client";
import { readOutput } from "@/lib/flow-graph";
import { useCanvasStore } from "@/store/canvas";
import { useRunStore } from "@/store/run";

export function Inspector() {
  const project = useCanvasStore((state) => state.project);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const running = useRunStore((state) => state.run?.status === "running");
  const nodeRuns = useRunStore((state) => state.run?.nodes);
  const armed = useRef(true);

  const selected =
    selectedNodeIds.length === 1
      ? project.graph.nodes.find((node) => node.id === selectedNodeIds[0])
      : undefined;
  const definition = selected ? nodeCatalog.find((item) => item.type === selected.type) : undefined;
  const live = selected ? nodeRuns?.[selected.id] : undefined;
  const output = selected ? readOutput(selected.data) : undefined;

  function commit(patch: Record<string, unknown>) {
    if (!selected) return;
    const recordHistory = armed.current;
    armed.current = false;
    updateNodeData(selected.id, patch, recordHistory);
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card/40">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">检查器</h2>
        <p className="text-[11px] text-muted-foreground">参数写在画布文件里。密钥不写。</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {selectedNodeIds.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            选择一个节点，填写提示词、模型或 seed。运行整张图，或只运行选中的节点（会带上上游）。
          </p>
        ) : null}
        {selectedNodeIds.length > 1 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            已选择 {selectedNodeIds.length} 个节点。「运行所选」会带上它们的上游。点一个节点可编辑参数。
          </p>
        ) : null}
        {selected && definition ? (
          <form
            className="space-y-3"
            onSubmit={(event) => event.preventDefault()}
          >
            <div>
              <div className="text-sm font-medium">{definition.title}</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{definition.type}</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{definition.summary}</p>
            </div>
            {live ? (
              <p className={`text-xs ${live.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                状态：{statusLabel(live.status)}
                {live.error ? `。${live.error}` : ""}
              </p>
            ) : null}
            <Field
              label="名称"
              value={typeof selected.data.label === "string" ? selected.data.label : ""}
              disabled={running}
              onFocus={() => {
                armed.current = true;
              }}
              onChange={(value) => commit({ label: value })}
            />
            {definition.fields.map((field) => (
              <CatalogField
                key={`${selected.id}:${field.key}`}
                field={field}
                value={selected.data[field.key]}
                disabled={running}
                onFocus={() => {
                  armed.current = true;
                }}
                onCommit={(value) => commit({ [field.key]: value })}
              />
            ))}
            {definition.type === "comfyui.image" ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                地址留空则用设置里的 COMFYUI_BASE_URL。工作流用 ComfyUI 的 Save (API Format)，不要把密钥贴进去。
              </p>
            ) : null}
            {definition.type === "video.wan-kling" ? (
              <p className="rounded-md border border-primary/40 px-3 py-2 text-xs leading-relaxed">
                视频会向 Wan 或 Kling 计费。只有点击「运行」才会提交这一次，失败不会自动重试。取消会停止轮询且不再跑下游；供应商如果已经接单，仍可能计费。
              </p>
            ) : null}
            {definition.type === "tts.edge" ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                不需要密钥，也不使用 edge-tts 包。点一次「运行」才会向微软的语音接口提交这一段文本。取消或超时都不会再跑下游。
              </p>
            ) : null}
            {definition.type === "tts.cosyvoice" ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                地址留空则用设置里的 COSYVOICE_BASE_URL。密钥只在「设置」里。不会把参考音频发给服务，也不会把密钥写进画布。
              </p>
            ) : null}
            {!definition.executable ? (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                这个节点本周不会执行。可运行的是对话、OpenAI 图像、ComfyUI、视频和两种语音。
              </p>
            ) : null}
            {running ? (
              <p className="text-[11px] text-muted-foreground">运行中。这次提交不会带上之后的修改。</p>
            ) : null}
            {output?.text ? (
              <div>
                <div className="text-[11px] text-muted-foreground">输出</div>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background px-2 py-2 text-xs leading-relaxed">
                  {output.text}
                </pre>
              </div>
            ) : null}
            {output?.image ? (
              <div>
                <div className="text-[11px] text-muted-foreground">输出</div>
                <img
                  src={assetUrl(output.image.relativePath)}
                  alt="生成的图像"
                  className="hz-preview mt-1"
                />
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{output.image.relativePath}</p>
              </div>
            ) : null}
            {output?.video ? (
              <div>
                <div className="text-[11px] text-muted-foreground">输出</div>
                <video
                  src={assetUrl(output.video.relativePath)}
                  controls
                  playsInline
                  preload="metadata"
                  className="hz-preview mt-1"
                />
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{output.video.relativePath}</p>
              </div>
            ) : null}
            {output?.audio ? (
              <div>
                <div className="text-[11px] text-muted-foreground">输出</div>
                <audio
                  src={assetUrl(output.audio.relativePath)}
                  controls
                  preload="metadata"
                  className="nodrag nopan hz-audio mt-1"
                />
                <a
                  className="mt-1 inline-block text-[10px] text-primary underline"
                  href={assetUrl(output.audio.relativePath)}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开音频
                </a>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{output.audio.relativePath}</p>
              </div>
            ) : null}
          </form>
        ) : null}
        {selected && !definition ? (
          <p className="text-xs text-muted-foreground">未知节点类型 {selected.type}。运行时会失败。</p>
        ) : null}
      </div>
    </aside>
  );
}

function CatalogField({
  field,
  value,
  disabled,
  onFocus,
  onCommit,
}: {
  field: NodeField;
  value: unknown;
  disabled?: boolean;
  onFocus: () => void;
  onCommit: (value: string | number | undefined) => void;
}) {
  if (field.kind === "select") {
    const options = field.options ?? [];
    const allowed = new Set(options.map((option) => option.value));
    const fallback = typeof field.default === "string" ? field.default : options[0]?.value ?? "";
    const shown = typeof value === "string" && allowed.has(value) ? value : fallback;
    return (
      <SelectField
        label={field.label}
        help={field.help}
        value={shown}
        options={options}
        disabled={disabled}
        onFocus={onFocus}
        onChange={(next) => onCommit(next)}
      />
    );
  }
  if (field.kind === "number") {
    return (
      <NumberField
        label={field.label}
        help={field.help}
        value={typeof value === "number" && Number.isFinite(value) ? value : undefined}
        disabled={disabled}
        onFocus={onFocus}
        onCommit={onCommit}
      />
    );
  }
  const shown = typeof value === "string" ? value : "";
  return (
    <Field
      label={field.label}
      help={field.help}
      value={shown}
      disabled={disabled}
      multiline={field.kind === "textarea"}
      placeholder={field.placeholder ?? (typeof field.default === "string" ? field.default : undefined)}
      onFocus={onFocus}
      onChange={(next) => onCommit(next)}
    />
  );
}

function SelectField({
  label,
  help,
  value,
  options,
  disabled,
  onFocus,
  onChange,
}: {
  label: string;
  help?: string;
  value: string;
  options: readonly FieldOption[];
  disabled?: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <select
        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
        value={value}
        disabled={disabled}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {help ? <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{help}</span> : null}
    </label>
  );
}

function NumberField({
  label,
  help,
  value,
  disabled,
  onFocus,
  onCommit,
}: {
  label: string;
  help?: string;
  value: number | undefined;
  disabled?: boolean;
  onFocus: () => void;
  onCommit: (value: string | number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? "" : String(value));
  return (
    <Field
      label={label}
      help={help}
      value={shown}
      disabled={disabled}
      inputMode="decimal"
      placeholder="留空"
      onFocus={() => {
        onFocus();
        setDraft(shown);
      }}
      onChange={(next) => {
        setDraft(next);
        if (next.trim() === "") {
          onCommit(undefined);
          return;
        }
        if (next === "-" || next === "." || next === "-." || /^-?\d+\.$/.test(next)) return;
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onCommit(parsed);
      }}
    />
  );
}

function Field({
  label,
  help,
  value,
  disabled,
  multiline,
  placeholder,
  inputMode,
  onFocus,
  onChange,
}: {
  label: string;
  help?: string;
  value: string;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
  inputMode?: "decimal";
  onFocus: () => void;
  onChange: (value: string) => void;
}) {
  const className =
    "mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className={`${className} min-h-20 resize-y`}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={className}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={inputMode}
          spellCheck={false}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {help ? <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{help}</span> : null}
    </label>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "等待";
    case "running":
      return "运行中";
    case "succeeded":
      return "完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "skipped":
      return "已跳过";
    default:
      return status;
  }
}
