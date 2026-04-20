<script setup>
import { computed } from 'vue';

const emit = defineEmits(['update:checked']);

const props = defineProps({
    checked: { type: [Array, Boolean], default: false },
    value: { type: String, default: null },
});

const proxyChecked = computed({
    get() { return props.checked; },
    set(val) { emit('update:checked', val); },
});
</script>

<template>
    <input
        v-model="proxyChecked"
        type="checkbox"
        :value="value"
        class="tavolo-check"
    >
</template>

<style scoped>
.tavolo-check {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--line);
  border-radius: 5px;
  background: var(--paper);
  cursor: pointer;
  position: relative;
  transition: border-color 120ms, background 120ms;
  flex-shrink: 0;
}
.tavolo-check:hover { border-color: var(--ink-3); }
.tavolo-check:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac) 25%, transparent);
  border-color: var(--ac);
}
.tavolo-check:checked {
  background: var(--ac);
  border-color: var(--ac);
}
.tavolo-check:checked::after {
  content: "";
  position: absolute;
  top: 2px; left: 5px;
  width: 5px; height: 9px;
  border: solid var(--paper);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
</style>
