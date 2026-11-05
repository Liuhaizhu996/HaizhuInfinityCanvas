# 海珠无限画布 Haizhu Infinity Canvas

`1.0.0-beta.1` · 私有 / All rights reserved

无限画布上的多模型 Agent 工作流。当前版本 `1.0.0-beta.1`：可拖放的 Agent 库、`.hzcanvas` 保存、本地 FastAPI 跑一次对话、OpenAI 图像、本机 ComfyUI 或 Wan/Kling 视频。没有桌面安装包。语音仍是占位。

## 运行 Web

需要 Node.js 20+ 和 pnpm 10。

```bash
pnpm install
pnpm --filter web dev
```

打开 http://127.0.0.1:5173 。从左侧 Agent 库把节点拖到画布上（也可以点击添加），可以连线。顶栏可以下载或打开 `.hzcanvas`，也可以运行或取消。构建：

```bash
pnpm --filter web build
```

## 运行引擎

需要 Python 3.12。

```bash
cd engine
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787
```

`GET http://127.0.0.1:8787/health` → `{"ok":true,"version":"1.0.0-beta.1"}`

密钥不要写进仓库。在网页「设置」里保存，或复制 `engine/.env.example` 为 `engine/.env` 后填写（该文件已被 git 忽略）：

```bash
# engine/.env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-your-key
COMFYUI_BASE_URL=http://127.0.0.1:8188
WAN_API_BASE=https://dashscope.aliyuncs.com/api/v1
WAN_API_KEY=
KLING_API_BASE=https://api.klingai.com
KLING_ACCESS_KEY=
KLING_SECRET_KEY=
```

对话和 OpenAI 图像共用 `OPENAI_*`。ComfyUI 指向你本机已经启动的服务。Wan 的 Base 要带 `/api/v1`，Kling 的 Base 不要带 `/v1`。进程环境变量在启动时优先于文件；网页保存之后，以 sidecar 内存里的新值为准，并写回 `engine/.env`。

```bash
.venv/bin/pytest
```

## 跑一次 对话 → 图像

1. 先开引擎，再开网页。顶栏应显示「引擎在线」。若显示「引擎未连接」，看画布上的提示。
2. 打开「设置」，填写 Base URL 和 API Key，保存到 `engine/.env`。
3. 从 Agent 库拖入「对话 LLM」和「图像」。把对话的 `text` 连到图像的 `prompt`。
4. 选中对话节点，在右侧检查器写提示词。模型默认 `gpt-4o-mini` 和 `dall-e-3`，可改。
5. 点「运行」。只提交这一次，不会自动重试。选中节点时「运行所选」会带上上游。
6. 图像出现在节点上。保存的 `.hzcanvas` 只记录 `images/...` 路径，字节在 `engine/var/assets/`（gitignore）。浏览器不会创建旁边的 `*.hzcanvas.assets` 目录。

取消会停掉正在进行的请求，并不再跑下游。图里如果有环，文件仍可保存，运行会返回 422。

## 跑一次 ComfyUI 或视频

1. ComfyUI：先在本机启动你自己的 ComfyUI（默认 `http://127.0.0.1:8188`）。在检查器里粘贴 **Save (API Format)** 工作流，或填写 `workflowPath`。提示词用 `{{prompt}}`，或填写提示词节点。可选参考图连到左侧的 `image`。点一次「运行」。
2. 视频：在「设置」里填写 Wan 或 Kling 的地址和密钥，再在节点上选择供应商、模型和时长。把文本连到 `prompt`，需要图生视频时再连一张图。点一次「运行」。失败不会自动重试。取消会停止轮询；供应商如果已经接单，仍可能计费。

工作流形状、轮询地址和密钥名称见 [engine/README.md](engine/README.md)。

## 文档

- [可行性](docs/research.md)
- [技术选型 ADR-001](docs/adr/ADR-001-stack.md)（为什么用 xyflow 而不是 tldraw）
- [路线图](docs/ROADMAP.md)
- [`.hzcanvas` 文件](docs/hzcanvas.md)

依赖以 MIT / Apache-2.0 为准。脚手架里已有的 Uvicorn 与测试用 httpx 是 BSD-3-Clause。本周的模型请求走 Python 标准库，没有新增第三方包。本仓库不包含 AGPL/GPL 源码。

## English

Private monorepo for a node-graph agent canvas. `1.0.0-beta.1` can drag agents, save `.hzcanvas`, and run one explicit pass for OpenAI chat, OpenAI image, a user-run ComfyUI, or Wan/Kling video. It does not build a desktop installer.

- Web: `pnpm install`, then `pnpm --filter web dev` → http://127.0.0.1:5173 . Drag agents, connect `text` → `prompt`, set the key in Settings, then Run once. See [docs/hzcanvas.md](docs/hzcanvas.md).
- Schema tests: `pnpm --filter @haizhu/canvas-core test`
- Engine: commands above. Health returns `{"ok":true,"version":"1.0.0-beta.1"}`. Endpoints and adapter status: [engine/README.md](engine/README.md).
- Provider URLs and keys live in the environment or `engine/.env` (`OPENAI_*`, `COMFYUI_*`, `WAN_*`, `KLING_*`). The example file stays blank. The graph file never stores a key.
- Still stubbed: Edge-TTS, CosyVoice, storyboard execution, batch runs, streaming, FFmpeg, Tauri. See `apps/desktop` and `plugins`.
- Docs: feasibility, stack ADR, roadmap.

```
apps/web/              Vite + React 19 canvas
apps/desktop/          Tauri 2 stub
packages/canvas-core/  graph, node, and port types
packages/node-sdk/     node manifests
packages/ui/           shadcn button and cn()
engine/                FastAPI sidecar
plugins/               adapter boundaries
docs/                  research, ADR-001, roadmap
```
