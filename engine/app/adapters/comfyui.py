"""comfyui.image — text, and an optional image, to a user-run ComfyUI.

HTTP only. Nothing from the ComfyUI repository is imported or copied.

The workflow is the object ComfyUI writes from Save (API Format): a map of
node id to ``{"class_type", "inputs"}``. ``{{prompt}}`` is replaced with the
run prompt. ``{{image}}`` becomes the uploaded filename when an image is
connected. ``{{seed}}`` must be the entire input value. ``promptNode`` /
``imageNode`` override that automatic mapping. The sidecar polls ``GET
/history/{prompt_id}``. Cancel and timeout both ``POST /interrupt`` and drop
the queued prompt. They do not start another attempt.
"""

from __future__ import annotations

import copy
import json
import threading
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from app.adapters.fields import timeout_seconds
from app.adapters.jobs import poll_job
from app.adapters.openai_common import (
    USER_AGENT,
    AdapterError,
    optional_seed,
    optional_string,
    read_json_object,
)
from app.adapters.reference import load_reference_image
from app.adapters.transport import RunCancelled, Transport, TransportError
from app.assets import MAX_IMAGE_BYTES, safe_token, sniff_image, write_asset
from app.config import Settings, engine_root, normalize_base_url
from app.errors import sanitize
from app.graph import Node

_PROMPT_MARK = "{{prompt}}"
_IMAGE_MARK = "{{image}}"
_SEED_MARK = "{{seed}}"
_TEXT_CLASSES = {"CLIPTextEncode", "CLIPTextEncodeSDXL", "CLIPTextEncodeFlux"}
_POLL_SECONDS = 0.5
_MAX_WORKFLOW_BYTES = 2_000_000
_MAX_NODES = 2000


