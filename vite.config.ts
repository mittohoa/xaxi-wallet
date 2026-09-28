import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base='./' -> chay duoc ca tren GitHub Pages (sub-path), Tauri va Capacitor (file://)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
  server: { port: 5173, strictPort: false },
})
