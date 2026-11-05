# 海珠无限画布 Haizhu Infinity Canvas

`1.0.0-beta.1` · 私有 / All rights reserved

无限画布上的多模型 Agent 工作流。这一版是脚手架：空白 React Flow 画布、Agent 库占位、FastAPI 健康检查。不会调用模型，也没有桌面安装包。

## 运行 Web

需要 Node.js 20+ 和 pnpm 10。

```bash
pnpm install
pnpm --filter web dev
```

打开 http://127.0.0.1:5173 。从左侧列表把节点放到画布上，可以拖动和连线。构建：

```bash
pnpm --filter web build
```

## 运行引擎

需要 Python 3.12。

```bash
cd engine
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787
```

`GET http://127.0.0.1:8787/health` → `{"ok":true,"version":"1.0.0-beta.1"}`

```bash
.venv/bin/pytest
```

## 文档

- [可行性](docs/research.md)
- [技术选型 ADR-001](docs/adr/ADR-001-stack.md)（为什么用 xyflow 而不是 tldraw）
- [路线图](docs/ROADMAP.md)

依赖只使用 MIT / Apache-2.0。本仓库不包含 AGPL/GPL 源码。

## English

Private monorepo for a node-graph agent canvas. This beta is a scaffold: an empty React Flow canvas, a stub agent library, and a FastAPI health check. It does not call models or build a desktop installer.

- Web: `pnpm install`, then `pnpm --filter web dev` → http://127.0.0.1:5173
- Engine: commands above. Health returns `{"ok":true,"version":"1.0.0-beta.1"}`.
- Desktop (Tauri 2) and adapters are stubs. See `apps/desktop` and `plugins`.
- Docs: feasibility, stack ADR, roadmap.

```
apps/web/              Vite + React 19 canvas
apps/desktop/          Tauri 2 stub
packages/canvas-core/  graph, node, and port types
packages/node-sdk/     node manifests
packages/ui/           shadcn button and cn()
engine/                FastAPI sidecar
plugins/               adapter boundaries
docs/                  research, ADR-001, roadmap
```
