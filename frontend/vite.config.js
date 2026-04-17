import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3001,
    proxy: {
      '/api': { target: 'http://100.83.56.65:9001', changeOrigin: true, ws: true },
      '/uploads': { target: 'http://100.83.56.65:9001', changeOrigin: true },
      '/cropped': { target: 'http://100.83.56.65:9001', changeOrigin: true }
    }
  },
  preview: {
    port: 3001,
    proxy: {
      '/api': { target: 'http://127.0.0.1:9001', changeOrigin: true, ws: true },
      '/uploads': { target: 'http://127.0.0.1:9001', changeOrigin: true },
      '/cropped': { target: 'http://127.0.0.1:9001', changeOrigin: true }
    }
  }
})
