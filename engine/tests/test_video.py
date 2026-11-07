"""Mocked Wan and Kling: submit, poll, download, timeout, and cancel. No live calls."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
from pathlib import Path

from fastapi.testclient import TestClient

from app.adapters.transport import HttpResult, RunCancelled
from app.main import create_app
from app.version import GRAPH_DOCUMENT_VERSION
from tests.support import (
    MP4_BYTES,
    PNG_BYTES,
    FakeTransport,
    chat_node,
    edge,
    graph,
    image_node,
    json_result,
    video_node,
    wait_run,
)

VERSION = GRAPH_DOCUMENT_VERSION
WAN = "https://wan.example.test/api/v1"
KLING = "https://kling.example.test"
WAN_KEY = "wk-test-value"
KLING_ACCESS = "kling-access-value"
KLING_SECRET = "kling-secret-value"


def _client(tmp_path: Path, transport: object) -> TestClient:
    application = create_app(env_file=tmp_path / ".env", asset_root=tmp_path / "assets", transport=transport)  # type: ignore[arg-type]
    return TestClient(application)


def _jwt_payload(token: str, secret: str) -> dict[str, object]:
    header, payload, signature = token.split(".")
    signing = f"{header}.{payload}".encode("ascii")
    expected = base64.urlsafe_b64encode(hmac.new(secret.encode("utf-8"), signing, hashlib.sha256).digest())
    assert signature.encode("ascii") == expected.rstrip(b"=")
    padded = payload + "=" * (-len(payload) % 4)
    body = json.loads(base64.urlsafe_b64decode(padded))
    assert isinstance(body, dict)
    return body


def _with_text_output(node: dict[str, object]) -> dict[str, object]:
    ports = list(node["ports"])  # type: ignore[arg-type]
    ports.append({"id": "text", "name": "text", "direction": "output", "dataType": "text"})
    node["ports"] = ports
    return node


def test_wan_text_to_video_polls_once_and_stores_the_file(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url == f"{WAN}/services/aigc/video-generation/video-synthesis":
            assert call["headers"]["Authorization"] == f"Bearer {WAN_KEY}"
            assert call["headers"]["X-DashScope-Async"] == "enable"
            body = call["json"]
            assert body["model"] == "wan2.5-t2v-preview"  # type: ignore[index]
            assert body["input"] == {"prompt": "a lantern floating"}  # type: ignore[index]
            assert body["parameters"]["size"] == "1280*720"  # type: ignore[index]
            assert body["parameters"]["duration"] == 5  # type: ignore[index]
            assert "resolution" not in body["parameters"]  # type: ignore[operator]
            return json_result(200, {"output": {"task_id": "task-1", "task_status": "PENDING"}, "request_id": "r1"})
        if url == f"{WAN}/tasks/task-1":
            return json_result(
                200,
                {
                    "output": {
                        "task_id": "task-1",
                        "task_status": "SUCCEEDED",
                        "video_url": "https://cdn.example.test/a.mp4",
                    }
                },
            )
        if url == "https://cdn.example.test/a.mp4":
            assert "Authorization" not in call["headers"]
            return HttpResult(200, {"content-type": "video/mp4"}, MP4_BYTES)
        raise AssertionError(url)

    transport = FakeTransport(handler)
    client = _client(tmp_path, transport)
    client.put("/settings", json={"wanBaseUrl": WAN, "wanApiKey": WAN_KEY})
    body = graph(
        [video_node("vid", prompt="a lantern floating", vendor="wan", model="wan2.5-t2v-preview")],
        [],
        version=VERSION,
    )
    created = client.post("/runs", json={"graph": body})
    assert created.status_code == 202
    finished = wait_run(client, created.json()["id"])
    assert finished["status"] == "succeeded"
    video = finished["nodes"]["vid"]["outputs"]["video"]
    assert video["mediaType"] == "video/mp4"
    assert video["relativePath"].startswith("videos/")
    assert video["relativePath"].endswith(".mp4")
    assert video["url"] == f"/assets/{video['relativePath']}"
    assert WAN_KEY not in json.dumps(finished)
    asset = client.get(video["url"])
    assert asset.status_code == 200
    assert asset.content == MP4_BYTES
    assert asset.headers["content-type"].startswith("video/mp4")
    assert sum(1 for call in transport.calls if str(call["url"]).endswith("/video-synthesis")) == 1


def test_wan_image_uses_the_i2v_model_and_a_data_url(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/images/generations"):
            encoded = base64.b64encode(PNG_BYTES).decode("ascii")
            return json_result(200, {"data": [{"b64_json": encoded}]})
        if url.endswith("/video-synthesis"):
            body = call["json"]
            assert body["model"] == "wan2.6-i2v"  # type: ignore[index]
            assert body["parameters"]["resolution"] == "720P"  # type: ignore[index]
            assert body["parameters"]["duration"] == 10  # type: ignore[index]
            assert "size" not in body["parameters"]  # type: ignore[operator]
            image_url = body["input"]["img_url"]  # type: ignore[index]
            assert image_url.startswith("data:image/png;base64,")
            assert base64.b64decode(image_url.split(",", 1)[1]) == PNG_BYTES
            assert body["input"]["prompt"] == "move the lantern"  # type: ignore[index]
            return json_result(200, {"output": {"task_id": "task-2", "task_status": "PENDING"}})
        if url.endswith("/tasks/task-2"):
            return json_result(
                200,
                {"output": {"task_status": "SUCCEEDED", "video_url": "https://cdn.example.test/b.mp4"}},
            )
        if url == "https://cdn.example.test/b.mp4":
            assert "Authorization" not in call["headers"]
            return HttpResult(200, {"content-type": "application/octet-stream"}, MP4_BYTES)
        raise AssertionError(url)

    client = _client(tmp_path, FakeTransport(handler))
    client.put(
        "/settings",
        json={
            "openaiBaseUrl": "https://example.test/v1",
            "openaiApiKey": "sk-test",
            "wanBaseUrl": WAN,
            "wanApiKey": WAN_KEY,
        },
    )
    body = graph(
        [
            image_node("src", prompt="a circle", model="gpt-image-1"),
            video_node("vid", prompt="move the lantern", vendor="wan", model="wan2.6-t2v", duration=10),
        ],
        [edge("e1", "src", "vid", source_port="image", target_port="image")],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"])
    assert finished["status"] == "succeeded"
    assert finished["nodes"]["vid"]["outputs"]["video"]["relativePath"].startswith("videos/")
    assert WAN_KEY not in json.dumps(finished)
    assert "sk-test" not in json.dumps(finished)


def test_kling_text_signs_a_jwt_and_kling_image_uses_image2video(tmp_path: Path) -> None:
    def text_handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url == f"{KLING}/v1/videos/text2video":
            token = str(call["headers"]["Authorization"]).removeprefix("Bearer ")
            assert KLING_SECRET not in token
            assert _jwt_payload(token, KLING_SECRET)["iss"] == KLING_ACCESS
            body = call["json"]
            assert body["model_name"] == "kling-v2-master"  # type: ignore[index]
            assert body["prompt"] == "city at night"  # type: ignore[index]
            assert body["duration"] == "5"  # type: ignore[index]
            assert body["mode"] == "pro"  # type: ignore[index]
            assert body["aspect_ratio"] == "9:16"  # type: ignore[index]
            assert "image" not in body  # type: ignore[operator]
            return json_result(200, {"code": 0, "data": {"task_id": "k1", "task_status": "submitted"}})
        if url == f"{KLING}/v1/videos/text2video/k1":
            token = str(call["headers"]["Authorization"]).removeprefix("Bearer ")
            assert _jwt_payload(token, KLING_SECRET)["iss"] == KLING_ACCESS
            return json_result(
                200,
                {
                    "code": 0,
                    "data": {
                        "task_id": "k1",
                        "task_status": "succeed",
                        "task_result": {"videos": [{"id": "v", "url": "https://cdn.example.test/k.mp4"}]},
                    },
                },
            )
        if url == "https://cdn.example.test/k.mp4":
            assert "Authorization" not in call["headers"]
            return HttpResult(200, {"content-type": "video/mp4"}, MP4_BYTES)
        raise AssertionError(url)

    client = _client(tmp_path, FakeTransport(text_handler))
    client.put(
        "/settings",
        json={"klingBaseUrl": KLING, "klingAccessKey": KLING_ACCESS, "klingSecretKey": KLING_SECRET},
    )
    text_graph = graph(
        [video_node("vid", prompt="city at night", vendor="kling", model="wan2.6-t2v", size="9:16", mode="pro")],
        [],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": text_graph}).json()["id"])
    assert finished["status"] == "succeeded"
    assert KLING_SECRET not in json.dumps(finished)
    assert KLING_ACCESS not in json.dumps(finished)

    def image_handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/images/generations"):
            return json_result(200, {"data": [{"b64_json": base64.b64encode(PNG_BYTES).decode("ascii")}]})
        if url == f"{KLING}/v1/videos/image2video":
            body = call["json"]
            assert body["model_name"] == "kling-v1-6"  # type: ignore[index]
            assert "aspect_ratio" not in body  # type: ignore[operator]
            assert base64.b64decode(body["image"]) == PNG_BYTES  # type: ignore[index]
            assert str(call["headers"]["Authorization"]).startswith("Bearer kling-api-key")
            return json_result(200, {"code": 0, "data": {"task_id": "k2", "task_status": "submitted"}})
        if url == f"{KLING}/v1/videos/image2video/k2":
            return json_result(
                200,
                {
                    "code": 0,
                    "data": {
                        "task_status": "succeed",
                        "task_result": {"videos": [{"url": "https://cdn.example.test/k2.mp4"}]},
                    },
                },
            )
        if url == "https://cdn.example.test/k2.mp4":
            assert "Authorization" not in call["headers"]
            return HttpResult(200, {"content-type": "video/mp4"}, MP4_BYTES)
        raise AssertionError(url)

    client = _client(tmp_path, FakeTransport(image_handler))
    client.put(
        "/settings",
        json={
            "openaiBaseUrl": "https://example.test/v1",
            "openaiApiKey": "sk-test",
            "klingBaseUrl": KLING,
            "klingApiKey": "kling-api-key",
        },
    )
    image_graph = graph(
        [
            image_node("src", prompt="a circle", model="gpt-image-1"),
            video_node("vid", prompt="push in", vendor="kling", model="kling-v1-6"),
        ],
        [edge("e1", "src", "vid", source_port="image", target_port="image")],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": image_graph}).json()["id"])
    assert finished["status"] == "succeeded"
    assert "kling-api-key" not in json.dumps(finished)
    assert "sk-test" not in json.dumps(finished)


def test_video_timeout_does_not_retry_or_start_downstream(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/video-synthesis"):
            return json_result(200, {"output": {"task_id": "task-1", "task_status": "PENDING"}})
        if "/tasks/" in url:
            return json_result(200, {"output": {"task_id": "task-1", "task_status": "RUNNING"}})
        if url.endswith("/chat/completions"):
            raise AssertionError("downstream chat was called")
        raise AssertionError(url)

    transport = FakeTransport(handler)
    client = _client(tmp_path, transport)
    client.put(
        "/settings",
        json={
            "openaiBaseUrl": "https://example.test/v1",
            "openaiApiKey": "sk-test",
            "wanBaseUrl": WAN,
            "wanApiKey": WAN_KEY,
        },
    )
    video = _with_text_output(video_node("a", prompt="slow", vendor="wan", timeoutSec=1))
    body = graph(
        [video, chat_node("b", prompt="should-not-run")],
        [edge("e1", "a", "b", source_port="text", target_port="prompt")],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"], timeout=5)
    assert finished["status"] == "failed"
    assert "超时" in finished["nodes"]["a"]["error"]
    assert "重试" in finished["nodes"]["a"]["error"]
    assert finished["nodes"]["b"]["status"] == "skipped"
    assert sum(1 for call in transport.calls if str(call["url"]).endswith("/video-synthesis")) == 1
    assert not any(str(call["url"]).endswith("/chat/completions") for call in transport.calls)


def test_video_cancel_stops_polling_and_blocks_a_second_run(tmp_path: Path) -> None:
    class Blocking:
        def __init__(self) -> None:
            self.started = threading.Event()
            self.calls: list[str] = []

        def request(self, method: str, url: str, *, headers=None, json_body=None, body=None, timeout: float = 120, cancel=None, max_bytes: int = 1):
            del method, headers, json_body, body, timeout, max_bytes
            self.calls.append(url)
            if url.endswith("/video-synthesis"):
                return json_result(200, {"output": {"task_id": "task-1", "task_status": "PENDING"}})
            if "/tasks/" in url:
                self.started.set()
                if cancel is None or not cancel.wait(5):
                    raise AssertionError("cancel was not signaled")
                raise RunCancelled()
            raise AssertionError(url)

    transport = Blocking()
    client = _client(tmp_path, transport)
    client.put(
        "/settings",
        json={
            "openaiBaseUrl": "https://example.test/v1",
            "openaiApiKey": "sk-test",
            "wanBaseUrl": WAN,
            "wanApiKey": WAN_KEY,
        },
    )
    video = _with_text_output(video_node("a", prompt="wait", vendor="wan"))
    body = graph(
        [video, chat_node("b", prompt="should-not-run")],
        [edge("e1", "a", "b")],
        version=VERSION,
    )
    created = client.post("/runs", json={"graph": body})
    assert created.status_code == 202
    run_id = created.json()["id"]
    assert transport.started.wait(2)
    blocked = client.post("/runs", json={"graph": body})
    assert blocked.status_code == 409
    assert blocked.json()["runId"] == run_id
    assert client.post(f"/runs/{run_id}/cancel").status_code == 200
    finished = wait_run(client, run_id)
    assert finished["status"] == "cancelled"
    assert finished["nodes"]["a"]["status"] == "cancelled"
    assert finished["nodes"]["b"]["status"] == "cancelled"
    assert finished["nodes"]["b"]["outputs"] == {}
    assert sum(1 for url in transport.calls if url.endswith("/video-synthesis")) == 1
    assert not any(url.endswith("/chat/completions") for url in transport.calls)


def test_missing_video_credentials_reject_the_run(tmp_path: Path) -> None:
    transport = FakeTransport(lambda _call, _cancel: json_result(500, {}))
    client = _client(tmp_path, transport)
    wan = graph([video_node("a", prompt="hi", vendor="wan")], [], version=VERSION)
    missing = client.post("/runs", json={"graph": wan})
    assert missing.status_code == 422
    assert missing.json()["error"] == "missing_credentials"
    assert "WAN_API_KEY" in missing.json()["message"]

    client.put("/settings", json={"wanApiKey": WAN_KEY})
    kling = graph([video_node("a", prompt="hi", vendor="kling")], [], version=VERSION)
    refused = client.post("/runs", json={"graph": kling})
    assert refused.status_code == 422
    assert "Kling" in refused.json()["message"]

    invalid = graph([video_node("a", prompt="hi", vendor="other")], [], version=VERSION)
    rejected = client.post("/runs", json={"graph": invalid})
    assert rejected.status_code == 422
    assert rejected.json()["error"] == "invalid_graph"
    assert transport.calls == []

    client.put("/settings", json={"wanApiKey": WAN_KEY, "wanBaseUrl": WAN})
    empty = graph([video_node("a", vendor="wan")], [], version=VERSION)
    finished = wait_run(client, client.post("/runs", json={"graph": empty}).json()["id"])
    assert finished["nodes"]["a"]["status"] == "failed"
    assert transport.calls == []
