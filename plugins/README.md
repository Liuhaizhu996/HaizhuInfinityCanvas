# Plugins

Adapter boundaries. Manifests live in `@haizhu/node-sdk`. The HTTP clients for OpenAI, ComfyUI, Wan/Kling, Edge speech, and CosyVoice live in `engine/app/adapters` (stdlib client, no extra package). This folder stays empty of vendored source.

| Directory (future) | Adapter | Boundary |
| --- | --- | --- |
| `openai-compatible/` | LLM chat and image | HTTPS to an OpenAI-compatible base URL. Keys stay outside git. |
| `comfyui/` | Image (and later other graphs) | HTTP to a ComfyUI process the user runs. Do not copy ComfyUI (GPL-3.0). |
| `video-wan-kling/` | Video | Async job APIs for Wan or Kling. One node type, backend chosen by config. |
| `tts-edge-cosyvoice/` | Speech | Original HTTP client for Edge speech. Do not import the LGPL `edge-tts` package. CosyVoice (Apache-2.0) is an external server; no weights in this repo. |

No plugin in this folder may vendor AGPL or GPL source. MIT and Apache-2.0 dependencies only.
