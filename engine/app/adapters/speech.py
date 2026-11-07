"""Shared speech helpers. Stdlib only. No edge-tts and no CosyVoice source."""

from __future__ import annotations

import threading
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from app.adapters.openai_common import USER_AGENT, AdapterError
from app.adapters.transport import HttpResult, RunCancelled, Transport, TransportError
from app.assets import MAX_AUDIO_BYTES, pcm16_to_wav, safe_token, sniff_audio, write_asset
from app.errors import sanitize

_TEXT_PREFIXES = (b"{", b"[", b"<", b"<!doctype", b"<html")


def checked_request(
    transport: Transport,
    method: str,
    url: str,
    *,
    headers: Mapping[str, str],
    body: bytes | None,
    timeout: float,
    cancel: threading.Event,
    secrets: tuple[str, ...] | list[str],
) -> HttpResult:
    if cancel.is_set():
        raise RunCancelled()
    try:
        return transport.request(
            method,
            url,
            headers=headers,
            body=body,
            timeout=timeout,
            cancel=cancel,
            max_bytes=MAX_AUDIO_BYTES,
        )
    except RunCancelled:
        raise
    except TransportError as exc:
        if "timed out" in str(exc).lower():
            raise AdapterError("请求超时。没有自动重试。") from exc
        raise AdapterError(sanitize(str(exc), secrets)) from exc


def require_audio(result: HttpResult, secrets: tuple[str, ...] | list[str]) -> None:
    if result.status == 200 and result.body:
        return
    if result.status == 200:
        raise AdapterError("语音响应是空的。")
    message = _error_text(result) or f"语音服务返回 HTTP {result.status}。"
    raise AdapterError(sanitize(message, secrets))


def store_audio(
    asset_root: Path,
    run_id: str,
    node_id: str,
    data: bytes,
    header_type: str | None,
    *,
    pcm_sample_rate: int | None = None,
) -> dict[str, object]:
    try:
        media_type, extension = sniff_audio(data, header_type)
        payload = data
    except ValueError:
        payload, media_type, extension = _pcm_or_fail(data, pcm_sample_rate)
    relative = f"audio/{safe_token(run_id)}-{safe_token(node_id)}{extension}"
    try:
        write_asset(asset_root, relative, payload)
    except ValueError as exc:
        raise AdapterError(str(exc)) from exc
    return {
        "audio": {
            "relativePath": relative,
            "mediaType": media_type,
            "url": f"/assets/{relative}",
        }
    }


def whole_number(
    data: dict[str, Any],
    key: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    if key not in data or data[key] is None or data[key] == "":
        return default
    value = data[key]
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise AdapterError(f"{key} 必须是 {minimum} 到 {maximum} 的整数。")
    if isinstance(value, float) and not value.is_integer():
        raise AdapterError(f"{key} 必须是 {minimum} 到 {maximum} 的整数。")
    number = int(value)
    if number < minimum or number > maximum:
        raise AdapterError(f"{key} 必须是 {minimum} 到 {maximum} 的整数。")
    return number


def unit_float(
    data: dict[str, Any],
    key: str,
    default: float,
    *,
    minimum: float,
    maximum: float,
) -> float:
    if key not in data or data[key] is None or data[key] == "":
        return default
    value = data[key]
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise AdapterError(f"{key} 必须是 {minimum:g} 到 {maximum:g} 的数字。")
    number = float(value)
    if number < minimum or number > maximum:
        raise AdapterError(f"{key} 必须是 {minimum:g} 到 {maximum:g} 的数字。")
    return number


def speech_text(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        raise AdapterError("提示词是空的。在检查器里填写，或连一条文本进来。")
    if len(cleaned) > 3000:
        raise AdapterError("文本过长。单次语音最多 3000 个字符。")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in cleaned):
        raise AdapterError("文本含有无法朗读的控制字符。")
    return cleaned


def browser_headers() -> dict[str, str]:
    return {"User-Agent": _EDGE_UA, "Accept": "*/*"}


def product_headers() -> dict[str, str]:
    return {"User-Agent": USER_AGENT, "Accept": "audio/wav, audio/mpeg, application/octet-stream"}


def _pcm_or_fail(data: bytes, sample_rate: int | None) -> tuple[bytes, str, str]:
    if sample_rate is None or _looks_like_text(data):
        raise AdapterError("语音响应不是 MP3 或 WAV。")
    try:
        wav = pcm16_to_wav(data, sample_rate)
    except ValueError as exc:
        raise AdapterError("CosyVoice 返回的 PCM 无法封装为 WAV。") from exc
    return wav, "audio/wav", ".wav"


def _looks_like_text(data: bytes) -> bool:
    stripped = data.lstrip().lower()
    return stripped.startswith(_TEXT_PREFIXES)


def _error_text(result: HttpResult) -> str | None:
    if not result.body or len(result.body) > 800:
        return None
    if _looks_like_text(result.body) or result.status >= 400:
        text = result.body.decode("utf-8", errors="replace").strip()
        return " ".join(text.split()) or None
    return None


_EDGE_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
)
