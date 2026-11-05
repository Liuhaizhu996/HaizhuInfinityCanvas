"""openai.chat — text to text via OpenAI-compatible Chat Completions.

Blocking call. Streaming is left for later.
"""

from __future__ import annotations

import threading
from typing import Any

from app.adapters.openai_common import (
    CHAT_MODEL,
    AdapterError,
    model_name,
    optional_seed,
    optional_string,
    optional_temperature,
    post_json,
)
from app.adapters.transport import Transport
from app.config import Settings
from app.graph import Node


def run_chat(
    node: Node,
    prompt: str,
    settings: Settings,
    transport: Transport,
    cancel: threading.Event,
) -> dict[str, Any]:
    messages: list[dict[str, str]] = []
    system = optional_string(node.data, "system")
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload: dict[str, object] = {
        "model": model_name(node.data, CHAT_MODEL),
        "messages": messages,
    }
    temperature = optional_temperature(node.data)
    if temperature is not None:
        payload["temperature"] = temperature
    seed = optional_seed(node.data)
    if seed is not None:
        payload["seed"] = seed
    body = post_json(
        transport,
        settings,
        "/chat/completions",
        payload,
        timeout=120,
        cancel=cancel,
    )
    return {"text": _extract_text(body)}


def _extract_text(body: dict[str, Any]) -> str:
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise AdapterError("Chat response has no choices.")
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str) and content.strip():
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        text = "".join(parts).strip()
        if text:
            return text
    raise AdapterError("Chat response has no text content.")
