<script setup>
import { computed } from 'vue';

const props = defineProps({
  table: { type: Object, required: true },
  activeOrder: { type: Object, default: null },
  canRemove: { type: Boolean, default: false },
});

const emit = defineEmits(['view-order', 'open-table', 'remove-table', 'serve-ready']);

const isOccupied = computed(() => props.table.status === 'occupied');
const isReserved = computed(() => props.table.status === 'reserved');

const itemCount = computed(() => props.activeOrder?.items?.length || 0);

const readyCount = computed(() => {
  return props.activeOrder?.items?.filter(i => i.status === 'ready').length || 0;
});

const minutes = computed(() => {
  if (!props.activeOrder?.opened_at) return 0;
  const opened = new Date(props.activeOrder.opened_at);
  return Math.max(0, Math.round((Date.now() - opened.getTime()) / 60000));
});

const isAlert = computed(() => minutes.value > 60);

const totalAmount = computed(() => {
  if (!props.activeOrder) return null;
  const v = parseFloat(props.activeOrder.total_amount || 0);
  return `€${v.toFixed(2).replace('.', ',')}`;
});

const cardState = computed(() => {
  if (isReserved.value) return 'res';
  if (!isOccupied.value) return 'free';
  if (readyCount.value > 0) return 'ready';
  return 'busy';
});

const canRemoveTable = computed(() => props.canRemove && cardState.value === 'free' && !props.activeOrder);

const areaLabel = computed(() => {
  return props.table.area === 'esterno' ? 'Esterno' : 'Interno';
});

const handleClick = () => {
  if (isOccupied.value && props.activeOrder) {
    emit('view-order', props.activeOrder);
  } else if (!isOccupied.value && !isReserved.value) {
    emit('open-table', props.table);
  }
};

const handleRemove = () => {
  if (!canRemoveTable.value) return;
  emit('remove-table', props.table);
};

const handleServeReady = () => {
  if (!props.activeOrder || readyCount.value === 0) return;
  emit('serve-ready', props.activeOrder);
};
</script>

<template>
  <article
    role="button"
    tabindex="0"
    class="sl-card"
    :class="[cardState, { alert: isAlert }]"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
    :aria-label="`Tavolo ${table.number} - ${cardState}`"
  >
    <button
      v-if="canRemoveTable"
      type="button"
      class="sl-card-remove"
      :aria-label="`Rimuovi tavolo ${table.number}`"
      title="Rimuovi tavolo"
      @click.stop="handleRemove"
    >
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>

    <div class="sl-card-head">
      <span class="sl-card-n">{{ String(table.number).padStart(2, '0') }}</span>
      <div class="sl-card-meta">
        <span><i class="bi bi-people" aria-hidden="true"></i>{{ table.seats }}</span>
        <span class="sl-card-area">{{ areaLabel }}</span>
      </div>
    </div>

    <div class="sl-card-body">
      <template v-if="cardState === 'free'">
        <div class="sl-card-state">
          <span class="sl-card-state-l">Libero</span>
          <span class="sl-card-state-s">posti per {{ table.seats }}</span>
        </div>
      </template>

      <template v-else-if="cardState === 'res'">
        <div class="sl-card-state">
          <span class="sl-card-state-l"><i class="bi bi-calendar-check"></i>Prenotato</span>
          <span class="sl-card-state-s">{{ table.reservationLabel || '—' }}</span>
        </div>
      </template>

      <template v-else>
        <div class="sl-card-total">{{ totalAmount }}</div>
        <div class="sl-card-row">
          <span><i class="bi bi-receipt"></i>{{ itemCount }} portate</span>
          <span class="sl-card-time" :class="{ alert: isAlert }">
            <i class="bi bi-clock"></i>{{ minutes }}m
          </span>
        </div>
        <div v-if="readyCount > 0" class="sl-card-flag">
          <i class="bi bi-check2-circle"></i>{{ readyCount }} pront{{ readyCount === 1 ? 'o' : 'i' }}
        </div>
        <div v-else-if="isAlert" class="sl-card-flag warn">
          <i class="bi bi-exclamation-triangle-fill"></i>Lungo
        </div>
      </template>
    </div>

    <div class="sl-card-actions">
      <span v-if="cardState === 'free'" class="sl-card-action accent">
        <i class="bi bi-plus-lg"></i>Apri tavolo
      </span>
      <span v-else-if="cardState === 'res'" class="sl-card-action accent">
        <i class="bi bi-door-open"></i>Accomoda
      </span>
      <template v-else>
        <span class="sl-card-action">
          <i class="bi bi-eye"></i>Dettagli
        </span>
        <button
          v-if="readyCount > 0"
          type="button"
          class="sl-card-action sl-card-action-btn ok"
          :aria-label="`Segna come servito tutti i ${readyCount} piatti pronti del tavolo ${table.number}`"
          @click.stop="handleServeReady"
          @keydown.enter.stop="handleServeReady"
          @keydown.space.stop="handleServeReady"
        >
          <i class="bi bi-check2-circle"></i>Servi {{ readyCount }}
        </button>
      </template>
    </div>
  </article>
</template>
