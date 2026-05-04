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
  items.sort((a, b) => {
    const ca = parseInt(a.course, 10) || 1;
    const cb = parseInt(b.course, 10) || 1;
    if (ca !== cb) return ca - cb;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return items;
});

const takenItems = computed(() => allItems.value.filter(i => i.status === 'taken'));
const preparingItems = computed(() => allItems.value.filter(i => i.status === 'preparing'));
const readyItems = computed(() => allItems.value.filter(i => i.status === 'ready'));

const groupByCourse = (items) => {
  const groups = [];
  const byCourse = new Map();
  for (const item of items) {
    const course = parseInt(item.course, 10) || 1;
    let group = byCourse.get(course);
    if (!group) {
      group = { course, items: [] };
      byCourse.set(course, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
};

const takenGroups = computed(() => groupByCourse(takenItems.value));
const preparingGroups = computed(() => groupByCourse(preparingItems.value));
const readyGroups = computed(() => groupByCourse(readyItems.value));
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
        <section v-for="group in takenGroups" :key="group.course" class="kt-course">
          <header class="kt-course-h">{{ group.course }}a portata</header>
          <KitchenItemCard
            v-for="item in group.items"
            :key="item.documentId"
            :item="item"
            :table-number="item._tableNumber"
            :busy="busyItemIds.has(item.documentId)"
            @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
          />
        </section>
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
        <section v-for="group in preparingGroups" :key="group.course" class="kt-course">
          <header class="kt-course-h">{{ group.course }}a portata</header>
          <KitchenItemCard
            v-for="item in group.items"
            :key="item.documentId"
            :item="item"
            :table-number="item._tableNumber"
            :busy="busyItemIds.has(item.documentId)"
            @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
          />
        </section>
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
        <section v-for="group in readyGroups" :key="group.course" class="kt-course">
          <header class="kt-course-h">{{ group.course }}a portata</header>
          <KitchenItemCard
            v-for="item in group.items"
            :key="item.documentId"
            :item="item"
            :table-number="item._tableNumber"
            :busy="busyItemIds.has(item.documentId)"
            @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
          />
        </section>
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

<style scoped>
.kt-course {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.kt-course + .kt-course {
  margin-top: 12px;
}
.kt-course-h {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 28px;
  display: flex;
  align-items: center;
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--bg-2);
  color: var(--ink-2);
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 12px;
  font-weight: 700;
}
</style>
