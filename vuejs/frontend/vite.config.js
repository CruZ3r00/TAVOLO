import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    vue(),
    legacy({
      targets: ['Firefox >= 52', 'Chrome >= 49', 'Safari >= 10.1', 'Edge >= 18'],
      polyfills: true,
      renderLegacyChunks: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    host: true, // aggiunto questo per farlo vedere in rete locale
    port: 5174,
  }
})
