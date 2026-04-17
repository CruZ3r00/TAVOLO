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
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
    overflow: hidden;
    transition: box-shadow var(--transition-fast), opacity var(--transition-fast);
}
.kic:hover {
    box-shadow: var(--shadow-sm);
}
.kic-busy {
    opacity: 0.6;
    pointer-events: none;
}

.kic-taken {
    border-left: 3px solid var(--color-text-muted);
}
.kic-preparing {
    border-left: 3px solid var(--color-warning);
}
.kic-ready {
    border-left: 3px solid var(--color-accent);
}

.kic-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-border);
}
.kic-table {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.kic-body {
    padding: var(--space-3);
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}
.kic-dish {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
}
.kic-name {
    font-weight: 600;
    font-size: var(--text-base);
    color: var(--color-text);
}
.kic-qty {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--color-text-muted);
    flex-shrink: 0;
}

.kic-notes {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    padding: var(--space-2);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-sm);
    margin: 0;
}
.kic-notes i {
    margin-top: 1px;
    flex-shrink: 0;
}

.kic-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-subtle);
}
.kic-timer {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
}

/* Bottoni grandi per touch cucina */
.kic-footer .ds-btn {
    min-height: 36px;
    padding: var(--space-2) var(--space-3);
}
</style>
