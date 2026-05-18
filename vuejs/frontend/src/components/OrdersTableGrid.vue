<script setup>
// OrdersTableGrid: griglia dei tavoli (modalità cameriere).
//
// Il filtro stato (Tutti/Liberi/Occupati/Da chiudere/Prenotati) è ora
// controllato dal parent (Orders.vue) tramite la sidebar laterale della
// pagina. Niente più SalaFiltersBar interna né input "Cerca tavolo, area…"
// (rimosso su richiesta utente — creava confusione).

import { computed, watch } from 'vue';
import SalaTableCard from '@/components/SalaTableCard.vue';
import SalaAreaSummary from '@/components/SalaAreaSummary.vue';

const props = defineProps({
  tables: { type: Array, default: () => [] },
  orders: { type: Array, default: () => [] },
  ordersByTableId: { default: null },
  canRemoveTables: { type: Boolean, default: false },
  // Stato filtro corrente (controllato dal parent). Vue 2.7 dual-build:
  // niente v-model:filter — il parent fa :filter + @update:filter.
  filter: { type: String, default: 'all' },
});

const emit = defineEmits(['view-order', 'open-table', 'remove-table', 'serve-ready', 'counts-changed']);

function activeOrderForTable(table) {
  if (props.ordersByTableId && typeof props.ordersByTableId.get === 'function') {
    return props.ordersByTableId.get(table.documentId) || null;
  }
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

// Notifica il parent ogni volta che i counts cambiano: gli serve per
// mostrarli come badge accanto alle voci della sidebar.
watch(counts, (next) => emit('counts-changed', next), { immediate: true, deep: true });

const filtered = computed(() => {
  let list = [...props.tables];
  if (props.filter !== 'all') {
    list = list.filter(t => tableState(t) === props.filter);
  }
  // Sort by number asc
  list.sort((a, b) => (a.number || 0) - (b.number || 0));
  return list;
});
</script>

<template>
  <div class="sala-wrap" v-if="tables.length">
    <SalaAreaSummary :tables="tables" :orders="orders" />

    <div v-if="filtered.length" class="sl-grid">
      <SalaTableCard
        v-for="t in filtered"
        :key="t.documentId"
        :table="t"
        :active-order="activeOrderForTable(t)"
        :can-remove="canRemoveTables"
        @view-order="(ord) => emit('view-order', ord)"
        @open-table="(table) => emit('open-table', table)"
        @remove-table="(table) => emit('remove-table', table)"
        @serve-ready="(ord) => emit('serve-ready', ord)"
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
