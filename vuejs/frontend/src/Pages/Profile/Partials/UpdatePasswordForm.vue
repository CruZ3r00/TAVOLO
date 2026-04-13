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
    <div class="ds-card">
        <div class="ds-card-header">
            <i class="bi bi-key" style="color: var(--color-primary);"></i>
            <h3 class="section-title">Cambio password</h3>
        </div>
        <div class="ds-card-body">
            <p class="section-description">Aggiorna la tua password per mantenere sicuro il tuo account.</p>

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
.section-title { font-size: var(--text-base); font-weight: 600; margin: 0; }
.section-description { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0 0 var(--space-5) 0; }
.password-field { position: relative; }
.password-field :deep(.ds-input) { padding-right: 44px; }
.password-toggle { position: absolute; right: var(--space-3); top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--color-text-muted); cursor: pointer; padding: var(--space-1); display: flex; align-items: center; transition: color var(--transition-fast); }
.password-toggle:hover { color: var(--color-text); }
</style>
