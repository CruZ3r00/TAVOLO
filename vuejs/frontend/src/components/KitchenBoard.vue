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
    gap: var(--s-4);
    align-items: flex-start;
}

.kb-col {
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    min-height: 280px;
    overflow: hidden;
    font-family: var(--f-sans, 'Geist', sans-serif);
}

.kb-col-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--line);
    border-top: 3px solid var(--ink-3);
}
.kb-col-icon {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-sm);
    font-size: 14px;
}
.kb-col-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    flex: 1;
    letter-spacing: -0.01em;
}
.kb-col-count {
    min-width: 26px;
    height: 22px;
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 600;
    border-radius: 999px;
    background: var(--paper);
    border: 1px solid var(--line);
    color: var(--ink-2);
}

.kb-col-taken { border-top-color: var(--ink-3); }
.kb-col-taken .kb-col-icon {
    background: color-mix(in oklab, var(--ink) 8%, var(--paper));
    color: var(--ink-2);
}
.kb-col-preparing { border-top-color: var(--warn); }
.kb-col-preparing .kb-col-icon {
    background: color-mix(in oklab, var(--warn) 14%, var(--paper));
    color: var(--warn);
}
.kb-col-preparing .kb-col-count {
    background: color-mix(in oklab, var(--warn) 14%, var(--paper));
    color: var(--warn);
    border-color: color-mix(in oklab, var(--warn) 30%, transparent);
}
.kb-col-ready { border-top-color: var(--ok); }
.kb-col-ready .kb-col-icon {
    background: color-mix(in oklab, var(--ok) 14%, var(--paper));
    color: var(--ok);
}
.kb-col-ready .kb-col-count {
    background: color-mix(in oklab, var(--ok) 14%, var(--paper));
    color: var(--ok);
    border-color: color-mix(in oklab, var(--ok) 30%, transparent);
}

.kb-col-body {
    flex: 1;
    padding: var(--s-3);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    max-height: calc(100vh - 280px);
}

.kb-col-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--s-7) var(--s-3);
    color: var(--ink-3);
    font-size: 13px;
    text-align: center;
}

.kb-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--s-9) var(--s-4);
    gap: var(--s-3);
    color: var(--ink-3);
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    background: var(--paper);
    border: 1px dashed var(--line);
    border-radius: var(--r-lg);
}

.kb-empty :deep(.ds-empty-icon) {
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    background: var(--bg-2);
    border-radius: 50%;
    font-size: 22px;
    color: var(--ink-3);
}

@media (max-width: 991px) {
    .kb {
        grid-template-columns: 1fr;
    }
    .kb-col-body { max-height: none; }
}
</style>
