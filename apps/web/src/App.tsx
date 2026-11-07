import { useEffect, type CSSProperties } from "react";
import { AgentLibrary } from "@/components/AgentLibrary";
import { Canvas } from "@/components/Canvas";
import { Inspector } from "@/components/Inspector";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TopBar } from "@/components/TopBar";
import { chrome } from "@/lib/chrome";
import { useCanvasStore } from "@/store/canvas";
import { useRunStore } from "@/store/run";

const frame = {
  "--hz-top": `${chrome.top}px`,
  "--hz-library": `${chrome.library}px`,
  "--hz-inspector": `${chrome.inspector}px`,
} as CSSProperties;

export function App() {
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const refreshHealth = useRunStore((state) => state.refreshHealth);

  useEffect(() => {
    void refreshHealth();
    const id = window.setInterval(() => void refreshHealth(), 5000);
    return () => window.clearInterval(id);
  }, [refreshHealth]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  return (
    <div className="relative h-full overflow-hidden bg-background text-foreground" style={frame}>
      <Canvas />
      <TopBar />
      <AgentLibrary />
      <Inspector />
      <SettingsDialog />
    </div>
  );
}
