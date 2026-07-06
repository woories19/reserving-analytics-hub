import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/reserving-analytics-hub/',
  build: {
    chunkSizeWarningLimit: 1500, // Suppress warnings for heavy client-side libraries (xlsx, jspdf, html2canvas)
  }
})
