"""tts.edge — text to MP3 via Microsoft's speech HTTP endpoint.

This module does not import the LGPL ``edge-tts`` package and does not open
the Edge read-aloud WebSocket. The sidecar already has an HTTP client whose
cancel path closes the in-flight socket, so speech uses that.

The call shape is the one the Edge translator page uses:

1. ``GET https://edge.microsoft.com/translate/auth`` returns a short-lived JWT.
   No API key. The ``region`` claim selects the speech host.
2. ``POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1``
   sends SSML with ``Authorization: Bearer`` and
   ``X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3``.

Microsoft can change or block that token endpoint. The node then fails once.
There is no retry and no fallback package. The WebSocket protocol
(``Sec-MS-GEC``) is a different stack and is intentionally not implemented.
"""

from __future__ import annotations

import base64
import json
import re
import threading
from pathlib import Path

from app.adapters.fields import timeout_seconds
from app.adapters.openai_common import AdapterError, optional_string
from app.adapters.speech import browser_headers, checked_request, require_audio, speech_text, store_audio, whole_number
from app.adapters.transport import HttpResult, Transport
from app.config import Settings
from app.graph import Node

TOKEN_URL = "https://edge.microsoft.com/translate/auth"
OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
DEFAULT_LOCALE = "zh-CN"

_LOCALE = re.compile(r"^[a-z]{2,3}-[A-Z]{2}$")
_VOICE = re.compile(r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,40}){1,5}$")
_REGION = re.compile(r"^[a-z0-9-]{1,40}$")


def run_edge(
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
    locale = _locale(node.data)
    rate = whole_number(node.data, "rate", 0, minimum=-50, maximum=100)
    pitch = whole_number(node.data, "pitch", 0, minimum=-50, maximum=50)
    timeout = timeout_seconds(node.data, 120)
    secrets = settings.secret_values()
    token_result = checked_request(
        transport,
        "GET",
        TOKEN_URL,
        headers=browser_headers(),
        body=None,
        timeout=min(30.0, timeout),
        cancel=cancel,
        secrets=secrets,
    )
    _require_token(token_result)
    token = _token(token_result.body)
    region = _region(token)
    speech = checked_request(
        transport,
        "POST",
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        headers={
            **browser_headers(),
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/ssml+xml; charset=utf-8",
            "Accept": "audio/mpeg",
            "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        },
        body=_ssml(text, voice, locale, rate, pitch),
        timeout=timeout,
        cancel=cancel,
        secrets=(*secrets, token),
    )
    require_audio(speech, (*secrets, token))
    return store_audio(
        asset_root,
        run_id,
        node.id,
        speech.body,
        speech.headers.get("content-type"),
    )


def _require_token(result: HttpResult) -> None:
    if result.status == 200 and result.body:
        return
    raise AdapterError(f"Edge 令牌接口返回 HTTP {result.status}。没有自动重试。")


def _voice(data: dict[str, Any]) -> str:
    value = optional_string(data, "voice", default=DEFAULT_VOICE) or DEFAULT_VOICE
    if len(value) > 80 or not _VOICE.fullmatch(value):
        raise AdapterError("音色应为微软神经语音名，例如 zh-CN-XiaoxiaoNeural。")
    return value


def _locale(data: dict[str, Any]) -> str:
    value = optional_string(data, "locale", default=DEFAULT_LOCALE) or DEFAULT_LOCALE
    if not _LOCALE.fullmatch(value):
        raise AdapterError("地区应为 zh-CN 这种形式。")
    return value


def _token(body: bytes) -> str:
    text = body.decode("utf-8", errors="replace").strip().strip('"')
    if text.lower().startswith("bearer "):
        text = text[7:].strip()
    if not text or len(text) > 4000 or any(ord(char) <= 32 for char in text):
        raise AdapterError("Edge 令牌无效。")
    return text


def _region(token: str) -> str:
    parts = token.split(".")
    if len(parts) < 2:
        return "eastus"
    padded = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded))
    except (json.JSONDecodeError, ValueError):
        return "eastus"
    if not isinstance(payload, dict):
        return "eastus"
    region = payload.get("region")
    if not isinstance(region, str):
        return "eastus"
    cleaned = region.strip().lower()
    if not _REGION.fullmatch(cleaned):
        return "eastus"
    return cleaned


def _ssml(text: str, voice: str, locale: str, rate: int, pitch: int) -> bytes:
    body = (
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' "
        f"xml:lang='{locale}'>"
        f"<voice name='{voice}'>"
        f"<prosody rate='{_percent(rate)}' pitch='{_hertz(pitch)}'>"
        f"{_xml(text)}"
        "</prosody></voice></speak>"
    )
    return body.encode("utf-8")


def _percent(value: int) -> str:
    if value >= 0:
        return f"+{value}%"
    return f"{value}%"


def _hertz(value: int) -> str:
    if value >= 0:
        return f"+{value}Hz"
    return f"{value}Hz"


def _xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
