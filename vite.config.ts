
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
})
