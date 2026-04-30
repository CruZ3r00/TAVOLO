<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { createWalkin, reservationErrorMessage } from '@/utils';

const props = defineProps({
    show: { type: Boolean, default: false },
    tables: { type: Array, default: () => [] },
    token: { type: String, default: null },
});

const emit = defineEmits(['close', 'created']);

// table_id === 'auto' → lascia che il backend crei il tavolo automaticamente.
// table_id === '<documentId>' → usa un tavolo libero esistente.
const form = ref({
    table_id: 'auto',
    number_of_people: 2,
    customer_name: '',
    phone: '',
    notes: '',
});
const submitting = ref(false);
const errorMessage = ref('');
const fieldErrors = ref({});

const freeTables = computed(() =>
    (props.tables || []).filter(t => t.status === 'free')
);

watch(() => props.show, (v) => {
    if (!v) return;
    form.value = {
        table_id: 'auto',
        number_of_people: 2,
        customer_name: '',
        phone: '',
        notes: '',
    };
    errorMessage.value = '';
    fieldErrors.value = {};
    submitting.value = false;
});

const selectTable = (table) => {
    form.value.table_id = table.documentId;
};

const selectAuto = () => {
    form.value.table_id = 'auto';
};

const validate = () => {
    const errs = {};
    const name = form.value.customer_name.trim();
    if (!name) errs.customer_name = 'Nome tavolo obbligatorio.';
    else if (name.length > 120) errs.customer_name = 'Nome troppo lungo.';
    const phone = form.value.phone.trim();
    if (phone && phone.length > 32) errs.phone = 'Telefono troppo lungo.';
    const n = parseInt(form.value.number_of_people, 10);
    if (!Number.isFinite(n) || n < 1) errs.number_of_people = 'Numero persone (min 1).';
    else if (n > 50) errs.number_of_people = 'Massimo 50 persone.';
    fieldErrors.value = errs;
    return Object.keys(errs).length === 0;
};

const buildPayload = (force = false) => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const payload = {
        customer_name: form.value.customer_name.trim(),
        number_of_people: parseInt(form.value.number_of_people, 10),
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    };
    if (form.value.table_id && form.value.table_id !== 'auto') {
        payload.table_id = form.value.table_id;
    }
    const phone = form.value.phone.trim();
    if (phone) payload.phone = phone;
    const notes = form.value.notes.trim();
    if (notes) payload.notes = notes;
    if (force) payload.force = true;
    return payload;
};

