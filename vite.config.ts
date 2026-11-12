import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // Forwards room sockets to the local Worker started by `wrangler dev`.
    proxy: { "/ws": { target: "http://127.0.0.1:8787", ws: true } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
