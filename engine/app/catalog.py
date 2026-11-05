"""Adapter status reported by the sidecar. Execution lives next to this list."""

from __future__ import annotations

OPENAI_NODE_TYPES = frozenset({"openai.chat", "openai.image"})

_SPECS: tuple[tuple[str, str, bool], ...] = (
    ("openai.chat", "text→text", True),
    ("openai.image", "text→image", True),
    ("comfyui.image", "text→image", False),
    ("video.wan-kling", "text+image→video", False),
    ("tts.edge", "text→audio", False),
    ("tts.cosyvoice", "text→audio", False),
    ("storyboard.board", "text→storyboard", False),
)


def adapter_catalog(api_key_set: bool) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for node_type, contract, implemented in _SPECS:
        if not implemented:
            status = "stub"
        elif api_key_set:
            status = "ready"
        else:
            status = "needs_key"
        rows.append(
            {
                "type": node_type,
                "contract": contract,
                "implemented": implemented,
                "status": status,
            }
        )
    return rows
