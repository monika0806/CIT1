import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// VITE_API_URL: Set this in Cloudflare Pages → Settings → Environment Variables
// to your Render backend URL, e.g. https://roadpulseai-backend.onrender.com
export default defineConfig({
  plugins: [react()],
  define: {
    // Expose backend URL to the app at build time
    '__API_BASE__': JSON.stringify(
      process.env.VITE_API_URL || 'http://127.0.0.1:5000'
    )
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/video_feed': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/static': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../web/dist',
    emptyOutDir: true
  }
})