def run_comfyui(
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
    base = _base_url(node.data, settings)
    headers = _headers(settings)
    secrets = settings.secret_values()
    workflow = _load_workflow(node.data)
    image_name: str | None = None
    if image is not None:
        data, media_type = load_reference_image(asset_root, image, limit=MAX_IMAGE_BYTES)
        image_name = _upload_image(transport, base, headers, data, media_type, cancel, secrets)
    prepared = _prepare_workflow(workflow, prompt, optional_seed(node.data), image_name, node.data)
    timeout = timeout_seconds(node.data, 300)
    deadline_offset = timeout
    prompt_id: str | None = None
    try:
        submitted = _request_json(
            transport,
            "POST",
            f"{base}/prompt",
            headers=headers,
            payload={"prompt": prepared, "client_id": f"hz-{safe_token(run_id)}"},
            timeout=min(60.0, deadline_offset),
            cancel=cancel,
            secrets=secrets,
        )
        prompt_id = _accept_prompt(submitted, secrets)
        found = poll_job(
            cancel,
            timeout,
            _POLL_SECONDS,
            lambda: _history_once(transport, base, headers, prompt_id or "", cancel, secrets),
        )
    except RunCancelled:
        _stop(transport, base, headers, prompt_id)
        raise
    if found is None:
        _stop(transport, base, headers, prompt_id)
        raise AdapterError("等待 ComfyUI 超时。没有自动重试。")
    raw, header_type = _download_view(transport, base, headers, found, cancel, secrets)
    try:
        media_type, extension = sniff_image(raw, header_type)
    except ValueError as exc:
        raise AdapterError(str(exc)) from exc
    relative = f"images/{safe_token(run_id)}-{safe_token(node.id)}{extension}"
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


def _base_url(data: dict[str, Any], settings: Settings) -> str:
    override = optional_string(data, "baseUrl")
    if not override:
        return settings.comfyui_base_url
    try:
        return normalize_base_url(override)
    except ValueError as exc:
        raise AdapterError("ComfyUI 地址必须是 http 或 https URL。") from exc


def _headers(settings: Settings) -> dict[str, str]:
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if settings.comfyui_api_key:
        headers["Authorization"] = f"Bearer {settings.comfyui_api_key}"
    return headers


def _load_workflow(data: dict[str, Any]) -> dict[str, Any]:
    inline = data.get("workflow")
    if isinstance(inline, dict):
        return _unwrap_workflow(inline)
    if isinstance(inline, str) and inline.strip():
        if len(inline) > 100_000:
            raise AdapterError("工作流 JSON 太长。请改用 workflowPath。")
        try:
            parsed = json.loads(inline)
        except json.JSONDecodeError as exc:
            raise AdapterError("工作流 JSON 无法解析。") from exc
        return _unwrap_workflow(parsed)
    path_text = optional_string(data, "workflowPath")
    if path_text:
        return _unwrap_workflow(_read_workflow_file(path_text))
    raise AdapterError("没有工作流。在检查器里粘贴 API 格式 JSON，或填写 workflowPath。")


def _read_workflow_file(path_text: str) -> object:
    raw = Path(path_text).expanduser()
    if raw.is_absolute():
        path = raw.resolve()
    else:
        root = engine_root().resolve()
        path = (root / raw).resolve()
        if root != path and root not in path.parents:
            raise AdapterError("相对 workflowPath 必须位于 engine 目录内。")
    if path.suffix.lower() != ".json" or path.name.startswith(".env"):
        raise AdapterError("workflowPath 必须是 .json 文件，不能指向 env。")
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise AdapterError("无法读取 workflowPath。") from exc
    if size > _MAX_WORKFLOW_BYTES:
        raise AdapterError("工作流文件超过 2MB。")
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise AdapterError("无法读取 workflowPath。") from exc
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AdapterError("workflowPath 不是 JSON。") from exc


def _unwrap_workflow(parsed: object) -> dict[str, Any]:
    if isinstance(parsed, dict) and _is_api_graph(parsed):
        return parsed
    if isinstance(parsed, dict) and _is_api_graph(parsed.get("prompt")):
        prompt = parsed["prompt"]
        assert isinstance(prompt, dict)
        return prompt
    if isinstance(parsed, dict) and isinstance(parsed.get("nodes"), list):
        raise AdapterError("这是 ComfyUI 界面工作流。请用 Save (API Format) 导出。")
    raise AdapterError("工作流需要 ComfyUI API 格式：每个节点包含 class_type 和 inputs。")


def _is_api_graph(value: object) -> bool:
    if not isinstance(value, dict) or not value or len(value) > _MAX_NODES:
        return False
    return all(_is_api_node(item) for item in value.values())


def _is_api_node(item: object) -> bool:
    return (
        isinstance(item, dict)
        and isinstance(item.get("class_type"), str)
        and bool(item.get("class_type", "").strip())
        and isinstance(item.get("inputs"), dict)
    )


def _prepare_workflow(
    workflow: dict[str, Any],
    prompt: str,
    seed: int | None,
    image_name: str | None,
    data: dict[str, Any],
) -> dict[str, Any]:
    had_prompt = _contains(workflow, _PROMPT_MARK)
    had_image = _contains(workflow, _IMAGE_MARK)
    had_seed = _contains(workflow, _SEED_MARK)
    if had_seed and seed is None:
        raise AdapterError("工作流含 {{seed}}，但没有填写 Seed。")
    if had_image and image_name is None:
        raise AdapterError("工作流含 {{image}}，但没有连入图像。")
    mapping: dict[str, object] = {_PROMPT_MARK: prompt}
    if image_name is not None:
        mapping[_IMAGE_MARK] = image_name
    if seed is not None:
        mapping[_SEED_MARK] = seed
    prepared = _replace(copy.deepcopy(workflow), mapping)
    if not isinstance(prepared, dict):
        raise AdapterError("工作流需要是 JSON 对象。")
    if seed is not None and _contains(prepared, _SEED_MARK):
        raise AdapterError("{{seed}} 需要独占一个输入值，不能写在别的文字中间。")
    prompt_node = optional_string(data, "promptNode")
    prompt_input = optional_string(data, "promptInput") or "text"
    if prompt_node:
        _set_input(prepared, prompt_node, prompt_input, prompt)
    elif not had_prompt:
        found = _first_class(prepared, _TEXT_CLASSES)
        if found is None:
            raise AdapterError("工作流里没有可写入的提示词。设置 promptNode，或在文本里写 {{prompt}}。")
        _set_input(prepared, found, prompt_input, prompt)
    if image_name is not None:
        image_node = optional_string(data, "imageNode")
        image_input = optional_string(data, "imageInput") or "image"
        if image_node:
            _set_input(prepared, image_node, image_input, image_name)
        elif not had_image:
            found = _first_class(prepared, {"LoadImage"})
            if found is None:
                raise AdapterError("连了参考图，但工作流里没有 LoadImage。设置 imageNode，或在输入里写 {{image}}。")
            _set_input(prepared, found, image_input, image_name)
    return prepared


def _upload_image(
    transport: Transport,
    base: str,
    headers: dict[str, str],
    data: bytes,
    media_type: str,
    cancel: threading.Event,
    secrets: tuple[str, ...],
) -> str:
    extension = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}.get(media_type, ".png")
    payload, content_type = _multipart(
        [
            ("image", ("reference" + extension, media_type, data)),
            ("type", "input"),
            ("overwrite", "true"),
        ]
    )
    upload_headers = dict(headers)
    upload_headers["Content-Type"] = content_type
    upload_headers["Accept"] = "application/json"
    body = _request_json(
        transport,
        "POST",
        f"{base}/upload/image",
        headers=upload_headers,
        raw_body=payload,
        timeout=60,
        cancel=cancel,
        secrets=secrets,
    )
    name = body.get("name")
    if not isinstance(name, str) or not name or "/" in name or "\\" in name or name in {".", ".."}:
        raise AdapterError("ComfyUI 没有返回上传文件名。")
    return name


