"""openai.image — text to image via an OpenAI-compatible Images API."""

from __future__ import annotations

import base64
import binascii
import re
import threading
from pathlib import Path
from typing import Any

from app.adapters.openai_common import (
    IMAGE_MODEL,
    USER_AGENT,
    AdapterError,
    image_size,
    model_name,
    optional_seed,
    post_json,
)
from app.adapters.transport import Transport, TransportError
from app.assets import sniff_image, write_asset
from app.config import Settings
from app.errors import sanitize
from app.graph import Node


def run_image(
    node: Node,
    prompt: str,
    settings: Settings,
    transport: Transport,
    cancel: threading.Event,
    *,
    run_id: str,
    asset_root: Path,
) -> dict[str, Any]:
    model = model_name(node.data, IMAGE_MODEL)
    payload: dict[str, object] = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": image_size(node.data),
    }
    if model.startswith("dall-e"):
        payload["response_format"] = "b64_json"
    seed = optional_seed(node.data)
    if seed is not None:
        payload["seed"] = seed
    body = post_json(
        transport,
        settings,
        "/images/generations",
        payload,
        timeout=180,
        cancel=cancel,
    )
    raw, header_type = _extract_image(body, transport, cancel)
    try:
        media_type, extension = sniff_image(raw, header_type)
    except ValueError as exc:
        raise AdapterError(str(exc)) from exc
    relative = f"images/{_token(run_id)}-{_token(node.id)}{extension}"
    try:
        write_asset(asset_root, relative, raw)
    except ValueError as exc:
        raise AdapterError(str(exc)) from exc
    return {
        "image": {
            "relativePath": relative,
            "mediaType": media_type,
            "url": f"/assets/{relative}",
        }
    }


def _extract_image(
    body: dict[str, Any],
    transport: Transport,
    cancel: threading.Event,
) -> tuple[bytes, str | None]:
    data = body.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise AdapterError("Image response has no data.")
    item = data[0]
    encoded = item.get("b64_json")
    if isinstance(encoded, str) and encoded:
        if len(encoded) > 34_000_000:
            raise AdapterError("Image response is too large.")
        try:
            return _decode_b64(encoded), None
        except (binascii.Error, ValueError) as exc:
            raise AdapterError("Image response was not valid base64.") from exc
    url = item.get("url")
    if isinstance(url, str) and url.startswith(("http://", "https://")):
        try:
            result = transport.request(
                "GET",
                url,
                headers={"Accept": "image/*", "User-Agent": USER_AGENT},
                timeout=60,
                cancel=cancel,
            )
        except TransportError as exc:
            raise AdapterError(sanitize(str(exc), "")) from exc
        if result.status != 200:
            raise AdapterError(f"Image URL returned HTTP {result.status}.")
        return result.body, result.headers.get("content-type")
    raise AdapterError("Image response has neither b64_json nor url.")


def _decode_b64(encoded: str) -> bytes:
    compact = "".join(encoded.split())
    try:
        return base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError):
        padded = compact + "=" * (-len(compact) % 4)
        return base64.urlsafe_b64decode(padded)


def _token(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", value)[:80]
    return cleaned or "node"
