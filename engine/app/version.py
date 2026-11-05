"""Repository version shared by the health check and graph documents."""

from pathlib import Path

VERSION_PATH = Path(__file__).resolve().parents[2] / "VERSION"


def read_version() -> str:
    if not VERSION_PATH.is_file():
        raise FileNotFoundError(f"VERSION file not found at {VERSION_PATH}")
    return VERSION_PATH.read_text(encoding="utf-8").strip()
