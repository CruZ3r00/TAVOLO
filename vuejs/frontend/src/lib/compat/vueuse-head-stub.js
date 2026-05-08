// Stub no-op di `@vueuse/head` per il legacy build (Vue 2.7).
// Il modulo originale richiede API specifiche di Vue 3 che non esistono in
// Vue 2.7 (`hasInjectionContext`, ecc). Su legacy la gestione di <title>/<meta>
// avviene via manipolazione DOM diretta in `lib/compat/head.js`.

export function useHead() { /* no-op */ }
export function createHead() {
  return { install() { /* no-op */ } };
}
export default { useHead, createHead };
