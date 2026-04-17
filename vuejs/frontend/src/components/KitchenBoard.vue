<script setup>
import { computed } from 'vue';
import KitchenItemCard from '@/components/KitchenItemCard.vue';

const props = defineProps({
    orders: { type: Array, default: () => [] },
    busyItemIds: { type: Set, default: () => new Set() },
});

const emit = defineEmits(['advance']);

/**
 * Appiattisce gli items di tutti gli ordini attivi e li annota
 * con il numero tavolo, ordinati per createdAt (piu vecchio in alto).
 */
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
    <div class="kb" v-if="allItems.length > 0">
        <!-- Colonna: Da fare -->
        <section class="kb-col">
            <header class="kb-col-header kb-col-taken">
                <span class="kb-col-icon"><i class="bi bi-receipt"></i></span>
                <h3 class="kb-col-title">Da fare</h3>
                <span class="kb-col-count">{{ takenItems.length }}</span>
            </header>
            <div class="kb-col-body">
                <KitchenItemCard
                    v-for="item in takenItems"
                    :key="item.documentId"
                    :item="item"
                    :table-number="item._tableNumber"
                    :busy="busyItemIds.has(item.documentId)"
                    @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
                />
                <div v-if="!takenItems.length" class="kb-col-empty">
                    <p>Nessun piatto in attesa.</p>
                </div>
            </div>
        </section>

        <!-- Colonna: In preparazione -->
        <section class="kb-col">
            <header class="kb-col-header kb-col-preparing">
                <span class="kb-col-icon"><i class="bi bi-fire"></i></span>
                <h3 class="kb-col-title">In preparazione</h3>
                <span class="kb-col-count">{{ preparingItems.length }}</span>
            </header>
            <div class="kb-col-body">
                <KitchenItemCard
                    v-for="item in preparingItems"
                    :key="item.documentId"
                    :item="item"
                    :table-number="item._tableNumber"
                    :busy="busyItemIds.has(item.documentId)"
                    @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
                />
                <div v-if="!preparingItems.length" class="kb-col-empty">
                    <p>Nessun piatto in lavorazione.</p>
                </div>
            </div>
        </section>

        <!-- Colonna: Pronti -->
        <section class="kb-col">
            <header class="kb-col-header kb-col-ready">
                <span class="kb-col-icon"><i class="bi bi-check-circle"></i></span>
                <h3 class="kb-col-title">Pronti</h3>
                <span class="kb-col-count">{{ readyItems.length }}</span>
            </header>
            <div class="kb-col-body">
                <KitchenItemCard
                    v-for="item in readyItems"
                    :key="item.documentId"
                    :item="item"
                    :table-number="item._tableNumber"
                    :busy="busyItemIds.has(item.documentId)"
                    @advance="(payload) => emit('advance', { ...payload, orderDocumentId: item._orderDocumentId })"
                />
                <div v-if="!readyItems.length" class="kb-col-empty">
                    <p>Nessun piatto pronto da servire.</p>
                </div>
            </div>
        </section>
    </div>
    <div v-else class="kb-empty">
        <div class="ds-empty-icon"><i class="bi bi-cup-hot"></i></div>
        <p class="ds-empty-description">Nessun piatto da preparare al momento.</p>
    </div>
</template>

<style scoped>
.kb {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
    align-items: flex-start;
}

.kb-col {
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    min-height: 280px;
    overflow: hidden;
}

.kb-col-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-elevated);
    border-bottom: 1px solid var(--color-border);
}
.kb-col-icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
}
.kb-col-title {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
}
.kb-col-count {
    min-width: 26px;
    height: 24px;
    padding: 0 var(--space-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs);
    font-weight: 600;
    border-radius: var(--radius-full);
    background: var(--color-bg-subtle);
    color: var(--color-text-secondary);
}

.kb-col-taken .kb-col-icon {
    background: var(--color-bg-muted);
    color: var(--color-text-muted);
}
.kb-col-taken .kb-col-count {
    background: var(--color-bg-muted);
    color: var(--color-text-muted);
}
.kb-col-preparing .kb-col-icon {
    background: var(--color-warning-light);
    color: var(--color-warning);
}
.kb-col-preparing .kb-col-count {
    background: var(--color-warning-light);
    color: var(--color-warning);
}
.kb-col-ready .kb-col-icon {
    background: var(--color-accent-light);
    color: var(--color-accent);
}
.kb-col-ready .kb-col-count {
    background: var(--color-accent-light);
    color: var(--color-accent);
}

.kb-col-body {
    flex: 1;
    padding: var(--space-3);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-height: calc(100vh - 280px);
}

.kb-col-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8) var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
}

.kb-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-12) var(--space-4);
    gap: var(--space-3);
    color: var(--color-text-muted);
}

@media (max-width: 991px) {
    .kb {
        grid-template-columns: 1fr;
    }
}
</style>
