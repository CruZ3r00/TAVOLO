// Build target: gestionale operativo per browser molto vecchi (Chrome 37+, IE11, Android 4.4+, SeaMonkey vecchi).
// Usa Vue 2.7 al posto di Vue 3 perche' Vue 3 richiede `Proxy`, non polyfillabile.
// Stessi sorgenti `.vue` del modern build dove possibile (Vue 2.7 supporta Composition API + <script setup>
// via unplugin-vue2-script-setup).

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { createVuePlugin as vue2 } from 'vite-plugin-vue2'
import scriptSetup from 'unplugin-vue2-script-setup/vite'
import legacy from '@vitejs/plugin-legacy'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// `vite-plugin-vue2` usa `@vue/component-compiler-utils` (Vue 2.6 era) e NON
// risolve i binding di `<script setup>` nei template — i componenti referenziati
// nel template diventano string tag (`_c('AppLayout',...)` → tag HTML vuoto).
// `unplugin-vue2-script-setup` trasforma i `<script setup>` blocchi in
// `defineComponent` con `components: { ... }` esplicito, cosi i binding diventano
// veri component reference.

// Plugin custom: rinomina `dist/legacy/index.legacy.html` -> `dist/legacy/index.html`
// cosi static server tipo `npx serve dist/legacy` lo trovano come default index.
const renameLegacyHtml = () => {
  let outDir = 'dist/legacy';
  return {
    name: 'rename-legacy-html',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const dir = path.isAbsolute(outDir) ? outDir : path.resolve(process.cwd(), outDir);
      const src = path.join(dir, 'index.legacy.html');
      const dst = path.join(dir, 'index.html');
      try {
        await fs.access(src);
        await fs.rename(src, dst);
      } catch (_e) { /* niente da rinominare */ }
    },
  };
};

// In dev Vite serve sempre `index.html` come fallback SPA se non gli diciamo
// esplicitamente il contrario. Per il legacy build quello rompe tutto: carica
// `src/main.js` (Vue 3) mentre gli alias risolvono `vue` a Vue 2.
const legacyDevHtmlFallback = () => ({
  name: 'legacy-dev-html-fallback',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
        next();
        return;
      }

      const accept = req.headers.accept || '';
      const wantsHtml = accept.includes('text/html') || accept.includes('*/*');
      const pathname = req.url.split('?')[0];
      const isViteInternal = pathname.startsWith('/@')
        || pathname.startsWith('/__vite')
        || pathname.startsWith('/node_modules/')
        || pathname.startsWith('/src/');

      if (wantsHtml && !isViteInternal && !path.posix.extname(pathname)) {
        req.url = '/index.legacy.html';
      }

      next();
    });
  },
});

export default defineConfig({
  base: '/',
  define: {
    __VUE_BUILD__: JSON.stringify('legacy'),
    __MODERN__: 'false',
  },
  plugins: [
    legacyDevHtmlFallback(),
    scriptSetup({}),
    vue2(),
    renameLegacyHtml(),
    legacy({
      targets: [
        'chrome >= 37',
        'android >= 4.4',
        'ios_saf >= 8',
        'safari >= 8',
        'firefox >= 38',
        'ie >= 11',
        'edge >= 12',
        'samsung >= 4',
        'opera >= 24',
      ],
      polyfills: true,
      modernPolyfills: false,
      renderLegacyChunks: true,
      additionalLegacyPolyfills: [
        'regenerator-runtime/runtime',
        'whatwg-fetch',
        'intersection-observer',
        'url-search-params-polyfill',
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Vue 2.7 al posto di Vue 3 (composition API + <script setup> supportati).
      vue: 'vue2',
      // vue-router e vuex usano shim che re-esportano dalle versioni 3 + aggiungono
      // `useRoute`/`useRouter`/`useStore` mancanti (esistono solo in V4).
      'vue-router': fileURLToPath(new URL('./src/lib/compat/vue-router-shim.js', import.meta.url)),
      vuex: fileURLToPath(new URL('./src/lib/compat/vuex-shim.js', import.meta.url)),
      // Stub no-op per librerie Vue 3-only sul legacy. Le funzionalita' (head
      // tags, animazioni) sono gestite altrove o escluse per scelta.
      '@vueuse/head': fileURLToPath(new URL('./src/lib/compat/vueuse-head-stub.js', import.meta.url)),
      '@vueuse/motion': fileURLToPath(new URL('./src/lib/compat/vueuse-motion-stub.js', import.meta.url)),
    },
    dedupe: ['vue2', 'vue-router2', 'vuex2'],
  },
  optimizeDeps: {
    include: ['vue2', 'vue-router2', 'vuex2'],
    exclude: ['@vueuse/head', '@vueuse/motion', '@vueuse/core', '@vueuse/shared'],
  },
  build: {
    target: 'es2015',
    cssTarget: 'chrome37',
    rollupOptions: {
      input: fileURLToPath(new URL('./index.legacy.html', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5175,
  },
})
