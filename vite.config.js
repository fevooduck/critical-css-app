import { defineConfig } from "vite"

export default defineConfig({
  server: {
    port: 8000,
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
})
