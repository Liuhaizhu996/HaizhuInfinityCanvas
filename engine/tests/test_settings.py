"""Settings stay on the sidecar. Responses never echo the API key."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.support import FakeTransport, json_result


def _client(tmp_path: Path) -> TestClient:
    application = create_app(
        env_file=tmp_path / ".env",
        asset_root=tmp_path / "assets",
        transport=FakeTransport(lambda _call, _cancel: json_result(500, {})),
    )
    return TestClient(application)


def test_settings_file_and_adapter_status(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        'COMFYUI_BASE_URL="http://127.0.0.1:8188"\nCOSYVOICE_BASE_URL="http://127.0.0.1:9880"\n',
        encoding="utf-8",
    )
    client = _client(tmp_path)
    before = client.get("/settings")
    assert before.status_code == 200
    assert before.json() == {
        "openaiBaseUrl": "https://api.openai.com/v1",
        "openaiApiKeySet": False,
        "comfyuiBaseUrl": "http://127.0.0.1:8188",
        "comfyuiApiKeySet": False,
        "wanBaseUrl": "https://dashscope.aliyuncs.com/api/v1",
        "wanApiKeySet": False,
        "klingBaseUrl": "https://api.klingai.com",
        "klingAccessKeySet": False,
        "klingSecretKeySet": False,
        "klingApiKeySet": False,
        "envFile": "engine/.env",
    }
    assert "sk-test" not in before.text
    needs_key = client.get("/adapters").json()["adapters"]
    chat = next(item for item in needs_key if item["type"] == "openai.chat")
    image = next(item for item in needs_key if item["type"] == "openai.image")
    comfy = next(item for item in needs_key if item["type"] == "comfyui.image")
    video = next(item for item in needs_key if item["type"] == "video.wan-kling")
    edge = next(item for item in needs_key if item["type"] == "tts.edge")
    assert chat["status"] == "needs_key"
    assert image["implemented"] is True
    assert comfy["implemented"] is True
    assert comfy["status"] == "ready"
    assert video["implemented"] is True
    assert video["status"] == "needs_key"
    assert edge["implemented"] is False

    saved = client.put(
        "/settings",
        json={"openaiBaseUrl": "https://example.test/v1/", "openaiApiKey": "sk-test"},
    )
    assert saved.status_code == 200
    assert saved.json()["openaiBaseUrl"] == "https://example.test/v1"
    assert saved.json()["openaiApiKeySet"] is True
    assert saved.json()["wanApiKeySet"] is False
    assert "sk-test" not in saved.text

    text = env_file.read_text(encoding="utf-8")
    assert "sk-test" in text
    assert "COMFYUI_BASE_URL" in text
    assert "http://127.0.0.1:8188" in text
    assert "COSYVOICE_BASE_URL" in text
    assert (env_file.stat().st_mode & 0o777) == 0o600

    kept = client.put(
        "/settings",
        json={"openaiBaseUrl": "https://example.test/v1", "openaiApiKey": ""},
    )
    assert kept.json()["openaiApiKeySet"] is True

    rejected = client.put(
        "/settings",
        json={"openaiBaseUrl": "http://user:pass@example.test/v1"},
    )
    assert rejected.status_code == 422
    assert rejected.json()["error"] == "invalid_settings"
    assert "pass" not in rejected.text

    ready = client.get("/adapters").json()["adapters"]
    assert next(item for item in ready if item["type"] == "openai.chat")["status"] == "ready"
    assert next(item for item in ready if item["type"] == "comfyui.image")["status"] == "ready"
    assert next(item for item in ready if item["type"] == "video.wan-kling")["status"] == "needs_key"

    video_saved = client.put(
        "/settings",
        json={"wanBaseUrl": "https://wan.example.test/api/v1", "wanApiKey": "wk-test"},
    )
    assert video_saved.status_code == 200
    assert video_saved.json()["wanBaseUrl"] == "https://wan.example.test/api/v1"
    assert video_saved.json()["wanApiKeySet"] is True
    assert video_saved.json()["openaiApiKeySet"] is True
    assert "wk-test" not in video_saved.text
    assert "sk-test" not in video_saved.text
    stored = env_file.read_text(encoding="utf-8")
    assert "wk-test" in stored
    assert "COSYVOICE_BASE_URL" in stored
    warmed = client.get("/adapters").json()["adapters"]
    assert next(item for item in warmed if item["type"] == "video.wan-kling")["status"] == "ready"

    blank_keeps_wan = client.put("/settings", json={"wanApiKey": ""})
    assert blank_keeps_wan.json()["wanApiKeySet"] is True
