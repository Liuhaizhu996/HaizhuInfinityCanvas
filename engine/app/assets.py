"""Run cache for image bytes.

Paths use the same relative shape as `.hzcanvas` assets (`images/frame.png`).
The browser still does not write the sibling `*.hzcanvas.assets` directory.
This cache is `engine/var/assets/` and is gitignored.
"""

from __future__ import annotations

from pathlib import Path

MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

_MAX_BYTES = 25 * 1024 * 1024


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


def write_asset(root: Path, relative: str, data: bytes) -> None:
    if not is_safe_relative_path(relative):
        raise ValueError("Unsafe asset path.")
    if len(data) > _MAX_BYTES:
        raise ValueError("Image is too large.")
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


def media_type_for(path: Path) -> str:
    return MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
