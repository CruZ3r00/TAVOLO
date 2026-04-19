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
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
    overflow: hidden;
    transition: box-shadow var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
    position: relative;
}
.otc-occupied {
    cursor: pointer;
}
.otc-occupied:hover {
    box-shadow: var(--shadow-sm);
    border-color: var(--color-border-hover);
    transform: translateY(-1px);
}
.otc-free {
    cursor: default;
    opacity: 0.85;
}
.otc:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
}

.otc-occupied {
    border-left: 3px solid var(--color-primary);
}
.otc-free {
    border-left: 3px solid var(--color-accent);
}

.otc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-3) var(--space-2);
}

.otc-number {
    display: flex;
    flex-direction: column;
}
.otc-number-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
}
.otc-number-value {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: var(--tracking-tight);
    line-height: 1;
}

.otc-badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.otc-ready-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--color-accent-light);
    color: var(--color-accent);
    font-size: 11px;
    font-weight: 700;
    border-radius: var(--radius-full);
    animation: pulse-ready 1.5s ease-in-out infinite;
}

@keyframes pulse-ready {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.otc-status-dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
}
.dot-occupied {
    background: var(--color-primary);
}
.dot-free {
    background: var(--color-accent);
}

.otc-body {
    padding: 0 var(--space-3) var(--space-3);
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.otc-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
}
.otc-seats {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

.otc-order-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-sm);
}
.otc-items-count {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
}
.otc-total {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--color-text);
}

.otc-free-label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-accent);
    font-weight: 500;
}

.otc-actions {
    display: flex;
    gap: var(--space-1);
    padding: 0 var(--space-3) var(--space-2);
}
.otc-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: var(--color-bg-subtle);
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-xs);
    transition: all var(--transition-fast);
}
.otc-action-btn:hover {
    background: var(--color-bg-muted);
    color: var(--color-text);
}
.otc-action-danger:hover {
    background: var(--color-destructive-light);
    color: var(--color-destructive);
}
</style>
