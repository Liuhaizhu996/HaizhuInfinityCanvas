"""Parse a canvas graph and refuse to execute a cycle.

The `.hzcanvas` file may store a cycle. This module is the runner's gate.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from app.errors import ApiError

PORT_DATA_TYPES = {"text", "image", "video", "audio", "storyboard"}
_MAX_NODES = 200
_MAX_EDGES = 400


@dataclass(frozen=True)
class Port:
    id: str
    name: str
    direction: str
    data_type: str


@dataclass(frozen=True)
class Edge:
    id: str
    source: str
    source_port: str
    target: str
    target_port: str


@dataclass
class Node:
    id: str
    type: str
    data: dict[str, Any]
    ports: tuple[Port, ...]

    def port(self, port_id: str) -> Port | None:
        for item in self.ports:
            if item.id == port_id:
                return item
        return None


@dataclass
class ExecutableGraph:
    nodes: dict[str, Node]
    edges: tuple[Edge, ...]
    order: tuple[str, ...]
    parents: dict[str, tuple[str, ...]] = field(default_factory=dict)


def prepare_run(payload: object, node_ids: list[str] | None, *, version: str) -> ExecutableGraph:
    graph = _parse_graph(payload, version)
    selected = _select(graph, node_ids)
    if not selected.nodes:
        code = "empty_selection" if node_ids is not None else "empty_graph"
        message = (
            "No nodes were selected."
            if node_ids is not None
            else "Graph has no nodes."
        )
        raise ApiError(422, code, message)
    order = _topological_order(selected)
    parents: dict[str, set[str]] = {node_id: set() for node_id in selected.nodes}
    for edge in selected.edges:
        parents[edge.target].add(edge.source)
    selected.order = order
    selected.parents = {node_id: tuple(sorted(values)) for node_id, values in parents.items()}
    return selected


def _parse_graph(payload: object, version: str) -> ExecutableGraph:
    if not isinstance(payload, dict):
        raise ApiError(422, "invalid_graph", "Graph must be an object.")
    _require_string(payload.get("id"), "id")
    _require_string(payload.get("name"), "name")
    if payload.get("version") != version:
        raise ApiError(422, "invalid_graph", f"Graph version must be {version}.")
    raw_nodes = payload.get("nodes")
    raw_edges = payload.get("edges")
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
        raise ApiError(422, "invalid_graph", "Graph nodes and edges must be arrays.")
    if len(raw_nodes) > _MAX_NODES or len(raw_edges) > _MAX_EDGES:
        raise ApiError(422, "invalid_graph", "Graph is too large.")

    nodes: dict[str, Node] = {}
    for index, raw in enumerate(raw_nodes):
        node = _parse_node(raw, index)
        if node.id in nodes:
            raise ApiError(422, "invalid_graph", f'Duplicate node id "{node.id}".')
        nodes[node.id] = node

    edges: list[Edge] = []
    seen_edge_ids: set[str] = set()
    seen_connections: set[tuple[str, str, str, str]] = set()
    for index, raw in enumerate(raw_edges):
        edge = _parse_edge(raw, index, nodes)
        if edge.id in seen_edge_ids:
            raise ApiError(422, "invalid_graph", f'Duplicate edge id "{edge.id}".')
        seen_edge_ids.add(edge.id)
        key = (edge.source, edge.source_port, edge.target, edge.target_port)
        if key in seen_connections:
            raise ApiError(422, "invalid_graph", "Duplicate connection.")
        seen_connections.add(key)
        edges.append(edge)
    return ExecutableGraph(nodes=nodes, edges=tuple(edges), order=())


def _parse_node(raw: object, index: int) -> Node:
    path = f"nodes[{index}]"
    if not isinstance(raw, dict):
        raise ApiError(422, "invalid_graph", f"{path} must be an object.")
    node_id = _require_string(raw.get("id"), f"{path}.id")
    node_type = _require_string(raw.get("type"), f"{path}.type")
    position = raw.get("position")
    if not isinstance(position, dict):
        raise ApiError(422, "invalid_graph", f"{path}.position must be an object.")
    _finite(position.get("x"), f"{path}.position.x")
    _finite(position.get("y"), f"{path}.position.y")
    data = raw.get("data")
    if not isinstance(data, dict):
        raise ApiError(422, "invalid_graph", f"{path}.data must be an object.")
    parsed_data = _json_object(data, f"{path}.data")
    raw_ports = raw.get("ports")
    if not isinstance(raw_ports, list):
        raise ApiError(422, "invalid_graph", f"{path}.ports must be an array.")
    ports: list[Port] = []
    seen_ports: set[str] = set()
    for port_index, raw_port in enumerate(raw_ports):
        port = _parse_port(raw_port, f"{path}.ports[{port_index}]")
        if port.id in seen_ports:
            raise ApiError(422, "invalid_graph", f'Duplicate port id "{port.id}" on node "{node_id}".')
        seen_ports.add(port.id)
        ports.append(port)
    return Node(id=node_id, type=node_type, data=parsed_data, ports=tuple(ports))


def _parse_port(raw: object, path: str) -> Port:
    if not isinstance(raw, dict):
        raise ApiError(422, "invalid_graph", f"{path} must be an object.")
    port_id = _require_string(raw.get("id"), f"{path}.id")
    name = _require_string(raw.get("name"), f"{path}.name")
    direction = raw.get("direction")
    if direction not in {"input", "output"}:
        raise ApiError(422, "invalid_graph", f"{path}.direction must be input or output.")
    data_type = raw.get("dataType")
    if data_type not in PORT_DATA_TYPES:
        raise ApiError(422, "invalid_graph", f"{path}.dataType is not a port type.")
    return Port(id=port_id, name=name, direction=str(direction), data_type=str(data_type))


def _parse_edge(raw: object, index: int, nodes: dict[str, Node]) -> Edge:
    path = f"edges[{index}]"
    if not isinstance(raw, dict):
        raise ApiError(422, "invalid_graph", f"{path} must be an object.")
    edge_id = _require_string(raw.get("id"), f"{path}.id")
    source = _require_string(raw.get("source"), f"{path}.source")
    source_port = _require_string(raw.get("sourcePort"), f"{path}.sourcePort")
    target = _require_string(raw.get("target"), f"{path}.target")
    target_port = _require_string(raw.get("targetPort"), f"{path}.targetPort")
    if source == target:
        raise ApiError(422, "invalid_graph", "A node cannot connect to itself.")
    source_node = nodes.get(source)
    target_node = nodes.get(target)
    if source_node is None:
        raise ApiError(422, "invalid_graph", f'Missing source node "{source}".')
    if target_node is None:
        raise ApiError(422, "invalid_graph", f'Missing target node "{target}".')
    output_port = source_node.port(source_port)
    input_port = target_node.port(target_port)
    if output_port is None:
        raise ApiError(422, "invalid_graph", f'Node "{source}" has no port "{source_port}".')
    if input_port is None:
        raise ApiError(422, "invalid_graph", f'Node "{target}" has no port "{target_port}".')
    if output_port.direction != "output":
        raise ApiError(422, "invalid_graph", f'Port "{source_port}" on "{source}" is not an output.')
    if input_port.direction != "input":
        raise ApiError(422, "invalid_graph", f'Port "{target_port}" on "{target}" is not an input.')
    if output_port.data_type != input_port.data_type:
        raise ApiError(
            422,
            "invalid_graph",
            f"Cannot connect {output_port.data_type} to {input_port.data_type}.",
        )
    return Edge(
        id=edge_id,
        source=source,
        source_port=source_port,
        target=target,
        target_port=target_port,
    )


def _select(graph: ExecutableGraph, node_ids: list[str] | None) -> ExecutableGraph:
    if node_ids is None:
        return graph
    if len(node_ids) > _MAX_NODES:
        raise ApiError(422, "invalid_graph", "Selection is too large.")
    wanted = set(node_ids)
    missing = sorted(node_id for node_id in wanted if node_id not in graph.nodes)
    if missing:
        raise ApiError(422, "unknown_node", "Selection includes a node that is not in the graph.", nodeIds=missing)
    incoming: dict[str, set[str]] = {node_id: set() for node_id in graph.nodes}
    for edge in graph.edges:
        incoming[edge.target].add(edge.source)
    stack = list(wanted)
    while stack:
        current = stack.pop()
        for source in incoming[current]:
            if source not in wanted:
                wanted.add(source)
                stack.append(source)
    nodes = {node_id: node for node_id, node in graph.nodes.items() if node_id in wanted}
    edges = tuple(edge for edge in graph.edges if edge.source in wanted and edge.target in wanted)
    return ExecutableGraph(nodes=nodes, edges=edges, order=())


def _topological_order(graph: ExecutableGraph) -> tuple[str, ...]:
    indegree = {node_id: 0 for node_id in graph.nodes}
    children: dict[str, list[str]] = {node_id: [] for node_id in graph.nodes}
    for edge in graph.edges:
        indegree[edge.target] += 1
        children[edge.source].append(edge.target)
    ready = sorted(node_id for node_id, degree in indegree.items() if degree == 0)
    order: list[str] = []
    while ready:
        node_id = ready.pop(0)
        order.append(node_id)
        for child in children[node_id]:
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
        ready.sort()
    if len(order) != len(graph.nodes):
        cyclic = sorted(node_id for node_id, degree in indegree.items() if degree > 0)
        raise ApiError(
            422,
            "cycle",
            "Runner refused a cycle. The file may store one; this run will not.",
            nodeIds=cyclic,
        )
    return tuple(order)


def _require_string(value: object, path: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise ApiError(422, "invalid_graph", f"{path} must be a non-empty string.")
    return value


def _finite(value: object, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise ApiError(422, "invalid_graph", f"{path} must be a finite number.")
    return float(value)


def _json_object(value: dict[object, object], path: str) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    for key, item in value.items():
        if not isinstance(key, str) or len(key) > 200:
            raise ApiError(422, "invalid_graph", f"{path} has an invalid key.")
        parsed[key] = _json_value(item, f"{path}.{key}")
    return parsed


def _json_value(value: object, path: str) -> Any:
    if value is None or isinstance(value, str | bool):
        if isinstance(value, str) and len(value) > 100_000:
            raise ApiError(422, "invalid_graph", f"{path} is too long.")
        return value
    if isinstance(value, int | float) and not isinstance(value, bool):
        if isinstance(value, float) and not math.isfinite(value):
            raise ApiError(422, "invalid_graph", f"{path} must be finite.")
        return value
    if isinstance(value, list):
        if len(value) > 200:
            raise ApiError(422, "invalid_graph", f"{path} is too long.")
        return [_json_value(item, f"{path}[]") for item in value]
    if isinstance(value, dict):
        return _json_object(value, path)
    raise ApiError(422, "invalid_graph", f"{path} is not JSON.")
