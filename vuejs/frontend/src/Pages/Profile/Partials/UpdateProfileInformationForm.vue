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
    <div class="ds-card">
        <div class="ds-card-header">
            <i class="bi bi-person" style="color: var(--color-primary);"></i>
            <h3 class="section-title">Informazioni profilo</h3>
        </div>
        <div class="ds-card-body">
            <p class="section-description">Aggiorna le informazioni del tuo account.</p>

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
.section-title { font-size: var(--text-base); font-weight: 600; margin: 0; }
.section-description { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0 0 var(--space-5) 0; }
</style>
