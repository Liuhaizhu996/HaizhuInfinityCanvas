"""In-memory state for one user-triggered run."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any


@dataclass
class NodeRun:
    type: str
    status: str = "pending"
    error: str | None = None
    outputs: dict[str, Any] = field(default_factory=dict)


@dataclass
class RunRecord:
    id: str
    status: str
    node_ids: list[str]
    nodes: dict[str, NodeRun]
    cancel: threading.Event
    lock: threading.Lock = field(default_factory=threading.Lock)
    error: str | None = None

    def public(self) -> dict[str, object]:
        with self.lock:
            return {
                "id": self.id,
                "status": self.status,
                "error": self.error,
                "nodeIds": list(self.node_ids),
                "nodes": {
                    node_id: {
                        "type": node.type,
                        "status": node.status,
                        "error": node.error,
                        "outputs": _public_outputs(node.outputs),
                    }
                    for node_id, node in self.nodes.items()
                },
            }


def _public_outputs(outputs: dict[str, Any]) -> dict[str, object]:
    body: dict[str, object] = {}
    text = outputs.get("text")
    if isinstance(text, str):
        body["text"] = text
    _put_media(body, outputs, "image", "application/octet-stream")
    _put_media(body, outputs, "video", "video/mp4")
    _put_media(body, outputs, "audio", "audio/mpeg")
    return body


def _put_media(body: dict[str, object], outputs: dict[str, Any], key: str, default_type: str) -> None:
    value = outputs.get(key)
    if not isinstance(value, dict) or not isinstance(value.get("relativePath"), str):
        return
    relative = value["relativePath"]
    media = value.get("mediaType")
    url = value.get("url")
    body[key] = {
        "relativePath": relative,
        "mediaType": media if isinstance(media, str) else default_type,
        "url": url if isinstance(url, str) else f"/assets/{relative}",
    }
