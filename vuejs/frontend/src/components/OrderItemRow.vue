<script setup>
import { computed } from 'vue';
import OrderStatusBadge from '@/components/OrderStatusBadge.vue';

const props = defineProps({
    item: { type: Object, required: true },
    orderActive: { type: Boolean, default: true },
    busy: { type: Boolean, default: false },
});

const emit = defineEmits(['increment', 'decrement', 'delete', 'serve', 'edit-notes']);

const isEditable = computed(() => props.item.status === 'taken' && props.orderActive);
const isReady = computed(() => props.item.status === 'ready' && props.orderActive);

const lineTotal = computed(() => {
    const p = parseFloat(props.item.price) || 0;
    const q = parseInt(props.item.quantity, 10) || 0;
    return (p * q).toFixed(2);
});
</script>

<template>
    <div class="oi-row" :class="{ 'oi-row-busy': busy }">
        <div class="oi-main">
            <div class="oi-info">
                <span class="oi-name">{{ item.name }}</span>
                <span class="oi-price">&euro; {{ parseFloat(item.price).toFixed(2) }}</span>
            </div>
            <OrderStatusBadge :status="item.status" />
        </div>

        <div v-if="item.notes" class="oi-notes">
            <i class="bi bi-chat-text" aria-hidden="true"></i>
            <span>{{ item.notes }}</span>
        </div>

        <div class="oi-actions">
            <div class="oi-qty-group">
                <button
                    v-if="isEditable"
                    type="button"
                    class="oi-qty-btn"
                    :disabled="busy || item.quantity <= 1"
                    @click="emit('decrement', item)"
                    aria-label="Riduci quantita"
                >
                    <i class="bi bi-dash" aria-hidden="true"></i>
                </button>
                <span class="oi-qty" aria-label="Quantita">{{ item.quantity }}</span>
                <button
                    v-if="isEditable"
                    type="button"
                    class="oi-qty-btn"
                    :disabled="busy"
                    @click="emit('increment', item)"
                    aria-label="Aumenta quantita"
                >
                    <i class="bi bi-plus" aria-hidden="true"></i>
                </button>
            </div>

            <span class="oi-line-total">&euro; {{ lineTotal }}</span>

            <div class="oi-btns">
                <button
                    v-if="isEditable"
                    type="button"
                    class="ds-btn ds-btn-ghost ds-btn-sm oi-action-btn"
                    :disabled="busy"
                    @click="emit('delete', item)"
                    aria-label="Elimina elemento"
                >
                    <i class="bi bi-trash" aria-hidden="true"></i>
                </button>
                <button
                    v-if="isReady"
                    type="button"
                    class="ds-btn ds-btn-accent ds-btn-sm oi-action-btn"
                    :disabled="busy"
                    @click="emit('serve', item)"
                    aria-label="Segna come servito"
                >
                    <i class="bi bi-cup-straw" aria-hidden="true"></i>
                    <span>Servito</span>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.oi-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--paper);
    transition: opacity 160ms, border-color 160ms;
    font-family: var(--f-sans, 'Geist', sans-serif);
}
.oi-row:hover { border-color: color-mix(in oklab, var(--ink) 16%, var(--line)); }
.oi-row-busy {
    opacity: 0.6;
    pointer-events: none;
}

.oi-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.oi-info {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
}
.oi-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.01em;
}
.oi-price {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    color: var(--ink-3);
    flex-shrink: 0;
}

.oi-notes {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-2);
    padding: 6px 10px;
    background: var(--bg-2);
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    line-height: 1.4;
}
.oi-notes i {
    margin-top: 2px;
    flex-shrink: 0;
    color: var(--ink-3);
}

.oi-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.oi-qty-group {
    display: inline-flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    overflow: hidden;
    background: var(--paper);
}
.oi-qty-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    background: var(--bg-2);
    color: var(--ink);
    cursor: pointer;
    transition: background 120ms, color 120ms;
    font-size: 14px;
}
.oi-qty-btn:hover:not(:disabled) {
    background: color-mix(in oklab, var(--ac) 12%, var(--paper));
    color: var(--ac);
}
.oi-qty-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}
.oi-qty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 30px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    background: var(--paper);
}

.oi-line-total {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.01em;
    margin-left: auto;
}

.oi-btns {
    display: flex;
    gap: 6px;
}
.oi-action-btn {
    padding: 6px 10px;
}
</style>
