import { useRef, useState } from "react";
import { nodeCatalog, type NodeField } from "@haizhu/node-sdk";
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
            {!definition.executable ? (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                这个节点本周不会执行。可运行的是对话 LLM 和图像。
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
