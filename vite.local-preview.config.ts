// Temporary local-preview config. Forwards the runtime-config and invitation
// routes to a locally running Access service so the browser sees one origin.
// Delete this file after the preview session; it is not part of the product.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const accessService = 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    proxy: {
      '/api': { target: accessService, changeOrigin: false },
      '/auth': { target: accessService, changeOrigin: false },
      '/access': { target: accessService, changeOrigin: false },
    },
  },
})
