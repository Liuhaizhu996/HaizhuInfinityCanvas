# Changelog

## [Unreleased]

Still `1.0.0-beta.1`. No version bump. `GRAPH_DOCUMENT_VERSION` stays `1.0.0-beta.1`: speech fields live in the existing `node.data` object. Audio bytes stay out of the JSON.

- `tts.edge` synthesizes speech with an original HTTP client: a short-lived token from `https://edge.microsoft.com/translate/auth`, then one SSML `POST` to the regional Speech endpoint. Voice, locale, rate, and pitch are inspector fields. The LGPL `edge-tts` package is not imported, and the read-aloud WebSocket is not used. Cancel closes the in-flight request. Timeout does not retry or start downstream.
- `tts.cosyvoice` `POST`s form fields `tts_text`, `spk_id`, and `speed` to `{COSYVOICE_BASE_URL}/inference_sft` on a server the user runs. Raw PCM is wrapped in a WAV header at the node's sample rate. WAV and MP3 are stored as-is. No weights, no CosyVoice source, and no reference-audio cloning. Optional `COSYVOICE_API_KEY` stays in `engine/.env`.
- A speech result is playable from the sidecar cache (`audio/...`) and recorded in `assets.entries`. The browser still does not write the sibling `*.hzcanvas.assets` directory.
- `comfyui.image` calls a user-run ComfyUI over HTTP only (queue, poll `/history`, download `/view`). The user supplies an API-format workflow. Optional reference image upload. Timeout and cancel interrupt that server and do not start another attempt. No ComfyUI source and no GPL dependency.
- `video.wan-kling` is one node. The inspector picks Wan or Kling. The sidecar submits one async job, polls, downloads the file, and stops on timeout. Cancel stops polling and does not start downstream. There is no automatic retry.
- Settings and `engine/.env.example` add blank names for `COMFYUI_*`, `WAN_API_BASE`, `WAN_API_KEY`, `KLING_API_BASE`, `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`, `KLING_API_KEY`, `COSYVOICE_BASE_URL`, and `COSYVOICE_API_KEY`. Responses still do not echo secrets. Edge speech has no key.
- A video result is playable from the sidecar cache (`videos/...`) and recorded in `assets.entries`. The browser still does not write the sibling `*.hzcanvas.assets` directory.
- FastAPI sidecar runs one user-triggered graph (or a selected subgraph plus its ancestors). `POST /runs`, `GET /runs/{id}`, `POST /runs/{id}/cancel`. Cycles are rejected even though the file may store them. A second run returns 409 while one is in progress.
- Real clients for `openai.chat` (Chat Completions, blocking) and `openai.image` (Images API). Keys and base URL come from the process environment or `engine/.env`. `GET/PUT /settings` never echoes the key.
- Web inspector for prompt, model, seed, and the other non-secret fields. Run / cancel controls. Empty, error, and engine-offline states on the canvas. Settings writes `engine/.env`.
- A successful image is shown from the sidecar cache (`engine/var/assets`, gitignored) and recorded as an `assets.entries` path. The browser still does not write the sibling `*.hzcanvas.assets` directory.
- `@haizhu/canvas-core` project document for `.hzcanvas`: graph, node, and port schemas (`text`, `image`, `video`, `audio`, `storyboard`), referential validation, and JSON serialize/deserialize. See `docs/hzcanvas.md`.
- Port types `json` and `any` are removed. An edge is valid only when the output and input types match.
- Web canvas state is a `ProjectDocument`. Drag an agent from the library onto the canvas (click-to-add remains). Download and open a `.hzcanvas` JSON file. Undo and redo (session history, not stored in the file).
- The sibling `*.hzcanvas.assets` directory is part of the format. The browser keeps `assets.entries` and does not read or write those files.
- Storyboard stub `storyboard.board` in the agent catalog. No batch runner, streaming, FFmpeg, or Tauri packaging.

## 1.0.0-beta.1 — 2026-11-05

Scaffold for the private monorepo.

- Vite + React 19 web app with an empty React Flow canvas and a stub Agent library
- Workspace packages for graph types, node definitions, and shadcn-based UI
- FastAPI sidecar with `GET /health`
- Product docs: feasibility, stack ADR, roadmap
- No model calls, media export, or Tauri packaging
