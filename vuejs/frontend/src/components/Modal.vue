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
    <Teleport to="body">
        <Transition name="scale">
            <div
              v-if="show"
              class="modal-bg modal-bg--centered"
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
    </Teleport>
</template>

<style>
/* Forza il centramento globale: alcuni layout (grid containers) possono
   creare un containing block per position:fixed quando ci sono filtri
   o transform sugli ancestor. Questa regola garantisce che il backdrop
   sia sempre rispetto al viewport. */
.modal-bg.modal-bg--centered {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    margin: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    place-items: center !important;
    z-index: 800;
}
.modal-bg.modal-bg--centered > .modal {
    margin: auto !important;
}
.scale-enter-active, .scale-leave-active {
    transition: opacity 180ms ease, transform 180ms ease;
}
.scale-enter-from, .scale-leave-to {
    opacity: 0;
}
.scale-enter-from .modal, .scale-leave-to .modal {
    transform: translateY(8px) scale(0.98);
}
</style>
