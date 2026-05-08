<script setup>
import { computed, onMounted, ref } from 'vue';

// Compat Vue 3 / Vue 2.7: il default v-model di Vue 3 e' `modelValue`/`update:modelValue`,
// quello di Vue 2 e' `value`/`input`. Accettiamo entrambe le coppie cosi' il
// consumer puo' scrivere `<TextInput v-model="x"/>` invariato in entrambi i build.
const props = defineProps({
    modelValue: [String, Number],
    value: [String, Number],
    placeholder: { type: String, default: '' },
    type: { type: String, default: 'text' },
});

const emit = defineEmits(['update:modelValue', 'input']);

const inputRef = ref(null);

const currentValue = computed(() => (props.modelValue !== undefined ? props.modelValue : props.value));

const handleInput = (e) => {
    const v = e.target.value;
    emit('update:modelValue', v);
    emit('input', v);
};

onMounted(() => {
    if (inputRef.value && inputRef.value.hasAttribute('autofocus')) {
        inputRef.value.focus();
    }
});

defineExpose({ focus: () => inputRef.value?.focus() });
</script>

<template>
    <input
        ref="inputRef"
        class="input"
        :type="type"
        :value="currentValue"
        :placeholder="placeholder"
        @input="handleInput"
    >
</template>
