<script setup>
import { onMounted, ref } from 'vue';
import InputLabel from '@/components/InputLabel.vue';
import { useStore } from 'vuex';
import TextInput from '@/components/TextInput.vue';
import { API_BASE } from '@/utils';

const isError = ref(false);
const isSucces = ref(false);
const alertMessage = ref('');
const isLoading = ref(false);

const props = defineProps({
    user: {
        type: Object,
        required: true,
        default: () => ({ id: '', username: '', email: '' }),
    },
});

const username = ref('');
const email = ref('');
const savedUsername = ref('');
const savedEmail = ref('');
const twoFactorEnabled = ref(false);
const twoFactorMethod = ref('totp');
const confirmationCode = ref('');
const confirmationPassword = ref('');
const emailHint = ref('');
const emailCodeSent = ref(false);
const store = useStore();

const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${store.getters.getToken}`,
});

const loadTwoFactorStatus = async () => {
    try {
        const response = await fetch(`${API_BASE}/api/account/2fa/status`, { headers: authHeaders() });
        if (!response.ok) return;
        const data = await response.json();
        twoFactorEnabled.value = !!data.enabled;
        twoFactorMethod.value = data.method || 'totp';
    } catch {
        // Backend verification remains fail-closed if this status call fails.
    }
};

const requiresConfirmation = () => username.value !== savedUsername.value || email.value !== savedEmail.value;

const validateConfirmation = () => {
    if (!requiresConfirmation()) return true;
    if (twoFactorEnabled.value && twoFactorMethod.value === 'email') {
        if (!/^\d{6}$/.test(confirmationCode.value)) {
            alertMessage.value = 'Invia e inserisci il codice email per salvare le modifiche.';
            return false;
        }
        return true;
    }
    if (twoFactorEnabled.value) {
        if (!confirmationPassword.value && !/^\d{6}$/.test(confirmationCode.value)) {
            alertMessage.value = 'Inserisci il codice 2FA oppure la password.';
            return false;
        }
        return true;
    }
    if (!confirmationPassword.value) {
        alertMessage.value = 'Inserisci la password per salvare le modifiche.';
        return false;
    }
    return true;
};

const sendEmailCode = async () => {
    isError.value = false;
    isSucces.value = false;
    alertMessage.value = '';
    isLoading.value = true;
    try {
        const response = await fetch(`${API_BASE}/api/account/2fa/email/code`, {
            method: 'POST',
            headers: authHeaders(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            isError.value = true;
            alertMessage.value = data?.error?.message || data?.message || 'Impossibile inviare il codice email.';
            return;
        }
        emailHint.value = data.emailHint || emailHint.value;
        emailCodeSent.value = true;
        isSucces.value = true;
        alertMessage.value = 'Codice email inviato.';
    } catch {
        isError.value = true;
        alertMessage.value = 'Errore di rete. Riprova.';
    } finally {
        isLoading.value = false;
    }
};

const updateInfoUser = async () => {
    isError.value = false;
    isSucces.value = false;
    alertMessage.value = '';

    if (!username.value && !email.value) {
        isError.value = true;
        alertMessage.value = 'Nessun dato inserito';
        return;
    }
    if (!validateConfirmation()) {
        isError.value = true;
        return;
    }

    isLoading.value = true;
    try {
        const response = await fetch(`${API_BASE}/api/account/profile`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({
                email: email.value,
                username: username.value,
                code: confirmationCode.value,
                password: confirmationPassword.value,
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            isError.value = true;
            alertMessage.value = data?.error?.message || data?.message || 'Errore durante l\'aggiornamento';
        } else {
            isSucces.value = true;
            alertMessage.value = 'Profilo aggiornato';
            if (data.user) {
                const current = store.getters.getUser || {};
                const merged = { ...current, username: data.user.username, email: data.user.email };
                store.commit('setUser', merged);
                localStorage.setItem('user', JSON.stringify(merged));
                savedUsername.value = data.user.username;
                savedEmail.value = data.user.email;
            }
            confirmationCode.value = '';
            confirmationPassword.value = '';
            emailCodeSent.value = false;
        }
    } catch {
        isError.value = true;
        alertMessage.value = 'Errore di rete. Riprova.';
    }
    isLoading.value = false;
};

onMounted(() => {
    username.value = props.user.username;
    email.value = props.user.email;
    savedUsername.value = props.user.username;
    savedEmail.value = props.user.email;
    loadTwoFactorStatus();
});
</script>

<template>
    <div class="profile-section">
        <div class="section-header">
            <div class="section-icon"><i class="bi bi-person"></i></div>
            <div>
                <h3 class="section-title">Informazioni profilo</h3>
                <p class="section-description">Aggiorna le informazioni del tuo account.</p>
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

            <form @submit.prevent="updateInfoUser">
                <div class="ds-field">
                    <InputLabel for="name" value="Username" />
                    <TextInput id="name" v-model="username" type="text" required autocomplete="username" :placeholder="username" />
                </div>

                <div class="ds-field">
                    <InputLabel for="email" value="Email" />
                    <TextInput id="email" v-model="email" type="email" required autocomplete="email" :placeholder="email" />
                </div>

                <div v-if="requiresConfirmation()" class="ds-field">
                    <InputLabel
                        for="profile_confirmation"
                        :value="twoFactorEnabled && twoFactorMethod === 'email' ? 'Codice email di conferma' : 'Conferma modifica sensibile'"
                    />
                    <div v-if="twoFactorEnabled && twoFactorMethod === 'email'" class="confirm-row">
                        <TextInput
                            id="profile_confirmation"
                            v-model="confirmationCode"
                            type="text"
                            inputmode="numeric"
                            autocomplete="one-time-code"
                            placeholder="000000"
                        />
                        <button type="button" class="ds-btn ds-btn-secondary" :disabled="isLoading" @click="sendEmailCode">
                            <i class="bi bi-envelope-check"></i>
                            <span>{{ emailCodeSent ? 'Invia nuovo codice' : 'Invia codice email' }}</span>
                        </button>
                    </div>
                    <template v-else>
                        <TextInput
                            v-if="twoFactorEnabled"
                            id="profile_confirmation"
                            v-model="confirmationCode"
                            type="text"
                            inputmode="numeric"
                            autocomplete="one-time-code"
                            placeholder="Codice 2FA"
                        />
                        <TextInput
                            id="profile_password"
                            v-model="confirmationPassword"
                            type="password"
                            autocomplete="current-password"
                            :placeholder="twoFactorEnabled ? 'Oppure la tua password' : 'La tua password'"
                        />
                    </template>
                    <p v-if="twoFactorEnabled && twoFactorMethod === 'email'" class="ds-helper">
                        Il codice viene inviato a {{ emailHint || 'la tua email' }}.
                    </p>
                </div>

                <button type="submit" class="ds-btn ds-btn-primary" :disabled="isLoading">
                    <span v-if="isLoading" class="ds-spinner"></span>
                    <template v-else>
                        <i class="bi bi-check2"></i>
                        <span>Salva</span>
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
.confirm-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
}
.confirm-row :deep(.ds-btn-secondary) {
    white-space: nowrap;
}
.ds-helper {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--ink-3);
}
.section-body :deep(.ds-alert) {
    margin-bottom: var(--s-3);
}
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
@media (max-width: 640px) {
    .confirm-row {
        grid-template-columns: 1fr;
    }
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
