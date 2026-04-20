<script setup>
import { computed, ref } from 'vue';
import OrderStatusBadge from '@/components/OrderStatusBadge.vue';

const props = defineProps({
    item: { type: Object, required: true },
    tableNumber: { type: [Number, String], default: '?' },
    busy: { type: Boolean, default: false },
});

const emit = defineEmits(['advance']);

const elapsed = ref('');

/** Calcola minuti trascorsi da creazione item */
function updateElapsed() {
    const created = new Date(props.item.createdAt);
    if (Number.isNaN(created.getTime())) { elapsed.value = ''; return; }
    const mins = Math.floor((Date.now() - created.getTime()) / 60000);
    if (mins < 1) elapsed.value = '<1 min';
    else elapsed.value = `${mins} min`;
}
updateElapsed();

// Aggiorna ogni 30s
let timer = null;
import { onMounted, onBeforeUnmount } from 'vue';
onMounted(() => { timer = setInterval(updateElapsed, 30000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const nextStatus = computed(() => {
    switch (props.item.status) {
        case 'taken': return 'preparing';
        case 'preparing': return 'ready';
        default: return null;
    }
});

const actionLabel = computed(() => {
    switch (props.item.status) {
        case 'taken': return 'Inizia';
        case 'preparing': return 'Pronto';
        default: return '';
    }
});

const actionIcon = computed(() => {
    switch (props.item.status) {
        case 'taken': return 'bi-fire';
        case 'preparing': return 'bi-check-circle';
        default: return '';
    }
});
</script>

<template>
    <article class="kic" :class="[`kic-${item.status}`, { 'kic-busy': busy }]">
        <header class="kic-header">
            <span class="kic-table">
                <i class="bi bi-grid-3x3-gap" aria-hidden="true"></i>
                T{{ tableNumber }}
            </span>
            <OrderStatusBadge :status="item.status" />
        </header>

        <div class="kic-body">
            <div class="kic-dish">
                <span class="kic-name">{{ item.name }}</span>
                <span class="kic-qty">x{{ item.quantity }}</span>
            </div>
            <p v-if="item.notes" class="kic-notes">
                <i class="bi bi-chat-text" aria-hidden="true"></i>
                {{ item.notes }}
            </p>
        </div>

        <footer class="kic-footer">
            <span class="kic-timer" aria-label="Tempo trascorso">
                <i class="bi bi-clock" aria-hidden="true"></i>
                {{ elapsed }}
            </span>
            <button
                v-if="nextStatus"
                type="button"
                class="ds-btn ds-btn-sm"
                :class="item.status === 'taken' ? 'ds-btn-warning' : 'ds-btn-accent'"
                :disabled="busy"
                @click="emit('advance', { item, next: nextStatus })"
            >
                <span v-if="busy" class="ds-spinner" aria-hidden="true"></span>
                <template v-else>
                    <i :class="['bi', actionIcon]" aria-hidden="true"></i>
                    <span>{{ actionLabel }}</span>
                </template>
            </button>
        </footer>
    </article>
</template>

<style scoped>
.kic {
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    overflow: hidden;
    position: relative;
    font-family: var(--f-sans, 'Geist', sans-serif);
    transition: box-shadow 160ms, opacity 160ms, transform 160ms;
}
.kic:hover {
    box-shadow: 0 6px 16px -8px color-mix(in oklab, var(--ink) 18%, transparent);
    transform: translateY(-1px);
}
.kic-busy {
    opacity: 0.6;
    pointer-events: none;
}

.kic::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--ink-3);
}
.kic-taken::before { background: var(--ink-3); }
.kic-preparing::before { background: var(--warn); }
.kic-ready::before { background: var(--ok); }

.kic-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--bg-2);
}
.kic-table {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-2);
    letter-spacing: 0.04em;
}
.kic-table i { font-size: 11px; }

.kic-body {
    padding: 14px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.kic-dish {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-2);
}
.kic-name {
    font-weight: 600;
    font-size: 15px;
    color: var(--ink);
    letter-spacing: -0.01em;
}
.kic-qty {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 14px;
    font-weight: 700;
    color: var(--ac);
    flex-shrink: 0;
}

.kic-notes {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-2);
    padding: 8px 10px;
    background: var(--bg-2);
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    margin: 0;
    line-height: 1.4;
}
.kic-notes i {
    margin-top: 2px;
    flex-shrink: 0;
    color: var(--ink-3);
}

.kic-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-top: 1px solid var(--line);
    background: var(--bg-2);
}
.kic-timer {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.03em;
}

.kic-footer :deep(.ds-btn) {
    min-height: 38px;
    padding: 6px 14px;
}
</style>
