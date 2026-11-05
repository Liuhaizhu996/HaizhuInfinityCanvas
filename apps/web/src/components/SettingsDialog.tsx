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

const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function SettingsDialog() {
  const open = useRunStore((state) => state.settingsOpen);
  const setSettingsOpen = useRunStore((state) => state.setSettingsOpen);
  const refreshHealth = useRunStore((state) => state.refreshHealth);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("https://api.openai.com/v1");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [comfyuiBaseUrl, setComfyuiBaseUrl] = useState("http://127.0.0.1:8188");
  const [comfyuiApiKey, setComfyuiApiKey] = useState("");
  const [wanBaseUrl, setWanBaseUrl] = useState("https://dashscope.aliyuncs.com/api/v1");
  const [wanApiKey, setWanApiKey] = useState("");
  const [klingBaseUrl, setKlingBaseUrl] = useState("https://api.klingai.com");
  const [klingAccessKey, setKlingAccessKey] = useState("");
  const [klingSecretKey, setKlingSecretKey] = useState("");
  const [klingApiKey, setKlingApiKey] = useState("");
  const [known, setKnown] = useState<PublicSettings | null>(null);
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOpenaiApiKey("");
    setComfyuiApiKey("");
    setWanApiKey("");
    setKlingAccessKey("");
    setKlingSecretKey("");
    setKlingApiKey("");
    setMessage(null);
    setError(null);
    setOffline(false);
    void (async () => {
      try {
        const settings = await getSettings();
        if (cancelled) return;
        setKnown(settings);
        setOpenaiBaseUrl(settings.openaiBaseUrl);
        setComfyuiBaseUrl(settings.comfyuiBaseUrl);
        setWanBaseUrl(settings.wanBaseUrl);
        setKlingBaseUrl(settings.klingBaseUrl);
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

  const basesReady =
    openaiBaseUrl.trim() !== "" && comfyuiBaseUrl.trim() !== "" && wanBaseUrl.trim() !== "" && klingBaseUrl.trim() !== "";

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await putSettings({
        openaiBaseUrl: openaiBaseUrl.trim(),
        openaiApiKey: openaiApiKey.trim() || undefined,
        comfyuiBaseUrl: comfyuiBaseUrl.trim(),
        comfyuiApiKey: comfyuiApiKey.trim() || undefined,
        wanBaseUrl: wanBaseUrl.trim(),
        wanApiKey: wanApiKey.trim() || undefined,
        klingBaseUrl: klingBaseUrl.trim(),
        klingAccessKey: klingAccessKey.trim() || undefined,
        klingSecretKey: klingSecretKey.trim() || undefined,
        klingApiKey: klingApiKey.trim() || undefined,
      });
      setKnown(saved);
      setOpenaiApiKey("");
      setComfyuiApiKey("");
      setWanApiKey("");
      setKlingAccessKey("");
      setKlingSecretKey("");
      setKlingApiKey("");
      setOffline(false);
      setMessage("已写入 engine/.env。密钥只留在本机 sidecar，不会进 .hzcanvas。保存不会发起视频请求。");
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
        className="max-h-[min(85vh,760px)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="settings-title" className="text-sm font-semibold">
          引擎设置
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          地址和密钥只交给本地 FastAPI。仓库里的 <span className="font-mono">engine/.env.example</span>{" "}
          保持空白。保存会重写 <span className="font-mono">engine/.env</span>（已 gitignore），不会发起请求。
        </p>
        {offline ? (
          <div className="mt-3 rounded-md border border-destructive/40 px-3 py-2 text-xs leading-relaxed text-destructive">
            引擎未连接。先启动 sidecar：
            <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">{`cd engine
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787`}</pre>
            也可以直接编辑 <span className="font-mono">engine/.env</span>：
            <pre className="mt-2 font-mono text-[10px] text-muted-foreground">{`OPENAI_BASE_URL=
OPENAI_API_KEY=
COMFYUI_BASE_URL=
COMFYUI_API_KEY=
WAN_API_BASE=
WAN_API_KEY=
KLING_API_BASE=
KLING_ACCESS_KEY=
KLING_SECRET_KEY=
KLING_API_KEY=`}</pre>
          </div>
        ) : (
          <form
            className="mt-3 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <section className="space-y-3">
              <h3 className="text-xs font-medium">OpenAI 兼容</h3>
              <TextField
                id="openai-base-url"
                label="OpenAI Base URL"
                value={openaiBaseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={setOpenaiBaseUrl}
              />
              <SecretField
                id="openai-api-key"
                label="OpenAI API Key"
                value={openaiApiKey}
                placeholder={known?.openaiApiKeySet ? "已设置，留空则不更改" : "未设置"}
                onChange={setOpenaiApiKey}
              />
              <p className="text-[11px] text-muted-foreground">
                {known?.openaiApiKeySet ? "当前密钥已配置。" : "当前没有密钥。"} 对话和图像共用这一组。
              </p>
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-medium">ComfyUI</h3>
              <TextField
                id="comfyui-base-url"
                label="ComfyUI Base URL"
                value={comfyuiBaseUrl}
                placeholder="http://127.0.0.1:8188"
                onChange={setComfyuiBaseUrl}
              />
              <SecretField
                id="comfyui-api-key"
                label="ComfyUI API Key"
                value={comfyuiApiKey}
                placeholder={known?.comfyuiApiKeySet ? "已设置，留空则不更改" : "本地实例通常留空"}
                onChange={setComfyuiApiKey}
              />
              <p className="text-[11px] text-muted-foreground">
                本机 ComfyUI 一般不需要密钥。节点上的地址可以覆盖这里的 Base URL。
              </p>
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-medium">万相 Wan</h3>
              <TextField
                id="wan-base-url"
                label="Wan API Base"
                value={wanBaseUrl}
                placeholder="https://dashscope.aliyuncs.com/api/v1"
                onChange={setWanBaseUrl}
              />
              <SecretField
                id="wan-api-key"
                label="Wan API Key"
                value={wanApiKey}
                placeholder={known?.wanApiKeySet ? "已设置，留空则不更改" : "未设置"}
                onChange={setWanApiKey}
              />
              <p className="text-[11px] text-muted-foreground">
                Base 含 /api/v1。中国大陆可用 dashscope.aliyuncs.com，国际站换 dashscope-intl。保存不会生成视频。
              </p>
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-medium">可灵 Kling</h3>
              <TextField
                id="kling-base-url"
                label="Kling API Base"
                value={klingBaseUrl}
                placeholder="https://api.klingai.com"
                onChange={setKlingBaseUrl}
              />
              <SecretField
                id="kling-api-key"
                label="Kling API Key"
                value={klingApiKey}
                placeholder={known?.klingApiKeySet ? "已设置，留空则不更改" : "新接口可只填这一项"}
                onChange={setKlingApiKey}
              />
              <SecretField
                id="kling-access-key"
                label="Kling Access Key"
                value={klingAccessKey}
                placeholder={known?.klingAccessKeySet ? "已设置，留空则不更改" : "与 Secret Key 成对"}
                onChange={setKlingAccessKey}
              />
              <SecretField
                id="kling-secret-key"
                label="Kling Secret Key"
                value={klingSecretKey}
                placeholder={known?.klingSecretKeySet ? "已设置，留空则不更改" : "与 Access Key 成对"}
                onChange={setKlingSecretKey}
              />
              <p className="text-[11px] text-muted-foreground">
                Base 不要带 /v1。填了 API Key 时用它；否则用 Access Key 和 Secret Key 签一个短期 JWT。视频只有点「运行」才提交一次。
              </p>
            </section>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
                关闭
              </Button>
              <Button type="submit" size="sm" disabled={busy || !basesReady}>
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

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs" htmlFor={id}>
      <span className="text-muted-foreground">{label}</span>
      <input
        id={id}
        className={INPUT_CLASS}
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SecretField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs" htmlFor={id}>
      <span className="text-muted-foreground">{label}</span>
      <input
        id={id}
        type="password"
        autoComplete="off"
        className={INPUT_CLASS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
