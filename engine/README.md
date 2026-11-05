# Engine

Python 3.12 FastAPI sidecar. It runs one graph at a time for `openai.chat` and `openai.image`. It does not call ComfyUI, Wan, Kling, or TTS, and it does not shell out to FFmpeg.

```bash
cd engine
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787
```

`GET /health` returns `{"ok":true,"version":"1.0.0-beta.1"}`. The version string is read from the repository `VERSION` file.

```bash
.venv/bin/pytest
```

Runtime third-party packages stay FastAPI (MIT) and Uvicorn (BSD-3-Clause). The HTTP client is the Python standard library. Tests use pytest and httpx because Starlette's `TestClient` needs an HTTP library; the adapters do not import httpx. ComfyUI (GPL-3.0) and the `edge-tts` package (LGPL-3.0) are not dependencies.

## Keys

The process environment wins once at startup. After that, `PUT /settings` updates memory and rewrites `engine/.env` (mode `0600`, gitignored). `engine/.env.example` keeps the names blank.

```bash
# engine/.env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
```

Chat and image share that pair. Point the base URL at another provider's `/v1` when it speaks the same APIs. `GET /settings` returns the base URL and `openaiApiKeySet`, never the key. The web Settings panel is the usual way to write the file. You can also edit `engine/.env` and restart.

`COMFYUI_BASE_URL`, `WAN_API_BASE`, `KLING_API_BASE`, and `COSYVOICE_BASE_URL` are not read.

## Endpoints

CORS allows `http://127.0.0.1:<port>` and `http://localhost:<port>` so the Vite app on port 5173 can call across origins. The server binds to `127.0.0.1`.

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | `{"ok":true,"version":"1.0.0-beta.1"}` |
| `GET` | `/adapters` | Each known node: `implemented` and `status` (`ready`, `needs_key`, or `stub`) |
| `GET` | `/settings` | Base URL, whether a key is set, logical file name `engine/.env` |
| `PUT` | `/settings` | `{ "openaiBaseUrl", "openaiApiKey" }`. An empty key keeps the saved one |
| `POST` | `/runs` | Body `{ "graph", "nodeIds"? }`. `202` and a run object. One active run; a second returns `409` |
| `GET` | `/runs/{run_id}` | Per-node status and outputs |
| `POST` | `/runs/{run_id}/cancel` | Sets cancel and closes the in-flight socket |
| `GET` | `/assets/{relativePath}` | Image bytes from `engine/var/assets`. Rejects `..` and non-image suffixes |

`graph` is the canvas-core graph object (`version` must be `1.0.0-beta.1`). `nodeIds` limits the run to those nodes plus ancestors. Omit it to run the whole graph.

Run `status`: `running`, `succeeded`, `failed`, `cancelled`.

Node `status`: `pending`, `running`, `succeeded`, `failed`, `cancelled`, `skipped`.

Errors use `{ "error", "message" }` and, for a cycle, `nodeIds`. Codes include `cycle`, `empty_graph`, `empty_selection`, `missing_credentials`, `invalid_graph`, `run_in_progress`, `unknown_node`.

A cycle is `422` before any provider call. The `.hzcanvas` file may still contain one.

## Adapters

| Node | Status | Contract |
| --- | --- | --- |
| `openai.chat` | implemented | text → text. `POST {base}/chat/completions`. Blocking. Optional `temperature` and `seed` |
| `openai.image` | implemented | text → image. `POST {base}/images/generations`. `dall-e-*` asks for `b64_json`; other models accept `b64_json` or a URL that the sidecar downloads. Optional `seed` (official Images may reject it) |
| `comfyui.image` | stub | text → image |
| `video.wan-kling` | stub | text + image → video |
| `tts.edge` | stub | text → audio. The LGPL `edge-tts` package is not imported |
| `tts.cosyvoice` | stub | text → audio |
| `storyboard.board` | stub | text → storyboard |

A stub node fails that node. Downstream nodes are skipped. There is no batch runner and no automatic retry.

Chat defaults to `gpt-4o-mini`. Image defaults to `dall-e-3` and `1024x1024`. A connected text input replaces the local prompt. Provider keys are read only from settings, never from `node.data`.

Image bytes are written under `engine/var/assets/images/`. The run output is `{ relativePath, mediaType, url }` with `url` like `/assets/images/<run>-<node>.png`. The web app stores the relative path on the node and in `assets.entries`. It does not embed bytes.

## 中文

引擎是本机 sidecar。先按上面的命令在 `127.0.0.1:8787` 启动。网页「设置」或 `engine/.env` 提供 `OPENAI_BASE_URL` 与 `OPENAI_API_KEY`，响应里不会带回密钥。

`POST /runs` 提交整张图，或用 `nodeIds` 提交选中节点及其上游。环会被拒绝。`GET /runs/{id}` 看每个节点的状态。`POST /runs/{id}/cancel` 取消。同一时间只跑一次。

本周真正发请求的只有 `openai.chat` 和 `openai.image`。ComfyUI、Wan/Kling、Edge-TTS、CosyVoice、分镜不会调用。没有批处理，没有流式输出，没有 FFmpeg。
