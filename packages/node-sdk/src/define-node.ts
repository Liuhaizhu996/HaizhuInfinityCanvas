import { PortSchema, type Port } from "@haizhu/canvas-core";

export const nodeCategories = ["llm", "image", "video", "audio", "storyboard"] as const;

export type NodeCategory = (typeof nodeCategories)[number];

export const fieldKinds = ["text", "textarea", "number"] as const;

export type FieldKind = (typeof fieldKinds)[number];

/** Inspector field stored on `node.data`. Never a secret. */
export interface NodeField {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  default?: string | number;
}

export interface NodeDefinition {
  type: string;
  title: string;
  category: NodeCategory;
  summary: string;
  ports: Port[];
  fields: NodeField[];
  /** The sidecar can execute this type in the current milestone. */
  executable: boolean;
}

const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const RESERVED_KEYS = new Set(["label", "output"]);
const SECRET_KEY = /key|secret|token|password|credential/i;

/**
 * Register a node manifest. The sidecar owns execution.
 * Fields are copied onto the graph node and must not include secrets.
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
  const seen = new Set<string>();
  for (const field of definition.fields) {
    if (!FIELD_KEY.test(field.key) || RESERVED_KEYS.has(field.key) || SECRET_KEY.test(field.key)) {
      throw new Error(`Invalid field "${field.key}" on node "${definition.type}".`);
    }
    if (seen.has(field.key)) {
      throw new Error(`Duplicate field "${field.key}" on node "${definition.type}".`);
    }
    seen.add(field.key);
    if (field.kind === "number") {
      if (field.default !== undefined && typeof field.default !== "number") {
        throw new Error(`Field "${field.key}" on "${definition.type}" needs a numeric default.`);
      }
    } else if (field.default !== undefined && typeof field.default !== "string") {
      throw new Error(`Field "${field.key}" on "${definition.type}" needs a string default.`);
    }
  }
  return definition;
}
