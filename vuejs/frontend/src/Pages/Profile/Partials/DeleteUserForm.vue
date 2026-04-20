<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import TextInput from '@/components/TextInput.vue';
import Modal from '@/components/Modal.vue';
import { API_BASE } from '@/utils';

const storeVx = useStore();
const router = useRouter();

const confirmingUserDeletion = ref(false);
const passwordInput = ref(null);

const form = reactive({
    password: '',
    error: '',
    processing: false,
});

const confirmUserDeletion = () => {
    form.error = '';
    confirmingUserDeletion.value = true;
    setTimeout(() => passwordInput.value?.focus(), 250);
};

const deleteUser = async () => {
    form.processing = true;
    form.error = '';
    try {
        const tkn = storeVx.getters.getToken;
        const response = await fetch(`${API_BASE}/api/account/destroy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tkn}`,
            },
            body: JSON.stringify({ password: form.password }),
        });
        const data = await response.json();
        if (!response.ok) {
            form.error = data?.error?.message || data?.message || 'Password errata';
            return;
        }
        storeVx.dispatch('logout');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        closeModal();
        router.push('/login');
    } catch (e) {
        form.error = 'Errore di rete. Riprova.';
    } finally {
        form.processing = false;
        form.password = '';
    }
};

const closeModal = () => {
    confirmingUserDeletion.value = false;
    form.password = '';
    form.error = '';
};
</script>

<template>
    <div class="profile-section danger-section">
        <div class="section-header">
            <div class="section-icon danger"><i class="bi bi-trash"></i></div>
            <div>
                <h3 class="section-title">Elimina account</h3>
                <p class="section-description">Azione irreversibile. I dati saranno cancellati permanentemente.</p>
            </div>
        </div>
        <div class="section-body">
            <div class="danger-notice">
                <i class="bi bi-exclamation-triangle"></i>
                <p>
                    Una volta eliminato il tuo account, tutti i dati e le risorse saranno cancellati
                    permanentemente. Prima di procedere, scarica eventuali dati che desideri conservare.
                </p>
            </div>
            <button @click="confirmUserDeletion" class="danger-btn">
                <i class="bi bi-trash"></i>
                <span>Elimina account</span>
            </button>
        </div>
    </div>

    <Modal :show="confirmingUserDeletion" @close="closeModal">
        <template #title>
            <h3 class="modal-danger-title">
                <i class="bi bi-exclamation-triangle"></i>
                Elimina account
            </h3>
        </template>
        <template #body>
            <p class="modal-description">
                Sei sicuro di voler eliminare il tuo account? Tutti i dati saranno cancellati permanentemente. Inserisci la tua password per confermare.
            </p>
            <div class="ds-field">
                <TextInput
                    ref="passwordInput"
                    v-model="form.password"
                    type="password"
                    placeholder="La tua password"
                    autocomplete="current-password"
                    @keyup.enter="deleteUser"
                />
                <Transition name="fade">
                    <p v-if="form.error" class="field-error">{{ form.error }}</p>
                </Transition>
            </div>

            <div class="modal-actions">
                <button @click="closeModal" class="ds-btn ds-btn-secondary">Annulla</button>
                <button
                    class="ds-btn ds-btn-danger"
                    :disabled="form.processing || !form.password"
                    @click="deleteUser"
                >
                    <span v-if="form.processing" class="ds-spinner"></span>
                    <span v-else>Elimina account</span>
                </button>
            </div>
        </template>
    </Modal>
</template>

<style scoped>
.profile-section {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    font-family: var(--f-sans, 'Geist', sans-serif);
    overflow: hidden;
}
.danger-section {
    border-color: color-mix(in oklab, var(--dan) 25%, var(--line));
}
.section-header {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-5);
    border-bottom: 1px solid var(--line);
}
.section-icon {
    width: 36px; height: 36px;
    display: grid; place-items: center;
    background: color-mix(in oklab, var(--ac) 10%, var(--paper));
    color: var(--ac);
    border-radius: var(--r-sm);
    font-size: 16px;
    flex-shrink: 0;
}
.section-icon.danger {
    background: color-mix(in oklab, var(--dan) 12%, var(--paper));
    color: var(--dan);
}
.section-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 2px;
    letter-spacing: -0.01em;
}
.section-description {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.5;
}
.section-body { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-4); }
.danger-notice {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-4);
    background: color-mix(in oklab, var(--dan) 6%, var(--paper));
    border: 1px solid color-mix(in oklab, var(--dan) 20%, var(--line));
    border-radius: var(--r-md);
}
.danger-notice i {
    color: var(--dan);
    font-size: 18px;
    flex-shrink: 0;
    margin-top: 1px;
}
.danger-notice p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
    line-height: 1.55;
}
.danger-btn {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 600;
    color: var(--paper);
    background: var(--dan);
    border: 1px solid var(--dan);
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background 120ms, transform 120ms;
}
.danger-btn:hover {
    background: color-mix(in oklab, var(--dan) 88%, var(--ink));
    transform: translateY(-1px);
}

/* Modal overrides */
.modal-danger-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 17px;
    font-weight: 700;
    color: var(--dan);
    margin: 0;
    letter-spacing: -0.01em;
}
.modal-description {
    font-size: 14px;
    color: var(--ink-2);
    margin: 0 0 var(--s-4) 0;
    line-height: 1.6;
}
.field-error {
    font-size: 13px;
    color: var(--dan);
    margin: 6px 0 0;
}
.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-3);
    margin-top: var(--s-5);
    padding-top: var(--s-4);
    border-top: 1px solid var(--line);
}
.modal-actions :deep(.ds-btn) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 600;
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background 120ms, transform 120ms;
    border: 1px solid transparent;
}
.modal-actions :deep(.ds-btn-secondary) {
    color: var(--ink-2);
    background: var(--paper);
    border-color: var(--line);
}
.modal-actions :deep(.ds-btn-secondary:hover) {
    background: color-mix(in oklab, var(--ink) 5%, var(--paper));
    color: var(--ink);
}
.modal-actions :deep(.ds-btn-danger) {
    color: var(--paper);
    background: var(--dan);
    border-color: var(--dan);
}
.modal-actions :deep(.ds-btn-danger:hover) {
    background: color-mix(in oklab, var(--dan) 88%, var(--ink));
    transform: translateY(-1px);
}
.modal-actions :deep(.ds-btn-danger:disabled) {
    opacity: 0.55; cursor: not-allowed; transform: none;
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
