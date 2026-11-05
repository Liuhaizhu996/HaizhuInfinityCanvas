"""FastAPI sidecar: health, one-shot graph runs, and local OpenAI-compatible settings."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.adapters.transport import Transport, UrllibTransport
from app.assets import media_type_for, resolve_asset
from app.catalog import adapter_catalog
from app.config import SettingsStore, default_asset_root, default_env_file
from app.errors import ApiError
from app.runs import RunManager
from app.version import read_version

_RUN_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def create_app(
    *,
    env_file: Path | None = None,
    asset_root: Path | None = None,
    transport: Transport | None = None,
) -> FastAPI:
    version = read_version()
    settings = SettingsStore(env_file or default_env_file())
    root = asset_root or default_asset_root()
    runs = RunManager(
        settings=settings,
        transport=transport or UrllibTransport(),
        asset_root=root,
        version=version,
    )
    app = FastAPI(title="Haizhu Infinity Canvas Engine", version=version)
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(127\.0\.0\.1|localhost):\d+",
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Accept", "Content-Type"],
    )
    app.state.settings = settings
    app.state.runs = runs
    app.state.asset_root = root
    app.state.version = version

    @app.exception_handler(ApiError)
    def handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.body)

    @app.get("/health")
    def health() -> dict[str, bool | str]:
        return {"ok": True, "version": version}

    @app.get("/adapters")
    def adapters() -> dict[str, object]:
        return {"adapters": adapter_catalog(bool(settings.get().openai_api_key))}

    @app.get("/settings")
    def get_settings() -> dict[str, object]:
        return settings.public()

    @app.put("/settings")
    async def put_settings(request: Request) -> dict[str, object]:
        payload = await _json_object(request)
        base_url = payload.get("openaiBaseUrl", None)
        api_key = payload.get("openaiApiKey", None)
        if base_url is not None and not isinstance(base_url, str):
            raise ApiError(422, "invalid_settings", "openaiBaseUrl must be a string.")
        if api_key is not None and not isinstance(api_key, str):
            raise ApiError(422, "invalid_settings", "openaiApiKey must be a string.")
        return settings.update(openai_base_url=base_url, openai_api_key=api_key)

    @app.post("/runs", status_code=202)
    async def create_run(request: Request) -> dict[str, object]:
        payload = await _json_object(request)
        graph = payload.get("graph")
        if not isinstance(graph, dict):
            raise ApiError(422, "invalid_graph", "Body must include a graph object.")
        node_ids = payload.get("nodeIds", None)
        if node_ids is not None:
            if not isinstance(node_ids, list) or any(not isinstance(item, str) or not item for item in node_ids):
                raise ApiError(422, "invalid_graph", "nodeIds must be a list of node ids.")
        return runs.submit(graph, node_ids)

    @app.get("/runs/{run_id}")
    def get_run(run_id: str) -> dict[str, object]:
        _check_run_id(run_id)
        return runs.get(run_id)

    @app.post("/runs/{run_id}/cancel")
    def cancel_run(run_id: str) -> dict[str, object]:
        _check_run_id(run_id)
        return runs.cancel(run_id)

    @app.get("/assets/{relative_path:path}")
    def get_asset(relative_path: str) -> FileResponse:
        path = resolve_asset(root, relative_path)
        if path is None:
            raise ApiError(404, "not_found", "Asset not found.")
        return FileResponse(path, media_type=media_type_for(path))

    return app


async def _json_object(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except Exception as exc:
        raise ApiError(422, "invalid_json", "Request body must be JSON.") from exc
    if not isinstance(payload, dict):
        raise ApiError(422, "invalid_json", "Request body must be a JSON object.")
    return payload


def _check_run_id(run_id: str) -> None:
    if not _RUN_ID.fullmatch(run_id):
        raise ApiError(404, "not_found", "Run not found.")


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787)
