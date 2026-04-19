<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { seatReservation, reservationErrorMessage } from '@/utils';

const props = defineProps({
    show: { type: Boolean, default: false },
    reservation: { type: Object, default: null },
    tables: { type: Array, default: () => [] },
    token: { type: String, default: null },
});

const emit = defineEmits(['close', 'seated']);

// 'auto' | '<documentId>' | null
const selectedTableId = ref('auto');
const coversOverride = ref(null);
const submitting = ref(false);
const errorMessage = ref('');

const freeTables = computed(() =>
    (props.tables || []).filter(t => t.status === 'free')
);

const reservationGuests = computed(() => {
    const n = parseInt(props.reservation?.number_of_people, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
});

watch(() => props.show, (v) => {
    if (!v) return;
    selectedTableId.value = 'auto';
    coversOverride.value = reservationGuests.value;
    errorMessage.value = '';
    submitting.value = false;
});

const selectTable = (table) => {
    selectedTableId.value = table.documentId;
};

const selectAuto = () => {
    selectedTableId.value = 'auto';
};

const doSeat = async (force = false) => {
    const body = {
        covers: parseInt(coversOverride.value, 10) || reservationGuests.value,
    };
    if (selectedTableId.value && selectedTableId.value !== 'auto') {
        body.table_id = selectedTableId.value;
    }
    if (force) body.force = true;
    return seatReservation(props.reservation.documentId, body, props.token);
};

const submit = async () => {
    if (!selectedTableId.value || !props.reservation?.documentId) return;
    submitting.value = true;
    errorMessage.value = '';
    try {
        const result = await doSeat(false);
        emit('seated', result);
        emit('close');
    } catch (err) {
        if (err?.code === 'OVERBOOKING' && selectedTableId.value === 'auto') {
            const d = err.details || {};
            const msg =
                `Posti finiti: capienza ${d.capacity ?? '?'}, occupati ${d.current ?? '?'}, ` +
                `richiesti ${d.requested ?? '?'}.\n\nVuoi creare comunque il tavolo e far accomodare il cliente?`;
            if (window.confirm(msg)) {
                try {
                    const result = await doSeat(true);
                    emit('seated', result);
                    emit('close');
                    return;
                } catch (err2) {
                    errorMessage.value = reservationErrorMessage(err2);
                }
            } else {
                errorMessage.value = 'Accomodazione annullata per mancanza posti.';
            }
        } else {
            errorMessage.value = reservationErrorMessage(err);
        }
    } finally {
        submitting.value = false;
    }
};

const onClose = () => {
    if (submitting.value) return;
    emit('close');
};
</script>

<template>
    <Modal :show="show" @close="onClose">
        <template #title>
            <div class="modal-title-wrap">
                <i class="bi bi-door-open" aria-hidden="true"></i>
                <h2 class="modal-title">Fai accomodare</h2>
            </div>
        </template>

        <template #body>
            <div class="seat-modal">
                <div v-if="reservation" class="seat-resv-info">
                    <div class="seat-resv-row">
                        <i class="bi bi-person" aria-hidden="true"></i>
                        <span class="seat-resv-name">{{ reservation.customer_name || 'Senza nome' }}</span>
                    </div>
                    <div class="seat-resv-row">
                        <i class="bi bi-people" aria-hidden="true"></i>
                        <span>{{ reservationGuests }} {{ reservationGuests === 1 ? 'persona' : 'persone' }}</span>
                    </div>
                </div>

                <Transition name="fade">
                    <div v-if="errorMessage" class="ds-alert ds-alert-error" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                </Transition>

                <h3 class="seat-section-title">
                    Tavolo
                    <span v-if="freeTables.length" class="seat-section-hint">
                        ({{ freeTables.length }} liber{{ freeTables.length === 1 ? 'o' : 'i' }})
                    </span>
                </h3>

                <div class="seat-table-grid">
                    <button
                        type="button"
                        :class="['seat-table-btn', 'seat-auto-btn', { selected: selectedTableId === 'auto' }]"
                        @click="selectAuto"
                    >
                        <i class="bi bi-magic seat-auto-icon" aria-hidden="true"></i>
                        <span class="seat-table-num">Auto</span>
                        <span class="seat-table-meta">Crea nuovo tavolo</span>
                    </button>
                    <button
                        v-for="t in freeTables"
                        :key="t.documentId"
                        type="button"
                        :class="['seat-table-btn', { selected: selectedTableId === t.documentId }]"
                        @click="selectTable(t)"
                    >
                        <span class="seat-table-num">T{{ t.number }}</span>
                        <span class="seat-table-meta">
                            {{ t.seats }} posti &middot; {{ t.area === 'esterno' ? 'Esterno' : 'Interno' }}
                        </span>
                    </button>
                </div>
                <p v-if="selectedTableId === 'auto'" class="ds-helper seat-hint">
                    <i class="bi bi-info-circle" aria-hidden="true"></i>
                    Verrà creato un nuovo tavolo se ci sono abbastanza posti.
                </p>

                <div v-if="selectedTableId" class="ds-field">
                    <label class="ds-label" for="seat-covers">Coperti</label>
                    <input
                        id="seat-covers"
                        v-model.number="coversOverride"
                        type="number"
                        min="1"
                        class="ds-input"
                    >
                    <p class="ds-helper">Di default corrisponde al numero di persone della prenotazione.</p>
                </div>

                <div class="form-actions">
                    <button type="button" class="ds-btn ds-btn-ghost" @click="onClose" :disabled="submitting">
                        Annulla
                    </button>
                    <button
                        type="button"
                        class="ds-btn ds-btn-primary"
                        :disabled="submitting || !selectedTableId"
                        @click="submit"
                    >
                        <span v-if="submitting" class="ds-spinner" aria-hidden="true"></span>
                        <template v-else>
                            <i class="bi bi-check-lg" aria-hidden="true"></i>
                            <span>Conferma accomodazione</span>
                        </template>
                    </button>
                </div>
            </div>
        </template>
    </Modal>
</template>

<style scoped>
.modal-title-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-primary);
}
.modal-title {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
}

.seat-modal {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.seat-resv-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-md);
}
.seat-resv-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
}
.seat-resv-row i {
    color: var(--color-text-muted);
}
.seat-resv-name {
    color: var(--color-text);
    font-weight: 600;
}

.seat-section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
}
.seat-section-hint {
    margin-left: var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: none;
    letter-spacing: normal;
}
.seat-hint {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    margin: 0;
}

.seat-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-6);
    color: var(--color-text-muted);
    gap: var(--space-2);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-md);
}

.seat-table-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-2);
    max-height: 280px;
    overflow-y: auto;
}

.seat-table-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 2px solid var(--color-border);
    background: var(--color-bg-elevated);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: var(--font-family);
}
.seat-table-btn:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
}
.seat-table-btn.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
    box-shadow: 0 0 0 2px var(--color-primary-light);
}
.seat-auto-btn {
    border-style: dashed;
}
.seat-auto-icon {
    font-size: var(--text-xl);
    color: var(--color-primary);
    margin-bottom: 2px;
}
.seat-table-num {
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--color-text);
}
.seat-table-meta {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: center;
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-2);
}

@media (max-width: 640px) {
    .form-actions {
        flex-direction: column-reverse;
    }
    .form-actions .ds-btn {
        width: 100%;
    }
}
</style>
