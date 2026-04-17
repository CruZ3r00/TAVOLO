<script setup>
import { computed, ref } from 'vue';
import ReservationStatusBadge from '@/components/ReservationStatusBadge.vue';

const props = defineProps({
    reservation: { type: Object, required: true },
    busy: { type: Boolean, default: false },
});

const emit = defineEmits(['action']);

const notesExpanded = ref(false);

const dt = computed(() => {
    const raw = props.reservation?.datetime;
    if (!raw) return { time: '--:--', date: '' };
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return { time: '--:--', date: '' };
    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });
    return { time, date };
});

const customer = computed(() => ({
    name: props.reservation?.customer_name || '',
    phone: props.reservation?.phone || '',
}));

const guests = computed(() => {
    const n = props.reservation?.number_of_people;
    return Number.isFinite(n) ? n : 0;
});

const notes = computed(() => props.reservation?.notes || '');

// Le prenotazioni con stato iniziale pending sono quelle create dal sito
// vetrina pubblico; quelle già confirmed arrivano dal gestionale.
const createdBy = computed(() => props.reservation?.status === 'pending' ? 'sito vetrina' : 'gestionale');

// Azioni contestuali in base allo stato corrente (FSM ADR 0001.5)
const actions = computed(() => {
    switch (props.reservation?.status) {
        case 'pending':
            return [
                { key: 'confirm', label: 'Accetta', icon: 'bi-check-lg', cls: 'ds-btn-primary', next: 'confirmed' },
                { key: 'cancel', label: 'Rifiuta', icon: 'bi-x-lg', cls: 'ds-btn-secondary', next: 'cancelled' },
            ];
        case 'confirmed':
            return [
                { key: 'arrived', label: 'Arrivato', icon: 'bi-door-open', cls: 'ds-btn-accent', next: 'at_restaurant' },
                { key: 'cancel', label: 'Annulla', icon: 'bi-x-lg', cls: 'ds-btn-ghost', next: 'cancelled' },
            ];
        case 'at_restaurant':
            return [
                { key: 'complete', label: 'Chiudi', icon: 'bi-check2-all', cls: 'ds-btn-primary', next: 'completed' },
            ];
        default:
            return [];
    }
});

const handleAction = (action) => {
    emit('action', { documentId: props.reservation.documentId, next: action.next, key: action.key });
};

const phoneHref = computed(() => {
    const p = customer.value?.phone;
    if (!p) return null;
    return `tel:${p.replace(/\s+/g, '')}`;
});
</script>

<template>
    <article class="res-card" :aria-busy="busy">
        <header class="res-card-header">
            <div class="res-time" aria-label="Orario prenotazione">
                <span class="res-time-hour">{{ dt.time }}</span>
                <span class="res-time-date">{{ dt.date }}</span>
            </div>
            <ReservationStatusBadge :status="reservation.status" />
        </header>

        <div class="res-card-body">
            <div class="res-line res-name">
                <i class="bi bi-person" aria-hidden="true"></i>
                <span>{{ customer.name || 'Senza nome' }}</span>
            </div>
            <div class="res-line res-guests">
                <i class="bi bi-people" aria-hidden="true"></i>
                <span>{{ guests }} {{ guests === 1 ? 'persona' : 'persone' }}</span>
            </div>
            <div class="res-line res-phone" v-if="customer.phone">
                <i class="bi bi-telephone" aria-hidden="true"></i>
                <a :href="phoneHref" class="res-phone-link">{{ customer.phone }}</a>
            </div>
            <div class="res-notes" v-if="notes">
                <button
                    type="button"
                    class="res-notes-toggle"
                    @click="notesExpanded = !notesExpanded"
                    :aria-expanded="notesExpanded"
                >
                    <i :class="['bi', notesExpanded ? 'bi-chevron-up' : 'bi-chevron-down']" aria-hidden="true"></i>
                    <span>{{ notesExpanded ? 'Nascondi note' : 'Mostra note' }}</span>
                </button>
                <p v-if="notesExpanded" class="res-notes-text">{{ notes }}</p>
            </div>
            <div class="res-origin">
                <span class="text-overline">Origine: {{ createdBy }}</span>
            </div>
        </div>

        <footer v-if="actions.length" class="res-card-footer">
            <button
                v-for="a in actions"
                :key="a.key"
                type="button"
                class="ds-btn ds-btn-sm"
                :class="a.cls"
                :disabled="busy"
                @click="handleAction(a)"
            >
                <span v-if="busy" class="ds-spinner" aria-hidden="true"></span>
                <template v-else>
                    <i :class="['bi', a.icon]" aria-hidden="true"></i>
                    <span>{{ a.label }}</span>
                </template>
            </button>
        </footer>
    </article>
</template>

<style scoped>
.res-card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
    overflow: hidden;
    transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
    display: flex;
    flex-direction: column;
}
.res-card:hover {
    box-shadow: var(--shadow-sm);
    border-color: var(--color-border-hover);
}
.res-card[aria-busy="true"] {
    opacity: 0.7;
}

.res-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
}

.res-time {
    display: flex;
    flex-direction: column;
    line-height: 1;
}
.res-time-hour {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: var(--tracking-tight);
}
.res-time-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: var(--space-1);
    text-transform: capitalize;
}

.res-card-body {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
}

.res-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
}
.res-line i {
    color: var(--color-text-muted);
    font-size: var(--text-base);
}
.res-name {
    color: var(--color-text);
    font-weight: 600;
    font-size: var(--text-base);
}

.res-phone-link {
    color: var(--color-primary);
    text-decoration: none;
}
.res-phone-link:hover {
    text-decoration: underline;
}

.res-notes {
    margin-top: var(--space-1);
}
.res-notes-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    background: none;
    border: none;
    padding: 0;
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    font-family: var(--font-family);
}
.res-notes-toggle:hover {
    color: var(--color-primary-hover);
}
.res-notes-text {
    margin: var(--space-2) 0 0 0;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    white-space: pre-wrap;
}

.res-origin {
    margin-top: auto;
    padding-top: var(--space-2);
}

.res-card-footer {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-subtle);
    flex-wrap: wrap;
}
.res-card-footer .ds-btn {
    flex: 1;
    min-width: 110px;
}
</style>
