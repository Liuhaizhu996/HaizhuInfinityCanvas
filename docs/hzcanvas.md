# `.hzcanvas` project file

Format version `1.0.0-beta.1`. The product version can be newer (`VERSION`, `/health`). The web app downloads and opens this file. It does not read or write the assets directory. Model calls go to the local sidecar and are not part of this file.

## Files on disk

```
Demo.hzcanvas                 UTF-8 JSON project document
Demo.hzcanvas.assets/         optional sibling directory (bytes live here)
  images/frame-01.png
  audio/line-03.wav
```

The directory name is the project file name plus `.assets`. Paths inside it are relative (`images/frame-01.png`). Absolute paths and `..` segments are invalid.

The browser build only transfers the JSON file. `assets.entries` is kept so a later desktop shell can resolve the same paths. Saving from the web app shows the directory name and does not create the folder.

## Document

| Field | Meaning |
| --- | --- |
| `format` | Always `"hzcanvas"`. |
| `formatVersion` | Always `GRAPH_DOCUMENT_VERSION` (`1.0.0-beta.1`). |
| `graph` | The canvas graph. |
| `assets.directory` | One path segment, ending in `.hzcanvas.assets`. |
| `assets.entries` | Manifest only. File bytes are not embedded. |

`graph.version` is the same literal as `formatVersion`. Bump `GRAPH_DOCUMENT_VERSION` in `@haizhu/canvas-core` when either shape breaks. Do not bump it just because the product version changed.

### Graph

| Field | Meaning |
| --- | --- |
| `id`, `name` | Document identity. The download file name is sanitized from `name`. |
| `nodes[].type` | Catalog type, such as `openai.chat`. Not the React Flow renderer. |
| `nodes[].position` | Flow coordinates. Finite numbers. The node's top-left is this point. |
| `nodes[].data` | JSON object. The editor stores `label` and runner fields here (`prompt`, `model`, `system`, `temperature`, `size`, `seed`). After a run it may also store `output`. Secrets are not valid fields. |
| `nodes[].ports` | Typed ports. Ids are unique on that node. |
| `edges[]` | `source` / `sourcePort` is an output. `target` / `targetPort` is an input. |

### Port data types

`text`, `image`, `video`, `audio`, `storyboard`.

A connection is valid only when the output and the input use the same type. `storyboard` connects only to `storyboard`. Cycles are allowed in the file; a future runner rejects them. The editor also rejects self-connections, missing endpoints, duplicate node or edge ids, duplicate port ids on one node, and a second edge with the same endpoints and ports.

`json` and `any` from the first scaffold are not port types.

## Example

```json
{
  "format": "hzcanvas",
  "formatVersion": "1.0.0-beta.1",
  "graph": {
    "id": "demo",
    "name": "Demo",
    "version": "1.0.0-beta.1",
    "nodes": [
      {
        "id": "llm",
        "type": "openai.chat",
        "position": { "x": 80, "y": 140 },
        "data": { "label": "对话 LLM" },
        "ports": [
          { "id": "prompt", "name": "prompt", "direction": "input", "dataType": "text" },
          { "id": "text", "name": "text", "direction": "output", "dataType": "text" }
        ]
      },
      {
        "id": "board",
        "type": "storyboard.board",
        "position": { "x": 420, "y": 140 },
        "data": { "label": "分镜" },
        "ports": [
          { "id": "prompt", "name": "prompt", "direction": "input", "dataType": "text" },
          { "id": "board", "name": "board", "direction": "output", "dataType": "storyboard" }
        ]
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "source": "llm",
        "sourcePort": "text",
        "target": "board",
        "targetPort": "prompt"
      }
    ]
  },
  "assets": {
    "directory": "Demo.hzcanvas.assets",
    "entries": [
      {
        "id": "asset-frame",
        "relativePath": "images/frame-01.png",
        "kind": "image",
        "mediaType": "image/png"
      }
    ]
  }
}
```

`kind` uses the same five port types. `mediaType` is an optional MIME type.

## Runner fields and outputs

`formatVersion` did not change. `node.data` was already an open object.

| Key | Used by | Notes |
| --- | --- | --- |
| `prompt`, `system` | `openai.chat` (prompt also on image) | Text. A connected text input replaces `prompt` for that run. |
| `model` | chat, image | Defaults in the sidecar: `gpt-4o-mini`, `dall-e-3`. |
| `temperature`, `seed` | chat; seed also on image | Omitted when empty. Official Images APIs may reject `seed`. |
| `size` | `openai.image` | Such as `1024x1024`. |
| `output.text` | chat | The completion string. |
| `output.image` | image | `{ relativePath, mediaType }` only. No bytes, no provider key. |

A successful image also appends an `assets.entries` item whose `relativePath` is `images/<run>-<node>.png` (or `.jpg` / `.webp`). The sidecar keeps those bytes in `engine/var/assets/` so the browser can preview them at `GET /assets/<relativePath>`. Saving still does not create `Name.hzcanvas.assets/` on disk. A later desktop shell can copy the cache into that sibling directory.

## API

`@haizhu/canvas-core` parses this file:

- `validateGraph` / `validateProjectDocument` / `validateConnection`
- `serializeProject` / `deserializeProject`
- `createEmptyProject`
- `projectFileName` / `assetsDirectoryForProjectFile`

React Flow state in `apps/web` is a view over `ProjectDocument`. Undo and redo keep session snapshots of that document (up to 50). They are not written into the file.

## Web app

- Drag a row from the Agent library onto the canvas. The node's top-left lands on the pointer in flow coordinates, including pan and zoom. Clicking a row still adds it on the grid.
- **保存** downloads `<graph name>.hzcanvas`.
- **打开** reads a `.hzcanvas` JSON file and replaces the canvas. Invalid JSON or an invalid graph leaves the current canvas in place.
- **撤销** / **重做**, or Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.
- **运行** / **运行所选** / **取消** talk to the local sidecar. **设置** writes `engine/.env`.

Save and open still do not call a model. Run does, and only for `openai.chat` and `openai.image`.
