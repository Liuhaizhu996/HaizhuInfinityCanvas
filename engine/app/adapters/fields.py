"""Non-secret node fields shared by the ComfyUI and video adapters."""

from __future__ import annotations

import re
from typing import Any

from app.adapters.openai_common import AdapterError, optional_string

_SIZE = re.compile(r"^[A-Za-z0-9:*./_-]{1,40}$")
_MODE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


def vendor_name(data: dict[str, Any]) -> str:
    raw = optional_string(data, "vendor", default="wan") or "wan"
    name = raw.lower()
    if name not in {"wan", "kling"}:
        raise AdapterError("vendor 只能是 wan 或 kling。")
    return name


def timeout_seconds(data: dict[str, Any], default: int) -> float:
    number = _whole_number(data, "timeoutSec", default, minimum=1, maximum=1800)
    return float(number)


def duration_seconds(data: dict[str, Any], default: int = 5) -> int:
    return _whole_number(data, "duration", default, minimum=1, maximum=30)


def media_size(data: dict[str, Any], default: str) -> str:
    value = optional_string(data, "size", default=default) or default
    if not _SIZE.fullmatch(value):
        raise AdapterError("size 的格式应为 1280*720、720P 或 16:9。")
    return value


def run_mode(data: dict[str, Any]) -> str:
    value = optional_string(data, "mode", default="std") or "std"
    if not _MODE.fullmatch(value):
        raise AdapterError("mode 必须是简短的英文标记，例如 std 或 pro。")
    return value


def _whole_number(
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
