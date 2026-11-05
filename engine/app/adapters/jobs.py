"""Poll an async provider job until it finishes, times out, or the user cancels.

One attempt. This loop never submits the job again.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import TypeVar

from app.adapters.transport import RunCancelled

T = TypeVar("T")


def poll_job(
    cancel: threading.Event,
    timeout: float,
    interval: float,
    probe: Callable[[], T | None],
) -> T | None:
    """Return the probe value, or None when the deadline passes.

    `probe` returns None while the job is still running. Cancel raises
    `RunCancelled` and does not call `probe` again.
    """
    deadline = time.monotonic() + timeout
    while True:
        if cancel.is_set():
            raise RunCancelled()
        if time.monotonic() >= deadline:
            return None
        value = probe()
        if value is not None:
            return value
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return None
        if cancel.wait(min(interval, remaining)):
            raise RunCancelled()
