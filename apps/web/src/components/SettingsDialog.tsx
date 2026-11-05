import { useEffect, useState } from "react";
import { Button } from "@haizhu/ui";
import {
  EngineOfflineError,
  EngineRequestError,
  getSettings,
  putSettings,
  type PublicSettings,
} from "@/lib/engine-client";
import { useRunStore } from "@/store/run";

export function SettingsDialog() {
  const open = useRunStore((state) => state.settingsOpen);
  const setSettingsOpen = useRunStore((state) => state.setSettingsOpen);
  const refreshHealth = useRunStore((state) => state.refreshHealth);
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [known, setKnown] = useState<PublicSettings | null>(null);
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setApiKey("");
    setMessage(null);
    setError(null);
    setOffline(false);
    void (async () => {
      try {
        const settings = await getSettings();
        if (cancelled) return;
        setKnown(settings);
        setBaseUrl(settings.openaiBaseUrl);
        setOffline(false);
      } catch (caught) {
        if (cancelled) return;
        setKnown(null);
        setOffline(true);
        if (!(caught instanceof EngineOfflineError)) {
          setError(caught instanceof Error ? caught.message : "无法读取设置。");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setSettingsOpen]);

  if (!open) return null;

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await putSettings({
        openaiBaseUrl: baseUrl.trim(),
        openaiApiKey: apiKey.trim() ? apiKey.trim() : undefined,
      });
      setKnown(saved);
      setApiKey("");
      setOffline(false);
      setMessage("已写入 engine/.env。密钥只留在本机 sidecar，不会进 .hzcanvas。");
      useRunStore.getState().clearRunBanner();
      await refreshHealth();
    } catch (caught) {
      if (caught instanceof EngineOfflineError) {
        setOffline(true);
        setError("引擎未连接，没有写入。");
      } else if (caught instanceof EngineRequestError) {
        setError(caught.message);
      } else {
        setError("没有保存。");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4"
      role="presentation"
      onMouseDown={() => setSettingsOpen(false)}
    >
      <div
        role="dialog"
        aria-labelledby="settings-title"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="settings-title" className="text-sm font-semibold">
          引擎设置
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Base URL 和 API Key 只交给本地 FastAPI。仓库里的 <span className="font-mono">engine/.env.example</span>{" "}
          保持空白。保存会重写 <span className="font-mono">engine/.env</span>（已 gitignore）。
        </p>
        {offline ? (
          <div className="mt-3 rounded-md border border-destructive/40 px-3 py-2 text-xs leading-relaxed text-destructive">
            引擎未连接。先启动 sidecar：
            <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">{`cd engine
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787`}</pre>
            也可以直接编辑 <span className="font-mono">engine/.env</span>：
            <pre className="mt-2 font-mono text-[10px] text-muted-foreground">{`OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=`}</pre>
          </div>
        ) : (
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="block text-xs">
              <span className="text-muted-foreground">OpenAI Base URL</span>
              <input
                id="openai-base-url"
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={baseUrl}
                spellCheck={false}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">OpenAI API Key</span>
              <input
                id="openai-api-key"
                type="password"
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={known?.openaiApiKeySet ? "已设置，留空则不更改" : "未设置"}
              />
            </label>
            <p className="text-[11px] text-muted-foreground">
              {known?.openaiApiKeySet ? "当前密钥已配置。" : "当前没有密钥。"} 对话和图像共用这一组。
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
                关闭
              </Button>
              <Button type="submit" size="sm" disabled={busy || baseUrl.trim() === ""}>
                保存到 engine/.env
              </Button>
            </div>
          </form>
        )}
        {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}
        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
        {offline ? (
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              重试
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
              关闭
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
