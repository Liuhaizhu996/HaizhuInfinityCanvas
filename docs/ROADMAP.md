# Roadmap

Haizhu Infinity Canvas is a private node canvas for multi-model agents. Sequence is fixed: **WebUI → Windows desktop → Linux desktop**.

Version `1.0.0-beta.1` is the scaffold in this repository. It is not the MVP.

## Now — v1.0.0-beta.1

- pnpm workspace, proprietary license, no secrets.
- React Flow canvas with an empty graph, drag, connect, and delete.
- Stub Agent library (manifests only).
- Zod graph document in `@haizhu/canvas-core`, plus `.hzcanvas` save/load (JSON only; assets directory is a convention).
- Drag agents onto the canvas, and undo/redo in the session.
- FastAPI `GET /health`.
- Tauri noted in `apps/desktop`, not built.

The unreleased line on this version adds the first sidecar run: `openai.chat`, `openai.image`, inspector, and local settings. Still out: ComfyUI, video, TTS, batch runs, FFmpeg, installers.

## MVP — WebUI

The milestone after the scaffold. Still a browser app talking to a local sidecar.

- Graph JSON save/load already exists in beta.1 (`.hzcanvas`). The MVP adds an inspector and a sidecar on top of that file.
- Node inspector for the stub fields a runner needs (prompt, model id, seed) without embedding secrets in the file.
- Sidecar endpoints: submit graph, node status, cancel. Reject cycles.
- One user-triggered call for each first adapter, then stop. No batch runner and no unattended retries.
- Empty, error, and "engine offline" states in the same canvas.
- Settings UI that writes a local env file or OS keychain entry. The git repo keeps only `engine/.env.example` with blank names.

Done when a person can wire LLM → image on the canvas, run it once against their own endpoints, and reload the document later.

The first slice of that is in the unreleased `1.0.0-beta.1` line: submit, per-node status, cancel, cycle rejection, the two OpenAI-compatible adapters, the inspector, and settings that write `engine/.env`. Adapters 3–6 are still stubs. There is no batch runner.

## Phase 2 — Windows desktop

- Tauri 2 shell around `apps/web` `dist`.
- The app starts and stops the FastAPI sidecar.
- File dialogs for graph JSON.
- No second editor. If the canvas changes, it changes in the web package.

Windows first because that is the committed desktop target. Signing and a bundled Python runtime are part of this phase, not of the MVP.

## Phase 3 — Linux desktop

- Same Tauri shell and sidecar as Windows.
- Package differences only (libraries, GPU drivers, install path).
- Do not start Linux packaging before the Windows shell actually runs the MVP graph.

macOS is not on this roadmap.

## Adapters

Order inside the WebUI MVP. Each one is a sidecar client plus the manifest already sketched in `@haizhu/node-sdk`.

| Order | Node | Contract | Notes |
| --- | --- | --- | --- |
| 1 | `openai.chat` | text → text | OpenAI-compatible Chat Completions. Streaming can land after a blocking call works. |
| 2 | `openai.image` | text → image | OpenAI-compatible Images API. Same base URL and key as chat when the provider allows it. |
| 3 | `comfyui.image` | text → image | User-run ComfyUI. HTTP only. No GPL source in this repo. |
| 4 | `video.wan-kling` | text + optional image → video | One node. Config picks Wan or Kling. Async job, poll, timeout. |
| 5 | `tts.edge` | text → audio | Original HTTP client or a separate process. Do not depend on the LGPL `edge-tts` package. |
| 6 | `tts.cosyvoice` | text → audio | Apache-2.0 CosyVoice as an external server. Weights are not committed. |

Later, not MVP: a generic ComfyUI graph node, a second video vendor, voice cloning controls, and any export that needs FFmpeg.

## Risks to watch while building

- A dependency review on every new package (MIT / Apache-2.0 only).
- Provider keys only on the sidecar.
- Video calls cost money; the UI must make the run explicit.
- Graph files must stay valid when a node type is renamed. Bump `GRAPH_DOCUMENT_VERSION` when the document breaks.
- Keep the GitHub repository private.

## Non-goals

- Copying ComfyUI, tldraw, or `edge-tts`.
- Training or redistributing model weights.
- Accounts, teams, or realtime collaboration.
- A plugin marketplace.
- Mobile.
