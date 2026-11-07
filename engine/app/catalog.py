"""Adapter status reported by the sidecar. Execution lives next to this list."""

from __future__ import annotations

from app.config import Settings

OPENAI_NODE_TYPES = frozenset({"openai.chat", "openai.image"})
EXECUTABLE_NODE_TYPES = frozenset(
    {
        "openai.chat",
        "openai.image",
        "comfyui.image",
        "video.wan-kling",
    }
)

# auth: openai needs OPENAI_API_KEY, video needs Wan or Kling, none is ready when implemented.
_SPECS: tuple[tuple[str, str, bool, str], ...] = (
    ("openai.chat", "text→text", True, "openai"),
    ("openai.image", "text→image", True, "openai"),
    ("comfyui.image", "text→image", True, "none"),
    ("video.wan-kling", "text+image→video", True, "video"),
    ("tts.edge", "text→audio", False, "none"),
    ("tts.cosyvoice", "text→audio", False, "none"),
    ("storyboard.board", "text→storyboard", False, "none"),
)


def adapter_catalog(settings: Settings) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for node_type, contract, implemented, auth in _SPECS:
        rows.append(
            {
                "type": node_type,
                "contract": contract,
                "implemented": implemented,
                "status": _status(implemented, auth, settings),
            }
        )
    return rows


def _status(implemented: bool, auth: str, settings: Settings) -> str:
    if not implemented:
        return "stub"
    if auth == "openai":
        return "ready" if settings.openai_api_key else "needs_key"
    if auth == "video":
        if settings.wan_api_key or settings.kling_configured():
            return "ready"
        return "needs_key"
    return "ready"
