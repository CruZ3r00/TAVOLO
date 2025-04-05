<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

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

const close = () => {
    emit('close');
};

const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        close();
    }
};

onMounted(() => document.addEventListener('keydown', closeOnEscape));

onUnmounted(() => {
    document.removeEventListener('keydown', closeOnEscape);
    document.body.style.overflow = null;
});
</script>

<template>
    <div
      class="modal fade show d-block"
      tabindex="-1"
      role="dialog"
      ref="dialog"
      @click.self="close"
      style="background: rgba(0,0,0,0.5);"
      v-if="show"
    >
      <div class="modal-dialog modal-dialog-centered" :class="maxWidthClass" role="document">
        <div class="modal-content">
          <!-- Header con bottone di chiusura -->
          <div class="modal-header">
            <slot v-if="showSlot" name="title" />
            <button type="button" class="btn-close" @click="close" aria-label="Close"></button>
          </div>
  
          <!-- Contenuto -->
          <div class="modal-body">
            <slot v-if="showSlot" name="body"/>
          </div>
        </div>
      </div>
    </div>
</template>
