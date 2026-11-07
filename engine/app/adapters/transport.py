"""Small HTTP client for sidecar provider calls.

Stdlib only, so the sidecar does not take another third-party license.
Cancel closes the in-flight connection. A raw body is used for multipart uploads.
"""

from __future__ import annotations

import http.client
import json
import socket
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlsplit

_MAX_BYTES = 25 * 1024 * 1024
_MAX_ALLOWED = 80 * 1024 * 1024
_LOCK = threading.Lock()
_OPEN: dict[int, list[http.client.HTTPConnection]] = {}


class RunCancelled(Exception):
    """The user cancelled the run while a request was in flight."""


class TransportError(Exception):
    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class HttpResult:
    status: int
    headers: dict[str, str]
    body: bytes

    def json_object(self) -> object:
        return json.loads(self.body.decode("utf-8"))


class Transport(Protocol):
    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        json_body: Mapping[str, object] | None = None,
        body: bytes | None = None,
        timeout: float = 120,
        cancel: threading.Event | None = None,
        max_bytes: int = _MAX_BYTES,
    ) -> HttpResult: ...


def abort(cancel: threading.Event) -> None:
    cancel.set()
    with _LOCK:
        connections = list(_OPEN.get(id(cancel), ()))
    for connection in connections:
        try:
            connection.close()
        except OSError:
            continue


class UrllibTransport:
    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        json_body: Mapping[str, object] | None = None,
        body: bytes | None = None,
        timeout: float = 120,
        cancel: threading.Event | None = None,
        max_bytes: int = _MAX_BYTES,
    ) -> HttpResult:
        if json_body is not None and body is not None:
            raise TransportError("Request cannot include both JSON and a raw body.")
        if max_bytes < 1 or max_bytes > _MAX_ALLOWED:
            raise TransportError("Response limit is invalid.")
        if cancel is not None and cancel.is_set():
            raise RunCancelled()
        # The socket read can ignore a close from another thread. Poll so cancel
        # returns quickly, and keep the blocking call on a daemon thread.
        local_cancel = threading.Event()
        outcome: dict[str, object] = {}
        done = threading.Event()

        def work() -> None:
            try:
                outcome["result"] = self._exchange(
                    method,
                    url,
                    headers=headers,
                    json_body=json_body,
                    body=body,
                    timeout=timeout,
                    cancel=local_cancel,
                    max_bytes=max_bytes,
                )
            except BaseException as exc:
                outcome["error"] = exc
            finally:
                done.set()

        threading.Thread(target=work, name="hz-http", daemon=True).start()
        deadline = time.monotonic() + timeout
        while not done.wait(0.2):
            if cancel is not None and cancel.is_set():
                abort(local_cancel)
                raise RunCancelled()
            if time.monotonic() >= deadline:
                abort(local_cancel)
                raise TransportError("Request timed out.")
        if "error" in outcome:
            error = outcome["error"]
            if not isinstance(error, Exception):
                raise error
            if isinstance(error, RunCancelled):
                raise error
            if isinstance(error, TransportError):
                raise error
            raise TransportError(f"Request failed: {error.__class__.__name__}.") from error
        result = outcome.get("result")
        if not isinstance(result, HttpResult):
            raise TransportError("Request failed.")
        return result

    def _exchange(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None,
        json_body: Mapping[str, object] | None,
        body: bytes | None,
        timeout: float,
        cancel: threading.Event,
        max_bytes: int,
    ) -> HttpResult:
        _require_http_url(url)
        current_method = method.upper()
        current_url = url
        current_headers = dict(headers or {})
        current_json = json_body
        current_body = body
        for _ in range(4):
            result, location = self._once(
                current_method,
                current_url,
                headers=current_headers,
                json_body=current_json,
                body=current_body,
                timeout=timeout,
                cancel=cancel,
                max_bytes=max_bytes,
            )
            if result.status not in {301, 302, 303, 307, 308} or not location:
                return result
            if current_method != "GET":
                return result
            current_url = _join(current_url, location)
            _require_http_url(current_url)
            current_headers = {}
            current_json = None
            current_body = None
        raise TransportError("Too many redirects.")

    def _once(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        json_body: Mapping[str, object] | None,
        body: bytes | None,
        timeout: float,
        cancel: threading.Event | None,
        max_bytes: int,
    ) -> tuple[HttpResult, str | None]:
        if cancel is not None and cancel.is_set():
            raise RunCancelled()
        parsed = urlsplit(url)
        assert parsed.hostname is not None
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        if parsed.scheme == "https":
            connection: http.client.HTTPConnection = http.client.HTTPSConnection(
                parsed.hostname,
                port,
                timeout=timeout,
            )
        else:
            connection = http.client.HTTPConnection(parsed.hostname, port, timeout=timeout)
        token = _register(connection, cancel)
        try:
            if cancel is not None and cancel.is_set():
                raise RunCancelled()
            payload: bytes | None = None
            request_headers = {str(key): str(value) for key, value in headers.items()}
            if json_body is not None:
                payload = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
                request_headers["Content-Type"] = "application/json"
            elif body is not None:
                payload = body
                request_headers.setdefault("Content-Type", "application/octet-stream")
            connection.request(method, path, body=payload, headers=request_headers)
            if cancel is not None and cancel.is_set():
                raise RunCancelled()
            response = connection.getresponse()
            length = response.getheader("Content-Length")
            if length and length.isdigit() and int(length) > max_bytes:
                raise TransportError("Response is too large.")
            chunks: list[bytes] = []
            remaining = max_bytes + 1
            while remaining > 0:
                chunk = response.read(min(65_536, remaining))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            payload = b"".join(chunks)
            if len(payload) > max_bytes:
                raise TransportError("Response is too large.")
            header_map = {key.lower(): value for key, value in response.getheaders()}
            return HttpResult(response.status, header_map, payload), response.getheader("Location")
        except RunCancelled:
            raise
        except (TimeoutError, socket.timeout, http.client.HTTPException, OSError) as exc:
            if cancel is not None and cancel.is_set():
                raise RunCancelled() from exc
            raise TransportError(f"Request failed: {exc.__class__.__name__}.") from exc
        finally:
            _unregister(token, connection)
            connection.close()


def _register(connection: http.client.HTTPConnection, cancel: threading.Event | None) -> int | None:
    if cancel is None:
        return None
    key = id(cancel)
    with _LOCK:
        _OPEN.setdefault(key, []).append(connection)
    return key


def _unregister(token: int | None, connection: http.client.HTTPConnection) -> None:
    if token is None:
        return
    with _LOCK:
        connections = _OPEN.get(token)
        if not connections:
            return
        _OPEN[token] = [item for item in connections if item is not connection]
        if not _OPEN[token]:
            del _OPEN[token]


def _require_http_url(url: str) -> None:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise TransportError("Only http and https URLs are allowed.")


def _join(base: str, location: str) -> str:
    if location.startswith("http://") or location.startswith("https://"):
        return location
    parsed = urlsplit(base)
    if location.startswith("/"):
        return f"{parsed.scheme}://{parsed.netloc}{location}"
    prefix = parsed.path.rsplit("/", 1)[0] if parsed.path else ""
    return f"{parsed.scheme}://{parsed.netloc}{prefix}/{location}"
