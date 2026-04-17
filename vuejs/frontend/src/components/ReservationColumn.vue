<script setup>
import ReservationCard from '@/components/ReservationCard.vue';

defineProps({
    title: { type: String, required: true },
    icon: { type: String, default: 'bi-calendar-event' },
    tone: {
        type: String,
        default: 'neutral',
        validator: (v) => ['warning', 'primary', 'accent', 'neutral'].includes(v),
    },
    reservations: { type: Array, default: () => [] },
    busyIds: { type: Set, default: () => new Set() },
    emptyMessage: { type: String, default: 'Nessuna prenotazione.' },
});

const emit = defineEmits(['action']);
</script>

<template>
    <section class="res-col" :data-tone="tone" aria-labelledby="res-col-title">
        <header class="res-col-header">
            <div class="res-col-title-wrap">
                <span class="res-col-icon" aria-hidden="true">
                    <i :class="['bi', icon]"></i>
                </span>
                <h3 id="res-col-title" class="res-col-title">{{ title }}</h3>
            </div>
            <span class="res-col-count" aria-label="Numero prenotazioni">
                {{ reservations.length }}
            </span>
        </header>

        <div class="res-col-body">
            <template v-if="reservations.length">
                <TransitionGroup name="list" tag="div" class="res-col-list">
                    <ReservationCard
                        v-for="r in reservations"
                        :key="r.documentId"
                        :reservation="r"
                        :busy="busyIds.has(r.documentId)"
                        @action="payload => emit('action', payload)"
                    />
                </TransitionGroup>
            </template>
            <div v-else class="res-col-empty">
                <div class="ds-empty-icon">
                    <i :class="['bi', icon]" aria-hidden="true"></i>
                </div>
                <p class="ds-empty-description">{{ emptyMessage }}</p>
            </div>
        </div>
    </section>
</template>

<style scoped>
.res-col {
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    min-height: 280px;
    overflow: hidden;
}

.res-col-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-elevated);
    border-bottom: 1px solid var(--color-border);
}

.res-col-title-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.res-col-icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
}

.res-col-title {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
}

.res-col-count {
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

/* Colorazione tonale per header colonna */
.res-col[data-tone="warning"] .res-col-icon {
    background: var(--color-warning-light);
    color: var(--color-warning);
}
.res-col[data-tone="warning"] .res-col-count {
    background: var(--color-warning-light);
    color: var(--color-warning);
}
.res-col[data-tone="primary"] .res-col-icon {
    background: var(--color-primary-light);
    color: var(--color-primary);
}
.res-col[data-tone="primary"] .res-col-count {
    background: var(--color-primary-light);
    color: var(--color-primary);
}
.res-col[data-tone="accent"] .res-col-icon {
    background: var(--color-accent-light);
    color: var(--color-accent);
}
.res-col[data-tone="accent"] .res-col-count {
    background: var(--color-accent-light);
    color: var(--color-accent);
}

.res-col-body {
    flex: 1;
    padding: var(--space-3);
    overflow-y: auto;
}

.res-col-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.res-col-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-8) var(--space-3);
    gap: var(--space-2);
    color: var(--color-text-muted);
}
</style>
