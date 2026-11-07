"""video.wan-kling — one node, Wan or Kling, text plus an optional image.

Wan talks to a DashScope-compatible async API. ``WAN_API_BASE`` already
includes ``/api/v1``. Create ``POST {base}/services/aigc/video-generation/video-synthesis``
with ``X-DashScope-Async: enable``, then ``GET {base}/tasks/{task_id}`` until
``output.task_status`` is ``SUCCEEDED`` and ``output.video_url`` is set.
An image is sent as ``input.img_url`` (``data:<mime>;base64,...``). Text-only
Wan 2.x uses ``parameters.size`` such as ``1280*720``. Image-to-video and a
``720P`` size use ``parameters.resolution``.

Kling uses ``KLING_API_BASE`` as the origin (no ``/v1``). Text calls
``POST /v1/videos/text2video``. An image calls ``POST /v1/videos/image2video``
with raw base64 (no data: prefix). Poll the same path plus ``/{task_id}``.
``KLING_API_KEY`` is sent as a bearer token. Otherwise the sidecar signs a
short-lived HS256 JWT from ``KLING_ACCESS_KEY`` and ``KLING_SECRET_KEY``.

Cancel stops polling and does not submit again. These APIs are not asked to
abort a task that was already accepted, so a provider can still bill that
task. Timeout fails the node the same way: no second submit, no downstream.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

from app.adapters.fields import duration_seconds, media_size, run_mode, timeout_seconds, vendor_name
from app.adapters.jobs import poll_job
from app.adapters.openai_common import (
    USER_AGENT,
    AdapterError,
    model_name,
    optional_seed,
    optional_string,
    read_json_object,
)
from app.adapters.reference import load_reference_image
from app.adapters.transport import RunCancelled, Transport, TransportError
from app.assets import MAX_VIDEO_BYTES, safe_token, sniff_video, write_asset
from app.config import Settings
from app.errors import sanitize
from app.graph import Node

WAN_T2V_MODEL = "wan2.6-t2v"
WAN_I2V_MODEL = "wan2.6-i2v"
KLING_MODEL = "kling-v2-master"
_WAN_CREATE = "/services/aigc/video-generation/video-synthesis"
_POLL_SECONDS = 2.0
_PENDING = {"PENDING", "RUNNING", "SUBMITTED", "PROCESSING", "QUEUED", "QUEUEING", "THROTTLED"}
_SUCCESS = {"SUCCEEDED", "SUCCESS", "SUCCEED", "COMPLETED"}
_ASPECTS = {"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}
_TIERS = {"480P", "720P", "1080P"}


def run_video(
    node: Node,
    prompt: str,
    settings: Settings,
    transport: Transport,
    cancel: threading.Event,
    *,
    run_id: str,
    asset_root: Path,
    image: dict[str, Any] | None,
) -> dict[str, Any]:
    vendor = vendor_name(node.data)
    reference = load_reference_image(asset_root, image) if image is not None else None
    timeout = timeout_seconds(node.data, 600)
    if vendor == "wan":
        video_url, secrets = _run_wan(node, prompt, settings, transport, cancel, reference, timeout)
    else:
        video_url, secrets = _run_kling(node, prompt, settings, transport, cancel, reference, timeout)
    raw, header_type = _download(transport, video_url, cancel, secrets)
    try:
        media_type, extension = sniff_video(raw, header_type)
    except ValueError as exc:
        raise AdapterError(str(exc)) from exc
    relative = f"videos/{safe_token(run_id)}-{safe_token(node.id)}{extension}"
    try:
        write_asset(asset_root, relative, raw)
    except ValueError as exc:
        raise AdapterError(str(exc)) from exc
    return {
        "video": {
            "relativePath": relative,
            "mediaType": media_type,
            "url": f"/assets/{relative}",
        }
    }


def _run_wan(
    node: Node,
    prompt: str,
    settings: Settings,
    transport: Transport,
    cancel: threading.Event,
    reference: tuple[bytes, str] | None,
    timeout: float,
) -> tuple[str, tuple[str, ...]]:
    if not settings.wan_api_key:
        raise AdapterError("WAN_API_KEY is not set on the sidecar.")
    secrets = settings.secret_values()
    has_image = reference is not None
    model = _wan_model(node.data, has_image)
    parameters = _wan_parameters(
        model,
        media_size(node.data, "1280*720"),
        duration_seconds(node.data),
        optional_seed(node.data),
        has_image,
    )
    wan_input: dict[str, object] = {"prompt": prompt}
    if reference is not None:
        data, media_type = reference
        encoded = base64.b64encode(data).decode("ascii")
        wan_input["img_url"] = f"data:{media_type};base64,{encoded}"
    payload = {"model": model, "input": wan_input, "parameters": parameters}
    headers = {
        "Authorization": f"Bearer {settings.wan_api_key}",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
        "X-DashScope-Async": "enable",
    }
    created = _request_json(
        transport,
        "POST",
        f"{settings.wan_base_url}{_WAN_CREATE}",
        headers=headers,
        payload=payload,
        timeout=min(60.0, timeout),
        cancel=cancel,
        secrets=secrets,
    )
    immediate = _wan_video_url(created)
    if immediate is not None:
        return immediate, secrets
    task_id = _wan_task_id(created)
    found = poll_job(
        cancel,
        timeout,
        _POLL_SECONDS,
        lambda: _wan_poll(transport, settings, headers, task_id, cancel, secrets),
    )
    if found is None:
        raise AdapterError("等待视频任务超时。没有自动重试。")
    return found, secrets


def _run_kling(
    node: Node,
    prompt: str,
    settings: Settings,
    transport: Transport,
    cancel: threading.Event,
    reference: tuple[bytes, str] | None,
    timeout: float,
) -> tuple[str, tuple[str, ...]]:
    if not settings.kling_configured():
        raise AdapterError("Kling credentials are not set on the sidecar.")
    token = _kling_bearer(settings)
    secrets = tuple(dict.fromkeys((*settings.secret_values(), token)))
    has_image = reference is not None
    path = "/v1/videos/image2video" if has_image else "/v1/videos/text2video"
    payload: dict[str, object] = {
        "model_name": _kling_model(node.data),
        "prompt": prompt,
        "duration": str(duration_seconds(node.data)),
        "mode": run_mode(node.data),
    }
    if reference is None:
        payload["aspect_ratio"] = _aspect(media_size(node.data, "1280*720"))
    else:
        payload["image"] = base64.b64encode(reference[0]).decode("ascii")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    created = _request_json(
        transport,
        "POST",
        f"{settings.kling_base_url}{path}",
        headers=headers,
        payload=payload,
        timeout=min(60.0, timeout),
        cancel=cancel,
        secrets=secrets,
    )
    _raise_kling_code(created, secrets)
    immediate = _kling_video_url(created)
    if immediate is not None:
        return immediate, secrets
    task_id = _kling_task_id(created)
    found = poll_job(
        cancel,
        timeout,
        _POLL_SECONDS,
        lambda: _kling_poll(transport, settings, task_id, path, cancel, secrets),
    )
    if found is None:
        raise AdapterError("等待视频任务超时。没有自动重试。")
    return found, secrets


def _wan_model(data: dict[str, Any], has_image: bool) -> str:
    raw = optional_string(data, "model")
    if raw in (None, "", WAN_T2V_MODEL, KLING_MODEL):
        return WAN_I2V_MODEL if has_image else WAN_T2V_MODEL
    return model_name({"model": raw}, WAN_T2V_MODEL)


def _kling_model(data: dict[str, Any]) -> str:
    raw = optional_string(data, "model")
    if raw in (None, "", WAN_T2V_MODEL, WAN_I2V_MODEL):
        return KLING_MODEL
    return model_name({"model": raw}, KLING_MODEL)


def _wan_parameters(
    model: str,
    size: str,
    duration: int,
    seed: int | None,
    has_image: bool,
) -> dict[str, object]:
    params: dict[str, object] = {"duration": duration}
    if seed is not None:
        params["seed"] = seed
    upper = size.upper()
    if model.startswith("wan3"):
        if upper in _TIERS:
            params["resolution"] = upper
        elif ":" in size and "*" not in size and "x" not in size.lower():
            params["resolution"] = "720P"
            params["ratio"] = size
        else:
            params["resolution"] = _tier(size)
            params["ratio"] = _aspect(size)
        return params
    if has_image or upper in _TIERS:
        params["resolution"] = upper if upper in _TIERS else _tier(size)
        return params
    params["size"] = size.replace("X", "*").replace("x", "*")
    return params


def _tier(size: str) -> str:
    text = size.lower().replace("x", "*")
    if "*" not in text:
        return "720P"
    width, _, height = text.partition("*")
    if not width.isdigit() or not height.isdigit():
        return "720P"
    pixels = int(width) * int(height)
    if pixels >= int(1920 * 1080 * 0.75):
        return "1080P"
    if pixels >= int(1280 * 720 * 0.75):
        return "720P"
    return "480P"


def _aspect(size: str) -> str:
    if size in _ASPECTS:
        return size
    text = size.lower().replace("*", "x")
    if "x" not in text:
        return "16:9"
    width, _, height = text.partition("x")
    if not width.isdigit() or not height.isdigit():
        return "16:9"
    wide, tall = int(width), int(height)
    if wide == tall:
        return "1:1"
    return "16:9" if wide > tall else "9:16"


def _wan_poll(
    transport: Transport,
    settings: Settings,
    headers: dict[str, str],
    task_id: str,
    cancel: threading.Event,
    secrets: tuple[str, ...],
) -> str | None:
    # A fresh copy keeps the bearer key and drops nothing the CDN should see.
    body = _request_json(
        transport,
        "GET",
        f"{settings.wan_base_url}/tasks/{quote(task_id, safe='')}",
        headers=headers,
        timeout=30,
        cancel=cancel,
        secrets=secrets,
    )
    return _wan_status(body, secrets)


def _kling_poll(
    transport: Transport,
    settings: Settings,
    task_id: str,
    path: str,
    cancel: threading.Event,
    secrets: tuple[str, ...],
) -> str | None:
    token = _kling_bearer(settings)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    body = _request_json(
        transport,
        "GET",
        f"{settings.kling_base_url}{path}/{quote(task_id, safe='')}",
        headers=headers,
        timeout=30,
        cancel=cancel,
        secrets=(*secrets, token),
    )
    _raise_kling_code(body, secrets)
    return _kling_status(body, secrets)


def _wan_status(body: dict[str, Any], secrets: tuple[str, ...]) -> str | None:
    output = body.get("output")
    if not isinstance(output, dict):
        message = body.get("message")
        if isinstance(message, str) and message.strip():
            raise AdapterError(sanitize(message, secrets))
        raise AdapterError("视频任务响应缺少 output。")
    status = str(output.get("task_status") or "").upper()
    if status in _PENDING or status == "":
        return None
    if status in _SUCCESS:
        url = _wan_video_url(body)
        if url is None:
            raise AdapterError("视频任务完成了，但没有 video_url。")
        return url
    message = output.get("message") if isinstance(output.get("message"), str) else "视频任务失败。"
    raise AdapterError(sanitize(message, secrets))


def _kling_status(body: dict[str, Any], secrets: tuple[str, ...]) -> str | None:
    data = body.get("data")
    if not isinstance(data, dict):
        raise AdapterError("Kling 响应没有 data。")
    status = str(data.get("task_status") or "").upper()
    if status in _PENDING or status == "":
        return None
    if status in _SUCCESS:
        url = _kling_video_url(body)
        if url is None:
            raise AdapterError("视频任务完成了，但没有视频地址。")
        return url
    message = data.get("task_status_msg")
    text = message if isinstance(message, str) and message.strip() else "视频任务失败。"
    raise AdapterError(sanitize(text, secrets))


def _wan_video_url(body: dict[str, Any]) -> str | None:
    output = body.get("output")
    if not isinstance(output, dict):
        return None
    if str(output.get("task_status") or "").upper() not in _SUCCESS:
        return None
    url = output.get("video_url")
    if isinstance(url, str) and url.startswith(("http://", "https://")):
        return url
    return None


def _wan_task_id(body: dict[str, Any]) -> str:
    output = body.get("output")
    task_id = output.get("task_id") if isinstance(output, dict) else body.get("task_id")
    return _task_id(task_id)


def _kling_video_url(body: dict[str, Any]) -> str | None:
    data = body.get("data")
    if not isinstance(data, dict):
        return None
    if str(data.get("task_status") or "").upper() not in _SUCCESS:
        return None
    result = data.get("task_result")
    videos = result.get("videos") if isinstance(result, dict) else None
    if not isinstance(videos, list) or not videos or not isinstance(videos[0], dict):
        return None
    url = videos[0].get("url")
    if isinstance(url, str) and url.startswith(("http://", "https://")):
        return url
    return None


def _kling_task_id(body: dict[str, Any]) -> str:
    data = body.get("data")
    task_id = data.get("task_id") if isinstance(data, dict) else None
    return _task_id(task_id)


def _raise_kling_code(body: dict[str, Any], secrets: tuple[str, ...]) -> None:
    code = body.get("code")
    if isinstance(code, int) and code != 0:
        message = body.get("message")
        text = message if isinstance(message, str) and message.strip() else "Kling 返回错误。"
        raise AdapterError(sanitize(text, secrets))


def _task_id(value: object) -> str:
    if not isinstance(value, str) or not value or len(value) > 128:
        raise AdapterError("供应商没有返回有效的任务 id。")
    if any(char in value for char in "/\\?# \r\n") or any(ord(char) < 32 for char in value):
        raise AdapterError("供应商没有返回有效的任务 id。")
    return value


def _kling_bearer(settings: Settings) -> str:
    if settings.kling_api_key:
        return settings.kling_api_key
    if settings.kling_access_key and settings.kling_secret_key:
        return kling_jwt(settings.kling_access_key, settings.kling_secret_key)
    raise AdapterError("Kling credentials are not set on the sidecar.")


def kling_jwt(access_key: str, secret_key: str, *, now: float | None = None) -> str:
    issued = int(time.time() if now is None else now)
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"iss": access_key, "exp": issued + 1800, "nbf": issued - 5}
    signing = f"{_b64_json(header)}.{_b64_json(payload)}"
    signature = hmac.new(secret_key.encode("utf-8"), signing.encode("ascii"), hashlib.sha256).digest()
    return f"{signing}.{_b64_bytes(signature)}"


def _b64_json(value: dict[str, object]) -> str:
    return _b64_bytes(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def _b64_bytes(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _download(
    transport: Transport,
    url: str,
    cancel: threading.Event,
    secrets: tuple[str, ...],
) -> tuple[bytes, str | None]:
    if not url.startswith(("http://", "https://")):
        raise AdapterError("视频地址不是 http(s) URL。")
    try:
        result = transport.request(
            "GET",
            url,
            headers={"Accept": "video/*,*/*", "User-Agent": USER_AGENT},
            timeout=120,
            cancel=cancel,
            max_bytes=MAX_VIDEO_BYTES,
        )
    except TransportError as exc:
        raise AdapterError(sanitize(str(exc), secrets)) from exc
    if result.status != 200:
        raise AdapterError(f"Video download returned HTTP {result.status}.")
    return result.body, result.headers.get("content-type")


def _request_json(
    transport: Transport,
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
    cancel: threading.Event,
    secrets: tuple[str, ...],
    payload: dict[str, object] | None = None,
) -> dict[str, Any]:
    try:
        result = transport.request(
            method,
            url,
            headers=headers,
            json_body=payload,
            timeout=timeout,
            cancel=cancel,
        )
    except TransportError as exc:
        raise AdapterError(sanitize(str(exc), secrets)) from exc
    return read_json_object(result, secrets)
