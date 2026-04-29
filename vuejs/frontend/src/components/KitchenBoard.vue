<script setup>
import { computed } from 'vue';
import KitchenItemCard from '@/components/KitchenItemCard.vue';

const props = defineProps({
  orders: { type: Array, default: () => [] },
  busyItemIds: { type: Set, default: () => new Set() },
});

const emit = defineEmits(['advance']);

const allItems = computed(() => {
  const items = [];
  for (const order of props.orders) {
    if (order.status !== 'active' || !order.items) continue;
    const tNum = order.table?.number ?? '?';
    for (const item of order.items) {
      if (item.status === 'served') continue;
      items.push({ ...item, _tableNumber: tNum, _orderDocumentId: order.documentId });
    }
  }
  items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return items;
});

const takenItems = computed(() => allItems.value.filter(i => i.status === 'taken'));
const preparingItems = computed(() => allItems.value.filter(i => i.status === 'preparing'));
const readyItems = computed(() => allItems.value.filter(i => i.status === 'ready'));
</script>

<template>
  <div class="kt-board" v-if="allItems.length > 0">
    <!-- Da fare -->
    <section class="kt-col kt-taken">
      <header class="kt-col-h">
        <div>
          <i class="bi bi-clipboard-check"/>
          <strong>Da fare</strong>
        </div>
        <span class="kt-col-c">{{ takenItems.length }}</span>
      </header>
      <div class="kt-col-body">
        <div v-if="!takenItems.length" class="kt-empty">
          <i class="bi bi-inbox"/>
          <p>Nessuna portata in attesa</p>
        </div>
        <KitchenItemCard
          v-for="item in takenItems"
          :key="item.documentId"
          :item="item"
          :table-number="item._tableNumber"
          :busy="busyItemIds.has(item.documentId)"
          @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
        />
      </div>
    </section>

    <!-- In preparazione -->
    <section class="kt-col kt-preparing">
      <header class="kt-col-h">
        <div>
          <i class="bi bi-fire"/>
          <strong>In preparazione</strong>
        </div>
        <span class="kt-col-c">{{ preparingItems.length }}</span>
      </header>
      <div class="kt-col-body">
        <div v-if="!preparingItems.length" class="kt-empty">
          <i class="bi bi-inbox"/>
          <p>Niente in lavorazione</p>
        </div>
        <KitchenItemCard
          v-for="item in preparingItems"
          :key="item.documentId"
          :item="item"
          :table-number="item._tableNumber"
          :busy="busyItemIds.has(item.documentId)"
          @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
        />
      </div>
    </section>

    <!-- Pronti -->
    <section class="kt-col kt-ready">
      <header class="kt-col-h">
        <div>
          <i class="bi bi-check2-circle"/>
          <strong>Pronti</strong>
        </div>
        <span class="kt-col-c">{{ readyItems.length }}</span>
      </header>
      <div class="kt-col-body">
        <div v-if="!readyItems.length" class="kt-empty">
          <i class="bi bi-inbox"/>
          <p>Nessun piatto pronto</p>
        </div>
        <KitchenItemCard
          v-for="item in readyItems"
          :key="item.documentId"
          :item="item"
          :table-number="item._tableNumber"
          :busy="busyItemIds.has(item.documentId)"
          @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
        />
      </div>
    </section>
  </div>

  <!-- Empty state -->
  <div v-else class="kr-hero-empty">
    <div class="kr-hero-empty-art">
      <svg viewBox="0 0 200 140" width="200" height="140">
        <circle cx="100" cy="70" r="56" fill="var(--ac-soft)"/>
        <g stroke="var(--ac)" stroke-width="2.5" fill="none" stroke-linecap="round">
          <path d="M70 80 Q100 50 130 80"/>
          <circle cx="100" cy="65" r="3" fill="var(--ac)"/>
          <path d="M65 95 L135 95" stroke-dasharray="3 6"/>
        </g>
      </svg>
    </div>
    <h2>Nessun ordine in coda. Per ora.</h2>
    <p>Quando la sala manderà gli ordini, li vedrai qui — divisi per stato e con il timer di preparazione.</p>
  </div>
</template>
