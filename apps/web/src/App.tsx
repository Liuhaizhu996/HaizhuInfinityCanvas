import { AgentLibrary } from "@/components/AgentLibrary";
import { Canvas } from "@/components/Canvas";
import { TopBar } from "@/components/TopBar";

export function App() {
  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <AgentLibrary />
        <Canvas />
      </div>
    </div>
  );
}
