"""Shared graph fixtures for sidecar tests. No network."""

from __future__ import annotations

import base64
import threading
import time
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.adapters.transport import HttpResult, RunCancelled

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

TEXT_PORTS = [
    {"id": "prompt", "name": "prompt", "direction": "input", "dataType": "text"},
    {"id": "text", "name": "text", "direction": "output", "dataType": "text"},
]

IMAGE_PORTS = [
    {"id": "prompt", "name": "prompt", "direction": "input", "dataType": "text"},
    {"id": "image", "name": "image", "direction": "output", "dataType": "image"},
]

STORYBOARD_PORTS = [
    {"id": "prompt", "name": "prompt", "direction": "input", "dataType": "text"},
    {"id": "board", "name": "board", "direction": "output", "dataType": "storyboard"},
]

COMFY_PORTS = [
    {"id": "prompt", "name": "prompt", "direction": "input", "dataType": "text"},
    {"id": "image_in", "name": "image", "direction": "input", "dataType": "image"},
    {"id": "image", "name": "image", "direction": "output", "dataType": "image"},
]

VIDEO_PORTS = [
    {"id": "prompt", "name": "prompt", "direction": "input", "dataType": "text"},
    {"id": "image", "name": "image", "direction": "input", "dataType": "image"},
    {"id": "video", "name": "video", "direction": "output", "dataType": "video"},
]

MP4_BYTES = bytes.fromhex("000000186674797069736f6d0000000069736f6d6d703432")


def node(node_id: str, node_type: str, ports: list[dict[str, str]], **data: object) -> dict[str, object]:
    return {
        "id": node_id,
        "type": node_type,
        "position": {"x": 0, "y": 0},
        "data": {"label": node_id, **data},
        "ports": ports,
    }


def chat_node(node_id: str, **data: object) -> dict[str, object]:
    return node(node_id, "openai.chat", TEXT_PORTS, **data)


def image_node(node_id: str, **data: object) -> dict[str, object]:
    return node(node_id, "openai.image", IMAGE_PORTS, **data)


def comfy_node(node_id: str, **data: object) -> dict[str, object]:
    return node(node_id, "comfyui.image", COMFY_PORTS, **data)


def video_node(node_id: str, **data: object) -> dict[str, object]:
    return node(node_id, "video.wan-kling", VIDEO_PORTS, **data)


def edge(edge_id: str, source: str, target: str, source_port: str = "text", target_port: str = "prompt") -> dict[str, str]:
    return {
        "id": edge_id,
        "source": source,
        "sourcePort": source_port,
        "target": target,
        "targetPort": target_port,
    }


def graph(nodes: list[dict[str, object]], edges: list[dict[str, str]], *, version: str) -> dict[str, object]:
    return {
        "id": "g",
        "name": "Demo",
        "version": version,
        "nodes": nodes,
        "edges": edges,
    }


class FakeTransport:
    def __init__(self, handler: Callable[[dict[str, Any], threading.Event | None], HttpResult]) -> None:
        self.handler = handler
        self.calls: list[dict[str, Any]] = []

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        json_body: dict[str, object] | None = None,
        body: bytes | None = None,
        timeout: float = 120,
        cancel: threading.Event | None = None,
        max_bytes: int = 25 * 1024 * 1024,
    ) -> HttpResult:
        del timeout, max_bytes
        call = {
            "method": method,
            "url": url,
            "headers": dict(headers or {}),
            "json": json_body,
            "body": body,
        }
        self.calls.append(call)
        if cancel is not None and cancel.is_set():
            raise RunCancelled()
        return self.handler(call, cancel)


def json_result(status: int, payload: dict[str, object]) -> HttpResult:
    import json

    return HttpResult(status, {"content-type": "application/json"}, json.dumps(payload).encode())


def wait_run(client: TestClient, run_id: str, timeout: float = 3) -> dict[str, Any]:
    deadline = time.time() + timeout
    last: dict[str, Any] = {}
    while time.time() < deadline:
        response = client.get(f"/runs/{run_id}")
        assert response.status_code == 200
        last = response.json()
        if last["status"] != "running":
            return last
        time.sleep(0.02)
    raise AssertionError(last)
