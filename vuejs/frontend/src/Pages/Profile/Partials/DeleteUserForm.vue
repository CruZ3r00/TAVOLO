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
    <div class="ds-card">
        <div class="ds-card-header">
            <i class="bi bi-trash" style="color: var(--color-destructive);"></i>
            <h3 class="section-title">Elimina account</h3>
        </div>
        <div class="ds-card-body">
            <p class="section-description">
                Una volta eliminato il tuo account, tutti i dati e le risorse saranno cancellati permanentemente. Prima di procedere, scarica eventuali dati che desideri conservare.
            </p>

            <button @click="confirmUserDeletion" class="ds-btn ds-btn-danger">
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
.section-title { font-size: var(--text-base); font-weight: 600; margin: 0; }
.section-description { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0 0 var(--space-5) 0; line-height: var(--leading-relaxed); }
.modal-danger-title { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-lg); font-weight: 600; color: var(--color-destructive); margin: 0; }
.modal-description { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0 0 var(--space-5) 0; line-height: var(--leading-relaxed); }
.field-error { font-size: var(--text-sm); color: var(--color-destructive); margin: var(--space-1) 0 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--color-border); }
</style>