def _accept_prompt(body: dict[str, Any], secrets: tuple[str, ...]) -> str:
    error = body.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        text = message if isinstance(message, str) and message.strip() else "ComfyUI 拒绝了工作流。"
        raise AdapterError(sanitize(text, secrets))
    node_errors = body.get("node_errors")
    if isinstance(node_errors, dict) and node_errors:
        raise AdapterError("ComfyUI 拒绝了工作流。检查 class_type、连线和模型文件名。")
    prompt_id = body.get("prompt_id")
    if not isinstance(prompt_id, str) or not prompt_id.strip() or len(prompt_id) > 128:
        raise AdapterError("ComfyUI 没有返回 prompt_id。")
    if any(char in prompt_id for char in "/\\?#") or any(ord(char) < 32 for char in prompt_id):
        raise AdapterError("ComfyUI 返回了无效的 prompt_id。")
    return prompt_id


def _history_once(
    transport: Transport,
    base: str,
    headers: dict[str, str],
    prompt_id: str,
    cancel: threading.Event,
    secrets: tuple[str, ...],
) -> dict[str, str] | None:
    body = _request_json(
        transport,
        "GET",
        f"{base}/history/{prompt_id}",
        headers=headers,
        timeout=30,
        cancel=cancel,
        secrets=secrets,
    )
    entry = body.get(prompt_id)
    if not isinstance(entry, dict):
        return None
    status = entry.get("status")
    if isinstance(status, dict) and status.get("completed") is True and str(status.get("status_str")) == "error":
        raise AdapterError(sanitize(_history_error(status), secrets))
    success = isinstance(status, dict) and (
        status.get("completed") is True or str(status.get("status_str")) == "success"
    )
    if not success:
        return None
    return _first_image(entry.get("outputs"))


def _history_error(status: dict[str, Any]) -> str:
    messages = status.get("messages")
    if isinstance(messages, list):
        for item in messages:
            if isinstance(item, list) and len(item) >= 2 and isinstance(item[1], dict):
                text = item[1].get("exception_message")
                if isinstance(text, str) and text.strip():
                    return text.strip()
    return "ComfyUI 执行失败。"


def _first_image(outputs: object) -> dict[str, str]:
    if not isinstance(outputs, dict):
        raise AdapterError("ComfyUI 完成了，但没有图像。")
    for node_id in sorted(outputs, key=str):
        item = outputs[node_id]
        images = item.get("images") if isinstance(item, dict) else None
        if not isinstance(images, list):
            continue
        for image in images:
            if not isinstance(image, dict):
                continue
            filename = image.get("filename")
            if not isinstance(filename, str) or not filename or "/" in filename or "\\" in filename:
                continue
            subfolder = image.get("subfolder") if isinstance(image.get("subfolder"), str) else ""
            if subfolder and ("/" in subfolder or "\\" in subfolder or ".." in subfolder):
                raise AdapterError("ComfyUI 返回了无效的子目录。")
            kind = image.get("type") if image.get("type") in {"output", "input", "temp"} else "output"
            return {"filename": filename, "subfolder": subfolder, "type": str(kind)}
    raise AdapterError("ComfyUI 完成了，但没有图像。")


