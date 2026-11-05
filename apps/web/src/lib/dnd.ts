export const NODE_DRAG_MIME = "application/x-hzcanvas-node";

let pendingType: string | null = null;

export function beginNodeDrag(dataTransfer: DataTransfer, nodeType: string): void {
  pendingType = nodeType;
  dataTransfer.setData(NODE_DRAG_MIME, nodeType);
  dataTransfer.setData("text/plain", nodeType);
  dataTransfer.effectAllowed = "copy";
}

export function endNodeDrag(): void {
  pendingType = null;
}

export function isNodeDrag(dataTransfer: DataTransfer): boolean {
  return pendingType !== null || Array.from(dataTransfer.types).includes(NODE_DRAG_MIME);
}

/** `getData` is empty during dragover in some browsers; the drop event can read it. */
export function nodeDragType(dataTransfer: DataTransfer): string | null {
  const custom = dataTransfer.getData(NODE_DRAG_MIME);
  if (custom) return custom;
  if (pendingType) return pendingType;
  const plain = dataTransfer.getData("text/plain");
  return plain || null;
}
