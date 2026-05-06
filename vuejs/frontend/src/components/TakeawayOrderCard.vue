<script setup>
import { computed } from 'vue';

const props = defineProps({
  order: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  dailyNumber: { type: [Number, String], default: '?' },
});

const emit = defineEmits(['accept', 'reject', 'open', 'edit', 'send', 'pickup', 'checkout']);

const status = computed(() => props.order.takeaway_status || 'confirmed');
const itemsCount = computed(() => (props.order.items || []).reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 0), 0));
const total = computed(() => Number(props.order.total_amount || 0).toFixed(2));
const pickupTime = computed(() => {
  if (!props.order.pickup_at) return '';
  const d = new Date(props.order.pickup_at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
});
const customer = computed(() => props.order.customer_name || 'Cliente');
const isPending = computed(() => status.value === 'pending_acceptance');
const isConfirmed = computed(() => status.value === 'confirmed');
const isSent = computed(() => status.value === 'sent_to_departments');
const isReady = computed(() => status.value === 'ready');
const isPickedUp = computed(() => status.value === 'picked_up');
</script>

<template>
  <article class="tw-card" :class="[`tw-${status}`, { busy }]">
    <header class="tw-head">
      <span class="tw-pill" aria-label="Identificativo asporto">A{{ dailyNumber }}</span>
      <div class="tw-head-info">
        <h3>{{ customer }}</h3>
      </div>
      <span class="tw-time"><i class="bi bi-clock"></i>{{ pickupTime || '--:--' }}</span>
    </header>

    <div class="tw-meta">
      <span v-if="order.customer_phone"><i class="bi bi-telephone"></i>{{ order.customer_phone }}</span>
      <span><i class="bi bi-receipt"></i>{{ itemsCount }} pezzi</span>
      <span><i class="bi bi-cash-coin"></i>&euro; {{ total }}</span>
    </div>

    <p v-if="isPending" class="tw-note pending">
      Richiesta da accettare. La risposta invierà una mail al cliente.
    </p>
    <p v-else-if="isConfirmed" class="tw-note">
      Non ancora inviato ai reparti.
    </p>
    <p v-else-if="isSent" class="tw-note">
      In lavorazione nei reparti.
    </p>
    <p v-else-if="isReady" class="tw-note ready">
      Pronto da ritirare in cucina.
    </p>
    <p v-else-if="isPickedUp" class="tw-note ready">
      Ritirato dalla cucina. Conto da chiudere.
    </p>

    <div class="tw-actions">
      <template v-if="isPending">
        <button type="button" class="ds-btn ds-btn-secondary" :disabled="busy" @click="emit('open', order)">
          <i class="bi bi-pencil-square"></i><span>Ordine</span>
        </button>
        <button type="button" class="ds-btn ds-btn-ghost" :disabled="busy" @click="emit('edit', order)">
          <i class="bi bi-calendar2-event"></i><span>Dati</span>
        </button>
        <button type="button" class="ds-btn ds-btn-primary" :disabled="busy" @click="emit('accept', order)">
          <i class="bi bi-check2-circle"></i><span>Accetta</span>
        </button>
        <button type="button" class="ds-btn ds-btn-ghost" :disabled="busy" @click="emit('reject', order)">
          <i class="bi bi-x-circle"></i><span>Rifiuta</span>
        </button>
      </template>
      <template v-else-if="isConfirmed">
        <button type="button" class="ds-btn ds-btn-secondary" :disabled="busy" @click="emit('open', order)">
          <i class="bi bi-pencil-square"></i><span>Ordine</span>
        </button>
        <button type="button" class="ds-btn ds-btn-ghost" :disabled="busy" @click="emit('edit', order)">
          <i class="bi bi-calendar2-event"></i><span>Dati</span>
        </button>
        <button type="button" class="ds-btn ds-btn-primary" :disabled="busy" @click="emit('send', order)">
          <i class="bi bi-send"></i><span>Invia</span>
        </button>
      </template>
      <template v-else-if="isSent">
        <button type="button" class="ds-btn ds-btn-secondary" :disabled="busy" @click="emit('open', order)">
          <i class="bi bi-eye"></i><span>Apri</span>
        </button>
      </template>
      <template v-else-if="isReady">
        <button type="button" class="ds-btn ds-btn-primary" :disabled="busy" @click="emit('pickup', order)">
          <i class="bi bi-box-arrow-up"></i><span>Preso dalla cucina</span>
        </button>
      </template>
      <template v-else-if="isPickedUp">
        <button type="button" class="ds-btn ds-btn-secondary" :disabled="busy" @click="emit('open', order)">
          <i class="bi bi-eye"></i><span>Apri</span>
        </button>
        <button type="button" class="ds-btn ds-btn-primary" :disabled="busy" @click="emit('checkout', order)">
          <i class="bi bi-receipt-cutoff"></i><span>Chiudi conto</span>
        </button>
      </template>
    </div>
  </article>
</template>

<style scoped>
.tw-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--line);
  border-left: 4px solid var(--ac);
  border-radius: var(--r-md);
  background: var(--paper);
  box-shadow: var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 0.04));
}
.tw-card.busy { opacity: 0.65; pointer-events: none; }
.tw-pending_acceptance { border-left-color: var(--warn); }
.tw-ready, .tw-picked_up { border-left-color: var(--ok); }
.tw-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tw-head-info { flex: 1; min-width: 0; }
.tw-head h3 {
  margin: 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tw-pill {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in oklab, var(--ac) 12%, var(--paper));
  border: 1px solid color-mix(in oklab, var(--ac) 35%, var(--line));
  color: var(--ac);
  font-family: var(--f-mono, var(--f-sans));
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.tw-time,
.tw-meta span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tw-time {
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--bg-2);
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.tw-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
}
.tw-note {
  margin: 0;
  padding: 9px 10px;
  border-radius: var(--r-sm);
  background: var(--bg-2);
  color: var(--ink-2);
  font-size: 12.5px;
}
.tw-note.pending { background: color-mix(in oklab, var(--warn) 12%, var(--paper)); color: var(--warn); }
.tw-note.ready { background: color-mix(in oklab, var(--ok) 10%, var(--paper)); color: var(--ok-ink, var(--ok)); }
.tw-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tw-actions :deep(.ds-btn) { flex: 1 1 120px; min-height: 36px; }
</style>
