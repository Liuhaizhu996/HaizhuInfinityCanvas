"""tts.cosyvoice — text to audio on a CosyVoice HTTP server the user runs.

CosyVoice is Apache-2.0. This repo does not vendor its source or its weights.
The sidecar only speaks HTTP.

Contract, matching FunAudioLLM ``runtime/python/fastapi/server.py``
``/inference_sft`` (the stable endpoint in that server; there is no separate
versioned JSON API):

``POST {base}/inference_sft``
``Content-Type: application/x-www-form-urlencoded``

``tts_text`` is the line to speak. ``spk_id`` is the speaker id already loaded
on that server (stock CosyVoice 1 uses ids such as ``中文女``). ``speed`` is
sent as well (``0.5``–``2``). The stock handler ignores unknown form fields;
wrappers that grew a ``speed`` argument can read it. No second request.

The stock response is streamed raw signed 16-bit little-endian mono PCM, often
with no content type. CosyVoice 1 is usually 22050 Hz and CosyVoice 2 is
usually 24000 Hz. The node's ``sampleRate`` wraps that PCM in a WAV header so
the browser can play it. WAV and MP3 responses are stored as-is.

Zero-shot, cross-lingual, and instruct routes need a prompt wav. Those are
cloning controls and are not called. There is no FFmpeg step.

``base`` is ``COSYVOICE_BASE_URL`` (default ``http://127.0.0.1:50000``) unless
the node sets ``baseUrl``. An optional ``COSYVOICE_API_KEY`` is a bearer token.
The key is never written onto the node.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from app.adapters.fields import timeout_seconds
from app.adapters.openai_common import AdapterError, optional_string
from app.adapters.speech import checked_request, product_headers, require_audio, speech_text, store_audio, unit_float, whole_number
from app.adapters.transport import Transport
from app.config import Settings, normalize_base_url
from app.graph import Node

DEFAULT_VOICE = "中文女"


def run_cosyvoice(
    node: Node,
    prompt: str,
    settings: Settings,
    transport: Transport,
    cancel: threading.Event,
    *,
    run_id: str,
    asset_root: Path,
) -> dict[str, object]:
    text = speech_text(prompt)
    voice = _voice(node.data)
    speed = unit_float(node.data, "speed", 1.0, minimum=0.5, maximum=2.0)
    sample_rate = whole_number(node.data, "sampleRate", 22050, minimum=8000, maximum=48000)
    timeout = timeout_seconds(node.data, 120)
    base = _base_url(node.data, settings)
    secrets = settings.secret_values()
    headers = product_headers()
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"
    if settings.cosyvoice_api_key:
        headers["Authorization"] = f"Bearer {settings.cosyvoice_api_key}"
    body = urlencode(
        {"tts_text": text, "spk_id": voice, "speed": _speed(speed)},
        encoding="utf-8",
    ).encode("utf-8")
    result = checked_request(
        transport,
        "POST",
        f"{base}/inference_sft",
        headers=headers,
        body=body,
        timeout=timeout,
        cancel=cancel,
        secrets=secrets,
    )
    require_audio(result, secrets)
    return store_audio(
        asset_root,
        run_id,
        node.id,
        result.body,
        result.headers.get("content-type"),
        pcm_sample_rate=sample_rate,
    )


def _voice(data: dict[str, Any]) -> str:
    value = optional_string(data, "voice", default=DEFAULT_VOICE) or DEFAULT_VOICE
    if len(value) > 80:
        raise AdapterError("音色太长。")
    return value


def _base_url(data: dict[str, Any], settings: Settings) -> str:
    override = optional_string(data, "baseUrl")
    if not override:
        return settings.cosyvoice_base_url
    try:
        return normalize_base_url(override)
    except ValueError as exc:
        raise AdapterError("CosyVoice 地址必须是 http 或 https URL。") from exc


def _speed(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text or "1"
