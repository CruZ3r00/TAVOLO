<script setup>
import OrdersTableCard from '@/components/OrdersTableCard.vue';

defineProps({
    tables: { type: Array, default: () => [] },
    orders: { type: Array, default: () => [] },
});

const emit = defineEmits(['view-order']);

/**
 * Trova l'ordine attivo per un dato tavolo.
 * Confronta per documentId del tavolo annidato nell'ordine.
 */
function activeOrderForTable(table, orders) {
    return orders.find(
        o => o.status === 'active' && o.table?.documentId === table.documentId
    ) || null;
}
</script>

<template>
    <div class="otg" v-if="tables.length">
        <OrdersTableCard
            v-for="t in tables"
            :key="t.documentId"
            :table="t"
            :active-order="activeOrderForTable(t, orders)"
            @view-order="(ord) => emit('view-order', ord)"
        />
    </div>
    <div v-else class="otg-empty">
        <div class="ds-empty-icon"><i class="bi bi-grid-3x3-gap"></i></div>
        <p class="ds-empty-description">
            Nessun tavolo configurato. Vai alla scheda Prenotazioni per aggiungere tavoli.
        </p>
    </div>
</template>

<style scoped>
.otg {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-4);
}

.otg-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-12) var(--space-4);
    gap: var(--space-3);
    color: var(--color-text-muted);
}

@media (max-width: 768px) {
    .otg {
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-3);
    }
}
</style>
