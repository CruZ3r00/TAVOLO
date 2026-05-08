// Teleport compat shim — Vue 3 ha <Teleport>; Vue 2.7 no.
//
// Uso nei componenti:
//   <script setup>
//   import TeleportCompat from '@/lib/compat/teleport.js'
//   </script>
//   <template>
//     <TeleportCompat to="body">
//       <div class="modal">...</div>
//     </TeleportCompat>
//   </template>
//
// Sul modern build risolve a `<Teleport>` nativo. Sul legacy build wrappa il
// contenuto in un <div> e lo sposta su `document.body` (o `props.to`) dopo il
// mount. Cleanup automatico al beforeDestroy.

import * as Vue from 'vue';

// eslint-disable-next-line no-undef
const isModern = typeof __MODERN__ !== 'undefined' ? __MODERN__ : true;

const Vue2TeleportFallback = {
  name: 'TeleportCompat',
  props: {
    to: { type: String, default: 'body' },
    disabled: { type: Boolean, default: false },
  },
  mounted() {
    if (this.disabled) return;
    const target = (this.to && document.querySelector(this.to)) || document.body;
    if (this.$el && target && this.$el.parentNode !== target) {
      try {
        target.appendChild(this.$el);
      } catch (_e) { /* niente da fare */ }
    }
  },
  beforeDestroy() {
    if (this.$el && this.$el.parentNode) {
      try {
        this.$el.parentNode.removeChild(this.$el);
      } catch (_e) { /* niente da fare */ }
    }
  },
  render(h) {
    return h('div', { staticClass: 'teleport-compat-wrapper' }, this.$slots.default);
  },
};

const TeleportCompat = isModern && Vue.Teleport ? Vue.Teleport : Vue2TeleportFallback;

export default TeleportCompat;
