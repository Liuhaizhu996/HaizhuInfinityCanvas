"""HTTP-facing errors. Bodies never include provider keys."""

from __future__ import annotations

from collections.abc import Iterable


class ApiError(Exception):
    def __init__(self, status_code: int, error: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body: dict[str, object] = {"error": error, "message": message, **extra}


def sanitize(message: str, secret: str | Iterable[str] | None = "") -> str:
    cleaned = " ".join(message.split()).strip()
    for item in sorted(_secrets(secret), key=len, reverse=True):
        cleaned = cleaned.replace(item, "***")
    if len(cleaned) > 500:
        cleaned = f"{cleaned[:500]}…"
    return cleaned or "Node failed."


def _secrets(secret: str | Iterable[str] | None) -> list[str]:
    if secret is None or secret == "":
        return []
    if isinstance(secret, str):
        return [secret]
    return [item for item in secret if isinstance(item, str) and item]
