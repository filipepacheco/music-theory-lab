import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "https://music-theory-lab-tau.vercel.app",
        changeOrigin: true,
      },
      // Local-only intake service (audio-library-intake). Kept off /api,
      // which already belongs to the deployed sync endpoints above. Nothing
      // proxies it in a production build - the module is dev-gated.
      "/intake": {
        target: "http://127.0.0.1:8756",
        changeOrigin: false,
      },
    },
  },
});
