<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  item: { type: Object, required: true },
  tableNumber: { type: [Number, String], default: '?' },
  takeaway: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['advance']);

const elapsed = ref('');
let timer = null;

function updateElapsed() {
  const created = new Date(props.item.createdAt);
  if (Number.isNaN(created.getTime())) { elapsed.value = ''; return; }
  const mins = Math.floor((Date.now() - created.getTime()) / 60000);
  if (mins < 1) elapsed.value = '<1 min';
  else elapsed.value = `${mins} min`;
}
updateElapsed();

onMounted(() => { timer = setInterval(updateElapsed, 30000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const nextStatus = computed(() => {
  switch (props.item.status) {
    case 'taken': return 'preparing';
    case 'preparing': return 'ready';
    case 'ready': return 'served';
    default: return null;
  }
});

const isLong = computed(() => {
  const created = new Date(props.item.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const mins = Math.floor((Date.now() - created.getTime()) / 60000);
  return mins > 15;
});

const onAdvance = () => {
  if (props.busy || !nextStatus.value) return;
  emit('advance', { item: props.item, next: nextStatus.value });
};
</script>

<template>
  <article class="kic" :class="[`kic-${item.status}`, { 'kic-prio': isLong, 'kic-busy': busy, 'kic-takeaway': takeaway }]">
    <div class="kic-info">
      <header class="kic-header">
        <span class="kic-table">
          <template v-if="takeaway">
            <i class="bi bi-bag-check" aria-hidden="true"></i>A{{ tableNumber }}
          </template>
          <template v-else>
            <i class="bi bi-grid-3x3-gap" aria-hidden="true"></i>T{{ tableNumber }}
          </template>
        </span>
        <span class="kic-badge" :class="`st-${item.status}`">
          <template v-if="item.status === 'taken'"><i class="bi bi-clipboard-check"/>Da fare</template>
          <template v-else-if="item.status === 'preparing'"><i class="bi bi-fire"/>In preparazione</template>
          <template v-else-if="item.status === 'ready'"><i class="bi bi-check2-circle"/>Pronto</template>
        </span>
      </header>
      <div class="kic-body">
        <div class="kic-dish">
          <span class="kic-name">{{ item.name }}</span>
          <span class="kic-qty">×{{ item.quantity }}</span>
        </div>
        <div class="kic-meta">
          <span class="kic-course">
            <i class="bi bi-layers"/>{{ parseInt(item.course, 10) || 1 }}a
          </span>
          <span v-if="item.category" class="kic-category">
            {{ item.category }}
          </span>
          <span class="kic-timer">
            <i class="bi bi-clock"/>{{ elapsed }}
          </span>
          <span v-if="isLong" class="kic-prio-flag">
            <i class="bi bi-flag-fill"/>Oltre 15 min
          </span>
        </div>
        <p v-if="item.notes" class="kic-notes">
          <i class="bi bi-chat-text"/>{{ item.notes }}
        </p>
      </div>
    </div>

    <button
      v-if="item.status === 'taken'"
      type="button"
      class="kic-action kic-action-taken"
      :disabled="busy"
      @click="onAdvance"
    >
      <i class="bi bi-fire"/>
      <span>Inizia preparazione</span>
      <i class="bi bi-arrow-right"/>
    </button>
    <button
      v-else-if="item.status === 'preparing'"
      type="button"
      class="kic-action kic-action-preparing"
      :disabled="busy"
      @click="onAdvance"
    >
      <i class="bi bi-check2-circle"/>
      <span>Segna come pronto</span>
      <i class="bi bi-arrow-right"/>
    </button>
    <button
      v-else-if="item.status === 'ready'"
      v-show="!takeaway"
      type="button"
      class="kic-action kic-action-ready"
      :disabled="busy"
      @click="onAdvance"
    >
      <i class="bi bi-check-lg"/>
      <span>Servito al tavolo</span>
      <i class="bi bi-arrow-right"/>
    </button>
  </article>
</template>

<style scoped>
.kic-busy { opacity: 0.6; pointer-events: none; }
.kic-takeaway {
  border-left: 4px solid var(--ac);
}
.kic-takeaway .kic-table {
  background: color-mix(in oklab, var(--ac) 10%, var(--paper));
  color: var(--ac);
  border-color: color-mix(in oklab, var(--ac) 35%, var(--line));
}
.kic-action:disabled { opacity: 0.6; cursor: not-allowed; }
.kic-course,
.kic-category {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--bg-2);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 700;
}
</style>
