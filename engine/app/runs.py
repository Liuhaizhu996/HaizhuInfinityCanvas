"""Accept one run at a time and keep its status until the process exits."""

from __future__ import annotations

import threading
import uuid
from pathlib import Path

from app.adapters.fields import vendor_name
from app.adapters.openai_common import AdapterError
from app.adapters.transport import Transport, abort
from app.catalog import OPENAI_NODE_TYPES
from app.config import Settings, SettingsStore
from app.errors import ApiError, sanitize
from app.executor import execute_graph
from app.graph import ExecutableGraph, prepare_run
from app.run_state import NodeRun, RunRecord

_MAX_RUNS = 32


class RunManager:
    def __init__(
        self,
        *,
        settings: SettingsStore,
        transport: Transport,
        asset_root: Path,
        version: str,
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._asset_root = asset_root
        self._version = version
        self._lock = threading.Lock()
        self._runs: dict[str, RunRecord] = {}

    def submit(self, graph_payload: object, node_ids: list[str] | None) -> dict[str, object]:
        graph = prepare_run(graph_payload, node_ids, version=self._version)
        missing = _missing_credentials(graph, self._settings.get())
        if missing is not None:
            raise ApiError(422, "missing_credentials", missing)
        record = RunRecord(
            id=str(uuid.uuid4()),
            status="running",
            node_ids=list(graph.order),
            nodes={node_id: NodeRun(type=graph.nodes[node_id].type) for node_id in graph.order},
            cancel=threading.Event(),
        )
        with self._lock:
            active = next((run for run in self._runs.values() if run.status == "running"), None)
            if active is not None:
                raise ApiError(
                    409,
                    "run_in_progress",
                    "A run is already in progress.",
                    runId=active.id,
                )
            self._runs[record.id] = record
            self._trim()
        thread = threading.Thread(
            target=self._worker,
            args=(record, graph),
            name=f"hz-run-{record.id}",
            daemon=True,
        )
        thread.start()
        return record.public()

    def get(self, run_id: str) -> dict[str, object]:
        record = self._find(run_id)
        return record.public()

    def cancel(self, run_id: str) -> dict[str, object]:
        record = self._find(run_id)
        abort(record.cancel)
        return record.public()

    def _find(self, run_id: str) -> RunRecord:
        with self._lock:
            record = self._runs.get(run_id)
        if record is None:
            raise ApiError(404, "not_found", "Run not found.")
        return record

    def _trim(self) -> None:
        if len(self._runs) <= _MAX_RUNS:
            return
        for run_id in list(self._runs):
            if len(self._runs) <= _MAX_RUNS:
                return
            if self._runs[run_id].status == "running":
                continue
            del self._runs[run_id]

    def _worker(self, record: RunRecord, graph: ExecutableGraph) -> None:
        try:
            execute_graph(record, graph, self._settings, self._transport, self._asset_root)
        except Exception as exc:
            secret = self._settings.get().secret_values()
            with record.lock:
                if record.status == "running":
                    record.status = "failed"
                    record.error = sanitize(str(exc), secret)
        finally:
            with record.lock:
                if record.status == "running":
                    record.status = "failed"
                    record.error = record.error or "Run stopped before it finished."


def _missing_credentials(graph: ExecutableGraph, settings: Settings) -> str | None:
    if any(node.type in OPENAI_NODE_TYPES for node in graph.nodes.values()) and not settings.openai_api_key:
        return "OPENAI_API_KEY is not set on the sidecar."
    for node_id in graph.order:
        node = graph.nodes[node_id]
        if node.type != "video.wan-kling":
            continue
        try:
            vendor = vendor_name(node.data)
        except AdapterError as exc:
            raise ApiError(422, "invalid_graph", str(exc)) from exc
        if vendor == "wan" and not settings.wan_api_key:
            return "WAN_API_KEY is not set on the sidecar."
        if vendor == "kling" and not settings.kling_configured():
            return "Kling credentials are not set. Set KLING_API_KEY or both KLING_ACCESS_KEY and KLING_SECRET_KEY."
    return None
