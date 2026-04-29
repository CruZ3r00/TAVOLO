<script setup>
defineProps({
  width: { type: String, default: '100%' },
  height: { type: String, default: '14px' },
  radius: { type: String, default: '6px' },
  circle: { type: Boolean, default: false },
});
</script>

<template>
  <span
    class="skel"
    :class="{ 'skel-circle': circle }"
    :style="{ width, height, borderRadius: circle ? '50%' : radius }"
    aria-hidden="true"
  />
</template>

<style scoped>
.skel {
  display: inline-block;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--ink) 6%, var(--paper)) 0%,
    color-mix(in oklab, var(--ink) 12%, var(--paper)) 50%,
    color-mix(in oklab, var(--ink) 6%, var(--paper)) 100%
  );
  background-size: 200% 100%;
  animation: skel-shimmer 1.4s ease-in-out infinite;
}
@keyframes skel-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
