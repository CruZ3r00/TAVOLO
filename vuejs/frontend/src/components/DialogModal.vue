<script setup>
import Modal from './Modal.vue';

const emit = defineEmits(['close']);

defineProps({
    show: {
        type: Boolean,
        default: false,
    },
    maxWidth: {
        type: String,
        default: '2xl',
    },
    closeable: {
        type: Boolean,
        default: true,
    },
});

const close = () => {
    emit('close');
};
</script>

<template>
    <Modal
        :show="show"
        :max-width="maxWidth"
        :closeable="closeable"
        @close="close"
    >
        <template #title>
            <div class="dialog-title">
                <slot name="title" />
            </div>
        </template>

        <template #body>
            <div class="dialog-content">
                <slot name="content" />
            </div>

            <div v-if="$slots.footer" class="dialog-footer">
                <slot name="footer" />
            </div>
        </template>
    </Modal>
</template>

<style scoped>
.dialog-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
}

.dialog-content {
    color: var(--color-text-secondary);
    font-size: var(--text-base);
    line-height: var(--leading-relaxed);
}

.dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
}
</style>
