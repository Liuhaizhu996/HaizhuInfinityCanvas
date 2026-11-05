import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  deserializeProject,
  portsCompatible,
  projectFileName,
  serializeProject,
  validateConnection,
  validateGraph,
  type GraphNode,
  type ProjectDocument,
} from "./index";

const textNode = (id: string, y = 0): GraphNode => ({
  id,
  type: "openai.chat",
  position: { x: 0, y },
  data: { label: id },
  ports: [
    { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
    { id: "text", name: "text", direction: "output", dataType: "text" },
  ],
});

const documentedExample = `{
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
`;

describe("project document", () => {
  it("round-trips an empty project", () => {
    const project = createEmptyProject("local-canvas", "Untitled");
    expect(project.assets.directory).toBe("Untitled.hzcanvas.assets");
    const again = deserializeProject(serializeProject(project));
    expect(again.success).toBe(true);
    if (again.success) expect(again.data).toEqual(project);
  });

  it("accepts the documented hzcanvas example", () => {
    const parsed = deserializeProject(documentedExample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.graph.nodes[1]?.ports[1]?.dataType).toBe("storyboard");
    expect(parsed.data.assets.entries).toHaveLength(1);
    const text = serializeProject(parsed.data);
    expect(deserializeProject(text).success).toBe(true);
  });

  it("rejects invalid JSON and unknown port types", () => {
    expect(deserializeProject("{").success).toBe(false);
    expect(deserializeProject("").success).toBe(false);
    const project = createEmptyProject("id", "Demo");
    const broken = {
      ...project,
      graph: {
        ...project.graph,
        nodes: [
          {
            ...textNode("a"),
            ports: [{ id: "out", name: "out", direction: "output", dataType: "json" }],
          },
        ],
      },
    };
    expect(deserializeProject(JSON.stringify(broken)).success).toBe(false);
  });

  it("rejects unsafe asset paths and duplicate asset ids", () => {
    const project = createEmptyProject("id", "Demo");
    const withPath = (relativePath: string): ProjectDocument => ({
      ...project,
      assets: {
        directory: "Demo.hzcanvas.assets",
        entries: [{ id: "a", relativePath, kind: "image" }],
      },
    });
    expect(deserializeProject(JSON.stringify(withPath("../secret.png"))).success).toBe(false);
    expect(deserializeProject(JSON.stringify(withPath("/etc/passwd"))).success).toBe(false);
    expect(deserializeProject(JSON.stringify(withPath("images/ok.png"))).success).toBe(true);
    const videoEntry: ProjectDocument = {
      ...project,
      assets: {
        directory: "Demo.hzcanvas.assets",
        entries: [{ id: "clip", relativePath: "videos/clip.mp4", kind: "video", mediaType: "video/mp4" }],
      },
    };
    expect(deserializeProject(JSON.stringify(videoEntry)).success).toBe(true);

    const duplicateIds: ProjectDocument = {
      ...project,
      assets: {
        directory: "Demo.hzcanvas.assets",
        entries: [
          { id: "a", relativePath: "a.png", kind: "image" },
          { id: "a", relativePath: "b.png", kind: "image" },
        ],
      },
    };
    expect(deserializeProject(JSON.stringify(duplicateIds)).success).toBe(false);
  });
});

describe("graph validation", () => {
  it("requires unique nodes, real ports, and matching types", () => {
    const ok = validateGraph({
      id: "g",
      name: "Demo",
      version: "1.0.0-beta.1",
      nodes: [textNode("a"), textNode("b", 40)],
      edges: [
        {
          id: "e1",
          source: "a",
          sourcePort: "text",
          target: "b",
          targetPort: "prompt",
        },
      ],
    });
    expect(ok.success).toBe(true);

    const mismatch = validateGraph({
      id: "g",
      name: "Demo",
      version: "1.0.0-beta.1",
      nodes: [
        textNode("a"),
        {
          id: "img",
          type: "openai.image",
          position: { x: 10, y: 10 },
          data: {},
          ports: [
            { id: "prompt", name: "prompt", direction: "input", dataType: "image" },
            { id: "image", name: "image", direction: "output", dataType: "image" },
          ],
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          sourcePort: "text",
          target: "img",
          targetPort: "prompt",
        },
      ],
    });
    expect(mismatch.success).toBe(false);

    const dangling = validateGraph({
      id: "g",
      name: "Demo",
      version: "1.0.0-beta.1",
      nodes: [textNode("a")],
      edges: [
        {
          id: "e1",
          source: "a",
          sourcePort: "text",
          target: "missing",
          targetPort: "prompt",
        },
      ],
    });
    expect(dangling.success).toBe(false);
  });

  it("checks a draft connection against the current graph", () => {
    const graph = validateGraph({
      id: "g",
      name: "Demo",
      version: "1.0.0-beta.1",
      nodes: [textNode("a"), textNode("b")],
      edges: [],
    });
    expect(graph.success).toBe(true);
    if (!graph.success) return;

    expect(
      validateConnection(graph.data, {
        source: "a",
        sourcePort: "text",
        target: "b",
        targetPort: "prompt",
      }).success,
    ).toBe(true);
    expect(
      validateConnection(graph.data, {
        source: "a",
        sourcePort: "prompt",
        target: "b",
        targetPort: "prompt",
      }).success,
    ).toBe(false);
    expect(
      validateConnection(graph.data, {
        source: "a",
        sourcePort: "text",
        target: "a",
        targetPort: "prompt",
      }).success,
    ).toBe(false);
    expect(portsCompatible("storyboard", "storyboard")).toBe(true);
    expect(portsCompatible("text", "image")).toBe(false);
  });
});

describe("file names", () => {
  it("strips path characters and keeps the extension", () => {
    expect(projectFileName("My Film")).toBe("My Film.hzcanvas");
    expect(projectFileName("海珠")).toBe("海珠.hzcanvas");
    expect(projectFileName("../etc/passwd")).toBe("etc_passwd.hzcanvas");
    expect(projectFileName("  ")).toBe("untitled.hzcanvas");
    expect(projectFileName("Demo.hzcanvas")).toBe("Demo.hzcanvas");
  });
});
