import { z } from "zod";
import { parseProjectJson } from "./document";
import {
  GraphSchema,
  ProjectDocumentSchema,
  connectionIssues,
  type ConnectionDraft,
  type Graph,
  type ProjectDocument,
  type ValidationIssue,
} from "./schema";

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] };

function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (part): part is string | number => typeof part === "string" || typeof part === "number",
    ),
    message: issue.message,
  }));
}

function fromZod<T>(parsed: z.ZodSafeParseResult<T>): ValidationResult<T> {
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, issues: issuesFromZod(parsed.error) };
}

export function formatIssues(issues: readonly ValidationIssue[]): string {
  if (issues.length === 0) return "Invalid document.";
  return issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join(" ");
}

export function parseGraph(input: unknown) {
  return GraphSchema.safeParse(input);
}

export function validateGraph(input: unknown): ValidationResult<Graph> {
  return fromZod(GraphSchema.safeParse(input));
}

export function validateProjectDocument(input: unknown): ValidationResult<ProjectDocument> {
  return fromZod(ProjectDocumentSchema.safeParse(input));
}

export function validateConnection(
  graph: Graph,
  draft: ConnectionDraft,
): ValidationResult<ConnectionDraft> {
  const issues = connectionIssues(graph.nodes, draft);
  const duplicate = graph.edges.some(
    (edge) =>
      edge.source === draft.source &&
      edge.sourcePort === draft.sourcePort &&
      edge.target === draft.target &&
      edge.targetPort === draft.targetPort,
  );
  if (duplicate) {
    issues.push({ path: ["target"], message: "That connection already exists." });
  }
  if (issues.length > 0) return { success: false, issues };
  return { success: true, data: draft };
}

export function deserializeProject(raw: string): ValidationResult<ProjectDocument> {
  const json = parseProjectJson(raw);
  if (!json.ok) return { success: false, issues: [{ path: [], message: json.message }] };
  return validateProjectDocument(json.value);
}
