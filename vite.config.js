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
      // Two entries on purpose: index.html is the vanilla build that is live
      // right now, app.html is the React port. They swap at cutover, so the
      // working version is never the thing under construction.
      input: {
        main: path.resolve(dir, 'index.html'),
        app: path.resolve(dir, 'app.html'),
      },
    },
  },
})
