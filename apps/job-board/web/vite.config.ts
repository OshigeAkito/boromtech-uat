import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const designSystem = fileURLToPath(new URL('../../../design-system', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@boromtech/design-system': designSystem } },
  server: {
    fs: { allow: ['../../..'] },
    // The Go service (apps/job-board/api, `go run .`) listens on :8080. Proxying straight to it keeps the
    // browser on one origin, so cookies and the Origin check behave as in production; the edge Worker only
    // forwards /api in production and isn't needed here. Vite keeps the Origin header (no changeOrigin).
    proxy: { '/api': 'http://localhost:8080' },
  },
})
