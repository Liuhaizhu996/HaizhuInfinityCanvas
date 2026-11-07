"""Product version for /health. Graph files use GRAPH_DOCUMENT_VERSION."""

from pathlib import Path

VERSION_PATH = Path(__file__).resolve().parents[2] / "VERSION"

# `.hzcanvas` formatVersion. Do not follow the product VERSION string.
GRAPH_DOCUMENT_VERSION = "1.0.0-beta.1"


def read_version() -> str:
    if not VERSION_PATH.is_file():
        raise FileNotFoundError(f"VERSION file not found at {VERSION_PATH}")
    return VERSION_PATH.read_text(encoding="utf-8").strip()
