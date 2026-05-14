<script setup>
// Modale di conferma per annullare un OrderItem gia' in lavorazione/servito.
// Richiede obbligatoriamente una motivazione (textarea, min 2 caratteri).
// L'annullamento e' irreversibile: non altera lo storico, viene tracciato
// nel daily stat (voided_count / voided_revenue_lost) e -- se l'item era
// gia served -- genera movimenti compensativi di magazzino.

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TeleportCompat from '@/lib/compat/teleport.js';

const props = defineProps({
  show: { type: Boolean, default: false },
  item: { type: Object, default: null },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['confirm', 'cancel']);

const reason = ref('');
const reasonError = ref('');
const textareaRef = ref(null);

const lineTotal = computed(() => {
  if (!props.item) return '0.00';
  const p = parseFloat(props.item.price) || 0;
  const q = parseInt(props.item.quantity, 10) || 0;
  return (p * q).toFixed(2);
});

const isServed = computed(() => props.item && props.item.status === 'served');

watch(() => props.show, async (v) => {
  if (v) {
    reason.value = '';
    reasonError.value = '';
    await nextTick();
    if (textareaRef.value) textareaRef.value.focus();
  }
});

let savedOverflow = '';
onMounted(() => {
  savedOverflow = document.body.style.overflow;
});
onBeforeUnmount(() => { document.body.style.overflow = savedOverflow; });
watch(() => props.show, (v) => {
  document.body.style.overflow = v ? 'hidden' : savedOverflow;
});

const onConfirm = () => {
  const trimmed = String(reason.value || '').trim();
  if (trimmed.length < 2) {
    reasonError.value = 'Indica una motivazione (almeno 2 caratteri).';
    return;
  }
  if (trimmed.length > 500) {
    reasonError.value = 'Motivazione troppo lunga (max 500).';
    return;
  }
  emit('confirm', trimmed);
};

const onCancel = () => {
  if (props.busy) return;
  emit('cancel');
};
</script>

<template>
  <TeleportCompat to="body">
    <div v-if="show" class="vim-overlay" role="dialog" aria-modal="true" @click.self="onCancel">
      <div class="vim-card">
        <header class="vim-head">
          <div>
            <h3>
              <i class="bi bi-exclamation-triangle"></i>
              Annulla elemento
            </h3>
            <p class="vim-sub" v-if="item">
              <strong>{{ item.name }}</strong>
              <span class="vim-meta">x{{ item.quantity }} &middot; &euro; {{ lineTotal }}</span>
            </p>
          </div>
          <button class="vim-close" :disabled="busy" @click="onCancel" aria-label="Chiudi">
            <i class="bi bi-x-lg"></i>
          </button>
        </header>

        <section class="vim-body">
          <p class="vim-warn">
            <i class="bi bi-info-circle"></i>
            <span v-if="isServed">
              L'elemento e' stato gia servito. L'annullamento generera' un
              movimento compensativo di magazzino e una perdita registrata
              nel report giornaliero.
            </span>
            <span v-else>
              L'annullamento e' definitivo. L'elemento rimane in archivio
              per il report giornaliero (perdite), ma non concorrera' al totale.
            </span>
          </p>

          <label class="vim-field">
            <span class="vim-label">Motivazione (obbligatoria)</span>
            <textarea
              ref="textareaRef"
              v-model="reason"
              class="vim-textarea"
              rows="3"
              maxlength="500"
              placeholder="Es. Cliente ha cambiato idea, piatto bruciato in cucina, allergia segnalata in ritardo..."
              :disabled="busy"
            ></textarea>
            <small class="vim-counter">{{ reason.length }}/500</small>
          </label>

          <p v-if="reasonError" class="vim-error">
            <i class="bi bi-exclamation-circle"></i>
            <span>{{ reasonError }}</span>
          </p>
        </section>

        <footer class="vim-foot">
          <button class="ds-btn ds-btn-ghost" :disabled="busy" @click="onCancel">Annulla</button>
          <button class="ds-btn ds-btn-destructive" :disabled="busy" @click="onConfirm">
            <i v-if="busy" class="bi bi-arrow-repeat vim-spin"></i>
            <i v-else class="bi bi-x-circle"></i>
            <span>Conferma annullamento</span>
          </button>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
.vim-overlay {
  position: fixed; inset: 0; z-index: 8700;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.vim-card {
  background: var(--paper, #fff);
  color: var(--ink);
  border-radius: 12px;
  width: 100%;
  max-width: 520px;
  max-height: 92vh;
  overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 64px rgba(0,0,0,0.3);
  border: 1px solid var(--line);
}
.vim-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  gap: 12px;
}
.vim-head h3 {
  margin: 0 0 4px;
  font-size: 16px; font-weight: 700;
}
.vim-head h3 i { color: #d97706; margin-right: 6px; }
.vim-sub { margin: 0; font-size: 13px; color: var(--ink-2); }
.vim-meta { margin-left: 6px; color: var(--ink-3); font-family: var(--f-mono, monospace); }
.vim-close {
  appearance: none; background: transparent; border: none;
  cursor: pointer; padding: 4px; color: var(--ink-3);
}

.vim-body {
  padding: 16px 20px;
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: 12px;
}
.vim-warn {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 10px;
  background: color-mix(in oklab, #d97706 10%, var(--paper));
  color: #92400e;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.4;
  margin: 0;
}
.vim-warn i { color: #d97706; margin-top: 2px; flex-shrink: 0; }

.vim-field {
  display: flex; flex-direction: column; gap: 4px;
}
.vim-label {
  font-size: 11px; font-weight: 600;
  color: var(--ink-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.vim-textarea {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  font: inherit;
  font-size: 14px;
  background: var(--paper);
  color: var(--ink);
  resize: vertical;
  min-height: 72px;
}
.vim-textarea:focus {
  outline: none;
  border-color: var(--ac);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac) 20%, transparent);
}
.vim-counter {
  align-self: flex-end;
  font-size: 11px;
  color: var(--ink-3);
}

.vim-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 10px;
  background: color-mix(in oklab, #dc2626 12%, var(--paper));
  color: #b91c1c;
  border-radius: 6px;
  font-size: 13px;
  margin: 0;
}

.vim-foot {
  padding: 12px 20px;
  border-top: 1px solid var(--line);
  display: flex; justify-content: flex-end; gap: 8px;
  background: var(--bg-2);
}
.vim-spin {
  animation: vim-spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes vim-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
