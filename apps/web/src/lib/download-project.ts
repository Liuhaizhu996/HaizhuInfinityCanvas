import {
  assetsDirectoryForProjectFile,
  projectFileName,
  serializeProject,
  type ProjectDocument,
} from "@haizhu/canvas-core";

export function projectDownload(project: ProjectDocument): {
  fileName: string;
  directory: string;
  body: string;
} {
  const fileName = projectFileName(project.graph.name);
  const directory = assetsDirectoryForProjectFile(fileName);
  const document: ProjectDocument = {
    ...project,
    assets: { ...project.assets, directory },
  };
  return { fileName, directory, body: serializeProject(document) };
}

export function downloadTextFile(fileName: string, body: string): void {
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
