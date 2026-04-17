<script setup>
import { ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { createTable, updateTable, deleteTable, orderErrorMessage } from '@/utils';

const props = defineProps({
    show: { type: Boolean, default: false },
    token: { type: String, default: null },
    tables: { type: Array, default: () => [] },
    editingTable: { type: Object, default: null },
});

const emit = defineEmits(['close', 'updated']);

const form = ref({ number: '', seats: 2, area: 'interno' });
const fieldErrors = ref({});
const submitting = ref(false);
const errorMessage = ref('');
const deleteConfirm = ref(null);

const isEditing = ref(false);
const editDocId = ref(null);

watch(() => props.show, (v) => {
    if (!v) return;
    errorMessage.value = '';
    fieldErrors.value = {};
    submitting.value = false;
    deleteConfirm.value = null;

    if (props.editingTable) {
        isEditing.value = true;
        editDocId.value = props.editingTable.documentId;
        form.value = {
            number: props.editingTable.number,
            seats: props.editingTable.seats,
            area: props.editingTable.area || 'interno',
        };
    } else {
        isEditing.value = false;
        editDocId.value = null;
        const maxNum = props.tables.reduce((max, t) => Math.max(max, t.number || 0), 0);
        form.value = { number: maxNum + 1, seats: 2, area: 'interno' };
    }
});

const validate = () => {
    const errs = {};
    const n = parseInt(form.value.number, 10);
    if (!Number.isFinite(n) || n < 1) errs.number = 'Numero tavolo obbligatorio (min 1).';
    const s = parseInt(form.value.seats, 10);
    if (!Number.isFinite(s) || s < 1) errs.seats = 'Posti obbligatori (min 1).';
    if (s > 100) errs.seats = 'Massimo 100 posti.';
    fieldErrors.value = errs;
    return Object.keys(errs).length === 0;
};

const submit = async () => {
    errorMessage.value = '';
    if (!validate()) return;
    submitting.value = true;
    try {
        const payload = {
            number: parseInt(form.value.number, 10),
            seats: parseInt(form.value.seats, 10),
            area: form.value.area,
        };
        if (isEditing.value) {
            await updateTable(editDocId.value, payload, props.token);
        } else {
            await createTable(payload, props.token);
        }
        emit('updated');
        emit('close');
    } catch (err) {
        errorMessage.value = orderErrorMessage(err);
    } finally {
        submitting.value = false;
    }
};

const handleDelete = async (table) => {
    if (deleteConfirm.value !== table.documentId) {
        deleteConfirm.value = table.documentId;
        return;
    }
    submitting.value = true;
    errorMessage.value = '';
    try {
        await deleteTable(table.documentId, props.token);
        deleteConfirm.value = null;
        emit('updated');
    } catch (err) {
        errorMessage.value = orderErrorMessage(err);
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
                <i class="bi bi-grid-3x3-gap" aria-hidden="true"></i>
                <h2 class="modal-title">{{ isEditing ? 'Modifica tavolo' : 'Gestione tavoli' }}</h2>
            </div>
        </template>

        <template #body>
            <div class="tmm">
                <!-- Errore -->
                <Transition name="fade">
                    <div v-if="errorMessage" class="ds-alert ds-alert-error" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                </Transition>

                <!-- Form -->
                <form @submit.prevent="submit" novalidate>
                    <h3 class="tmm-section-title">{{ isEditing ? 'Modifica tavolo' : 'Nuovo tavolo' }}</h3>

                    <div class="form-row-3">
                        <div class="ds-field">
                            <label class="ds-label" for="tmm-number">Numero *</label>
                            <input
                                id="tmm-number"
                                v-model.number="form.number"
                                type="number"
                                min="1"
                                class="ds-input"
                                :aria-invalid="!!fieldErrors.number"
                            >
                            <p v-if="fieldErrors.number" class="ds-helper tmm-err">{{ fieldErrors.number }}</p>
                        </div>
                        <div class="ds-field">
                            <label class="ds-label" for="tmm-seats">Posti *</label>
                            <input
                                id="tmm-seats"
                                v-model.number="form.seats"
                                type="number"
                                min="1"
                                max="100"
                                class="ds-input"
                                :aria-invalid="!!fieldErrors.seats"
                            >
                            <p v-if="fieldErrors.seats" class="ds-helper tmm-err">{{ fieldErrors.seats }}</p>
                        </div>
                        <div class="ds-field">
                            <label class="ds-label" for="tmm-area">Area</label>
                            <select id="tmm-area" v-model="form.area" class="ds-input ds-select">
                                <option value="interno">Interno</option>
                                <option value="esterno">Esterno</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="ds-btn ds-btn-ghost" @click="onClose" :disabled="submitting">
                            {{ isEditing ? 'Annulla' : 'Chiudi' }}
                        </button>
                        <button type="submit" class="ds-btn ds-btn-primary" :disabled="submitting">
                            <span v-if="submitting" class="ds-spinner" aria-hidden="true"></span>
                            <template v-else>
                                <i :class="['bi', isEditing ? 'bi-check-lg' : 'bi-plus-lg']" aria-hidden="true"></i>
                                <span>{{ isEditing ? 'Salva' : 'Aggiungi tavolo' }}</span>
                            </template>
                        </button>
                    </div>
                </form>

                <!-- Lista tavoli esistenti (solo in modalita aggiunta) -->
                <template v-if="!isEditing && tables.length > 0">
                    <h3 class="tmm-section-title tmm-section-list">Tavoli esistenti ({{ tables.length }})</h3>
                    <div class="tmm-table-list">
                        <div
                            v-for="t in tables"
                            :key="t.documentId"
                            class="tmm-table-row"
                        >
                            <div class="tmm-table-info">
                                <span class="tmm-table-num">T{{ t.number }}</span>
                                <span class="tmm-table-meta">{{ t.seats }} posti &middot; {{ t.area === 'esterno' ? 'Esterno' : 'Interno' }}</span>
                            </div>
                            <div class="tmm-table-actions">
                                <span
                                    v-if="t.status === 'occupied'"
                                    class="tmm-occupied-label"
                                >
                                    Occupato
                                </span>
                                <button
                                    v-else
                                    type="button"
                                    class="ds-btn ds-btn-ghost ds-btn-sm"
                                    :class="{ 'ds-btn-destructive-ghost': deleteConfirm === t.documentId }"
                                    :disabled="submitting"
                                    @click="handleDelete(t)"
                                >
                                    <i class="bi bi-trash" aria-hidden="true"></i>
                                    <span>{{ deleteConfirm === t.documentId ? 'Conferma' : 'Elimina' }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </template>
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

.tmm {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.tmm-section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 var(--space-2) 0;
}
.tmm-section-list {
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
}

.form-row-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--space-4);
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-2);
    margin-top: var(--space-2);
}

.tmm-err {
    color: var(--color-destructive);
}

.tmm-table-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 240px;
    overflow-y: auto;
}
.tmm-table-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-1);
    border-bottom: 1px solid var(--color-border);
}
.tmm-table-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}
.tmm-table-num {
    font-weight: 700;
    font-size: var(--text-sm);
    color: var(--color-text);
}
.tmm-table-meta {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
}
.tmm-table-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}
.tmm-occupied-label {
    font-size: var(--text-xs);
    color: var(--color-warning);
    font-weight: 500;
}
.ds-btn-destructive-ghost {
    color: var(--color-destructive);
}

@media (max-width: 640px) {
    .form-row-3 {
        grid-template-columns: 1fr;
        gap: 0;
    }
    .form-actions {
        flex-direction: column-reverse;
    }
    .form-actions .ds-btn {
        width: 100%;
    }
}
</style>
