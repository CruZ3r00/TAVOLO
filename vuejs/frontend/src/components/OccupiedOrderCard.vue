<script setup>
import { computed } from 'vue';

const props = defineProps({
    order: { type: Object, required: true },
});

const emit = defineEmits(['open', 'checkout']);

const reservation = computed(() => props.order?.reservation || null);

const isWalkin = computed(() => reservation.value?.is_walkin === true);

const customerName = computed(() => {
    const r = reservation.value;
    if (!r) return null;
    const name = (r.customer_name || '').trim();
    return name || null;
});

const tableLabel = computed(() => {
    const t = props.order?.table;
    return t && t.number != null ? `Tavolo ${t.number}` : 'Tavolo';
});

const areaLabel = computed(() => {
    const area = props.order?.table?.area;
    return area === 'esterno' ? 'Esterno' : 'Interno';
});

const openedTime = computed(() => {
    const raw = props.order?.opened_at;
    if (!raw) return '--:--';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
});

const itemCount = computed(() => {
    const items = Array.isArray(props.order?.items) ? props.order.items : [];
    return items.reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 0), 0);
});

const readyCount = computed(() => {
    const items = Array.isArray(props.order?.items) ? props.order.items : [];
    return items.filter((it) => it.status === 'ready').length;
});

const totalAmount = computed(() => {
    const raw = props.order?.total_amount;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
});

const coversLabel = computed(() => {
    const c = parseInt(props.order?.covers, 10);
    if (!Number.isFinite(c) || c < 1) return null;
    return `${c} ${c === 1 ? 'coperto' : 'coperti'}`;
});
</script>

<template>
    <article class="oo-card" :class="{ 'oo-card-walkin': isWalkin }">
        <header class="oo-card-header">
            <div class="oo-table">
                <span class="oo-table-label">{{ tableLabel }}</span>
                <span class="oo-table-area">{{ areaLabel }}</span>
            </div>
            <span v-if="isWalkin" class="oo-status-badge oo-badge-walkin">
                <i class="bi bi-person-walking" aria-hidden="true"></i>
                Walk-in
            </span>
            <span v-else class="oo-status-badge">
                <i class="bi bi-cup-straw" aria-hidden="true"></i>
                Ordine attivo
            </span>
        </header>

        <div class="oo-card-body">
            <div class="oo-line" v-if="customerName">
                <i class="bi bi-person" aria-hidden="true"></i>
                <span class="oo-customer">{{ customerName }}</span>
            </div>
            <div class="oo-line">
                <i class="bi bi-clock" aria-hidden="true"></i>
                <span>Aperto alle {{ openedTime }}</span>
            </div>
            <div class="oo-line" v-if="coversLabel">
                <i class="bi bi-people" aria-hidden="true"></i>
                <span>{{ coversLabel }}</span>
            </div>
            <div class="oo-line">
                <i class="bi bi-list-ul" aria-hidden="true"></i>
                <span>{{ itemCount }} {{ itemCount === 1 ? 'piatto' : 'piatti' }}</span>
                <span v-if="readyCount > 0" class="oo-ready-chip" :aria-label="`${readyCount} piatti pronti`">
                    <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
                    {{ readyCount }} pronti
                </span>
            </div>
            <div class="oo-total-row">
                <span class="oo-total-label">Totale</span>
                <span class="oo-total-value">&euro; {{ totalAmount }}</span>
            </div>
        </div>

        <footer class="oo-card-footer">
            <button
                type="button"
                class="ds-btn ds-btn-sm ds-btn-ghost"
                @click="emit('open', order)"
            >
                <i class="bi bi-pencil-square" aria-hidden="true"></i>
                <span>Gestisci ordine</span>
            </button>
            <button
                type="button"
                class="ds-btn ds-btn-sm ds-btn-primary"
                @click="emit('checkout', order)"
            >
                <i class="bi bi-receipt" aria-hidden="true"></i>
                <span>Chiudi conto</span>
            </button>
        </footer>
    </article>
</template>

<style scoped>
.oo-card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--color-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}
.oo-card:hover {
    box-shadow: var(--shadow-sm);
    border-color: var(--color-border-hover);
    border-left-color: var(--color-primary);
}
.oo-card-walkin {
    border-left-color: var(--color-accent);
}
.oo-card-walkin:hover {
    border-left-color: var(--color-accent);
}

.oo-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
}

.oo-table {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
}
.oo-table-label {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: var(--tracking-tight);
}
.oo-table-area {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: var(--space-1);
}

.oo-status-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px 8px;
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
}
.oo-badge-walkin {
    background: var(--color-accent-light);
    color: var(--color-accent);
}

.oo-card-body {
    padding: var(--space-3) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.oo-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
}
.oo-line i {
    color: var(--color-text-muted);
    font-size: var(--text-base);
}
.oo-customer {
    color: var(--color-text);
    font-weight: 600;
}

.oo-ready-chip {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--color-accent-light);
    color: var(--color-accent);
    font-size: 11px;
    font-weight: 600;
    border-radius: var(--radius-full);
}

.oo-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--space-1);
    padding-top: var(--space-2);
    border-top: 1px dashed var(--color-border);
}
.oo-total-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.oo-total-value {
    font-size: var(--text-base);
    font-weight: 700;
    color: var(--color-text);
}

.oo-card-footer {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-subtle);
}
.oo-card-footer .ds-btn {
    flex: 1;
}
</style>
