# Feasibility — Haizhu Infinity Canvas

Date: 2026-11-05. Scope: v1.0.0-beta.1 research notes for a private node-graph product. This beta does not prove model quality, latency, or packaging.

## Verdict

A WebUI that edits a typed agent graph is feasible now, on a normal React toolchain, without bundling models or GPL applications.

Running those graphs is also feasible, but it is a different milestone. Each first adapter is an HTTP integration with its own auth, async behavior, and license boundary. None of that needs to live in the canvas package. The Python sidecar is the right place for it, and it is deliberately unwired here.

Windows and Linux shells are feasible later by hosting the same web build in Tauri 2 and spawning that sidecar. They are not required to learn whether the canvas and the adapter contracts are right.

## What has to be true

1. Authors can place nodes, connect ports, and save a document that validates.
2. A runner can walk that document in order and attach outputs back onto nodes.
3. Heavy work (ComfyUI, video jobs, CosyVoice) stays out of the browser tab.
4. The proprietary repo never contains AGPL/GPL source, and secrets never land in git.

Item 1 is started in this scaffold. Items 2–4 are constraints on the next milestones, not code in this beta.

## Canvas

`@xyflow/react` already provides pan, zoom, selection, edges, and controlled node state. A few hundred agent nodes with short labels is a comfortable load; the risk is media previews (images, video frames, waveforms) if every node mounts a heavy viewer. The MVP should keep previews lazy and store blobs outside the graph JSON.

The document shape in `@haizhu/canvas-core` is intentionally smaller than React Flow's internal node: id, type, position, JSON data, and ports. React Flow stays a view. Zod parses the document at the boundary so a bad save cannot enter the runner later.

tldraw was rejected on product fit and license. See [ADR-001](adr/ADR-001-stack.md).

## Execution

The graph is a DAG plus the failure cases users will actually hit: cycles, a missing input, a node that errors halfway, and a video job that takes minutes. A first runner can:

- reject cycles
- topologically queue ready nodes
- persist each node as `idle | running | done | error`
- let the user cancel

That runner belongs in FastAPI, not in a `useEffect`. The web app submits a graph and polls or listens. This beta only checks that a graph document parses.

Local persistence (one JSON file per canvas) is enough for the MVP. Multiplayer and accounts are not.

## Adapters

All five families are HTTP-shaped. None are imported in this beta.

### OpenAI-compatible LLM and image

Feasible. Chat Completions and Images are widely cloned (official OpenAI, gateways, local servers). One base URL plus a key covers both nodes. Risks are key storage, streaming into a node, and providers that only look OpenAI-compatible. The sidecar should be the only process that sees the key. The browser sends the graph, not the secret.

No call is made in v1.0.0-beta.1.

### ComfyUI

Feasible as an external program. The user runs ComfyUI; the sidecar posts a workflow to its API and reads the output image. ComfyUI is GPL-3.0, so this repo must not vendor it, link it, or copy its nodes. Shipping a JSON workflow that *we* wrote is fine. Copying ComfyUI's Python or frontend is not.

The product risk is workflow fragility: a graph that only runs on one custom-node setup. The MVP should pin one plain text-to-image workflow and treat anything else as later.

### Wan or Kling video

Feasible as an async job, not as a function call. Both are remote video APIs with their own credentials and terms. The node should accept text plus an optional image and return a video reference. The sidecar submits, polls, and times out. Wan open weights and Kling are not vendored here; their model licenses are separate from this repo's code license.

FFmpeg export and timeline editing are out of scope. The MVP stores or displays the returned clip, nothing more.

### Edge-TTS and CosyVoice

Feasible, with a license split.

- Microsoft Edge read-aloud is a network service. The popular `edge-tts` Python package is LGPL-3.0 for nearly all of its code (one file is MIT). Importing it into this proprietary process is not acceptable under the repo policy. A later adapter should speak HTTP itself or run a separate process with a clear boundary.
- CosyVoice is Apache-2.0. It is large and wants a GPU. The practical integration is a local server the sidecar calls. Weights stay outside this git repo.

The canvas node is the same either way: text in, audio out. The backend is a setting.

## Desktop

Tauri 2 can wrap the Vite build and start the sidecar. That is a known pattern (window + sidecar), not a research unknown. The unknown is operations: Windows code signing, a Python runtime next to the app, and GPU drivers for local ComfyUI or CosyVoice. Those are phase-2 problems. The web app must keep working in a browser so desktop stays a shell.

Order stays WebUI → Windows → Linux. macOS is not a committed target.

## MVP (next build, not this beta)

The smallest product that tests the idea:

- Create, connect, delete, save, and reload a graph on disk.
- Agent library driven by `@haizhu/node-sdk` manifests (already stubbed).
- Adapter settings on the sidecar, secrets out of git.
- One real request per family, started by the user, with the result written back onto the node.
- Health, logs, and a visible error when the sidecar is down.

Not in that MVP: FFmpeg, a timeline, a marketplace, accounts, or a Tauri installer.

## Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| License contamination | GPL/LGPL code would conflict with All Rights Reserved | HTTP only for ComfyUI; no `edge-tts` import; review new dependencies |
| Secrets in the repo or the bundle | Provider keys in frontend env files leak | Sidecar-only secrets, `.env` gitignored, example file stays empty |
| Copyleft or non-commercial model terms | Weights are not MIT just because an API exists | Do not vendor weights; record each API's terms before shipping a call |
| Long video jobs | UI timeouts, duplicate submits, cost | Job ids, polling, cancel, no automatic retry that spends money |
| Cycles and partial runs | A naive walker hangs or overwrites good outputs | Validate DAG, per-node status, don't run downstream of an error |
| Preview performance | Many images in React Flow will jank | Lazy previews, blobs outside the JSON |
| ComfyUI drift | Custom nodes differ per machine | One pinned starter workflow |
| Desktop packaging | Python + GPU beside Tauri is the hard part | Ship WebUI first; Windows before Linux |
| Repo visibility | This tree is proprietary | Keep the GitHub repo private; no samples with keys |

## What this beta shows

`pnpm --filter web build` produces a blank canvas and a stub library. `GET /health` returns the version. The contracts and the license boundaries are written down. It does not show that any model works.
