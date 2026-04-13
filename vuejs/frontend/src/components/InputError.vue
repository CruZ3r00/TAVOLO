<script setup>
import { computed, defineProps } from 'vue';

const props = defineProps({
  message: {
    type: String,
    default: '',
  },
});

const hasError = computed(() => props.message.trim() !== '');
</script>

<template>
    <Transition name="fade">
        <div v-if="hasError" class="input-error">
            <i class="bi bi-exclamation-circle"></i>
            <span>{{ message }}</span>
        </div>
    </Transition>
</template>

<style scoped>
.input-error {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-destructive);
}
</style>
