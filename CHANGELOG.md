# Changelog

## [Unreleased]

Still `1.0.0-beta.1`. No version bump. `GRAPH_DOCUMENT_VERSION` stays `1.0.0-beta.1`: runner fields and outputs live in the existing `node.data` object, and image bytes stay out of the JSON.

- FastAPI sidecar runs one user-triggered graph (or a selected subgraph plus its ancestors). `POST /runs`, `GET /runs/{id}`, `POST /runs/{id}/cancel`. Cycles are rejected even though the file may store them. A second run returns 409 while one is in progress.
- Real clients for `openai.chat` (Chat Completions, blocking) and `openai.image` (Images API). Keys and base URL come from the process environment or `engine/.env`. `GET/PUT /settings` never echoes the key.
- Web inspector for prompt, model, seed, and the other non-secret fields. Run / cancel controls. Empty, error, and engine-offline states on the canvas. Settings writes `engine/.env`.
- A successful image is shown from the sidecar cache (`engine/var/assets`, gitignored) and recorded as an `assets.entries` path. The browser still does not write the sibling `*.hzcanvas.assets` directory.
- `@haizhu/canvas-core` project document for `.hzcanvas`: graph, node, and port schemas (`text`, `image`, `video`, `audio`, `storyboard`), referential validation, and JSON serialize/deserialize. See `docs/hzcanvas.md`.
- Port types `json` and `any` are removed. An edge is valid only when the output and input types match.
- Web canvas state is a `ProjectDocument`. Drag an agent from the library onto the canvas (click-to-add remains). Download and open a `.hzcanvas` JSON file. Undo and redo (session history, not stored in the file).
- The sibling `*.hzcanvas.assets` directory is part of the format. The browser keeps `assets.entries` and does not read or write those files.
- Storyboard stub `storyboard.board` in the agent catalog. ComfyUI, Wan/Kling, Edge-TTS, and CosyVoice stay stubs. No batch runner, streaming, FFmpeg, or Tauri packaging.

## 1.0.0-beta.1 — 2026-11-05

Scaffold for the private monorepo.

- Vite + React 19 web app with an empty React Flow canvas and a stub Agent library
- Workspace packages for graph types, node definitions, and shadcn-based UI
- FastAPI sidecar with `GET /health`
- Product docs: feasibility, stack ADR, roadmap
- No model calls, media export, or Tauri packaging
