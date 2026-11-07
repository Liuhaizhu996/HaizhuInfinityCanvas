"""Cycle rejection, cancel, and mocked OpenAI chat → image."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.transport import HttpResult, RunCancelled, UrllibTransport, abort
from app.main import create_app
from app.version import GRAPH_DOCUMENT_VERSION, read_version
from tests.support import (
    PNG_BYTES,
    STORYBOARD_PORTS,
    FakeTransport,
    chat_node,
    edge,
    graph,
    image_node,
    json_result,
    node,
    wait_run,
)

VERSION = read_version()


def _client(tmp_path: Path, transport: FakeTransport | None = None) -> tuple[TestClient, FakeTransport]:
    fake = transport or FakeTransport(lambda _call, _cancel: json_result(500, {"error": {"message": "unset"}}))
    application = create_app(
        env_file=tmp_path / ".env",
        asset_root=tmp_path / "assets",
        transport=fake,
    )
    return TestClient(application), fake


def _save_key(client: TestClient, key: str = "sk-test") -> None:
    response = client.put(
        "/settings",
        json={"openaiBaseUrl": "https://example.test/v1", "openaiApiKey": key},
    )
    assert response.status_code == 200
    assert response.json()["openaiApiKeySet"] is True
    assert key not in response.text


def test_health_on_isolated_app(tmp_path: Path) -> None:
    client, _transport = _client(tmp_path)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "version": VERSION}


def test_cycle_is_rejected_before_a_run_starts(tmp_path: Path) -> None:
    client, transport = _client(tmp_path)
    _save_key(client)
    body = graph(
        [chat_node("a", prompt="one"), chat_node("b", prompt="two")],
        [edge("e1", "a", "b"), edge("e2", "b", "a")],
        version=GRAPH_DOCUMENT_VERSION,
    )
    response = client.post("/runs", json={"graph": body})
    assert response.status_code == 422
    payload = response.json()
    assert payload["error"] == "cycle"
    assert sorted(payload["nodeIds"]) == ["a", "b"]
    assert transport.calls == []


def test_cycle_outside_the_selection_does_not_block_a_dag(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        assert str(call["url"]).endswith("/chat/completions")
        return json_result(200, {"choices": [{"message": {"content": "solo"}}]})

    client, transport = _client(tmp_path, FakeTransport(handler))
    _save_key(client)
    body = graph(
        [chat_node("a", prompt="loop"), chat_node("b", prompt="loop"), chat_node("c", prompt="alone")],
        [edge("e1", "a", "b"), edge("e2", "b", "a")],
        version=GRAPH_DOCUMENT_VERSION,
    )
    refused = client.post("/runs", json={"graph": body})
    assert refused.status_code == 422
    assert refused.json()["error"] == "cycle"

    accepted = client.post("/runs", json={"graph": body, "nodeIds": ["c"]})
    assert accepted.status_code == 202
    finished = wait_run(client, accepted.json()["id"])
    assert finished["status"] == "succeeded"
    assert finished["nodeIds"] == ["c"]
    assert finished["nodes"]["c"]["outputs"]["text"] == "solo"
    assert len(transport.calls) == 1


def test_chat_then_image_happy_path(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/chat/completions"):
            return json_result(200, {"choices": [{"message": {"content": "a red lantern"}}]})
        if url.endswith("/images/generations"):
            encoded = __import__("base64").b64encode(PNG_BYTES).decode("ascii")
            return json_result(200, {"data": [{"b64_json": encoded}]})
        raise AssertionError(url)

    client, transport = _client(tmp_path, FakeTransport(handler))
    _save_key(client)
    body = graph(
        [
            chat_node("llm", prompt="draw a lantern", model="gpt-4o-mini", temperature=0.4, seed=7),
            image_node("img", model="dall-e-3", size="1024x1024"),
        ],
        [edge("e1", "llm", "img")],
        version=GRAPH_DOCUMENT_VERSION,
    )
    created = client.post("/runs", json={"graph": body})
    assert created.status_code == 202
    finished = wait_run(client, created.json()["id"])
    assert finished["status"] == "succeeded"
    assert finished["nodes"]["llm"]["status"] == "succeeded"
    assert finished["nodes"]["llm"]["outputs"]["text"] == "a red lantern"
    image = finished["nodes"]["img"]["outputs"]["image"]
    assert image["mediaType"] == "image/png"
    assert image["relativePath"].startswith("images/")
    assert image["relativePath"].endswith(".png")
    assert "sk-test" not in json.dumps(finished)

    chat_payload = transport.calls[0]["json"]
    assert transport.calls[0]["headers"]["Authorization"] == "Bearer sk-test"
    assert transport.calls[0]["url"] == "https://example.test/v1/chat/completions"
    assert chat_payload["temperature"] == 0.4
    assert chat_payload["seed"] == 7
    assert chat_payload["messages"][-1]["content"] == "draw a lantern"

    image_payload = transport.calls[1]["json"]
    assert image_payload["prompt"] == "a red lantern"
    assert image_payload["model"] == "dall-e-3"
    assert image_payload["size"] == "1024x1024"
    assert image_payload["response_format"] == "b64_json"
    assert "seed" not in image_payload

    asset = client.get(image["url"])
    assert asset.status_code == 200
    assert asset.content == PNG_BYTES
    assert asset.headers["content-type"].startswith("image/png")


def test_image_url_is_downloaded_without_the_api_key(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/images/generations"):
            return json_result(200, {"data": [{"url": "https://cdn.example.test/a.png"}]})
        if url == "https://cdn.example.test/a.png":
            assert "Authorization" not in call["headers"]
            return HttpResult(200, {"content-type": "image/png"}, PNG_BYTES)
        raise AssertionError(url)

    client, _transport = _client(tmp_path, FakeTransport(handler))
    _save_key(client)
    body = graph([image_node("img", prompt="a circle", model="gpt-image-1")], [], version=GRAPH_DOCUMENT_VERSION)
    created = client.post("/runs", json={"graph": body})
    finished = wait_run(client, created.json()["id"])
    assert finished["status"] == "succeeded"
    assert finished["nodes"]["img"]["outputs"]["image"]["mediaType"] == "image/png"


def test_provider_error_hides_the_api_key(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        key = str(call["headers"]["Authorization"]).split()[-1]
        return json_result(401, {"error": {"message": f"rejected {key}"}})

    client, _transport = _client(tmp_path, FakeTransport(handler))
    _save_key(client, "sk-test")
    body = graph([chat_node("llm", prompt="hello")], [], version=GRAPH_DOCUMENT_VERSION)
    created = client.post("/runs", json={"graph": body})
    finished = wait_run(client, created.json()["id"])
    assert finished["status"] == "failed"
    assert "sk-test" not in json.dumps(finished)
    assert "***" in finished["nodes"]["llm"]["error"]


def test_cancel_stops_the_in_flight_node_and_skips_the_rest(tmp_path: Path) -> None:
    class BlockingTransport:
        def __init__(self) -> None:
            self.started = threading.Event()
            self.calls: list[str] = []

        def request(self, method: str, url: str, *, headers=None, json_body=None, timeout: float = 120, cancel=None):
            del method, headers, json_body, timeout
            self.calls.append(url)
            self.started.set()
            if cancel is None or not cancel.wait(5):
                raise AssertionError("cancel was not signaled")
            raise RunCancelled()

    transport = BlockingTransport()
    application = create_app(env_file=tmp_path / ".env", asset_root=tmp_path / "assets", transport=transport)
    client = TestClient(application)
    _save_key(client)
    body = graph(
        [chat_node("llm", prompt="wait"), image_node("img")],
        [edge("e1", "llm", "img")],
        version=GRAPH_DOCUMENT_VERSION,
    )
    created = client.post("/runs", json={"graph": body})
    assert created.status_code == 202
    run_id = created.json()["id"]
    assert transport.started.wait(2)
    blocked = client.post("/runs", json={"graph": body})
    assert blocked.status_code == 409
    assert blocked.json()["error"] == "run_in_progress"
    cancelled = client.post(f"/runs/{run_id}/cancel")
    assert cancelled.status_code == 200
    finished = wait_run(client, run_id)
    assert finished["status"] == "cancelled"
    assert finished["nodes"]["llm"]["status"] == "cancelled"
    assert finished["nodes"]["img"]["status"] == "cancelled"
    assert finished["nodes"]["img"]["outputs"] == {}
    assert all("/images/" not in url for url in transport.calls)


def test_missing_key_and_stub_adapter(tmp_path: Path) -> None:
    client, transport = _client(tmp_path)
    body = graph([chat_node("llm", prompt="hello")], [], version=GRAPH_DOCUMENT_VERSION)
    missing = client.post("/runs", json={"graph": body})
    assert missing.status_code == 422
    assert missing.json()["error"] == "missing_credentials"
    assert transport.calls == []

    _save_key(client)
    stub = graph(
        [
            chat_node("llm", prompt="hello"),
            node("board", "storyboard.board", STORYBOARD_PORTS),
        ],
        [edge("e1", "llm", "board")],
        version=GRAPH_DOCUMENT_VERSION,
    )

    def handler(_call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        return json_result(200, {"choices": [{"message": {"content": "scene"}}]})

    client, _transport = _client(tmp_path, FakeTransport(handler))
    _save_key(client)
    created = client.post("/runs", json={"graph": stub})
    finished = wait_run(client, created.json()["id"])
    assert finished["nodes"]["llm"]["status"] == "succeeded"
    assert finished["nodes"]["board"]["status"] == "failed"
    assert "storyboard.board" in finished["nodes"]["board"]["error"]
    assert finished["status"] == "failed"


def test_empty_prompt_does_not_call_the_provider(tmp_path: Path) -> None:
    client, transport = _client(tmp_path)
    _save_key(client)
    body = graph([chat_node("llm")], [], version=GRAPH_DOCUMENT_VERSION)
    created = client.post("/runs", json={"graph": body})
    finished = wait_run(client, created.json()["id"])
    assert finished["status"] == "failed"
    assert finished["nodes"]["llm"]["status"] == "failed"
    assert transport.calls == []


def test_asset_path_traversal_is_not_served(tmp_path: Path) -> None:
    client, _transport = _client(tmp_path)
    secret = tmp_path / "assets" / "secret.txt"
    secret.parent.mkdir(parents=True)
    secret.write_text("nope", encoding="utf-8")
    assert client.get("/assets/secret.txt").status_code == 404
    assert client.get("/assets/../secret.txt").status_code == 404
    assert client.get("/assets/images/%2e%2e/secret.txt").status_code == 404


def test_urllib_abort_unblocks_a_hung_request() -> None:
    started = threading.Event()
    stop = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length", "0"))
            if length:
                self.rfile.read(length)
            started.set()
            while not stop.is_set():
                time_sleep()
            try:
                self.send_response(200)
                self.end_headers()
            except OSError:
                return

        def log_message(self, fmt: str, *args: object) -> None:
            del fmt, args

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    cancel = threading.Event()
    outcome: dict[str, str] = {}

    def call() -> None:
        try:
            UrllibTransport().request(
                "POST",
                f"http://127.0.0.1:{port}/v1/chat/completions",
                json_body={"messages": []},
                timeout=5,
                cancel=cancel,
            )
            outcome["error"] = "completed"
        except RunCancelled:
            outcome["error"] = "cancelled"
        except Exception as exc:
            outcome["error"] = exc.__class__.__name__

    worker = threading.Thread(target=call)
    worker.start()
    assert started.wait(2)
    abort(cancel)
    worker.join(3)
    stop.set()
    server.shutdown()
    server.server_close()
    assert outcome["error"] == "cancelled"


def time_sleep() -> None:
    import time

    time.sleep(0.05)


def test_invalid_connection_is_rejected(tmp_path: Path) -> None:
    client, _transport = _client(tmp_path)
    _save_key(client)
    img = image_node("img")
    img["ports"] = [
        {"id": "prompt", "name": "prompt", "direction": "input", "dataType": "image"},
        {"id": "image", "name": "image", "direction": "output", "dataType": "image"},
    ]
    body = graph([chat_node("llm", prompt="x"), img], [edge("e1", "llm", "img")], version=GRAPH_DOCUMENT_VERSION)
    response = client.post("/runs", json={"graph": body})
    assert response.status_code == 422
    assert response.json()["error"] == "invalid_graph"


def test_ancestors_are_included_when_a_downstream_node_is_selected(tmp_path: Path) -> None:
    seen: list[str] = []

    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        prompt = call["json"]["messages"][-1]["content"]  # type: ignore[index]
        seen.append(prompt)
        return json_result(200, {"choices": [{"message": {"content": prompt + "!"}}]})

    client, _transport = _client(tmp_path, FakeTransport(handler))
    _save_key(client)
    body = graph(
        [chat_node("a", prompt="one"), chat_node("b"), chat_node("c")],
        [edge("e1", "a", "b"), edge("e2", "b", "c")],
        version=GRAPH_DOCUMENT_VERSION,
    )
    created = client.post("/runs", json={"graph": body, "nodeIds": ["c"]})
    finished = wait_run(client, created.json()["id"])
    assert finished["status"] == "succeeded"
    assert finished["nodeIds"] == ["a", "b", "c"]
    assert seen == ["one", "one!", "one!!"]
    assert finished["nodes"]["c"]["outputs"]["text"] == "one!!!"


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"graph": {"id": "g", "name": "Demo", "version": GRAPH_DOCUMENT_VERSION, "nodes": [], "edges": []}}, "empty_graph"),
        (
            {
                "graph": graph([chat_node("a", prompt="x")], [], version=GRAPH_DOCUMENT_VERSION),
                "nodeIds": [],
            },
            "empty_selection",
        ),
    ],
)
def test_empty_runs_are_rejected(tmp_path: Path, payload: dict[str, object], code: str) -> None:
    client, _transport = _client(tmp_path)
    response = client.post("/runs", json=payload)
    assert response.status_code == 422
    assert response.json()["error"] == code
