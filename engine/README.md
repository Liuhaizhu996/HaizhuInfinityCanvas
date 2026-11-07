# Engine

Python 3.12 FastAPI sidecar. It runs one graph at a time for `openai.chat`, `openai.image`, `comfyui.image`, `video.wan-kling`, `tts.edge`, and `tts.cosyvoice`. It does not shell out to FFmpeg, and it does not import the LGPL `edge-tts` package.

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

Runtime third-party packages stay FastAPI (MIT) and Uvicorn (BSD-3-Clause). The HTTP client is the Python standard library, including multipart uploads and the Kling JWT. Tests use pytest and httpx because Starlette's `TestClient` needs an HTTP library; the adapters do not import httpx. ComfyUI (GPL-3.0) and the `edge-tts` package (LGPL-3.0) are not dependencies. CosyVoice (Apache-2.0) is not vendored. No model weights are committed.

## Keys

The process environment wins once at startup. After that, `PUT /settings` updates memory and rewrites `engine/.env` (mode `0600`, gitignored). `engine/.env.example` keeps the names blank. An empty key in `PUT /settings` keeps the saved key. Responses never echo a key, only `*Set` booleans.

```bash
# engine/.env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_API_KEY=
WAN_API_BASE=https://dashscope.aliyuncs.com/api/v1
WAN_API_KEY=
KLING_API_BASE=https://api.klingai.com
KLING_ACCESS_KEY=
KLING_SECRET_KEY=
KLING_API_KEY=
COSYVOICE_BASE_URL=http://127.0.0.1:50000
COSYVOICE_API_KEY=
```

Chat and the OpenAI image node share `OPENAI_*`. Point that base URL at another provider's `/v1` when it speaks the same APIs. `tts.edge` has no key: it asks Microsoft's public speech HTTP endpoint for a short-lived token on each run. `COSYVOICE_BASE_URL` is the CosyVoice server you start (default `http://127.0.0.1:50000`). `COSYVOICE_API_KEY` is optional and is sent as a bearer token only when set.

`WAN_API_BASE` includes `/api/v1`. Mainland China: `https://dashscope.aliyuncs.com/api/v1`. International: `https://dashscope-intl.aliyuncs.com/api/v1`. A Model Studio workspace host is fine when the path under it is still `/api/v1`. `KLING_API_BASE` is the origin only, with no `/v1` (`https://api.klingai.com`). If `KLING_API_KEY` is set, it is sent as a bearer token. Otherwise the sidecar signs a 30-minute HS256 JWT from `KLING_ACCESS_KEY` and `KLING_SECRET_KEY`.

## Endpoints

CORS allows `http://127.0.0.1:<port>` and `http://localhost:<port>` so the Vite app on port 5173 can call across origins. The server binds to `127.0.0.1`.

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | `{"ok":true,"version":"1.0.0-beta.1"}` |
| `GET` | `/adapters` | Each known node: `implemented` and `status` (`ready`, `needs_key`, or `stub`) |
| `GET` | `/settings` | Base URLs, whether each key is set, logical file name `engine/.env` |
| `PUT` | `/settings` | Base URLs and keys below. An empty key keeps the saved one. Omitted fields are left unchanged |
| `POST` | `/runs` | Body `{ "graph", "nodeIds"? }`. `202` and a run object. One active run; a second returns `409` |
| `GET` | `/runs/{run_id}` | Per-node status and outputs |
| `POST` | `/runs/{run_id}/cancel` | Sets cancel, closes the in-flight socket, and stops provider polling |
| `GET` | `/assets/{relativePath}` | Image, video, or audio bytes from `engine/var/assets`. Rejects `..` and unknown suffixes |

`PUT /settings` fields: `openaiBaseUrl`, `openaiApiKey`, `comfyuiBaseUrl`, `comfyuiApiKey`, `wanBaseUrl`, `wanApiKey`, `klingBaseUrl`, `klingAccessKey`, `klingSecretKey`, `klingApiKey`, `cosyvoiceBaseUrl`, `cosyvoiceApiKey`.

`graph` is the canvas-core graph object (`version` must be `1.0.0-beta.1`). `nodeIds` limits the run to those nodes plus ancestors. Omit it to run the whole graph.

Run `status`: `running`, `succeeded`, `failed`, `cancelled`.

Node `status`: `pending`, `running`, `succeeded`, `failed`, `cancelled`, `skipped`.

Errors use `{ "error", "message" }` and, for a cycle, `nodeIds`. Codes include `cycle`, `empty_graph`, `empty_selection`, `missing_credentials`, `invalid_graph`, `run_in_progress`, `unknown_node`.

A cycle is `422` before any provider call. The `.hzcanvas` file may still contain one. A second `POST /runs` while one is `running` is `409`. There is no batch runner and no automatic retry.

`comfyui.image`, `tts.edge`, and `tts.cosyvoice` are `ready` without a key. Edge speech has no key. A local CosyVoice usually has none; the optional key does not change that status. `video.wan-kling` is `needs_key` until Wan has `WAN_API_KEY`, or Kling has `KLING_API_KEY`, or Kling has both access and secret keys. A run that includes a video node whose chosen vendor is not configured is `422` `missing_credentials` before any request.

