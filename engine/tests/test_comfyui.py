"""Mocked ComfyUI: prompt injection, upload, timeout, and cancel."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from fastapi.testclient import TestClient

from app.adapters.transport import HttpResult, RunCancelled
from app.main import create_app
from app.version import read_version
from tests.support import PNG_BYTES, FakeTransport, comfy_node, edge, graph, json_result, video_node, wait_run

VERSION = read_version()
COMFY = "http://comfy.example.test:8188"


def _client(tmp_path: Path, transport: object) -> TestClient:
    application = create_app(env_file=tmp_path / ".env", asset_root=tmp_path / "assets", transport=transport)  # type: ignore[arg-type]
    return TestClient(application)


def _workflow() -> str:
    return json.dumps(
        {
            "3": {"class_type": "KSampler", "inputs": {"seed": "{{seed}}"}},
            "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "{{prompt}}"}},
            "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0]}},
        }
    )


def _history() -> dict[str, object]:
    return {
        "pid-1": {
            "outputs": {
                "9": {
                    "images": [{"filename": "haizhu_00001_.png", "subfolder": "", "type": "output"}],
                }
            },
            "status": {"status_str": "success", "completed": True},
        }
    }


def test_comfy_prompt_placeholder_and_seed(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url == f"{COMFY}/prompt":
            assert "Authorization" not in call["headers"]
            workflow = call["json"]["prompt"]  # type: ignore[index]
            assert workflow["6"]["inputs"]["text"] == "red lantern"
            assert workflow["3"]["inputs"]["seed"] == 7
            assert isinstance(call["json"]["client_id"], str)  # type: ignore[index]
            return json_result(200, {"prompt_id": "pid-1", "number": 1, "node_errors": {}})
        if url == f"{COMFY}/history/pid-1":
            return json_result(200, _history())
        if url.startswith(f"{COMFY}/view?"):
            assert "filename=haizhu_00001_.png" in url
            return HttpResult(200, {"content-type": "image/png"}, PNG_BYTES)
        raise AssertionError(url)

    transport = FakeTransport(handler)
    client = _client(tmp_path, transport)
    body = graph(
        [comfy_node("draw", prompt="red lantern", seed=7, baseUrl=COMFY, workflow=_workflow())],
        [],
        version=VERSION,
    )
    created = client.post("/runs", json={"graph": body})
    assert created.status_code == 202
    finished = wait_run(client, created.json()["id"])
    assert finished["status"] == "succeeded"
    image = finished["nodes"]["draw"]["outputs"]["image"]
    assert image["relativePath"].startswith("images/")
    assert image["relativePath"].endswith(".png")
    asset = client.get(image["url"])
    assert asset.status_code == 200
    assert asset.content == PNG_BYTES
    assert asset.headers["content-type"].startswith("image/png")
    assert not any(str(call["url"]).endswith("/interrupt") for call in transport.calls)


def test_comfy_workflow_file_maps_prompt_node(tmp_path: Path) -> None:
    workflow_path = tmp_path / "portrait.json"
    workflow_path.write_text(
        json.dumps(
            {
                "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "old", "clip_l": "old"}},
                "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0]}},
            }
        ),
        encoding="utf-8",
    )

    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/prompt"):
            assert url.startswith("http://127.0.0.1:9191/prompt")
            workflow = call["json"]["prompt"]  # type: ignore[index]
            assert workflow["6"]["inputs"]["clip_l"] == "mapped lantern"
            assert workflow["6"]["inputs"]["text"] == "old"
            return json_result(200, {"prompt_id": "pid-1", "number": 1, "node_errors": {}})
        if url.endswith("/history/pid-1"):
            return json_result(200, _history())
        if "/view?" in url:
            return HttpResult(200, {"content-type": "image/png"}, PNG_BYTES)
        raise AssertionError(url)

    client = _client(tmp_path, FakeTransport(handler))
    saved = client.put("/settings", json={"comfyuiBaseUrl": "http://127.0.0.1:9191"})
    assert saved.status_code == 200
    body = graph(
        [
            comfy_node(
                "draw",
                prompt="mapped lantern",
                workflowPath=str(workflow_path),
                promptNode="6",
                promptInput="clip_l",
            )
        ],
        [],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"])
    assert finished["status"] == "succeeded"


def test_comfy_uploads_an_upstream_image(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/images/generations"):
            encoded = __import__("base64").b64encode(PNG_BYTES).decode("ascii")
            return json_result(200, {"data": [{"b64_json": encoded}]})
        if url.endswith("/upload/image"):
            assert str(call["headers"]["Content-Type"]).startswith("multipart/form-data")
            assert isinstance(call["body"], bytes) and PNG_BYTES in call["body"]
            return json_result(200, {"name": "uploaded.png", "subfolder": "", "type": "input"})
        if url.endswith("/prompt"):
            workflow = call["json"]["prompt"]  # type: ignore[index]
            assert workflow["1"]["inputs"]["image"] == "uploaded.png"
            assert workflow["6"]["inputs"]["text"] == "use the reference"
            return json_result(200, {"prompt_id": "pid-1", "number": 1, "node_errors": {}})
        if url.endswith("/history/pid-1"):
            return json_result(200, _history())
        if "/view?" in url:
            return HttpResult(200, {"content-type": "image/png"}, PNG_BYTES)
        raise AssertionError(url)

    client = _client(tmp_path, FakeTransport(handler))
    client.put("/settings", json={"openaiBaseUrl": "https://example.test/v1", "openaiApiKey": "sk-test"})
    workflow = json.dumps(
        {
            "1": {"class_type": "LoadImage", "inputs": {"image": "placeholder.png"}},
            "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "{{prompt}}"}},
            "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0]}},
        }
    )
    from tests.support import image_node

    body = graph(
        [
            image_node("src", prompt="a circle", model="gpt-image-1"),
            comfy_node("draw", prompt="use the reference", baseUrl=COMFY, workflow=workflow),
        ],
        [edge("e1", "src", "draw", source_port="image", target_port="image_in")],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"])
    assert finished["status"] == "succeeded"
    assert finished["nodes"]["draw"]["outputs"]["image"]["mediaType"] == "image/png"


def test_comfy_hides_an_optional_api_key(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        key = str(call["headers"].get("Authorization", "")).removeprefix("Bearer ")
        return json_result(401, {"error": {"message": f"rejected {key}"}})

    client = _client(tmp_path, FakeTransport(handler))
    client.put("/settings", json={"comfyuiApiKey": "comfy-secret"})
    body = graph(
        [comfy_node("draw", prompt="x", baseUrl=COMFY, workflow=_workflow(), seed=1)],
        [],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"])
    assert finished["status"] == "failed"
    assert "comfy-secret" not in json.dumps(finished)
    assert "***" in finished["nodes"]["draw"]["error"]


def test_bad_workflow_does_not_call_comfy(tmp_path: Path) -> None:
    transport = FakeTransport(lambda _call, _cancel: json_result(500, {}))
    client = _client(tmp_path, transport)
    missing = graph([comfy_node("draw", prompt="x", baseUrl=COMFY)], [], version=VERSION)
    finished = wait_run(client, client.post("/runs", json={"graph": missing}).json()["id"])
    assert finished["nodes"]["draw"]["status"] == "failed"
    assert transport.calls == []

    ui = graph(
        [comfy_node("draw", prompt="x", baseUrl=COMFY, workflow=json.dumps({"nodes": [], "links": []}))],
        [],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": ui}).json()["id"])
    assert "Save (API Format)" in finished["nodes"]["draw"]["error"]
    assert transport.calls == []

    escaped = graph(
        [comfy_node("draw", prompt="x", baseUrl=COMFY, workflowPath="../secret.json")],
        [],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": escaped}).json()["id"])
    assert "engine" in finished["nodes"]["draw"]["error"]
    assert transport.calls == []


def test_comfy_timeout_interrupts_and_skips_downstream(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/prompt"):
            return json_result(200, {"prompt_id": "pid-1", "number": 1, "node_errors": {}})
        if "/history/" in url:
            return json_result(200, {})
        if url.endswith("/interrupt") or url.endswith("/queue"):
            return json_result(200, {})
        raise AssertionError(url)

    transport = FakeTransport(handler)
    client = _client(tmp_path, transport)
    client.put("/settings", json={"wanApiKey": "wk-test", "wanBaseUrl": "https://wan.example.test/api/v1"})
    body = graph(
        [
            comfy_node("comfy", prompt="slow", baseUrl=COMFY, workflow=_workflow(), seed=1, timeoutSec=1),
            video_node("video", prompt="should-not-run", vendor="wan"),
        ],
        [edge("e1", "comfy", "video", source_port="image", target_port="image")],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"], timeout=5)
    assert finished["status"] == "failed"
    assert "超时" in finished["nodes"]["comfy"]["error"]
    assert finished["nodes"]["video"]["status"] == "skipped"
    assert sum(1 for call in transport.calls if str(call["url"]).endswith("/prompt")) == 1
    assert any(str(call["url"]).endswith("/interrupt") for call in transport.calls)
    deleted = [call for call in transport.calls if str(call["url"]).endswith("/queue")]
    assert deleted[-1]["json"] == {"delete": ["pid-1"]}
    assert not any("video-synthesis" in str(call["url"]) for call in transport.calls)
    assert not any("/view?" in str(call["url"]) for call in transport.calls)


def test_comfy_cancel_stops_polling_and_the_downstream_node(tmp_path: Path) -> None:
    class Blocking:
        def __init__(self) -> None:
            self.started = threading.Event()
            self.calls: list[dict[str, object]] = []

        def request(self, method: str, url: str, *, headers=None, json_body=None, body=None, timeout: float = 120, cancel=None, max_bytes: int = 1):
            del method, body, timeout, max_bytes
            self.calls.append({"url": url, "json": json_body, "headers": dict(headers or {}), "cancel": cancel})
            if url.endswith("/prompt"):
                return json_result(200, {"prompt_id": "pid-1", "number": 1, "node_errors": {}})
            if "/history/" in url:
                self.started.set()
                if cancel is None or not cancel.wait(5):
                    raise AssertionError("cancel was not signaled")
                raise RunCancelled()
            if url.endswith("/interrupt") or url.endswith("/queue"):
                assert cancel is None
                return json_result(200, {})
            raise AssertionError(url)

    transport = Blocking()
    client = _client(tmp_path, transport)
    client.put("/settings", json={"wanApiKey": "wk-test"})
    body = graph(
        [
            comfy_node("comfy", prompt="wait", baseUrl=COMFY, workflow=_workflow(), seed=1),
            video_node("video", prompt="should-not-run", vendor="wan"),
        ],
        [edge("e1", "comfy", "video", source_port="image", target_port="image")],
        version=VERSION,
    )
    created = client.post("/runs", json={"graph": body})
    assert created.status_code == 202
    run_id = created.json()["id"]
    assert transport.started.wait(2)
    blocked = client.post("/runs", json={"graph": body})
    assert blocked.status_code == 409
    assert blocked.json()["error"] == "run_in_progress"
    assert client.post(f"/runs/{run_id}/cancel").status_code == 200
    finished = wait_run(client, run_id)
    assert finished["status"] == "cancelled"
    assert finished["nodes"]["comfy"]["status"] == "cancelled"
    assert finished["nodes"]["video"]["status"] == "cancelled"
    assert finished["nodes"]["video"]["outputs"] == {}
    assert any(str(call["url"]).endswith("/interrupt") for call in transport.calls)
    assert not any("video-synthesis" in str(call["url"]) for call in transport.calls)
