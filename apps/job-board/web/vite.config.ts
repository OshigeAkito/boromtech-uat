import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const designSystem = fileURLToPath(new URL('../../../design-system', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@boromtech/design-system': designSystem } },
  server: {
    fs: { allow: ['../../..'] },
    // `npm run dev -w job-board-gateway` runs the API on :8787. Proxying keeps the browser on one origin,
    // so the cookie and Origin checks behave as in production.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
