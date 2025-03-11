<script setup>
import { defineProps } from 'vue';

const props = defineProps({
    value: String,
});

</script>

<template>
    <label class="block font-medium text-sm text-gray-700">
        <span v-if="props.value">{{ props.value }}</span>
        <span v-else><slot /></span>
    </label>
</template>
