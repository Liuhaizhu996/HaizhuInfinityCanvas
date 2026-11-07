"""Walk one graph in topological order. One node at a time, no retries."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.adapters.comfyui import run_comfyui
from app.adapters.openai_chat import run_chat
from app.adapters.openai_common import AdapterError
from app.adapters.openai_image import run_image
from app.adapters.transport import RunCancelled, Transport
from app.adapters.tts_cosyvoice import run_cosyvoice
from app.adapters.tts_edge import run_edge
from app.adapters.video_wan_kling import run_video
from app.catalog import EXECUTABLE_NODE_TYPES
from app.config import SettingsStore
from app.errors import sanitize
from app.graph import ExecutableGraph, Node
from app.run_state import RunRecord


def execute_graph(
    record: RunRecord,
    graph: ExecutableGraph,
    settings: SettingsStore,
    transport: Transport,
    asset_root: Path,
) -> None:
    for index, node_id in enumerate(graph.order):
        if record.cancel.is_set():
            _cancel_from(record, graph.order, index)
            _finish_cancelled(record)
            return
        block = _upstream_block(record, graph, node_id)
        if block == "cancelled":
            _mark(record, node_id, status="cancelled", error="已取消。")
            continue
        if block == "skipped":
            _mark(record, node_id, status="skipped", error="上游没有成功，已跳过。")
            continue
        _mark(record, node_id, status="running", error=None)
        node = graph.nodes[node_id]
        try:
            outputs = _dispatch(node, graph, record, settings, transport, asset_root)
        except RunCancelled:
            _mark(record, node_id, status="cancelled", error="已取消。")
            _cancel_from(record, graph.order, index + 1)
            _finish_cancelled(record)
            return
        except Exception as exc:
            _mark(record, node_id, status="failed", error=sanitize(str(exc), settings.get().secret_values()))
            continue
        _mark(record, node_id, status="succeeded", error=None, outputs=outputs)

    with record.lock:
        failed = [node.error for node in record.nodes.values() if node.status == "failed" and node.error]
        if failed:
            record.status = "failed"
            record.error = failed[0]
            return
        if record.cancel.is_set() or any(node.status == "cancelled" for node in record.nodes.values()):
            record.status = "cancelled"
            record.error = "已取消。"
            return
        record.status = "succeeded"
        record.error = None


def _dispatch(
    node: Node,
    graph: ExecutableGraph,
    record: RunRecord,
    settings: SettingsStore,
    transport: Transport,
    asset_root: Path,
) -> dict[str, object]:
    if node.type not in EXECUTABLE_NODE_TYPES:
        raise AdapterError(
            f"「{node.type}」还不能执行。当前可运行 openai.chat、openai.image、comfyui.image、video.wan-kling、tts.edge、tts.cosyvoice。"
        )
    prompt = _input_text(node, graph, record)
    current = settings.get()
    if node.type == "openai.chat":
        return run_chat(node, prompt, current, transport, record.cancel)
    if node.type == "openai.image":
        return run_image(
            node,
            prompt,
            current,
            transport,
            record.cancel,
            run_id=record.id,
            asset_root=asset_root,
        )
    if node.type == "tts.edge":
        return run_edge(
            node,
            prompt,
            current,
            transport,
            record.cancel,
            run_id=record.id,
            asset_root=asset_root,
        )
    if node.type == "tts.cosyvoice":
        return run_cosyvoice(
            node,
            prompt,
            current,
            transport,
            record.cancel,
            run_id=record.id,
            asset_root=asset_root,
        )
    image = _optional_image(node, graph, record)
    if node.type == "comfyui.image":
        return run_comfyui(
            node,
            prompt,
            current,
            transport,
            record.cancel,
            run_id=record.id,
            asset_root=asset_root,
            image=image,
        )
    return run_video(
        node,
        prompt,
        current,
        transport,
        record.cancel,
        run_id=record.id,
        asset_root=asset_root,
        image=image,
    )


def _input_text(node: Node, graph: ExecutableGraph, record: RunRecord) -> str:
    chunks: list[str] = []
    for edge in graph.edges:
        if edge.target != node.id:
            continue
        port = node.port(edge.target_port)
        if port is None or port.direction != "input" or port.data_type != "text":
            continue
        with record.lock:
            upstream = record.nodes[edge.source].outputs.get(edge.source_port)
        if not isinstance(upstream, str) or not upstream.strip():
            raise AdapterError("上游没有产出文本。")
        chunks.append(upstream)
    if chunks:
        return "\n\n".join(chunks)
    local = node.data.get("prompt")
    if isinstance(local, str) and local.strip():
        return local.strip()
    raise AdapterError("提示词是空的。在检查器里填写，或连一条文本进来。")


def _optional_image(node: Node, graph: ExecutableGraph, record: RunRecord) -> dict[str, Any] | None:
    found: dict[str, Any] | None = None
    for edge in graph.edges:
        if edge.target != node.id:
            continue
        port = node.port(edge.target_port)
        if port is None or port.direction != "input" or port.data_type != "image":
            continue
        with record.lock:
            upstream = record.nodes[edge.source].outputs.get(edge.source_port)
        if not isinstance(upstream, dict) or not isinstance(upstream.get("relativePath"), str):
            raise AdapterError("上游没有产出图像。")
        if found is not None:
            raise AdapterError("这个节点只接受一路图像输入。")
        found = upstream
    return found


def _upstream_block(record: RunRecord, graph: ExecutableGraph, node_id: str) -> str | None:
    for parent in graph.parents.get(node_id, ()):
        with record.lock:
            status = record.nodes[parent].status
        if status == "cancelled":
            return "cancelled"
        if status != "succeeded":
            return "skipped"
    return None


def _cancel_from(record: RunRecord, order: tuple[str, ...], start: int) -> None:
    for node_id in order[start:]:
        with record.lock:
            node = record.nodes[node_id]
            if node.status in {"pending", "running"}:
                node.status = "cancelled"
                node.error = "已取消。"


def _finish_cancelled(record: RunRecord) -> None:
    with record.lock:
        record.status = "cancelled"
        record.error = "已取消。"


def _mark(
    record: RunRecord,
    node_id: str,
    *,
    status: str,
    error: str | None,
    outputs: dict[str, object] | None = None,
) -> None:
    with record.lock:
        node = record.nodes[node_id]
        node.status = status
        node.error = error
        if outputs is not None:
            node.outputs = outputs
