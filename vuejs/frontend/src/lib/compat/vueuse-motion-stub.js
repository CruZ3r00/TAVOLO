// Stub no-op di `@vueuse/motion` per il legacy build (Vue 2.7).
// Sul legacy le animazioni sono escluse per scelta — il plugin non viene
// installato (vedi main.legacy.js).

export const MotionPlugin = { install() { /* no-op */ } };
export const useMotion = () => ({});
export default MotionPlugin;
