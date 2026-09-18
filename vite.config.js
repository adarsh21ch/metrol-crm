import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(dir, 'src/react') } },
  /* Vite does not read PORT on its own — it goes straight to 5173 and fails
     if that is taken. Honouring it lets a tool that hands us a free port
     (the Claude Code preview pane, and any CI or sandbox that does the same)
     actually place the server where it said. strictPort only when PORT was
     given: if that exact port is gone we want a loud failure, not a server
     quietly listening somewhere nobody is looking. Nothing changes for
     `npm run dev` by hand — that is still 5173. */
  server: process.env.PORT
    ? { port: Number(process.env.PORT), strictPort: true }
    : { port: 5173 },
  build: {
    rollupOptions: {
      // index.html is the React app. legacy.html is the vanilla build it
      // replaced, kept reachable for a little while as a fallback — delete it
      // (and src/app.js) once nobody has needed it.
      input: {
        main: path.resolve(dir, 'index.html'),
        legacy: path.resolve(dir, 'legacy.html'),
      },
    },
  },
})
