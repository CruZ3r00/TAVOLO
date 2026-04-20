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
const store = useStore();

const updateInfoUser = async () => {
    isError.value = false;
    isSucces.value = false;
    alertMessage.value = '';

    if (!username.value && !email.value) {
        isError.value = true;
        alertMessage.value = 'Nessun dato inserito';
        return;
    }

    isLoading.value = true;
    try {
        const tkn = store.getters.getToken;
        const response = await fetch(`${API_BASE}/api/account/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tkn}`,
            },
            body: JSON.stringify({ email: email.value, username: username.value }),
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
            }
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
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
