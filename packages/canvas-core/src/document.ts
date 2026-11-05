import { GRAPH_DOCUMENT_VERSION, HZCANVAS_FORMAT } from "./constants";
import { assetsDirectoryForProjectFile, projectFileName } from "./paths";
import {
  ProjectDocumentSchema,
  type Graph,
  type ProjectDocument,
} from "./schema";

export function createEmptyGraph(id: string, name = "Untitled"): Graph {
  return {
    id,
    name,
    version: GRAPH_DOCUMENT_VERSION,
    nodes: [],
    edges: [],
  };
}

export function createEmptyProject(id: string, name = "Untitled"): ProjectDocument {
  const fileName = projectFileName(name);
  return ProjectDocumentSchema.parse({
    format: HZCANVAS_FORMAT,
    formatVersion: GRAPH_DOCUMENT_VERSION,
    graph: createEmptyGraph(id, name),
    assets: {
      directory: assetsDirectoryForProjectFile(fileName),
      entries: [],
    },
  });
}

/** Pretty JSON, including a trailing newline. Throws when `document` is invalid. */
export function serializeProject(document: ProjectDocument): string {
  const parsed = ProjectDocumentSchema.parse(document);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function parseProjectJson(raw: string):
  | { ok: true; value: unknown }
  | { ok: false; message: string } {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return { ok: false, message: "Document is empty." };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, message: "Document is not valid JSON." };
  }
}