## Adapters

| Node | Status | Contract |
| --- | --- | --- |
| `openai.chat` | implemented | text → text. `POST {base}/chat/completions`. Blocking. Optional `temperature` and `seed` |
| `openai.image` | implemented | text → image. `POST {base}/images/generations`. `dall-e-*` asks for `b64_json`; other models accept `b64_json` or a URL that the sidecar downloads. Optional `seed` (official Images may reject it) |
| `comfyui.image` | implemented | text → image, optional image input. HTTP to a ComfyUI the user runs. Polls `GET /history/{prompt_id}` |
| `video.wan-kling` | implemented | text → video, optional image input. One node. `vendor` is `wan` or `kling`. Async create, poll, download |
| `tts.edge` | implemented | text → audio. Original HTTP client. The LGPL `edge-tts` package is not imported |
| `tts.cosyvoice` | implemented | text → audio. HTTP to a CosyVoice server the user runs |
| `storyboard.board` | stub | text → storyboard |

A stub node fails that node. Downstream nodes are skipped. There is no batch runner and no automatic retry.

Chat defaults to `gpt-4o-mini`. Image defaults to `dall-e-3` and `1024x1024`. A connected text input replaces the local prompt. Provider keys are read only from settings, never from `node.data`.

### ComfyUI workflow

Talk to the user's server only. Do not vendor ComfyUI. Default base URL is `http://127.0.0.1:8188`. A node `baseUrl` overrides it. Optional `COMFYUI_API_KEY` is sent as `Authorization: Bearer` when set.

The workflow is ComfyUI's **Save (API Format)** object, either inline in `workflow` or in a `.json` file at `workflowPath`. A relative path must stay inside the `engine/` directory. An absolute path is the file the user pointed at. The UI workflow (`{"nodes": [...]}`) is rejected.

Minimal shape:

```json
{
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": { "text": "{{prompt}}", "clip": ["4", 1] }
  },
  "1": {
    "class_type": "LoadImage",
    "inputs": { "image": "{{image}}" }
  },
  "3": {
    "class_type": "KSampler",
    "inputs": { "seed": "{{seed}}" }
  },
  "9": {
    "class_type": "SaveImage",
    "inputs": { "filename_prefix": "haizhu", "images": ["8", 0] }
  }
}
```

`{{prompt}}` is replaced with the run prompt. `promptNode` plus `promptInput` (default `text`) writes that node directly. If neither a placeholder nor `promptNode` is set, the first `CLIPTextEncode` / `CLIPTextEncodeSDXL` / `CLIPTextEncodeFlux` receives the prompt. `{{seed}}` must be the entire input value. An optional image input is uploaded with `POST /upload/image` and written to `imageNode` / `imageInput` (default `image`), or the first `LoadImage`, or `{{image}}`.

The sidecar `POST`s `{ "prompt", "client_id" }` to `/prompt`, then polls `GET /history/{prompt_id}` about twice a second. It does not open the WebSocket. The first image in the history outputs is downloaded from `GET /view`. Default timeout is 300 seconds (`timeoutSec`, 1–1800). Timeout and cancel both `POST /interrupt` and `POST /queue` with `{ "delete": [prompt_id] }`, then stop. Downstream nodes do not start. There is no second submit.

### Wan and Kling

One node. `vendor` is `wan` or `kling`.

Wan create: `POST {WAN_API_BASE}/services/aigc/video-generation/video-synthesis` with header `X-DashScope-Async: enable`. Poll: `GET {WAN_API_BASE}/tasks/{task_id}` until `output.task_status` is `SUCCEEDED`, then download `output.video_url` with no API key. Text-to-video default model is `wan2.6-t2v` and `parameters.size` such as `1280*720`. If an image is connected and the model is still that default (or empty), the model becomes `wan2.6-i2v` and the image is `input.img_url` as `data:<mime>;base64,...`. `720P` / `1080P` / `480P` is sent as `parameters.resolution`. A `wan3*` model sends `resolution` and, when the size looks like `16:9`, `ratio`. Set the model your account actually has.

Kling text: `POST {KLING_API_BASE}/v1/videos/text2video`. Image: `POST /v1/videos/image2video` with raw base64 and no `data:` prefix. Poll the same path plus `/{task_id}` until `data.task_status` is `succeed`, then download `data.task_result.videos[0].url` with no API key. If the model is empty or still `wan2.6-t2v` / `wan2.6-i2v`, Kling uses `kling-v2-master`. `size` `1280*720` becomes aspect `16:9`; `9:16` and `1:1` are sent as-is on text-to-video. `mode` defaults to `std`. `duration` is sent as a string. Seed is not sent to Kling.

Reference images are capped at 10MB. Default video timeout is 600 seconds. Cancel stops polling and does not submit again, and does not start downstream. Wan has no cancel API used here, and Kling is not asked to abort a task that was already accepted: if the provider took the job, it may still bill. Timeout fails the node the same way, with no retry.

### Edge speech

