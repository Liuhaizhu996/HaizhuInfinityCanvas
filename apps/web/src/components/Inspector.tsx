import { useRef, useState } from "react";
import { nodeCatalog, type NodeField } from "@haizhu/node-sdk";
import { assetUrl } from "@/lib/engine-client";
import { readOutput } from "@/lib/flow-graph";
import { runStatusClass, runStatusLabel } from "@/lib/run-status";
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
    <aside className="hz-glass hz-rail absolute bottom-0 right-0 top-[var(--hz-top)] z-20 flex w-[var(--hz-inspector)] flex-col border-l border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-medium">检查器</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">参数写在画布文件里。密钥不写。</p>
      </div>
      <div className="hz-scroll flex-1 overflow-y-auto px-4 py-4">
        {selectedNodeIds.length === 0 ? (
          <div className="flex min-h-full flex-col justify-center py-8">
            <p className="font-display text-[13px] font-medium">未选择节点</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              选中后可以改提示词、模型和 seed。运行整张图，或只运行选中的节点（会带上上游）。
            </p>
          </div>
        ) : null}
        {selectedNodeIds.length > 1 ? (
          <div className="flex min-h-full flex-col justify-center py-8">
            <p className="font-display text-[13px] font-medium">已选择 {selectedNodeIds.length} 个节点</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              「运行所选」会带上它们的上游。点一个节点可编辑参数。
            </p>
          </div>
        ) : null}
        {selected && definition ? (
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            <div>
              <div className="font-display text-[15px] font-medium">{definition.title}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="truncate font-mono text-[11px] text-muted-foreground" translate="no">
                  {definition.type}
                </span>
                <span className={definition.executable ? "text-[11px] text-success" : "text-[11px] text-muted-foreground"}>
                  {definition.executable ? "可运行" : "占位"}
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{definition.summary}</p>
            </div>
            {live ? (
              <p className={`text-[12px] leading-relaxed ${runStatusClass(live.status)}`}>
                {runStatusLabel[live.status]}
                {live.error ? <span className="text-danger">。{live.error}</span> : null}
              </p>
            ) : null}
            <div className="space-y-3">
              <h3 className="text-[12px] text-muted-foreground">参数</h3>
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
            </div>
            {!definition.executable ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                这个节点可以保存和连线。当前引擎不会执行。
              </p>
            ) : null}
            {running ? (
              <p className="text-[12px] text-muted-foreground">运行中。这次提交不会带上之后的修改。</p>
            ) : null}
            {output?.text || output?.image || output?.video || output?.audio ? (
              <div className="space-y-2">
                <h3 className="text-[12px] text-muted-foreground">输出</h3>
                {output.text ? (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background px-2.5 py-2 text-[12px] leading-relaxed">
                    {output.text}
                  </pre>
                ) : null}
                {output.image ? (
                  <figure>
                    <img
                      src={assetUrl(output.image.relativePath)}
                      alt="生成的图像"
                      className="hz-well max-h-64 w-full object-contain"
                    />
                    <figcaption className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {output.image.relativePath}
                    </figcaption>
                  </figure>
                ) : null}
                {output.video ? (
                  <figure>
                    <video
                      src={assetUrl(output.video.relativePath)}
                      className="hz-well max-h-64 w-full bg-background"
                      controls
                      playsInline
                      preload="metadata"
                    />
                    <figcaption className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {output.video.relativePath}
                    </figcaption>
                  </figure>
                ) : null}
                {output.audio ? (
                  <figure>
                    <audio
                      src={assetUrl(output.audio.relativePath)}
                      className="w-full"
                      controls
                      preload="metadata"
                      style={{ colorScheme: "dark" }}
                    />
                    <figcaption className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {output.audio.relativePath}
                    </figcaption>
                  </figure>
                ) : null}
              </div>
            ) : null}
          </form>
        ) : null}
        {selected && !definition ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            未知节点类型 <span className="font-mono" translate="no">{selected.type}</span>。运行时会失败。
          </p>
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
      mono={field.key === "model" || field.key === "size"}
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
      mono
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
  mono,
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
  mono?: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
}) {
  const className = `hz-field mt-1 ${mono ? "hz-field-mono" : ""}`;
  return (
    <label className="block">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className={`${className} min-h-24 resize-y`}
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
      {help ? <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{help}</span> : null}
    </label>
  );
}
