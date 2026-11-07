import type { PortDataType } from "@haizhu/canvas-core";

/** Locked port colors from docs/design/MASTER.md. Dots and edges only. */
export const portColor: Record<PortDataType, string> = {
  text: "#38BDF8",
  image: "#A78BFA",
  video: "#F472B6",
  audio: "#34D399",
  storyboard: "#FBBF24",
};
