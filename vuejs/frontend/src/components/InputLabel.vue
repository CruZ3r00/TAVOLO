<script setup>
defineProps({
    value: String,
});
</script>

<template>
    <label class="field-label">
        <span v-if="value">{{ value }}</span>
        <span v-else><slot /></span>
    </label>
</template>

<style scoped>
.field-label {
  display: block;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}
</style>
