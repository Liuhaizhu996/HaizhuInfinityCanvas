import { HZCANVAS_ASSETS_SUFFIX, HZCANVAS_EXTENSION } from "./constants";

const ILLEGAL_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * Download name for a graph title. The result always ends with `.hzcanvas`
 * and never contains a path separator.
 */
export function projectFileName(name: string): string {
  const stripped = name.trim().replace(/\.hzcanvas$/i, "");
  const cleaned = stripped
    .replace(ILLEGAL_FILE_CHARS, "_")
    .replace(/\s+/g, " ")
    .replace(/^[._]+/, "")
    .replace(/[.]+$/, "")
    .trim()
    .slice(0, 120);
  const base = cleaned || "untitled";
  return `${base}${HZCANVAS_EXTENSION}`;
}

/** Conventional sibling directory for a graph title or a `.hzcanvas` file name. */
export function assetsDirectoryForProjectFile(fileName: string): string {
  return `${projectFileName(fileName)}${HZCANVAS_ASSETS_SUFFIX}`;
}

/** Single path segment: `Name.hzcanvas.assets`. */
export function isAssetsDirectoryName(name: string): boolean {
  if (name.length < HZCANVAS_EXTENSION.length + HZCANVAS_ASSETS_SUFFIX.length + 1) return false;
  if (name.length > 180) return false;
  if (/[\u0000-\u001f\\/]/.test(name) || name.includes("..")) return false;
  const suffix = `${HZCANVAS_EXTENSION}${HZCANVAS_ASSETS_SUFFIX}`;
  if (!name.endsWith(suffix)) return false;
  const prefix = name.slice(0, -suffix.length);
  return prefix.length > 0 && prefix !== "." && prefix !== ".." && !prefix.endsWith(".");
}

/**
 * Asset paths are relative to the assets directory.
 * Reject absolute paths, drive letters, and any `..` segment.
 */
export function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.length > 512) return false;
  if (value.includes("\\") || value.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  if (/[\u0000-\u001f]/.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}
