"""Sidecar settings. Keys live in the process environment or engine/.env, never in a graph file."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from app.errors import ApiError

DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_COMFYUI_BASE_URL = "http://127.0.0.1:8188"
DEFAULT_WAN_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
DEFAULT_KLING_BASE_URL = "https://api.klingai.com"
_MANAGED_KEYS = (
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "COMFYUI_BASE_URL",
    "COMFYUI_API_KEY",
    "WAN_API_BASE",
    "WAN_API_KEY",
    "KLING_API_BASE",
    "KLING_ACCESS_KEY",
    "KLING_SECRET_KEY",
    "KLING_API_KEY",
)
_FILE_HEADER = (
    "# Local sidecar settings for Haizhu Infinity Canvas.",
    "# 本地引擎配置。不要提交这个文件。",
    "# An empty key line means that key is not set.",
)


@dataclass(frozen=True)
class Settings:
    openai_base_url: str
    openai_api_key: str
    comfyui_base_url: str
    comfyui_api_key: str
    wan_base_url: str
    wan_api_key: str
    kling_base_url: str
    kling_access_key: str
    kling_secret_key: str
    kling_api_key: str

    def secret_values(self) -> tuple[str, ...]:
        values = (
            self.openai_api_key,
            self.comfyui_api_key,
            self.wan_api_key,
            self.kling_access_key,
            self.kling_secret_key,
            self.kling_api_key,
        )
        unique = {item for item in values if item}
        return tuple(sorted(unique, key=len, reverse=True))

    def kling_configured(self) -> bool:
        if self.kling_api_key:
            return True
        return bool(self.kling_access_key) and bool(self.kling_secret_key)


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
        self._openai_base_url = _base_or_default(merged.get("OPENAI_BASE_URL", ""), DEFAULT_OPENAI_BASE_URL)
        self._openai_api_key = merged.get("OPENAI_API_KEY", "").strip()
        self._comfyui_base_url = _base_or_default(merged.get("COMFYUI_BASE_URL", ""), DEFAULT_COMFYUI_BASE_URL)
        self._comfyui_api_key = merged.get("COMFYUI_API_KEY", "").strip()
        self._wan_base_url = _base_or_default(merged.get("WAN_API_BASE", ""), DEFAULT_WAN_BASE_URL)
        self._wan_api_key = merged.get("WAN_API_KEY", "").strip()
        self._kling_base_url = _base_or_default(merged.get("KLING_API_BASE", ""), DEFAULT_KLING_BASE_URL)
        self._kling_access_key = merged.get("KLING_ACCESS_KEY", "").strip()
        self._kling_secret_key = merged.get("KLING_SECRET_KEY", "").strip()
        self._kling_api_key = merged.get("KLING_API_KEY", "").strip()
        self._extra = {key: value for key, value in file_values.items() if key not in _MANAGED_KEYS}

    def get(self) -> Settings:
        with self._lock:
            return self._snapshot_locked()

    def public(self) -> dict[str, object]:
        return _public_view(self.get())

    def update(
        self,
        *,
        openai_base_url: str | None = None,
        openai_api_key: str | None = None,
        comfyui_base_url: str | None = None,
        comfyui_api_key: str | None = None,
        wan_base_url: str | None = None,
        wan_api_key: str | None = None,
        kling_base_url: str | None = None,
        kling_access_key: str | None = None,
        kling_secret_key: str | None = None,
        kling_api_key: str | None = None,
    ) -> dict[str, object]:
        new_openai_base = _clean_base(openai_base_url)
        new_comfy_base = _clean_base(comfyui_base_url)
        new_wan_base = _clean_base(wan_base_url)
        new_kling_base = _clean_base(kling_base_url)
        new_openai_key = _clean_secret(openai_api_key)
        new_comfy_key = _clean_secret(comfyui_api_key)
        new_wan_key = _clean_secret(wan_api_key)
        new_kling_access = _clean_secret(kling_access_key)
        new_kling_secret = _clean_secret(kling_secret_key)
        new_kling_api = _clean_secret(kling_api_key)
        with self._lock:
            if new_openai_base is not None:
                self._openai_base_url = new_openai_base
            if new_comfy_base is not None:
                self._comfyui_base_url = new_comfy_base
            if new_wan_base is not None:
                self._wan_base_url = new_wan_base
            if new_kling_base is not None:
                self._kling_base_url = new_kling_base
            if new_openai_key is not None:
                self._openai_api_key = new_openai_key
            if new_comfy_key is not None:
                self._comfyui_api_key = new_comfy_key
            if new_wan_key is not None:
                self._wan_api_key = new_wan_key
            if new_kling_access is not None:
                self._kling_access_key = new_kling_access
            if new_kling_secret is not None:
                self._kling_secret_key = new_kling_secret
            if new_kling_api is not None:
                self._kling_api_key = new_kling_api
            self._write_file_locked()
            return _public_view(self._snapshot_locked())

    def _snapshot_locked(self) -> Settings:
        return Settings(
            openai_base_url=self._openai_base_url,
            openai_api_key=self._openai_api_key,
            comfyui_base_url=self._comfyui_base_url,
            comfyui_api_key=self._comfyui_api_key,
            wan_base_url=self._wan_base_url,
            wan_api_key=self._wan_api_key,
            kling_base_url=self._kling_base_url,
            kling_access_key=self._kling_access_key,
            kling_secret_key=self._kling_secret_key,
            kling_api_key=self._kling_api_key,
        )

    def _write_file_locked(self) -> None:
        values = dict(self._extra)
        managed = {
            "OPENAI_BASE_URL": self._openai_base_url,
            "OPENAI_API_KEY": self._openai_api_key,
            "COMFYUI_BASE_URL": self._comfyui_base_url,
            "COMFYUI_API_KEY": self._comfyui_api_key,
            "WAN_API_BASE": self._wan_base_url,
            "WAN_API_KEY": self._wan_api_key,
            "KLING_API_BASE": self._kling_base_url,
            "KLING_ACCESS_KEY": self._kling_access_key,
            "KLING_SECRET_KEY": self._kling_secret_key,
            "KLING_API_KEY": self._kling_api_key,
        }
        lines = list(_FILE_HEADER)
        for key in _MANAGED_KEYS:
            lines.append(f"{key}={_quote(managed[key])}")
            values.pop(key, None)
        for key in sorted(values):
            lines.append(f"{key}={_quote(values[key])}")
        text = "\n".join(lines) + "\n"
        self.env_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.env_file.with_name(f"{self.env_file.name}.tmp")
        temporary.write_text(text, encoding="utf-8")
        os.chmod(temporary, 0o600)
        temporary.replace(self.env_file)
        os.chmod(self.env_file, 0o600)


def _public_view(current: Settings) -> dict[str, object]:
    return {
        "openaiBaseUrl": current.openai_base_url,
        "openaiApiKeySet": bool(current.openai_api_key),
        "comfyuiBaseUrl": current.comfyui_base_url,
        "comfyuiApiKeySet": bool(current.comfyui_api_key),
        "wanBaseUrl": current.wan_base_url,
        "wanApiKeySet": bool(current.wan_api_key),
        "klingBaseUrl": current.kling_base_url,
        "klingAccessKeySet": bool(current.kling_access_key),
        "klingSecretKeySet": bool(current.kling_secret_key),
        "klingApiKeySet": bool(current.kling_api_key),
        "envFile": "engine/.env",
    }


def _clean_base(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return normalize_base_url(value)
    except ValueError as exc:
        raise ApiError(422, "invalid_settings", str(exc)) from exc


def _clean_secret(value: str | None) -> str | None:
    """None or a blank string keeps the saved secret. A non-empty string replaces it."""
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if any(char in text for char in "\r\n\x00") or len(text) > 2000:
        raise ApiError(422, "invalid_settings", "API key must be a single line.")
    return text


def _base_or_default(value: str, default: str) -> str:
    text = value.strip()
    if not text:
        return default
    try:
        return normalize_base_url(text)
    except ValueError:
        return default


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
