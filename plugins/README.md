# Plugins

Adapter homes for later milestones. v1.0.0-beta.1 ships manifests in `@haizhu/node-sdk` and does not call these services.

| Directory (future) | Adapter | Boundary |
| --- | --- | --- |
| `openai-compatible/` | LLM chat and image | HTTPS to an OpenAI-compatible base URL. Keys stay outside git. |
| `comfyui/` | Image (and later other graphs) | HTTP to a ComfyUI process the user runs. Do not copy ComfyUI (GPL-3.0). |
| `video-wan-kling/` | Video | Async job APIs for Wan or Kling. One node type, backend chosen by config. |
| `tts-edge-cosyvoice/` | Speech | Edge read-aloud via an original client or a separate process. Do not import the LGPL `edge-tts` package. CosyVoice (Apache-2.0) is an external server. |

No plugin in this folder may vendor AGPL or GPL source. MIT and Apache-2.0 dependencies only.
