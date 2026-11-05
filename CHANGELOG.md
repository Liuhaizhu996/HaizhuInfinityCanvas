# Changelog

## [Unreleased]

Still `1.0.0-beta.1`. No version bump.

- `@haizhu/canvas-core` project document for `.hzcanvas`: graph, node, and port schemas (`text`, `image`, `video`, `audio`, `storyboard`), referential validation, and JSON serialize/deserialize. See `docs/hzcanvas.md`.
- Port types `json` and `any` are removed. An edge is valid only when the output and input types match.
- Web canvas state is a `ProjectDocument`. Drag an agent from the library onto the canvas (click-to-add remains). Download and open a `.hzcanvas` JSON file. Undo and redo (session history, not stored in the file).
- The sibling `*.hzcanvas.assets` directory is part of the format. The browser keeps `assets.entries` and does not read or write those files.
- Storyboard stub `storyboard.board` in the agent catalog. Adapters still make no network calls.

## 1.0.0-beta.1 — 2026-11-05

Scaffold for the private monorepo.

- Vite + React 19 web app with an empty React Flow canvas and a stub Agent library
- Workspace packages for graph types, node definitions, and shadcn-based UI
- FastAPI sidecar with `GET /health`
- Product docs: feasibility, stack ADR, roadmap
- No model calls, media export, or Tauri packaging
