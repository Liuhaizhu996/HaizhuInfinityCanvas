"""Shared request helpers for OpenAI-compatible chat and images."""

from __future__ import annotations

import json
import threading
from typing import Any

from app.adapters.transport import HttpResult, Transport, TransportError
from app.config import Settings
from app.errors import sanitize

CHAT_MODEL = "gpt-4o-mini"
IMAGE_MODEL = "dall-e-3"
IMAGE_SIZE = "1024x1024"
USER_AGENT = "HaizhuInfinityCanvas/1.0.0-beta.1"


class AdapterError(Exception):
    """A node failed before or after the provider responded."""


def post_json(
    transport: Transport,
    settings: Settings,
    path: str,
    payload: dict[str, object],
    *,
    timeout: float,
    cancel: threading.Event,
) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise AdapterError("OPENAI_API_KEY is not set on the sidecar.")
    try:
        result = transport.request(
            "POST",
            f"{settings.openai_base_url}{path}",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
            json_body=payload,
            timeout=timeout,
            cancel=cancel,
        )
    except TransportError as exc:
        raise AdapterError(sanitize(str(exc), settings.secret_values())) from exc
    return read_json_object(result, settings.secret_values())


def optional_string(data: dict[str, Any], key: str, *, default: str | None = None) -> str | None:
    value = data.get(key, default)
    if value is None or value == "":
        return default
    if not isinstance(value, str):
        raise AdapterError(f"{key} must be a string.")
    cleaned = value.strip()
    if not cleaned:
        return default
    if len(cleaned) > 100_000:
        raise AdapterError(f"{key} is too long.")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in cleaned):
        raise AdapterError(f"{key} contains a control character.")
    return cleaned


def model_name(data: dict[str, Any], default: str) -> str:
    value = optional_string(data, "model", default=default) or default
    if len(value) > 200 or any(char.isspace() or ord(char) < 32 for char in value):
        raise AdapterError("model must be a single token.")
    return value


def optional_temperature(data: dict[str, Any]) -> float | None:
    if "temperature" not in data or data["temperature"] is None or data["temperature"] == "":
        return None
    value = data["temperature"]
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise AdapterError("temperature must be a number from 0 to 2.")
    number = float(value)
    if number < 0 or number > 2:
        raise AdapterError("temperature must be a number from 0 to 2.")
    return number


def optional_seed(data: dict[str, Any]) -> int | None:
    if "seed" not in data or data["seed"] is None or data["seed"] == "":
        return None
    value = data["seed"]
    if isinstance(value, bool) or not isinstance(value, int):
        raise AdapterError("seed must be an integer from 0 to 2147483647.")
    if value < 0 or value > 2_147_483_647:
        raise AdapterError("seed must be an integer from 0 to 2147483647.")
    return value


def image_size(data: dict[str, Any]) -> str:
    value = optional_string(data, "size", default=IMAGE_SIZE) or IMAGE_SIZE
    width, separator, height = value.partition("x")
    if separator != "x" or not width.isdigit() or not height.isdigit():
        raise AdapterError("size must look like 1024x1024.")
    if not (16 <= int(width) <= 4096 and 16 <= int(height) <= 4096):
        raise AdapterError("size must look like 1024x1024.")
    return value


def read_json_object(result: HttpResult, secret: str | tuple[str, ...] | list[str]) -> dict[str, Any]:
    text = result.body.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(text) if text else None
    except json.JSONDecodeError:
        parsed = None
    if result.status >= 400:
        message = _provider_message(parsed) or f"Provider returned HTTP {result.status}."
        raise AdapterError(sanitize(message, secret))
    if not isinstance(parsed, dict):
        raise AdapterError("Provider returned a non-JSON object.")
    return parsed


def _provider_message(parsed: object) -> str | None:
    if not isinstance(parsed, dict):
        return None
    error = parsed.get("error")
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return error["message"]
    if isinstance(error, str):
        return error
    return None