`tts.edge` does not depend on the LGPL `edge-tts` package and does not open the Edge read-aloud WebSocket. The sidecar HTTP client already closes the socket on cancel, so this adapter stays on that client.

Why not WebSocket: the read-aloud socket (`Sec-MS-GEC`, now moving between `speech.platform.bing.com` and `api.msedgeservices.com`) is a second protocol, and it has been returning 403 while Microsoft changes it. A separate process would also push users toward installing `edge-tts` itself. The HTTP path below is original code.

1. `GET https://edge.microsoft.com/translate/auth` with a browser User-Agent. The body is a short-lived JWT. No API key is stored. The `region` claim (default `eastus` when the claim is missing) selects the speech host.
2. `POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` with `Authorization: Bearer`, `Content-Type: application/ssml+xml`, and `X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3`. The body is SSML: `voice`, `xml:lang`, and `prosody` `rate` / `pitch`.

Node fields: `locale` (default `zh-CN`), `voice` (default `zh-CN-XiaoxiaoNeural`), `rate` (percent, -50 to 100, default 0), `pitch` (Hz, -50 to 50, default 0), `timeoutSec` (default 120, each HTTP call). A connected text input replaces `prompt`. Text is capped at 3000 characters and XML-escaped. One token fetch and one synthesis. Cancel closes the in-flight request and does not start downstream. Timeout fails the node with no retry. Microsoft can change or block the token endpoint; the node then fails that run.

### CosyVoice

`tts.cosyvoice` calls a server you run. Weights and CosyVoice source stay out of this repo.

The stock FunAudioLLM FastAPI server (`runtime/python/fastapi/server.py`) has no separate versioned JSON API. This client uses its stable SFT route:

`POST {base}/inference_sft` with `Content-Type: application/x-www-form-urlencoded`.

| Field | Meaning |
| --- | --- |
| `tts_text` | The line to speak |
| `spk_id` | Speaker id already loaded on that server. Stock CosyVoice 1 uses ids such as `中文女` |
| `speed` | `0.5`–`2`. Sent always. The stock handler ignores unknown fields; a wrapper that accepts `speed` can use it |

`base` is `COSYVOICE_BASE_URL` unless the node sets `baseUrl` (not a secret, so it may live in `.hzcanvas`). The path `/inference_sft` is appended. Do not include that path in the base URL.

The stock response is raw signed 16-bit little-endian mono PCM, often with no audio content type. CosyVoice 1 is usually 22050 Hz and CosyVoice 2 is usually 24000 Hz. `sampleRate` (default 22050) wraps that PCM in a WAV header so a browser can play it. This is a header, not FFmpeg. WAV and MP3 responses are stored unchanged.

Zero-shot, cross-lingual, and instruct routes need a prompt wav. Those are cloning controls and are not called. Optional `COSYVOICE_API_KEY` is `Authorization: Bearer` when set. Default timeout is 120 seconds. Cancel and timeout do not send a second request and do not start downstream.

## Assets

Image bytes go to `engine/var/assets/images/`. Video bytes go to `engine/var/assets/videos/` (MP4 or WebM, up to 80MB). Audio bytes go to `engine/var/assets/audio/` (MP3 or WAV, up to 25MB). The run output is `{ relativePath, mediaType, url }` with `url` like `/assets/images/<run>-<node>.png`, `/assets/videos/<run>-<node>.mp4`, or `/assets/audio/<run>-<node>.mp3`. The web app stores the relative path on the node and in `assets.entries`. It does not embed bytes and does not create the sibling `*.hzcanvas.assets` directory.

## 中文

引擎是本机 sidecar。先按上面的命令在 `127.0.0.1:8787` 启动。网页「设置」或 `engine/.env` 提供地址和密钥，响应里不会带回密钥。

`POST /runs` 提交整张图，或用 `nodeIds` 提交选中节点及其上游。环会被拒绝。`GET /runs/{id}` 看每个节点的状态。`POST /runs/{id}/cancel` 取消。同一时间只跑一次。没有批处理，没有自动重试，没有流式输出，没有 FFmpeg。

ComfyUI 只通过 HTTP 访问你自己启动的进程。工作流用 Save (API Format)，提示词写 `{{prompt}}` 或指定节点。可选参考图会先上传。引擎轮询 `/history`，不复制 ComfyUI 源码。

视频节点在检查器里选 Wan 或 Kling。Wan 的 Base 要带 `/api/v1`，Kling 的 Base 不要带 `/v1`。点一次「运行」才提交。取消会停止轮询并不再跑下游；供应商若已接单，仍可能计费。

Edge 语音不需要密钥，也不安装 `edge-tts`。引擎先向 `https://edge.microsoft.com/translate/auth` 要一个短期令牌，再把 SSML POST 到 `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`。检查器里选地区、音色、语速和音高。取消或超时都会停掉这次请求，不会再跑下游。

CosyVoice 由你自己启动。默认 `http://127.0.0.1:50000`，可选 `COSYVOICE_API_KEY`。引擎只 `POST /inference_sft`（`tts_text`、`spk_id`、`speed`）。返回的裸 PCM 会按节点上的采样率包成 WAV。不上传参考音频，不内置权重。分镜仍然不会执行。
