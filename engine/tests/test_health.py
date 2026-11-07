from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

ROOT_VERSION = (Path(__file__).resolve().parents[2] / "VERSION").read_text(encoding="utf-8").strip()


def test_health_matches_version_file() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "version": ROOT_VERSION}
    assert ROOT_VERSION == "1.0.0-beta.2"
