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
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    transition: opacity var(--transition-fast);
}
.oi-row-busy {
    opacity: 0.6;
    pointer-events: none;
}

.oi-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
}

.oi-info {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
}
.oi-name {
    font-weight: 600;
    font-size: var(--text-sm);
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.oi-price {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    flex-shrink: 0;
}

.oi-notes {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-sm);
}
.oi-notes i {
    margin-top: 1px;
    flex-shrink: 0;
}

.oi-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
}

.oi-qty-group {
    display: inline-flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
}
.oi-qty-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: var(--color-bg-subtle);
    color: var(--color-text);
    cursor: pointer;
    transition: background var(--transition-fast);
    font-size: var(--text-md);
}
.oi-qty-btn:hover:not(:disabled) {
    background: var(--color-bg-muted);
}
.oi-qty-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.oi-qty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    background: var(--color-bg-elevated);
}

.oi-line-total {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--color-text);
    margin-left: auto;
}

.oi-btns {
    display: flex;
    gap: var(--space-1);
}
.oi-action-btn {
    padding: var(--space-1) var(--space-2);
}
</style>
