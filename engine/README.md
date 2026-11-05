# Engine

Python 3.12 FastAPI sidecar. This beta exposes a health check only. It does not call models.

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

ComfyUI (GPL-3.0) and the `edge-tts` package (LGPL-3.0) are not dependencies. Later adapters must talk to those systems over HTTP or a separate process, without copying their source into this repo. CosyVoice itself is Apache-2.0 and can be called as an external server.
