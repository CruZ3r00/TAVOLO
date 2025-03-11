<script setup>
import { computed, defineProps } from 'vue';

// Props
const props = defineProps({
  message: {
    type: String,
    default: '', // Stringa vuota come valore predefinito
  },
});

// Computed per verificare se `message` è un errore
const hasError = computed(() => props.message.trim() !== '');
</script>

<template>
    <div v-if="hasError" class="error-message"> 
        <p class="text-sm text-red-600">
            {{ message }}
        </p>
    </div>
</template>

<style scoped>
.error-message {
  color: red;
  font-size: 14px;
}
</style>