const submit = async () => {
    errorMessage.value = '';
    if (!validate()) return;
    submitting.value = true;
    try {
        const result = await createWalkin(buildPayload(false), props.token);
        emit('created', result);
        emit('close');
    } catch (err) {
        if (err?.code === 'OVERBOOKING' && form.value.table_id === 'auto') {
            const d = err.details || {};
            const msg =
                `Posti finiti: capienza ${d.capacity ?? '?'}, occupati ${d.current ?? '?'}, ` +
                `richiesti ${d.requested ?? '?'}.\n\nVuoi creare comunque il tavolo e far accomodare il cliente?`;
            if (window.confirm(msg)) {
                try {
                    const result = await createWalkin(buildPayload(true), props.token);
                    emit('created', result);
                    emit('close');
                    return;
                } catch (err2) {
                    errorMessage.value = reservationErrorMessage(err2);
                }
            } else {
                errorMessage.value = 'Walk-in annullato per mancanza posti.';
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
                <i class="bi bi-person-plus" aria-hidden="true"></i>
                <h2 class="modal-title">Cliente senza prenotazione</h2>
            </div>
        </template>

        <template #body>
            <form class="walkin-form" @submit.prevent="submit" novalidate>
                <Transition name="fade">
                    <div v-if="errorMessage" class="ds-alert ds-alert-error" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                </Transition>

                <h3 class="walkin-section-title">
                    Tavolo
                    <span v-if="freeTables.length" class="walkin-section-hint">
                        ({{ freeTables.length }} liber{{ freeTables.length === 1 ? 'o' : 'i' }})
                    </span>
                </h3>

                <div class="walkin-table-grid">
                    <button
                        type="button"
                        :class="['walkin-table-btn', 'walkin-auto-btn', { selected: form.table_id === 'auto' }]"
                        @click="selectAuto"
                    >
                        <i class="bi bi-magic walkin-auto-icon" aria-hidden="true"></i>
                        <span class="walkin-table-num">Auto</span>
                        <span class="walkin-table-meta">Crea nuovo tavolo</span>
                    </button>
                    <button
                        v-for="t in freeTables"
                        :key="t.documentId"
                        type="button"
                        :class="['walkin-table-btn', { selected: form.table_id === t.documentId }]"
                        @click="selectTable(t)"
                    >
                        <span class="walkin-table-num">T{{ t.number }}</span>
                        <span class="walkin-table-meta">
                            {{ t.seats }} posti &middot; {{ t.area === 'esterno' ? 'Esterno' : 'Interno' }}
                        </span>
                    </button>
                </div>
                <p v-if="form.table_id === 'auto'" class="ds-helper walkin-hint">
                    <i class="bi bi-info-circle" aria-hidden="true"></i>
                    Verrà creato un nuovo tavolo se ci sono abbastanza posti.
                </p>
                <p v-else-if="!freeTables.length" class="ds-helper walkin-hint">
                    <i class="bi bi-info-circle" aria-hidden="true"></i>
                    Nessun tavolo libero: seleziona "Auto" per crearne uno nuovo.
                </p>

                <div class="form-row-2">
                    <div class="ds-field">
                        <label class="ds-label" for="walkin-guests">Persone *</label>
                        <input
                            id="walkin-guests"
                            v-model.number="form.number_of_people"
                            type="number"
                            min="1"
                            max="50"
                            class="ds-input"
                            :aria-invalid="!!fieldErrors.number_of_people"
                            required
                        >
                        <p v-if="fieldErrors.number_of_people" class="ds-helper walkin-err">{{ fieldErrors.number_of_people }}</p>
                    </div>
                    <div class="ds-field">
                        <label class="ds-label" for="walkin-name">Nome tavolo *</label>
                        <input
                            id="walkin-name"
                            v-model="form.customer_name"
                            type="text"
                            class="ds-input"
                            placeholder="Es. Rossi"
                            :aria-invalid="!!fieldErrors.customer_name"
                            required
                        >
                        <p v-if="fieldErrors.customer_name" class="ds-helper walkin-err">{{ fieldErrors.customer_name }}</p>
                    </div>
                </div>

                <div class="ds-field">
                    <label class="ds-label" for="walkin-phone">Telefono (opzionale)</label>
                    <input
                        id="walkin-phone"
                        v-model="form.phone"
                        type="tel"
                        class="ds-input"
                        placeholder="+39 320 1234567"
                        :aria-invalid="!!fieldErrors.phone"
                    >
                    <p v-if="fieldErrors.phone" class="ds-helper walkin-err">{{ fieldErrors.phone }}</p>
                </div>

                <div class="ds-field">
                    <label class="ds-label" for="walkin-notes">Note</label>
                    <textarea
                        id="walkin-notes"
                        v-model="form.notes"
                        class="ds-input"
                        rows="2"
                        placeholder="Allergie, richieste speciali..."
                        maxlength="1000"
                    ></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="ds-btn ds-btn-ghost" @click="onClose" :disabled="submitting">
                        Annulla
                    </button>
                    <button type="submit" class="ds-btn ds-btn-primary" :disabled="submitting">
                        <span v-if="submitting" class="ds-spinner" aria-hidden="true"></span>
                        <template v-else>
                            <i class="bi bi-check-lg" aria-hidden="true"></i>
                            <span>Apri tavolo</span>
                        </template>
                    </button>
                </div>
            </form>
        </template>
    </Modal>
</template>

<style scoped>
.modal-title-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-accent);
}
.modal-title {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
}

.walkin-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.walkin-section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
}
.walkin-section-hint {
    margin-left: var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: none;
    letter-spacing: normal;
}

.walkin-empty {
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

.walkin-table-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-2);
    max-height: 240px;
    overflow-y: auto;
}

.walkin-table-btn {
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
.walkin-table-btn:hover {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
}
.walkin-table-btn.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
    box-shadow: 0 0 0 2px var(--color-accent-light);
}
.walkin-auto-btn {
    border-style: dashed;
}
.walkin-auto-icon {
    font-size: var(--text-xl);
    color: var(--color-accent);
    margin-bottom: 2px;
}
.walkin-table-num {
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--color-text);
}
.walkin-table-meta {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: center;
}
.walkin-hint {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    margin: 0;
}

.form-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
}

.walkin-err {
    color: var(--color-destructive);
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-2);
}

textarea.ds-input {
    min-height: 60px;
    resize: vertical;
}

@media (max-width: 640px) {
    .form-row-2 { grid-template-columns: 1fr; gap: 0; }
    .form-actions {
        flex-direction: column-reverse;
    }
    .form-actions .ds-btn {
        width: 100%;
    }
}
</style>
