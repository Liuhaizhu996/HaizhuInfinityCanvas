"""Read an upstream image out of the sidecar asset cache."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.adapters.openai_common import AdapterError
from app.assets import is_safe_relative_path, read_asset_bytes, sniff_image

MAX_REFERENCE_BYTES = 10 * 1024 * 1024


def load_reference_image(
    asset_root: Path,
    image: dict[str, Any],
    *,
    limit: int = MAX_REFERENCE_BYTES,
) -> tuple[bytes, str]:
    relative = image.get("relativePath")
    if not isinstance(relative, str) or not is_safe_relative_path(relative):
        raise AdapterError("上游图像路径无效。")
    header = image.get("mediaType")
    try:
        data = read_asset_bytes(asset_root, relative)
    except ValueError as exc:
        raise AdapterError("找不到上游图像文件。") from exc
    if len(data) > limit:
        raise AdapterError(f"参考图超过 {max(1, limit // (1024 * 1024))}MB。")
    try:
        media_type, _extension = sniff_image(data, header if isinstance(header, str) else None)
    except ValueError as exc:
        raise AdapterError(str(exc)) from exc
    return data, media_type
