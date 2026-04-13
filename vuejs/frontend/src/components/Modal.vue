<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
    show: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['close']);

const dialog = ref();
const showSlot = ref(props.show);

watch(() => props.show, () => {
    if (props.show) {
        document.body.style.overflow = 'hidden';
        showSlot.value = true;
        dialog.value?.showModal();
    } else {
        document.body.style.overflow = null;
        setTimeout(() => {
            dialog.value?.close();
            showSlot.value = false;
        }, 200);
    }
});

const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        emit('close');
    }
};

onMounted(() => document.addEventListener('keydown', closeOnEscape));

onUnmounted(() => {
    document.removeEventListener('keydown', closeOnEscape);
    document.body.style.overflow = null;
});
</script>

<template>
    <Transition name="scale">
        <div
          v-if="show"
          class="ds-overlay"
          ref="dialog"
          @click.self="emit('close')"
        >
          <div class="ds-modal">
            <div class="ds-modal-header">
              <slot v-if="showSlot" name="title" />
              <button type="button" class="modal-close-btn" @click="emit('close')">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            <div class="ds-modal-body">
              <slot v-if="showSlot" name="body"/>
            </div>
          </div>
        </div>
    </Transition>
</template>

<style scoped>
.modal-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: var(--text-md);
}

.modal-close-btn:hover {
    background: var(--color-bg-subtle);
    color: var(--color-text);
}
</style>
