<script setup>
defineProps({
    type: {
        type: String,
        default: 'button',
    },
});
</script>

<template>
    <button :type="type" class="ds-btn ds-btn-secondary">
        <slot />
    </button>
</template>
