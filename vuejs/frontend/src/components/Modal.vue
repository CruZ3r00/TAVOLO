<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';

//props utilizzato per gestire la visualizzazione
const props = defineProps({
    show: {
        type: Boolean,
        default: false,
    },
});

//emit per chiudere il modale
const emit = defineEmits(['close']);

//variabili ref per gestire il comportamento reattivo
const dialog = ref();
const showSlot = ref(props.show); 

//watch dei props, quando cambiano allora eseguo
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

// funzione che gestice la chiusura premendo esc
const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        emit('close');
    }
};

// listener di tastiera per quando si preme un tasto
onMounted(() => document.addEventListener('keydown', closeOnEscape));

//rimuovo il listener quando il componente viene smontato
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
          <!-- Header con bottone di chiusura e possibilita di inserire un titolo -->
          <div class="modal-header">
            <slot v-if="showSlot" name="title" />
            <button type="button" class="btn-close" @click="$emit(close)" aria-label="Close"></button>
          </div>
  
          <!-- Contenuto -->
          <div class="modal-body">
            <slot v-if="showSlot" name="body"/>
          </div>
        </div>
      </div>
    </div>
</template>
