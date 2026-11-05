"""Run cache for image and video bytes.

Paths use the same relative shape as `.hzcanvas` assets (`images/frame.png`,
`videos/clip.mp4`). The browser still does not write the sibling
`*.hzcanvas.assets` directory. This cache is `engine/var/assets/` and is gitignored.
"""

from __future__ import annotations

import re
from pathlib import Path

IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
VIDEO_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}
MEDIA_TYPES = {**IMAGE_TYPES, **VIDEO_TYPES}

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_VIDEO_BYTES = 80 * 1024 * 1024


def is_safe_relative_path(value: str) -> bool:
    if not value or len(value) > 512:
        return False
    if "\\" in value or value.startswith("/"):
        return False
    if len(value) >= 2 and value[1] == ":" and value[0].isalpha():
        return False
    if any(ord(char) < 32 for char in value):
        return False
    parts = value.split("/")
    return all(part and part not in {".", ".."} for part in parts)


def safe_token(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", value)[:80]
    return cleaned or "node"


def sniff_image(data: bytes, header_type: str | None) -> tuple[str, str]:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp", ".webp"
    header = (header_type or "").split(";", 1)[0].strip().lower()
    for extension, media in MEDIA_TYPES.items():
        if header == media and extension != ".jpeg":
            return media, extension
    raise ValueError("Image response was not a PNG, JPEG, or WebP.")


def sniff_video(data: bytes, header_type: str | None) -> tuple[str, str]:
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "video/mp4", ".mp4"
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm", ".webm"
    header = (header_type or "").split(";", 1)[0].strip().lower()
    payload = data.lstrip()
    if payload.startswith((b"<", b"{", b"[")):
        raise ValueError("Video response was not an MP4 or WebM.")
    if header == "video/mp4" and len(data) > 32:
        return "video/mp4", ".mp4"
    if header == "video/webm" and len(data) > 32:
        return "video/webm", ".webm"
    raise ValueError("Video response was not an MP4 or WebM.")


def write_asset(root: Path, relative: str, data: bytes) -> None:
    if not is_safe_relative_path(relative):
        raise ValueError("Unsafe asset path.")
    if len(data) > _limit_for(relative):
        raise ValueError("Asset is too large.")
    root.mkdir(parents=True, exist_ok=True)
    path = (root / relative).resolve()
    root_resolved = root.resolve()
    if root_resolved != path and root_resolved not in path.parents:
        raise ValueError("Unsafe asset path.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def resolve_asset(root: Path, relative: str) -> Path | None:
    if not is_safe_relative_path(relative):
        return None
    suffix = Path(relative).suffix.lower()
    if suffix not in MEDIA_TYPES:
        return None
    root.mkdir(parents=True, exist_ok=True)
    path = (root / relative).resolve()
    root_resolved = root.resolve()
    if root_resolved != path and root_resolved not in path.parents:
        return None
    if not path.is_file():
        return None
    return path


def read_asset_bytes(root: Path, relative: str) -> bytes:
    path = resolve_asset(root, relative)
    if path is None:
        raise ValueError("Asset not found.")
    data = path.read_bytes()
    if len(data) > _limit_for(relative):
        raise ValueError("Asset is too large.")
    return data


def media_type_for(path: Path) -> str:
    return MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")


def _limit_for(relative: str) -> int:
    if Path(relative).suffix.lower() in VIDEO_TYPES:
        return MAX_VIDEO_BYTES
    return MAX_IMAGE_BYTES
