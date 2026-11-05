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
    image = outputs.get("image")
    if isinstance(image, dict) and isinstance(image.get("relativePath"), str):
        relative = image["relativePath"]
        media = image.get("mediaType")
        url = image.get("url")
        body["image"] = {
            "relativePath": relative,
            "mediaType": media if isinstance(media, str) else "application/octet-stream",
            "url": url if isinstance(url, str) else f"/assets/{relative}",
        }
    return body
