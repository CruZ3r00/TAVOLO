<script setup>
import { computed, ref } from 'vue';
import SalaTableCard from '@/components/SalaTableCard.vue';
import SalaFiltersBar from '@/components/SalaFiltersBar.vue';
import SalaAreaSummary from '@/components/SalaAreaSummary.vue';

const props = defineProps({
  tables: { type: Array, default: () => [] },
  orders: { type: Array, default: () => [] },
});

const emit = defineEmits(['view-order']);

const filter = ref('all');
const search = ref('');

function activeOrderForTable(table) {
  return props.orders.find(
    o => o.status === 'active' && o.table?.documentId === table.documentId
  ) || null;
}

const tableState = (t) => {
  if (t.status === 'reserved') return 'res';
  if (t.status === 'occupied') {
    const order = activeOrderForTable(t);
    if (order?.items?.some(i => i.status === 'ready')) return 'ready';
    return 'busy';
  }
  return 'free';
};

const counts = computed(() => {
  const c = { all: props.tables.length, free: 0, busy: 0, ready: 0, res: 0 };
  for (const t of props.tables) {
    const s = tableState(t);
    if (s in c) c[s] += 1;
  }
  return c;
});

const filtered = computed(() => {
  let list = [...props.tables];
  if (filter.value !== 'all') {
    list = list.filter(t => tableState(t) === filter.value);
  }
  const q = search.value.trim().toLowerCase();
  if (q) {
    list = list.filter(t => {
      const num = String(t.number || '').toLowerCase();
      const area = (t.area || '').toLowerCase();
      return num.includes(q) || area.includes(q);
    });
  }
  // Sort by number asc
  list.sort((a, b) => (a.number || 0) - (b.number || 0));
  return list;
});
</script>

<template>
  <div class="sala-wrap" v-if="tables.length">
    <SalaFiltersBar
      v-model:filter="filter"
      v-model:search="search"
      :counts="counts"
    />
    <SalaAreaSummary :tables="tables" :orders="orders" />

    <div v-if="filtered.length" class="sl-grid">
      <SalaTableCard
        v-for="t in filtered"
        :key="t.documentId"
        :table="t"
        :active-order="activeOrderForTable(t)"
        @view-order="(ord) => emit('view-order', ord)"
      />
    </div>
    <div v-else class="kt-empty" style="padding: 40px 16px;">
      <i class="bi bi-inbox"></i>
      <p>Nessun tavolo per il filtro selezionato.</p>
    </div>

    <div class="sl-legend">
      <span><span class="sl-tab-dot free"></span>Libero</span>
      <span><span class="sl-tab-dot res"></span>Prenotato</span>
      <span><span class="sl-tab-dot busy"></span>Occupato</span>
      <span><span class="sl-tab-dot ready"></span>Da chiudere</span>
      <span><i class="bi bi-exclamation-triangle-fill" style="color: var(--warn);"></i>Oltre 60 min</span>
    </div>
  </div>

  <div v-else class="kr-hero-empty">
    <div class="kr-hero-empty-art">
      <i class="bi bi-grid-3x3-gap" style="font-size: 64px; color: var(--ac); opacity: 0.5;"></i>
    </div>
    <h2>Nessun tavolo configurato</h2>
    <p>Aggiungi i tavoli del tuo ristorante per iniziare a gestire ordini e prenotazioni.</p>
  </div>
</template>

<style scoped>
.sala-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
