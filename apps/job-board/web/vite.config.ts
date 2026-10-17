import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const designSystem = fileURLToPath(new URL('../../../design-system', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@boromtech/design-system': designSystem } },
  server: { fs: { allow: ['../../..'] } },
})