def _download_view(
    transport: Transport,
    base: str,
    headers: dict[str, str],
    image: dict[str, str],
    cancel: threading.Event,
    secrets: tuple[str, ...],
) -> tuple[bytes, str | None]:
    query = urlencode(
        {"filename": image["filename"], "subfolder": image["subfolder"], "type": image["type"]}
    )
    view_headers = dict(headers)
    view_headers["Accept"] = "image/*,*/*"
    try:
        result = transport.request(
            "GET",
            f"{base}/view?{query}",
            headers=view_headers,
            timeout=60,
            cancel=cancel,
            max_bytes=MAX_IMAGE_BYTES,
        )
    except TransportError as exc:
        raise AdapterError(sanitize(str(exc), secrets)) from exc
    if result.status != 200:
        raise AdapterError(f"ComfyUI /view returned HTTP {result.status}.")
    return result.body, result.headers.get("content-type")


def _stop(transport: Transport, base: str, headers: dict[str, str], prompt_id: str | None) -> None:
    try:
        transport.request("POST", f"{base}/interrupt", headers=headers, json_body={}, timeout=5, cancel=None)
    except Exception:
        pass
    if not prompt_id:
        return
    try:
        transport.request(
            "POST",
            f"{base}/queue",
            headers=headers,
            json_body={"delete": [prompt_id]},
            timeout=5,
            cancel=None,
        )
    except Exception:
        pass


def _request_json(
    transport: Transport,
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
    cancel: threading.Event | None,
    secrets: tuple[str, ...],
    payload: dict[str, object] | None = None,
    raw_body: bytes | None = None,
) -> dict[str, Any]:
    try:
        result = transport.request(
            method,
            url,
            headers=headers,
            json_body=payload,
            body=raw_body,
            timeout=timeout,
            cancel=cancel,
        )
    except TransportError as exc:
        raise AdapterError(sanitize(str(exc), secrets)) from exc
    return read_json_object(result, secrets)


def _multipart(parts: list[tuple[str, str | tuple[str, str, bytes]]]) -> tuple[bytes, str]:
    boundary = f"----haizhu{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in parts:
        if isinstance(value, str):
            chunks.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
            )
            continue
        filename, content_type, data = value
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode()
            + data
            + b"\r\n"
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _set_input(workflow: dict[str, Any], node_id: str, key: str, value: object) -> None:
    target = workflow.get(node_id)
    if not isinstance(target, dict):
        raise AdapterError(f"工作流里没有节点 {node_id}。")
    inputs = target.get("inputs")
    if not isinstance(inputs, dict):
        raise AdapterError(f"节点 {node_id} 没有 inputs。")
    inputs[key] = value


def _first_class(workflow: dict[str, Any], class_types: set[str]) -> str | None:
    for node_id, node in workflow.items():
        if isinstance(node, dict) and node.get("class_type") in class_types:
            return str(node_id)
    return None


def _contains(value: object, needle: str) -> bool:
    if isinstance(value, str):
        return needle in value
    if isinstance(value, list):
        return any(_contains(item, needle) for item in value)
    if isinstance(value, dict):
        return any(_contains(item, needle) for item in value.values())
    return False


def _replace(value: object, mapping: dict[str, object]) -> object:
    if isinstance(value, str):
        if value in mapping and not isinstance(mapping[value], str):
            return mapping[value]
        result = value
        for key, item in mapping.items():
            if isinstance(item, str) and key in result:
                result = result.replace(key, item)
        return result
    if isinstance(value, list):
        return [_replace(item, mapping) for item in value]
    if isinstance(value, dict):
        return {key: _replace(item, mapping) for key, item in value.items()}
    return value
