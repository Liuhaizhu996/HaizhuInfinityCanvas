# ADR-001: Stack for v1.0.0-beta.1

- Status: Accepted
- Date: 2026-11-05

## Context

Haizhu Infinity Canvas is a private, all-rights-reserved node graph. People drop agents on an infinite canvas, connect typed ports, and later run LLM, image, video, and speech adapters. The product sequence is WebUI, then a Windows desktop shell, then Linux.

The repo may depend on MIT and Apache-2.0 packages only. AGPL and GPL source must not be copied in. That rules out forking ComfyUI and rules out the current tldraw SDK for production.

## Decision

| Layer | Choice |
| --- | --- |
| Web UI | React 19, TypeScript, Vite |
| Canvas | `@xyflow/react` (React Flow 12) |
| Client state | Zustand |
| Styling | Tailwind CSS and shadcn/ui (Radix Slot, MIT) |
| Graph contracts | `packages/canvas-core` (TypeScript + Zod) |
| Node manifests | `packages/node-sdk` |
| Shared controls | `packages/ui` |
| Desktop, later | Tauri 2 wrapping the same web build |
| Sidecar | Python 3.12, FastAPI |

The web app is the editor. The Python process will own long jobs, files, and adapter I/O. This beta only serves `GET /health`.

## Why `@xyflow/react`, not tldraw

The editor is a graph of nodes, ports, and edges that will be executed. It is not a drawing surface.

- React Flow is a node editor: custom nodes, handles, typed connections, controlled `nodes` / `edges`, and a store that matches Zustand. That is the MVP interaction.
- tldraw is an infinite whiteboard SDK (shapes, freehand, camera, text). A node graph would be rebuilt on top of shapes, including ports, connection validity, and a separate execution model.
- License: `@xyflow/react` is MIT, including commercial use. Since tldraw SDK 4.0 (September 2025) the SDK is source-available under the tldraw license. Development use is allowed; production needs their trial, hobby, or commercial license key. That is not an MIT or Apache-2.0 dependency, so this repo does not take it.
- React Flow's paid examples are optional. The library itself stays MIT. This project does not hide the React Flow attribution.

## Alternatives considered

- **Forking the ComfyUI frontend.** ComfyUI is GPL-3.0. Copying or linking that UI into this proprietary app would pull the app under GPL. ComfyUI stays an external program reached over its HTTP API (`/prompt`, history, view).
- **A custom canvas (pointer events + SVG).** Feasible, and it avoids a dependency, but pan, zoom, selection, and edges are the whole first milestone. React Flow already does that under MIT.
- **Redux or React context for the graph.** The graph is one client store updated on every drag. Zustand keeps that store small and lets React Flow's change handlers write nodes without an action layer.
- **Node.js as the only backend.** The confirmed sidecar is Python 3.12. Audio and video work, and a later CosyVoice process, sit more naturally next to FastAPI than inside the Vite app. The browser never holds provider keys in this design; the sidecar will.
- **Embedding Tauri now.** Desktop is phase 2. A Rust crate in this beta would imply a packaging promise the roadmap does not make yet. `apps/desktop` is a stub README.

## License constraints

Accepted in-tree dependencies are MIT or Apache-2.0: React, Vite, TypeScript, Zod, Zustand, Tailwind, shadcn/ui, Radix, FastAPI, Uvicorn, and Tauri when it is added.

Not accepted as source or as an imported library:

- ComfyUI and ComfyUI custom nodes (GPL-3.0).
- The Python package `edge-tts` (LGPL-3.0 for almost all of its files). A later speech adapter must use an original client or a separate process, not import that package into the proprietary interpreter.
- tldraw SDK (proprietary license).
- Model weights. Wan, Kling, and CosyVoice weights are not part of this repository.

Calling a GPL program over HTTP, the way a browser calls a server, does not copy that program into this repo. That is the only ComfyUI integration this project will use.

## Consequences

- `apps/web` can render and edit a graph without the engine running.
- Execution, secrets, and media bytes belong to the sidecar later, not to the Vite bundle.
- Node authors describe ports in `@haizhu/node-sdk`. They do not get an `execute()` implementation in this beta.
- shadcn components live in `packages/ui` and are scanned by the web Tailwind build. New components should be added there, not pasted into `apps/web`, so the desktop shell can reuse them.
- Two version strings must stay in lockstep: the root `VERSION` file (read by FastAPI) and `GRAPH_DOCUMENT_VERSION` in `@haizhu/canvas-core`.
