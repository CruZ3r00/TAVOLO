<script setup>
import { computed } from 'vue';

const props = defineProps({
  tables: { type: Array, default: () => [] },
  orders: { type: Array, default: () => [] },
});

const summary = computed(() => {
  const internal = props.tables.filter(t => (t.area || 'interno') === 'interno');
  const external = props.tables.filter(t => t.area === 'esterno');
  const internalOcc = internal.filter(t => t.status === 'occupied').length;
  const externalOcc = external.filter(t => t.status === 'occupied').length;
  const totalSeats = props.tables.reduce((s, t) => s + (t.seats || 0), 0);
  const occSeats = props.tables
    .filter(t => t.status === 'occupied')
    .reduce((s, t) => s + (t.seats || 0), 0);

  // Tempo medio (in minuti) sugli ordini attivi
  const activeOrders = props.orders.filter(o => o.status === 'active' && o.opened_at);
  let avgMinutes = 0;
  if (activeOrders.length > 0) {
    const total = activeOrders.reduce((s, o) => {
      return s + Math.max(0, Math.round((Date.now() - new Date(o.opened_at).getTime()) / 60000));
    }, 0);
    avgMinutes = Math.round(total / activeOrders.length);
  }

  const fmt = (a, b) => `${a}/${b}`;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  return {
    internal: { v: fmt(internalOcc, internal.length), pct: pct(internalOcc, internal.length) },
    external: { v: fmt(externalOcc, external.length), pct: pct(externalOcc, external.length) },
    seats: { occ: occSeats, total: totalSeats, pct: pct(occSeats, totalSeats) },
    avgTime: avgMinutes,
    avgPct: Math.min(100, Math.round((avgMinutes / 60) * 100)),
  };
});
</script>

<template>
  <div class="sl-areas">
    <div class="sl-area">
      <span class="sl-area-l">Sala interna</span>
      <strong>{{ summary.internal.v }}</strong>
      <span class="sl-area-pct"><span :style="{ width: summary.internal.pct + '%' }"></span></span>
    </div>
    <div class="sl-area">
      <span class="sl-area-l">Dehors</span>
      <strong>{{ summary.external.v }}</strong>
      <span class="sl-area-pct"><span :style="{ width: summary.external.pct + '%' }"></span></span>
    </div>
    <div class="sl-area">
      <span class="sl-area-l">Coperti totali</span>
      <strong>{{ summary.seats.occ }}<small>/{{ summary.seats.total }}</small></strong>
      <span class="sl-area-pct"><span :style="{ width: summary.seats.pct + '%' }"></span></span>
    </div>
    <div class="sl-area">
      <span class="sl-area-l">Tempo medio</span>
      <strong>{{ summary.avgTime }}<small>min</small></strong>
      <span class="sl-area-pct"><span :style="{ width: summary.avgPct + '%' }"></span></span>
    </div>
  </div>
</template>
