import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@haizhu/ui";
import {
  EngineOfflineError,
  EngineRequestError,
  getSettings,
  putSettings,
  type PublicSettings,
} from "@/lib/engine-client";
import { useRunStore } from "@/store/run";
import { APP_VERSION } from "@/version";

const START_ENGINE = `cd engine
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787`;

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
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setApiKey("");
    setMessage(null);
    setError(null);
    setOffline(false);
    setLoading(true);
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

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
    <Dialog open={open} onOpenChange={setSettingsOpen}>
      <DialogContent aria-labelledby="settings-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle id="settings-title" className="font-display text-[15px] font-medium">
              引擎设置
            </DialogTitle>
            <DialogDescription className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Base URL 和 API Key 只交给本地 FastAPI。仓库里的{" "}
              <span className="font-mono">engine/.env.example</span> 保持空白。保存会重写{" "}
              <span className="font-mono">engine/.env</span>（已 gitignore）。
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="关闭"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} aria-hidden />
            </button>
          </DialogClose>
        </div>
        {loading ? (
          <p className="mt-4 text-[12px] text-muted-foreground">正在读取引擎设置…</p>
        ) : offline ? (
          <div className="mt-4 rounded-lg border border-border bg-background px-3 py-3 text-[12px] leading-relaxed">
            <p className="text-warning">引擎未连接。先启动 sidecar：</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre font-mono text-[11px] leading-5 text-muted-foreground">
              {START_ENGINE}
            </pre>
            <p className="mt-3 text-muted-foreground">也可以直接编辑 engine/.env：</p>
            <pre className="mt-2 font-mono text-[11px] text-muted-foreground">{`OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=`}</pre>
          </div>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="block text-[12px]">
              <span className="text-muted-foreground">OpenAI Base URL</span>
              <input
                id="openai-base-url"
                className="hz-field hz-field-mono mt-1"
                value={baseUrl}
                spellCheck={false}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="block text-[12px]">
              <span className="text-muted-foreground">OpenAI API Key</span>
              <input
                id="openai-api-key"
                type="password"
                autoComplete="off"
                className="hz-field hz-field-mono mt-1"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={known?.openaiApiKeySet ? "已设置，留空则不更改" : "未设置"}
              />
            </label>
            <p className="text-[12px] text-muted-foreground">
              {known?.openaiApiKeySet ? "当前密钥已配置。" : "当前没有密钥。"} 对话和图像共用这一组。
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
                关闭
              </Button>
              <Button type="submit" size="sm" disabled={busy || baseUrl.trim() === ""}>
                {busy ? "保存中" : "保存"}
              </Button>
            </div>
          </form>
        )}
        {message ? <p className="mt-3 text-[12px] leading-relaxed text-success">{message}</p> : null}
        {error ? <p className="mt-3 text-[12px] leading-relaxed text-danger">{error}</p> : null}
        {!loading && offline ? (
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              重试
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
              关闭
            </Button>
          </div>
        ) : null}
        <p className="mt-4 font-mono text-[11px] text-muted-foreground" translate="no">
          海珠无限画布 · v{APP_VERSION}
        </p>
      </DialogContent>
    </Dialog>
  );
}
