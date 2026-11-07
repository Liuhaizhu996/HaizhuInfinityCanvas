"""Mocked Edge speech HTTP and CosyVoice. No live calls and no edge-tts package."""

from __future__ import annotations

import base64
import json
import threading
from pathlib import Path
from urllib.parse import parse_qs

from fastapi.testclient import TestClient

from app.adapters.transport import HttpResult, RunCancelled, TransportError
from app.assets import pcm16_to_wav
from app.main import create_app
from app.version import read_version
from tests.support import (
    MP3_BYTES,
    PCM_BYTES,
    FakeTransport,
    chat_node,
    cosy_node,
    edge,
    edge_tts_node,
    graph,
    json_result,
    wait_run,
)

VERSION = read_version()
TOKEN_URL = "https://edge.microsoft.com/translate/auth"
SPEECH_URL = "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1"
COSY = "http://voice.example.test:50000"
COSY_KEY = "cv-test-secret"


def _client(tmp_path: Path, transport: object) -> TestClient:
    application = create_app(env_file=tmp_path / ".env", asset_root=tmp_path / "assets", transport=transport)  # type: ignore[arg-type]
    return TestClient(application)


def _jwt(region: str = "eastus") -> bytes:
    header = base64.urlsafe_b64encode(b'{"alg":"none"}').decode("ascii").rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"region": region}).encode("utf-8")).decode("ascii").rstrip("=")
    return f"{header}.{payload}.sig".encode("ascii")


def _with_text_output(node: dict[str, object]) -> dict[str, object]:
    ports = list(node["ports"])  # type: ignore[arg-type]
    ports.append({"id": "text_out", "name": "text", "direction": "output", "dataType": "text"})
    node["ports"] = ports
    return node


def test_edge_speaks_upstream_text_and_serves_mp3(tmp_path: Path) -> None:
    token = _jwt()

    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url.endswith("/chat/completions"):
            return json_result(200, {"choices": [{"message": {"content": "Fish & chips"}}]})
        if url == TOKEN_URL:
            assert call["method"] == "GET"
            assert "Authorization" not in call["headers"]
            return HttpResult(200, {"content-type": "text/plain"}, token)
        if url == SPEECH_URL:
            assert call["method"] == "POST"
            assert call["headers"]["Authorization"] == f"Bearer {token.decode('ascii')}"
            assert call["headers"]["X-Microsoft-OutputFormat"] == "audio-24khz-48kbitrate-mono-mp3"
            body = bytes(call["body"]).decode("utf-8")  # type: ignore[arg-type]
            assert "xml:lang='zh-CN'" in body
            assert "name='zh-CN-YunxiNeural'" in body
            assert "rate='+10%'" in body
            assert "pitch='-5Hz'" in body
            assert "Fish &amp; chips" in body
            assert "Fish & chips" not in body
            assert "local prompt" not in body
            return HttpResult(200, {"content-type": "audio/mpeg"}, MP3_BYTES)
        raise AssertionError(url)

    transport = FakeTransport(handler)
    client = _client(tmp_path, transport)
    client.put("/settings", json={"openaiBaseUrl": "https://example.test/v1", "openaiApiKey": "sk-test"})
    body = graph(
        [
            chat_node("llm", prompt="ignored by speech"),
            edge_tts_node(
                "voice",
                prompt="local prompt",
                locale="zh-CN",
                voice="zh-CN-YunxiNeural",
                rate=10,
                pitch=-5,
            ),
        ],
        [edge("e1", "llm", "voice", source_port="text", target_port="text")],
        version=VERSION,
    )
    created = client.post("/runs", json={"graph": body})
    assert created.status_code == 202
    finished = wait_run(client, created.json()["id"])
    assert finished["status"] == "succeeded"
    audio = finished["nodes"]["voice"]["outputs"]["audio"]
    assert audio["mediaType"] == "audio/mpeg"
    assert audio["relativePath"].startswith("audio/")
    assert audio["relativePath"].endswith(".mp3")
    assert audio["url"] == f"/assets/{audio['relativePath']}"
    asset = client.get(audio["url"])
    assert asset.status_code == 200
    assert asset.content == MP3_BYTES
    assert asset.headers["content-type"].startswith("audio/mpeg")
    dumped = json.dumps(finished)
    assert token.decode("ascii") not in dumped
    assert "sk-test" not in dumped
    assert sum(1 for call in transport.calls if call["url"] == SPEECH_URL) == 1
    assert sum(1 for call in transport.calls if call["url"] == TOKEN_URL) == 1


