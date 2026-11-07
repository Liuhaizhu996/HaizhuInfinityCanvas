import type { NodeRunStatus } from "@/lib/engine-client";

export const runStatusLabel: Record<NodeRunStatus, string> = {
  pending: "等待",
  running: "运行中",
  succeeded: "完成",
  failed: "失败",
  cancelled: "已取消",
  skipped: "已跳过",
};

export function runStatusClass(status: NodeRunStatus): string {
  switch (status) {
    case "running":
      return "text-primary";
    case "succeeded":
      return "text-success";
    case "failed":
      return "text-danger";
    default:
      return "text-muted-foreground";
  }
}
