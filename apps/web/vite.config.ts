import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Cong cua backend o che do dev.
 *
 * PHAI khop voi mac dinh trong apps/api/src/env.ts (PORT=8080). Truoc day
 * hardcode 8099 o day nen `npm run dev` hong: Vite proxy sang 8099 nhung
 * API lang nghe 8080.
 *
 * Doi cong: API_PORT=9000 npm run dev
 */
const API_PORT = process.env.API_PORT ?? '8080'
const API_TARGET = `http://127.0.0.1:${API_PORT}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Che do dev: goi API sang backend that, khong mock.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // Pi 5 co CPU vua phai — sourcemap lam build cham va phong dist.
    sourcemap: false,
    target: 'es2019', // san Chromium 79 (LG webOS 6.0): thieu ?. va ??
  },
})
