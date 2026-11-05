import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "@haizhu/canvas-core": path.resolve(root, "../../packages/canvas-core/src/index.ts"),
      "@haizhu/node-sdk": path.resolve(root, "../../packages/node-sdk/src/index.ts"),
      "@haizhu/ui": path.resolve(root, "../../packages/ui/src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
