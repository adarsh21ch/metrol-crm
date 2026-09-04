import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(dir, 'src/react') } },
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
