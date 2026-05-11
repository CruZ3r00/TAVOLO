// Head compat shim — astrae la gestione di <title> e <meta> tra:
//   - modern build: @vueuse/head v2 (Vue 3)
//   - legacy build: manipolazione diretta di document.title e <meta>
//
// API:
//   import { useHead } from '@/lib/compat/head'
//   useHead({ title: 'Pagina X', meta: [{ name: 'description', content: '...' }] })
//
// Nel legacy build, l'import statico `from '@vueuse/head'` qui sotto e' aliasato
// a `@/lib/compat/vueuse-head-stub.js` (vedi vite.config.legacy.mjs), quindi
// `nativeUseHead` e' un no-op. Applichiamo poi `applyHeadLegacy` per ottenere
// il comportamento atteso (titolo/meta aggiornati senza reattivita').

import { useHead as nativeUseHead } from '@vueuse/head';

// eslint-disable-next-line no-undef
const isModern = typeof __MODERN__ !== 'undefined' ? __MODERN__ : true;

function applyHeadLegacy(input) {
  const data = typeof input === 'function' ? input() : input;
  if (!data || typeof data !== 'object') return;

  if (typeof data.title === 'string') {
    document.title = data.title;
  }

  if (Array.isArray(data.meta)) {
    data.meta.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      const key = m.name ? 'name' : (m.property ? 'property' : null);
      if (!key) return;
      const sel = 'meta[' + key + '="' + m[key] + '"]';
      let el = document.querySelector(sel);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(key, m[key]);
        document.head.appendChild(el);
      }
      if (m.content != null) el.setAttribute('content', String(m.content));
    });
  }
}

export function useHead(input) {
  if (isModern) {
    return nativeUseHead(input);
  }
  applyHeadLegacy(input);
}

export default { useHead };
