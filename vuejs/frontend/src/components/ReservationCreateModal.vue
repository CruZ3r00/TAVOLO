<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { createReservation, reservationErrorMessage } from '@/utils';

const props = defineProps({
    show: { type: Boolean, default: false },
    token: { type: String, default: null },
});

const emit = defineEmits(['close', 'created']);

const todayISO = () => new Date().toISOString().slice(0, 10);

const form = ref({
    customer_name: '',
    phone: '',
    email: '',
    date: todayISO(),
    time: '20:00',
    guests: 2,
    notes: '',
    status: 'confirmed',
});

const submitting = ref(false);
const errorMessage = ref('');
const fieldErrors = ref({});

const reset = () => {
    form.value = {
        customer_name: '',
        phone: '',
        email: '',
        date: todayISO(),
        time: '20:00',
        guests: 2,
        notes: '',
        status: 'confirmed',
    };
    submitting.value = false;
    errorMessage.value = '';
    fieldErrors.value = {};
};

// Reset form ogni volta che il modal si apre
watch(() => props.show, (v) => { if (v) reset(); });

const minDate = computed(() => todayISO());

const validate = () => {
    const errs = {};
    if (!form.value.customer_name.trim()) errs.customer_name = 'Inserisci il nome.';
    if (!form.value.phone.trim()) errs.phone = 'Inserisci il telefono.';
    if (!form.value.date) errs.date = 'Seleziona la data.';
    if (!form.value.time) errs.time = 'Seleziona l\'ora.';
    const g = parseInt(form.value.guests, 10);
    if (!Number.isFinite(g) || g < 1) errs.guests = 'Inserisci un numero valido (min 1).';
    if (g > 50) errs.guests = 'Massimo 50 persone per prenotazione.';
    if (form.value.date) {
        // Confronto a livello di giorno — accetta oggi
        const selected = new Date(`${form.value.date}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selected < today) errs.date = 'La data non può essere nel passato.';
    }
    // Verifica combinazione data+ora futura (margine lasciato al backend >15min)
    if (form.value.date && form.value.time) {
        const combined = new Date(`${form.value.date}T${form.value.time}`);
        if (combined.getTime() < Date.now()) {
            errs.time = 'L\'orario selezionato è nel passato.';
        }
    }
    fieldErrors.value = errs;
    return Object.keys(errs).length === 0;
};

const submit = async () => {
    errorMessage.value = '';
    if (!validate()) return;
    submitting.value = true;
    try {
        const notesWithEmail = (() => {
            const email = form.value.email.trim();
            const base = form.value.notes.trim();
            if (!email) return base || null;
            return base ? `${base}\nEmail: ${email}` : `Email: ${email}`;
        })();
        const payload = {
            customer_name: form.value.customer_name.trim(),
            phone: form.value.phone.trim(),
            date: form.value.date,
            time: form.value.time.length === 5 ? `${form.value.time}:00` : form.value.time,
            number_of_people: parseInt(form.value.guests, 10),
            notes: notesWithEmail,
            status: form.value.status,
        };
        const created = await createReservation(payload, props.token);
        emit('created', created);
        emit('close');
    } catch (err) {
        errorMessage.value = reservationErrorMessage(err);
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
                <i class="bi bi-calendar-plus" aria-hidden="true"></i>
                <h2 class="modal-title">Nuova prenotazione</h2>
            </div>
        </template>

        <template #body>
            <form @submit.prevent="submit" class="res-form" novalidate>
                <Transition name="fade">
                    <div v-if="errorMessage" class="ds-alert ds-alert-error" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                </Transition>

                <div class="ds-field">
                    <label class="ds-label" for="res-name">Nome cliente *</label>
                    <input
                        id="res-name"
                        v-model="form.customer_name"
                        type="text"
                        class="ds-input"
                        placeholder="Es. Mario Rossi"
                        :aria-invalid="!!fieldErrors.customer_name"
                        required
                    >
                    <p v-if="fieldErrors.customer_name" class="ds-helper res-err">{{ fieldErrors.customer_name }}</p>
                </div>

                <div class="form-row-2">
                    <div class="ds-field">
                        <label class="ds-label" for="res-phone">Telefono *</label>
                        <input
                            id="res-phone"
                            v-model="form.phone"
                            type="tel"
                            class="ds-input"
                            placeholder="+39 320 1234567"
                            :aria-invalid="!!fieldErrors.phone"
                            required
                        >
                        <p v-if="fieldErrors.phone" class="ds-helper res-err">{{ fieldErrors.phone }}</p>
                    </div>
                    <div class="ds-field">
                        <label class="ds-label" for="res-email">Email</label>
                        <input
                            id="res-email"
                            v-model="form.email"
                            type="email"
                            class="ds-input"
                            placeholder="mario@esempio.com"
                        >
                    </div>
                </div>

                <div class="form-row-3">
                    <div class="ds-field">
                        <label class="ds-label" for="res-date">Data *</label>
                        <input
                            id="res-date"
                            v-model="form.date"
                            type="date"
                            class="ds-input"
                            :min="minDate"
                            :aria-invalid="!!fieldErrors.date"
                            required
                        >
                        <p v-if="fieldErrors.date" class="ds-helper res-err">{{ fieldErrors.date }}</p>
                    </div>
                    <div class="ds-field">
                        <label class="ds-label" for="res-time">Ora *</label>
                        <input
                            id="res-time"
                            v-model="form.time"
                            type="time"
                            class="ds-input"
                            step="300"
                            :aria-invalid="!!fieldErrors.time"
                            required
                        >
                        <p v-if="fieldErrors.time" class="ds-helper res-err">{{ fieldErrors.time }}</p>
                    </div>
                    <div class="ds-field">
                        <label class="ds-label" for="res-guests">Persone *</label>
                        <input
                            id="res-guests"
                            v-model.number="form.guests"
                            type="number"
                            min="1"
                            max="50"
                            class="ds-input"
                            :aria-invalid="!!fieldErrors.guests"
                            required
                        >
                        <p v-if="fieldErrors.guests" class="ds-helper res-err">{{ fieldErrors.guests }}</p>
                    </div>
                </div>

                <div class="ds-field">
                    <label class="ds-label" for="res-status">Stato iniziale</label>
                    <select id="res-status" v-model="form.status" class="ds-input ds-select">
                        <option value="confirmed">Confermata (default)</option>
                        <option value="pending">In attesa</option>
                    </select>
                    <p class="ds-helper">
                        "Confermata" per prenotazioni sicure; "In attesa" se devi ancora ricontattare il cliente.
                    </p>
                </div>

                <div class="ds-field">
                    <label class="ds-label" for="res-notes">Note</label>
                    <textarea
                        id="res-notes"
                        v-model="form.notes"
                        class="ds-input"
                        rows="3"
                        placeholder="Allergie, richieste speciali, tavolo preferito..."
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
                            <span>Salva prenotazione</span>
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
    color: var(--color-primary);
}
.modal-title {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
}

.res-form {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.form-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
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
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-2);
}

.res-err {
    color: var(--color-destructive);
}

textarea.ds-input {
    min-height: 80px;
    resize: vertical;
}

@media (max-width: 640px) {
    .form-row-2,
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
