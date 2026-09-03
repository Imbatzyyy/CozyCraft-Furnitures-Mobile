import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Isolated UI fixture: this config never participates in the app build.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@supabase/supabase-js": fileURLToPath(new URL("./mock-supabase.ts", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5174, strictPort: true, fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
})
