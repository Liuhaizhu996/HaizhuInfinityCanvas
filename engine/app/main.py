from pathlib import Path

from fastapi import FastAPI

VERSION_PATH = Path(__file__).resolve().parents[2] / "VERSION"


def read_version() -> str:
    if not VERSION_PATH.is_file():
        raise FileNotFoundError(f"VERSION file not found at {VERSION_PATH}")
    return VERSION_PATH.read_text(encoding="utf-8").strip()


def create_app() -> FastAPI:
    version = read_version()
    app = FastAPI(title="Haizhu Infinity Canvas Engine", version=version)

    @app.get("/health")
    def health() -> dict[str, bool | str]:
        return {"ok": True, "version": version}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787)
