# Changelog

## 1.0.0-beta.2 — 2026-11-05

Creator studio chrome. Locked tokens live in `docs/design/MASTER.md`.

- Dark cinematic UI: canvas void `#0A0A0B`, rose accent, glass rails, Outfit / Work Sans / JetBrains Mono, Phosphor icons. Image, video, and audio nodes lead with a media well.
- Canvas interactions: drag a local image in for a session preview, double-click the empty pane to pick a node, bottom dock runs once, and 整理 reflows positions without touching edges. No credit badge and no silent retry.
- Product version is `1.0.0-beta.2`. `GRAPH_DOCUMENT_VERSION` stays `1.0.0-beta.1`, so existing `.hzcanvas` files still open and run. `/health` reports the product version. The runner checks the graph literal, not the product string.

## 1.0.0-beta.1 — 2026-11-05

Scaffold, then the first runnable graph. The document format did not change: ComfyUI and video fields live in `node.data`. Image and video bytes stay out of the JSON.

- `comfyui.image` calls a user-run ComfyUI over HTTP only (queue, poll `/history`, download `/view`). The user supplies an API-format workflow. Optional reference image upload. Timeout and cancel interrupt that server and do not start another attempt. No ComfyUI source and no GPL dependency.
- `video.wan-kling` is one node. The inspector picks Wan or Kling. The sidecar submits one async job, polls, downloads the file, and stops on timeout. Cancel stops polling and does not start downstream. There is no automatic retry.
- Settings and `engine/.env.example` add blank names for `COMFYUI_*`, `WAN_API_BASE`, `WAN_API_KEY`, `KLING_API_BASE`, `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`, and `KLING_API_KEY`. Responses still do not echo secrets.
- A video result is playable from the sidecar cache (`videos/...`) and recorded in `assets.entries`. The browser still does not write the sibling `*.hzcanvas.assets` directory.
- FastAPI sidecar runs one user-triggered graph (or a selected subgraph plus its ancestors). `POST /runs`, `GET /runs/{id}`, `POST /runs/{id}/cancel`. Cycles are rejected even though the file may store them. A second run returns 409 while one is in progress.
- Real clients for `openai.chat` (Chat Completions, blocking) and `openai.image` (Images API). Keys and base URL come from the process environment or `engine/.env`. `GET/PUT /settings` never echoes the key.
- Web inspector for prompt, model, seed, and the other non-secret fields. Run / cancel controls. Empty, error, and engine-offline states on the canvas. Settings writes `engine/.env`.
- A successful image is shown from the sidecar cache (`engine/var/assets`, gitignored) and recorded as an `assets.entries` path. The browser still does not write the sibling `*.hzcanvas.assets` directory.
- `@haizhu/canvas-core` project document for `.hzcanvas`: graph, node, and port schemas (`text`, `image`, `video`, `audio`, `storyboard`), referential validation, and JSON serialize/deserialize. See `docs/hzcanvas.md`.
- Port types `json` and `any` are removed. An edge is valid only when the output and input types match.
- Web canvas state is a `ProjectDocument`. Drag an agent from the library onto the canvas (click-to-add remains). Download and open a `.hzcanvas` JSON file. Undo and redo (session history, not stored in the file).
- The sibling `*.hzcanvas.assets` directory is part of the format. The browser keeps `assets.entries` and does not read or write those files.
- Storyboard stub `storyboard.board` in the agent catalog. Edge-TTS and CosyVoice stay stubs. No batch runner, streaming, FFmpeg, or Tauri packaging.
- Vite + React 19 web app, workspace packages, FastAPI `GET /health`, and product docs.
