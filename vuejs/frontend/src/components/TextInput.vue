<script setup>
import { onMounted, ref, defineProps, defineEmits, defineExpose } from 'vue';

const props = defineProps({
    modelValue: String,
    placeholder: {
        type: String,
        default: '',
    },
});

defineEmits(['update:modelValue']);

const input = ref(null);

onMounted(() => {
    if (input.value.hasAttribute('autofocus')) {
        input.value.focus();
    }
});

defineExpose({ focus: () => input.value.focus() });
</script>

<template>
    <input
        ref="input"
        class="ds-input"
        :value="modelValue"
        :placeholder="props.placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
    >
</template>
