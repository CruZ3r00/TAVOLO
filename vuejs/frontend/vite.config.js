import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Modern build (Vue 3, evergreen browsers).
// Per il fallback su browser vecchissimi vedi vite.config.legacy.mjs (Vue 2.7) — sono
// due build separate, in produzione la scelta avviene tramite UA-detect server-side
// o tramite bootstrap shell (vedi todo.md, Fase 3).
export default defineConfig({
  base: '/',
  define: {
    __VUE_BUILD__: JSON.stringify('modern'),
    __MODERN__: 'true',
  },
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
  },
  server: {
    host: true, // aggiunto questo per farlo vedere in rete locale
    port: 5174,
  },
})
