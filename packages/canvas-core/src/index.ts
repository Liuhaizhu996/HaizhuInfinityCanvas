import { z } from "zod";

/** Keep this aligned with the repository VERSION file. */
export const GRAPH_DOCUMENT_VERSION = "1.0.0-beta.1";

export const PortDirectionSchema = z.enum(["input", "output"]);
export const PortDataTypeSchema = z.enum([
  "text",
  "image",
  "video",
  "audio",
  "json",
  "any",
]);

export const PortSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: PortDirectionSchema,
  dataType: PortDataTypeSchema,
});

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.string(), z.unknown()),
  ports: z.array(PortSchema),
});

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourcePort: z.string().min(1),
  target: z.string().min(1),
  targetPort: z.string().min(1),
});

export const GraphSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.literal(GRAPH_DOCUMENT_VERSION),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export type PortDirection = z.infer<typeof PortDirectionSchema>;
export type PortDataType = z.infer<typeof PortDataTypeSchema>;
export type Port = z.infer<typeof PortSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type Graph = z.infer<typeof GraphSchema>;

export function createEmptyGraph(id: string, name = "Untitled"): Graph {
  return {
    id,
    name,
    version: GRAPH_DOCUMENT_VERSION,
    nodes: [],
    edges: [],
  };
}

export function parseGraph(input: unknown) {
  return GraphSchema.safeParse(input);
}
