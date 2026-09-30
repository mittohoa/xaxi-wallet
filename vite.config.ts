import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { buildVersion } from './scripts/version.mjs'

// base='./' -> chay duoc ca tren GitHub Pages (sub-path), Tauri va Capacitor (file://)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
  /*
   * So hieu ban dung, sinh tu git luc build.
   *
   * Truoc day chan man hinh Cai dat ghi cung "phien ban 1.0", nen moi ban deu
   * giong nhau va khong ai noi duoc may dang chay ban nao.
   */
  define: { __APP_VERSION__: JSON.stringify(buildVersion().full) },
  server: { port: 5173, strictPort: false },
})