def test_edge_cancel_stops_the_request_and_blocks_downstream(tmp_path: Path) -> None:
    class Blocking:
        def __init__(self) -> None:
            self.started = threading.Event()
            self.calls: list[str] = []

        def request(self, method, url, *, headers=None, json_body=None, body=None, timeout=120, cancel=None, max_bytes=1):
            del method, headers, json_body, body, timeout, max_bytes
            self.calls.append(url)
            if url == TOKEN_URL:
                return HttpResult(200, {"content-type": "text/plain"}, _jwt())
            if url == SPEECH_URL:
                self.started.set()
                if cancel is None or not cancel.wait(5):
                    raise AssertionError("cancel was not signaled")
                raise RunCancelled()
            raise AssertionError(url)

    transport = Blocking()
    client = _client(tmp_path, transport)
    client.put("/settings", json={"openaiBaseUrl": "https://example.test/v1", "openaiApiKey": "sk-test"})
    spoken = _with_text_output(edge_tts_node("a", prompt="wait", voice="zh-CN-XiaoxiaoNeural"))
    body = graph(
        [spoken, chat_node("b", prompt="should-not-run")],
        [edge("e1", "a", "b", source_port="text_out", target_port="prompt")],
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
    assert finished["nodes"]["a"]["status"] == "cancelled"
    assert finished["nodes"]["b"]["status"] == "cancelled"
    assert finished["nodes"]["b"]["outputs"] == {}
    assert transport.calls.count(SPEECH_URL) == 1
    assert not any(url.endswith("/chat/completions") for url in transport.calls)


def test_edge_timeout_does_not_retry_or_start_downstream(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        url = str(call["url"])
        if url == TOKEN_URL:
            return HttpResult(200, {"content-type": "text/plain"}, _jwt())
        if url == SPEECH_URL:
            raise TransportError("Request timed out.")
        if url.endswith("/chat/completions"):
            raise AssertionError("downstream chat was called")
        raise AssertionError(url)

    transport = FakeTransport(handler)
    client = _client(tmp_path, transport)
    client.put("/settings", json={"openaiBaseUrl": "https://example.test/v1", "openaiApiKey": "sk-test"})
    spoken = _with_text_output(edge_tts_node("a", prompt="slow", timeoutSec=1))
    body = graph(
        [spoken, chat_node("b", prompt="should-not-run")],
        [edge("e1", "a", "b", source_port="text_out", target_port="prompt")],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"], timeout=5)
    assert finished["status"] == "failed"
    assert "超时" in finished["nodes"]["a"]["error"]
    assert "重试" in finished["nodes"]["a"]["error"]
    assert finished["nodes"]["b"]["status"] == "skipped"
    assert sum(1 for call in transport.calls if call["url"] == SPEECH_URL) == 1
    assert sum(1 for call in transport.calls if call["url"] == TOKEN_URL) == 1
    assert not any(str(call["url"]).endswith("/chat/completions") for call in transport.calls)


def test_edge_empty_or_invalid_voice_does_not_call(tmp_path: Path) -> None:
    transport = FakeTransport(lambda _call, _cancel: HttpResult(500, {}, b""))
    client = _client(tmp_path, transport)
    empty = graph([edge_tts_node("a")], [], version=VERSION)
    finished = wait_run(client, client.post("/runs", json={"graph": empty}).json()["id"])
    assert finished["nodes"]["a"]["status"] == "failed"
    invalid = graph([edge_tts_node("a", prompt="hi", voice="not a voice")], [], version=VERSION)
    refused = wait_run(client, client.post("/runs", json={"graph": invalid}).json()["id"])
    assert refused["nodes"]["a"]["status"] == "failed"
    assert "音色" in refused["nodes"]["a"]["error"]
    assert transport.calls == []


def test_cosyvoice_wraps_pcm_and_hides_the_key(tmp_path: Path) -> None:
    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        assert call["method"] == "POST"
        assert call["url"] == f"{COSY}/inference_sft"
        assert call["headers"]["Authorization"] == f"Bearer {COSY_KEY}"
        form = parse_qs(bytes(call["body"]).decode("utf-8"), keep_blank_values=True)  # type: ignore[arg-type]
        assert form["tts_text"] == ["你好 & 世界"]
        assert form["spk_id"] == ["中文女"]
        assert form["speed"] == ["1.25"]
        return HttpResult(200, {"content-type": "application/octet-stream"}, PCM_BYTES)

    client = _client(tmp_path, FakeTransport(handler))
    client.put(
        "/settings",
        json={"cosyvoiceBaseUrl": COSY, "cosyvoiceApiKey": COSY_KEY},
    )
    body = graph(
        [cosy_node("a", prompt="你好 & 世界", voice="中文女", speed=1.25, sampleRate=24000)],
        [],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"])
    assert finished["status"] == "succeeded"
    audio = finished["nodes"]["a"]["outputs"]["audio"]
    assert audio["mediaType"] == "audio/wav"
    assert audio["relativePath"].startswith("audio/")
    assert audio["relativePath"].endswith(".wav")
    asset = client.get(audio["url"])
    assert asset.status_code == 200
    assert asset.content.startswith(b"RIFF")
    assert asset.content[8:12] == b"WAVE"
    assert asset.content[24:28] == (24000).to_bytes(4, "little")
    assert asset.content.endswith(PCM_BYTES)
    assert asset.headers["content-type"].startswith("audio/wav")
    assert COSY_KEY not in json.dumps(finished)
    assert COSY_KEY not in asset.content.decode("latin1")


def test_cosyvoice_keeps_wav_and_prefers_the_node_url(tmp_path: Path) -> None:
    wav = pcm16_to_wav(PCM_BYTES, 16000)
    node_url = "http://127.0.0.1:9880"

    def handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        assert call["url"] == f"{node_url}/inference_sft"
        assert "Authorization" not in call["headers"]
        return HttpResult(200, {"content-type": "audio/wav"}, wav)

    client = _client(tmp_path, FakeTransport(handler))
    client.put("/settings", json={"cosyvoiceBaseUrl": COSY})
    body = graph(
        [cosy_node("a", prompt="hello", baseUrl=node_url, sampleRate=22050)],
        [],
        version=VERSION,
    )
    finished = wait_run(client, client.post("/runs", json={"graph": body}).json()["id"])
    audio = finished["nodes"]["a"]["outputs"]["audio"]
    asset = client.get(audio["url"])
    assert asset.content == wav
    assert asset.content[24:28] == (16000).to_bytes(4, "little")


def test_cosyvoice_cancel_and_timeout_do_not_start_downstream(tmp_path: Path) -> None:
    class Blocking:
        def __init__(self) -> None:
            self.started = threading.Event()
            self.calls: list[str] = []

        def request(self, method, url, *, headers=None, json_body=None, body=None, timeout=120, cancel=None, max_bytes=1):
            del method, headers, json_body, body, timeout, max_bytes
            self.calls.append(url)
            self.started.set()
            if cancel is None or not cancel.wait(5):
                raise AssertionError("cancel was not signaled")
            raise RunCancelled()

    blocking = Blocking()
    client = _client(tmp_path, blocking)
    client.put(
        "/settings",
        json={
            "openaiBaseUrl": "https://example.test/v1",
            "openaiApiKey": "sk-test",
            "cosyvoiceBaseUrl": COSY,
        },
    )
    spoken = _with_text_output(cosy_node("a", prompt="wait"))
    body = graph(
        [spoken, chat_node("b", prompt="should-not-run")],
        [edge("e1", "a", "b", source_port="text_out", target_port="prompt")],
        version=VERSION,
    )
    created = client.post("/runs", json={"graph": body})
    run_id = created.json()["id"]
    assert blocking.started.wait(2)
    assert client.post("/runs", json={"graph": body}).status_code == 409
    assert client.post(f"/runs/{run_id}/cancel").status_code == 200
    finished = wait_run(client, run_id)
    assert finished["status"] == "cancelled"
    assert finished["nodes"]["a"]["status"] == "cancelled"
    assert finished["nodes"]["b"]["status"] == "cancelled"
    assert blocking.calls == [f"{COSY}/inference_sft"]

    def timeout_handler(call: dict[str, object], _cancel: threading.Event | None) -> HttpResult:
        if str(call["url"]).endswith("/inference_sft"):
            raise TransportError("Request timed out.")
        raise AssertionError(call["url"])

    transport = FakeTransport(timeout_handler)
    client = _client(tmp_path, transport)
    client.put(
        "/settings",
        json={
            "openaiBaseUrl": "https://example.test/v1",
            "openaiApiKey": "sk-test",
            "cosyvoiceBaseUrl": COSY,
        },
    )
    slow = _with_text_output(cosy_node("a", prompt="slow", timeoutSec=1))
    slow_graph = graph(
        [slow, chat_node("b", prompt="should-not-run")],
        [edge("e1", "a", "b", source_port="text_out", target_port="prompt")],
        version=VERSION,
    )
    timed = wait_run(client, client.post("/runs", json={"graph": slow_graph}).json()["id"], timeout=5)
    assert timed["nodes"]["a"]["status"] == "failed"
    assert "超时" in timed["nodes"]["a"]["error"]
    assert "重试" in timed["nodes"]["a"]["error"]
    assert timed["nodes"]["b"]["status"] == "skipped"
    assert len(transport.calls) == 1


def test_cosyvoice_bad_speed_or_url_does_not_call(tmp_path: Path) -> None:
    transport = FakeTransport(lambda _call, _cancel: HttpResult(500, {}, b""))
    client = _client(tmp_path, transport)
    fast = graph([cosy_node("a", prompt="hi", speed=3)], [], version=VERSION)
    refused = wait_run(client, client.post("/runs", json={"graph": fast}).json()["id"])
    assert refused["nodes"]["a"]["status"] == "failed"
    bad_url = graph([cosy_node("a", prompt="hi", baseUrl="javascript:alert(1)")], [], version=VERSION)
    rejected = wait_run(client, client.post("/runs", json={"graph": bad_url}).json()["id"])
    assert rejected["nodes"]["a"]["status"] == "failed"
    assert transport.calls == []
