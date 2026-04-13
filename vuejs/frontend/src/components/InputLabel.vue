<script setup>
import { defineProps } from 'vue';

const props = defineProps({
    value: String,
});
</script>

<template>
    <label class="ds-label">
        <span v-if="props.value">{{ props.value }}</span>
        <span v-else><slot /></span>
    </label>
</template>
