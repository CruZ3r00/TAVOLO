<script setup>
import { computed } from 'vue';

const props = defineProps({
  message: { type: String, default: '' },
});

const hasError = computed(() => (props.message || '').trim() !== '');
</script>

<template>
    <Transition name="fade">
        <div v-if="hasError" class="form-error" role="alert">
            <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
            <span>{{ message }}</span>
        </div>
    </Transition>
</template>

<style scoped>
.form-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  color: var(--dan);
}
.form-error i { font-size: 13px; }
.fade-enter-active, .fade-leave-active { transition: opacity 160ms, transform 160ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-2px); }
</style>
