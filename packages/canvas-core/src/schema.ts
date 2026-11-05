import { z } from "zod";
import {
  GRAPH_DOCUMENT_VERSION,
  HZCANVAS_FORMAT,
  PORT_DATA_TYPES,
} from "./constants";
import { isAssetsDirectoryName, isSafeRelativePath } from "./paths";

export const PortDirectionSchema = z.enum(["input", "output"]);
export const PortDataTypeSchema = z.enum(PORT_DATA_TYPES);

export const PortSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  direction: PortDirectionSchema,
  dataType: PortDataTypeSchema,
});

export const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const GraphNodeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(200),
  position: PositionSchema,
  data: z.record(z.string(), z.unknown()),
  ports: z.array(PortSchema),
});

export const GraphEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1),
  sourcePort: z.string().min(1),
  target: z.string().min(1),
  targetPort: z.string().min(1),
});

const GraphObjectSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  version: z.literal(GRAPH_DOCUMENT_VERSION),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export const AssetEntrySchema = z.object({
  id: z.string().min(1).max(200),
  relativePath: z
    .string()
    .refine(isSafeRelativePath, "Asset path must stay inside the assets directory."),
  kind: PortDataTypeSchema,
  mediaType: z.string().min(1).max(200).optional(),
});

const ProjectAssetsObjectSchema = z.object({
  directory: z.string().refine(isAssetsDirectoryName, {
    message: "Assets directory must be a single segment ending in .hzcanvas.assets.",
  }),
  entries: z.array(AssetEntrySchema),
});

export type PortDirection = z.infer<typeof PortDirectionSchema>;
export type PortDataType = z.infer<typeof PortDataTypeSchema>;
export type Port = z.infer<typeof PortSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type Graph = z.infer<typeof GraphObjectSchema>;
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type ProjectAssets = z.infer<typeof ProjectAssetsObjectSchema>;

export type ValidationIssue = {
  path: readonly (string | number)[];
  message: string;
};

export type ConnectionDraft = {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
};

/** Ports connect only when the output and input data types are the same. */
export function portsCompatible(output: PortDataType, input: PortDataType): boolean {
  return output === input;
}

export function connectionIssues(
  nodes: readonly GraphNode[],
  draft: ConnectionDraft,
  path: readonly (string | number)[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (draft.source === draft.target) {
    issues.push({
      path: [...path, "target"],
      message: "A node cannot connect to itself.",
    });
  }

  const source = nodes.find((node) => node.id === draft.source);
  const target = nodes.find((node) => node.id === draft.target);
  if (!source) {
    issues.push({
      path: [...path, "source"],
      message: `Missing source node "${draft.source}".`,
    });
  }
  if (!target) {
    issues.push({
      path: [...path, "target"],
      message: `Missing target node "${draft.target}".`,
    });
  }

  const sourcePort = source?.ports.find((port) => port.id === draft.sourcePort);
  const targetPort = target?.ports.find((port) => port.id === draft.targetPort);
  if (source && !sourcePort) {
    issues.push({
      path: [...path, "sourcePort"],
      message: `Node "${draft.source}" has no port "${draft.sourcePort}".`,
    });
  }
  if (target && !targetPort) {
    issues.push({
      path: [...path, "targetPort"],
      message: `Node "${draft.target}" has no port "${draft.targetPort}".`,
    });
  }
  if (sourcePort && sourcePort.direction !== "output") {
    issues.push({
      path: [...path, "sourcePort"],
      message: `Port "${sourcePort.id}" on "${draft.source}" is not an output.`,
    });
  }
  if (targetPort && targetPort.direction !== "input") {
    issues.push({
      path: [...path, "targetPort"],
      message: `Port "${targetPort.id}" on "${draft.target}" is not an input.`,
    });
  }
  if (
    sourcePort &&
    targetPort &&
    sourcePort.direction === "output" &&
    targetPort.direction === "input" &&
    !portsCompatible(sourcePort.dataType, targetPort.dataType)
  ) {
    issues.push({
      path: [...path, "targetPort"],
      message: `Cannot connect ${sourcePort.dataType} to ${targetPort.dataType}.`,
    });
  }
  return issues;
}

function graphIssues(graph: Graph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set<string>();

  graph.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) {
      issues.push({
        path: ["nodes", index, "id"],
        message: `Duplicate node id "${node.id}".`,
      });
    }
    nodeIds.add(node.id);

    const portIds = new Set<string>();
    node.ports.forEach((port, portIndex) => {
      if (portIds.has(port.id)) {
        issues.push({
          path: ["nodes", index, "ports", portIndex, "id"],
          message: `Duplicate port id "${port.id}" on node "${node.id}".`,
        });
      }
      portIds.add(port.id);
    });
  });

  const edgeIds = new Set<string>();
  const seenConnections = new Set<string>();
  graph.edges.forEach((edge, index) => {
    if (edgeIds.has(edge.id)) {
      issues.push({
        path: ["edges", index, "id"],
        message: `Duplicate edge id "${edge.id}".`,
      });
    }
    edgeIds.add(edge.id);

    const key = `${edge.source}\0${edge.sourcePort}\0${edge.target}\0${edge.targetPort}`;
    if (seenConnections.has(key)) {
      issues.push({
        path: ["edges", index],
        message: "Duplicate connection.",
      });
    }
    seenConnections.add(key);
    issues.push(...connectionIssues(graph.nodes, edge, ["edges", index]));
  });

  return issues;
}

function addZodIssues(ctx: z.RefinementCtx, issues: readonly ValidationIssue[]) {
  for (const issue of issues) {
    ctx.addIssue({
      code: "custom",
      message: issue.message,
      path: [...issue.path],
    });
  }
}

export const GraphSchema = GraphObjectSchema.superRefine((graph, ctx) => {
  addZodIssues(ctx, graphIssues(graph));
});

export const ProjectAssetsSchema = ProjectAssetsObjectSchema.superRefine((assets, ctx) => {
  const ids = new Set<string>();
  assets.entries.forEach((entry, index) => {
    if (ids.has(entry.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate asset id "${entry.id}".`,
        path: ["entries", index, "id"],
      });
    }
    ids.add(entry.id);
  });
});

const ProjectObjectSchema = z.object({
  format: z.literal(HZCANVAS_FORMAT),
  formatVersion: z.literal(GRAPH_DOCUMENT_VERSION),
  graph: GraphSchema,
  assets: ProjectAssetsSchema,
});

export type ProjectDocument = z.infer<typeof ProjectObjectSchema>;

export const ProjectDocumentSchema = ProjectObjectSchema;
