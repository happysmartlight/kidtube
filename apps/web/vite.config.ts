import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Che do dev: goi API sang backend that, khong mock.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8099', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8099', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // Pi 5 co CPU vua phai — sourcemap lam build cham va phong dist.
    sourcemap: false,
    target: 'es2019', // san Chromium 79 (LG webOS 6.0): thieu ?. va ??
  },
})
