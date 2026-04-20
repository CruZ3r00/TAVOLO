<script setup>
import { computed } from 'vue';

const props = defineProps({
    table: { type: Object, required: true },
    activeOrder: { type: Object, default: null },
});

const emit = defineEmits(['view-order']);

const isOccupied = computed(() => props.table.status === 'occupied');

const readyCount = computed(() => {
    if (!props.activeOrder?.items) return 0;
    return props.activeOrder.items.filter(i => i.status === 'ready').length;
});

const itemCount = computed(() => {
    if (!props.activeOrder?.items) return 0;
    return props.activeOrder.items.length;
});

const totalAmount = computed(() => {
    if (!props.activeOrder) return null;
    return parseFloat(props.activeOrder.total_amount || 0).toFixed(2);
});

const areaLabel = computed(() => {
    if (props.table.area === 'esterno') return 'Esterno';
    return 'Interno';
});
</script>

<template>
    <article
        class="otc"
        :class="{ 'otc-occupied': isOccupied, 'otc-free': !isOccupied }"
        @click="isOccupied ? emit('view-order', activeOrder) : null"
        :role="isOccupied ? 'button' : null"
        :tabindex="isOccupied ? 0 : -1"
        @keydown.enter="isOccupied ? emit('view-order', activeOrder) : null"
        :aria-label="`Tavolo ${table.number} - ${isOccupied ? 'Occupato' : 'Libero'}`"
    >
        <header class="otc-header">
            <div class="otc-number">
                <span class="otc-number-label">Tavolo</span>
                <span class="otc-number-value">{{ table.number }}</span>
            </div>
            <div class="otc-badges">
                <span v-if="readyCount > 0" class="otc-ready-badge" aria-label="Piatti pronti">
                    <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
                    {{ readyCount }}
                </span>
                <span class="otc-status-dot" :class="isOccupied ? 'dot-occupied' : 'dot-free'"></span>
            </div>
        </header>

        <div class="otc-body">
            <div class="otc-meta">
                <span class="otc-seats">
                    <i class="bi bi-person" aria-hidden="true"></i>
                    {{ table.seats }}
                </span>
                <span class="otc-area">{{ areaLabel }}</span>
            </div>

            <template v-if="isOccupied && activeOrder">
                <div class="otc-order-info">
                    <span class="otc-items-count">{{ itemCount }} piatt{{ itemCount === 1 ? 'o' : 'i' }}</span>
                    <span class="otc-total">&euro; {{ totalAmount }}</span>
                </div>
            </template>
            <template v-else>
                <div class="otc-free-label">
                    <i class="bi bi-hourglass" aria-hidden="true"></i>
                    <span>In attesa host</span>
                </div>
            </template>
        </div>
    </article>
</template>

<style scoped>
.otc {
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    overflow: hidden;
    transition: box-shadow 160ms, border-color 160ms, transform 160ms;
    position: relative;
    font-family: var(--f-sans, 'Geist', sans-serif);
}
.otc-occupied { cursor: pointer; }
.otc-occupied:hover {
    box-shadow: 0 10px 24px -12px color-mix(in oklab, var(--ac) 40%, transparent);
    border-color: color-mix(in oklab, var(--ac) 40%, var(--line));
    transform: translateY(-2px);
}
.otc-free {
    cursor: default;
    opacity: 0.92;
}
.otc:focus-visible {
    outline: 2px solid var(--ac);
    outline-offset: 2px;
}

.otc::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--ok);
}
.otc-occupied::before { background: var(--ac); }

.otc-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--s-4) var(--s-4) var(--s-2);
}

.otc-number {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.otc-number-label {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 10px;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 500;
}
.otc-number-value {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 32px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.03em;
    line-height: 1;
}

.otc-badges {
    display: flex;
    align-items: center;
    gap: var(--s-2);
}

.otc-ready-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: color-mix(in oklab, var(--ok) 14%, var(--paper));
    color: var(--ok);
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--ok) 30%, transparent);
    animation: pulse-ready 1.6s ease-in-out infinite;
}
.otc-ready-badge i { font-size: 10px; }

@keyframes pulse-ready {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.72; transform: scale(1.05); }
}

.otc-status-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
}
.dot-occupied {
    background: var(--ac);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac) 22%, transparent);
}
.dot-free {
    background: var(--ok);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--ok) 22%, transparent);
}

.otc-body {
    padding: 0 var(--s-4) var(--s-4);
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
}

.otc-meta {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    font-size: 12px;
    color: var(--ink-3);
    font-family: var(--f-mono, 'Geist Mono', monospace);
}
.otc-seats {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.otc-seats i { font-size: 13px; }
.otc-area {
    padding: 2px 8px;
    background: var(--bg-2);
    border-radius: 999px;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.otc-order-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--bg-2);
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
}
.otc-items-count {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    color: var(--ink-2);
}
.otc-total {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.01em;
}

.otc-free-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    color: var(--ink-3);
    font-weight: 500;
}
.otc-free-label i { font-size: 12px; }
</style>
