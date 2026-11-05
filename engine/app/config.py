"""Sidecar settings. Keys live in the process environment or engine/.env, never in a graph file."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from app.errors import ApiError

DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
_MANAGED_KEYS = ("OPENAI_BASE_URL", "OPENAI_API_KEY")


@dataclass(frozen=True)
class Settings:
    openai_base_url: str
    openai_api_key: str


def engine_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_env_file() -> Path:
    return engine_root() / ".env"


def default_asset_root() -> Path:
    return engine_root() / "var" / "assets"


def parse_env_text(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        values[key] = _unquote(raw_value.strip())
    return values


def normalize_base_url(value: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError("Base URL is empty.")
    parsed = urlsplit(text)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Base URL must be an http or https URL.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Base URL must not include user info, a query, or a fragment.")
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path.rstrip("/")
    return f"{parsed.scheme}://{parsed.hostname}{port}{path}"


class SettingsStore:
    """Live config. Process env wins once at startup; the settings API then updates memory and the file."""

    def __init__(self, env_file: Path) -> None:
        self.env_file = env_file
        self._lock = threading.Lock()
        file_values = parse_env_text(env_file.read_text(encoding="utf-8")) if env_file.is_file() else {}
        merged = dict(file_values)
        for key in _MANAGED_KEYS:
            from_env = os.environ.get(key, "").strip()
            if from_env:
                merged[key] = from_env
        self._base_url = _base_or_default(merged.get("OPENAI_BASE_URL", ""))
        self._api_key = merged.get("OPENAI_API_KEY", "").strip()
        self._extra = {key: value for key, value in file_values.items() if key not in _MANAGED_KEYS}

    def get(self) -> Settings:
        with self._lock:
            return Settings(openai_base_url=self._base_url, openai_api_key=self._api_key)

    def public(self) -> dict[str, object]:
        current = self.get()
        return {
            "openaiBaseUrl": current.openai_base_url,
            "openaiApiKeySet": bool(current.openai_api_key),
            "envFile": "engine/.env",
        }

    def update(self, *, openai_base_url: str | None, openai_api_key: str | None) -> dict[str, object]:
        new_base: str | None = None
        if openai_base_url is not None:
            try:
                new_base = normalize_base_url(openai_base_url)
            except ValueError as exc:
                raise ApiError(422, "invalid_settings", str(exc)) from exc
        new_key: str | None = None
        if openai_api_key is not None and openai_api_key.strip():
            new_key = openai_api_key.strip()
            if any(char in new_key for char in "\r\n\x00") or len(new_key) > 2000:
                raise ApiError(422, "invalid_settings", "API key must be a single line.")
        with self._lock:
            if new_base is not None:
                self._base_url = new_base
            if new_key is not None:
                self._api_key = new_key
            self._write_file_locked()
            api_key_set = bool(self._api_key)
            base_url = self._base_url
        return {
            "openaiBaseUrl": base_url,
            "openaiApiKeySet": api_key_set,
            "envFile": "engine/.env",
        }

    def _write_file_locked(self) -> None:
        values = dict(self._extra)
        values["OPENAI_BASE_URL"] = self._base_url
        values["OPENAI_API_KEY"] = self._api_key
        lines = [
            "# Local sidecar settings for Haizhu Infinity Canvas.",
            "# 本地引擎配置。不要提交这个文件。",
            "# An empty OPENAI_API_KEY line means the key is not set.",
        ]
        for key in ("OPENAI_BASE_URL", "OPENAI_API_KEY"):
            lines.append(f"{key}={_quote(values.pop(key))}")
        for key in sorted(values):
            lines.append(f"{key}={_quote(values[key])}")
        text = "\n".join(lines) + "\n"
        self.env_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.env_file.with_name(f"{self.env_file.name}.tmp")
        temporary.write_text(text, encoding="utf-8")
        os.chmod(temporary, 0o600)
        temporary.replace(self.env_file)
        os.chmod(self.env_file, 0o600)


def _base_or_default(value: str) -> str:
    text = value.strip()
    if not text:
        return DEFAULT_OPENAI_BASE_URL
    try:
        return normalize_base_url(text)
    except ValueError:
        return DEFAULT_OPENAI_BASE_URL


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        inner = value[1:-1]
        if value[0] == '"':
            return inner.replace('\\"', '"').replace("\\\\", "\\")
        return inner
    return value


def _quote(value: str) -> str:
    if value == "":
        return ""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
