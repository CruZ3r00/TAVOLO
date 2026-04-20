<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
    show: { type: Boolean, default: false },
    wide: { type: Boolean, default: false },
    slim: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const dialog = ref();
const showSlot = ref(props.show);

watch(() => props.show, () => {
    if (props.show) {
        document.body.style.overflow = 'hidden';
        showSlot.value = true;
    } else {
        document.body.style.overflow = null;
        setTimeout(() => { showSlot.value = false; }, 200);
    }
});

const closeOnEscape = (e) => {
    if (e.key === 'Escape' && props.show) {
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
          class="modal-bg"
          ref="dialog"
          @click.self="emit('close')"
          role="dialog"
          aria-modal="true"
        >
          <div class="modal" :class="{ wide, slim }">
            <div class="modal-h">
              <slot v-if="showSlot" name="title" />
              <button type="button" class="modal-close" @click="emit('close')" aria-label="Chiudi">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <div class="modal-b">
              <slot v-if="showSlot" name="body"/>
            </div>
            <div v-if="$slots.footer" class="modal-f">
              <slot v-if="showSlot" name="footer" />
            </div>
          </div>
        </div>
    </Transition>
</template>
