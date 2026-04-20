<script setup>
import { ref } from 'vue';
import InputLabel from '@/components/InputLabel.vue';
import TextInput from '@/components/TextInput.vue';
import { useStore } from 'vuex';
import { API_BASE } from '@/utils';

const store = useStore();

const current_password = ref('');
const password = ref('');
const password_confirmation = ref('');
const alertMessage = ref('');

const showPassword = ref(false);
const showCurrentPassword = ref(false);
const showConfirmPassword = ref(false);

const isLoading = ref(false);
const isError = ref(false);
const isSucces = ref(false);

const updatePasswordCheck = async () => {
    isError.value = false;
    isSucces.value = false;
    alertMessage.value = '';

    if (password.value !== password_confirmation.value) {
        isError.value = true;
        alertMessage.value = 'Le due password devono essere uguali';
        return;
    }
    if (password.value.length < 6) {
        isError.value = true;
        alertMessage.value = 'La password deve essere di almeno 6 caratteri';
        return;
    }

    isLoading.value = true;
    try {
        const tkn = store.getters.getToken;
        const response = await fetch(`${API_BASE}/api/account/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tkn}`,
            },
            body: JSON.stringify({
                current_password: current_password.value,
                password: password.value,
                password_confirmation: password_confirmation.value,
            }),
        });
        const data = await response.json();
        if (response.ok) {
            isSucces.value = true;
            alertMessage.value = 'Password aggiornata con successo';
            current_password.value = '';
            password.value = '';
            password_confirmation.value = '';
        } else {
            isError.value = true;
            alertMessage.value = data?.error?.message || data?.message || 'Errore durante l\'aggiornamento';
        }
    } catch (e) {
        isError.value = true;
        alertMessage.value = 'Errore di rete. Riprova.';
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
    <div class="profile-section">
        <div class="section-header">
            <div class="section-icon"><i class="bi bi-key"></i></div>
            <div>
                <h3 class="section-title">Cambio password</h3>
                <p class="section-description">Aggiorna la tua password per mantenere sicuro il tuo account.</p>
            </div>
        </div>
        <div class="section-body">

            <Transition name="fade">
                <div v-if="isError" class="ds-alert ds-alert-error">
                    <i class="bi bi-exclamation-circle"></i>
                    <span>{{ alertMessage }}</span>
                </div>
            </Transition>
            <Transition name="fade">
                <div v-if="isSucces" class="ds-alert ds-alert-success">
                    <i class="bi bi-check-circle"></i>
                    <span>{{ alertMessage }}</span>
                </div>
            </Transition>

            <form @submit.prevent="updatePasswordCheck">
                <div class="ds-field">
                    <InputLabel for="current_password" value="Password corrente" />
                    <div class="password-field">
                        <TextInput
                            id="current_password"
                            v-model="current_password"
                            :type="showCurrentPassword ? 'text' : 'password'"
                            placeholder="Inserisci la password corrente"
                            required
                        />
                        <button type="button" class="password-toggle" @click="showCurrentPassword = !showCurrentPassword" tabindex="-1">
                            <i v-if="showCurrentPassword" class="bi bi-eye"></i>
                            <i v-else class="bi bi-eye-slash"></i>
                        </button>
                    </div>
                </div>

                <div class="ds-field">
                    <InputLabel for="password" value="Nuova password" />
                    <div class="password-field">
                        <TextInput
                            id="password"
                            v-model="password"
                            :type="showPassword ? 'text' : 'password'"
                            placeholder="Nuova password"
                            required
                        />
                        <button type="button" class="password-toggle" @click="showPassword = !showPassword" tabindex="-1">
                            <i v-if="showPassword" class="bi bi-eye"></i>
                            <i v-else class="bi bi-eye-slash"></i>
                        </button>
                    </div>
                </div>

                <div class="ds-field">
                    <InputLabel for="password_confirmation" value="Conferma password" />
                    <div class="password-field">
                        <TextInput
                            id="password_confirmation"
                            v-model="password_confirmation"
                            :type="showConfirmPassword ? 'text' : 'password'"
                            placeholder="Conferma la nuova password"
                            autocomplete="new-password"
                            required
                        />
                        <button type="button" class="password-toggle" @click="showConfirmPassword = !showConfirmPassword" tabindex="-1">
                            <i v-if="showConfirmPassword" class="bi bi-eye"></i>
                            <i v-else class="bi bi-eye-slash"></i>
                        </button>
                    </div>
                </div>

                <button type="submit" class="ds-btn ds-btn-primary" :disabled="isLoading">
                    <span v-if="isLoading" class="ds-spinner"></span>
                    <template v-else>
                        <i class="bi bi-check2"></i>
                        <span>Aggiorna password</span>
                    </template>
                </button>
            </form>
        </div>
    </div>
</template>

<style scoped>
.profile-section {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    font-family: var(--f-sans, 'Geist', sans-serif);
    overflow: hidden;
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
.section-body { padding: var(--s-5); }
.section-body form { display: flex; flex-direction: column; gap: var(--s-4); }
.section-body :deep(.ds-alert) { margin-bottom: var(--s-3); }
.password-field { position: relative; }
.password-field :deep(.input),
.password-field :deep(.ds-input) { padding-right: 44px; }
.password-toggle {
    position: absolute;
    right: 10px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    color: var(--ink-3);
    cursor: pointer;
    padding: 4px;
    display: flex; align-items: center;
    transition: color 120ms;
}
.password-toggle:hover { color: var(--ink); }
.section-body :deep(.ds-btn-primary) {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--paper);
    background: var(--ink);
    border: 1px solid var(--ink);
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background 120ms, transform 120ms;
}
.section-body :deep(.ds-btn-primary:hover) {
    background: color-mix(in oklab, var(--ink) 90%, var(--ac));
    transform: translateY(-1px);
}
.section-body :deep(.ds-btn-primary:disabled) {
    opacity: 0.6; cursor: not-allowed; transform: none;
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
