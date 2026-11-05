"""HTTP-facing errors. Bodies never include provider keys."""


class ApiError(Exception):
    def __init__(self, status_code: int, error: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body: dict[str, object] = {"error": error, "message": message, **extra}


def sanitize(message: str, secret: str) -> str:
    cleaned = " ".join(message.split()).strip()
    if secret:
        cleaned = cleaned.replace(secret, "***")
    if len(cleaned) > 500:
        cleaned = f"{cleaned[:500]}…"
    return cleaned or "Node failed."
