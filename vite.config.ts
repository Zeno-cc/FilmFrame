
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx,js,mjs,cjs}'],
    exclude: ['tests/e2e/**'],
    // The physical/spectral suites are CPU-bound and block their worker for
    // seconds at a time, so an async test in a neighbouring file can be starved
    // past the 5s default and fail on scheduling rather than on behaviour.
    testTimeout: 30000,
  },
})
