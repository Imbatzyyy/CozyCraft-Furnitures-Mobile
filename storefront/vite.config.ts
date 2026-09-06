import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    target: ["es2022", "safari16", "chrome107"],
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined
          if (id.includes("heic-to")) return "review-heic-decoder"
          if (id.includes("@supabase") || id.includes("realtime-js") || id.includes("postgrest-js")) return "vendor-supabase"
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react"
          return "vendor"
        },
      },
    },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 5173, strictPort: true },
})
