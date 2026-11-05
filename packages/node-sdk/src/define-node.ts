import { PortSchema, type Port } from "@haizhu/canvas-core";

export const nodeCategories = ["llm", "image", "video", "audio"] as const;

export type NodeCategory = (typeof nodeCategories)[number];

export interface NodeDefinition {
  type: string;
  title: string;
  category: NodeCategory;
  summary: string;
  ports: Port[];
}

/**
 * Register a node manifest. Execution is intentionally absent:
 * v1.0.0-beta.1 does not call models or external APIs.
 */
export function defineNode(definition: NodeDefinition): NodeDefinition {
  for (const port of definition.ports) {
    const parsed = PortSchema.safeParse(port);
    if (!parsed.success) {
      throw new Error(
        `Invalid port "${port.id}" on node "${definition.type}": ${parsed.error.message}`,
      );
    }
  }
  return definition;
}
