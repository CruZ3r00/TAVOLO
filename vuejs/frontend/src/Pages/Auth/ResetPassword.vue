<script setup>
    import { useHead } from '@vueuse/head';
    import { computed, reactive, ref } from 'vue';
    import { useRoute, useRouter } from 'vue-router';
    import { defineRule, configure } from 'vee-validate';
    import AuthenticationCard from '@/components/AuthenticationCard.vue';
    import InputError from '@/components/InputError.vue';
    import InputLabel from '@/components/InputLabel.vue';
    import TextInput from '@/components/TextInput.vue';
    import { API_BASE } from '@/utils';

    useHead({
        title: 'Reset Password',
        meta: [
            { name: 'description', content: 'Password reset page' },
        ],
    });

    defineRule('required', (value) => (value ? true : 'This field is required'));
    defineRule('email', (value) =>
        /^\S+@\S+\.\S+$/.test(value) || 'Please enter a valid email address'
    );
    defineRule('confirmed', (value, [other]) => value === other || 'The passwords do not match');
    configure({
        generateMessage: (ctx) => {
            const messages = {
            required: `The field ${ctx.field} is required.`,
            email: 'Please enter a valid email address',
            confirmed: 'The passwords do not match',
            };
            return messages[ctx.rule.name] || 'Invalid field';
        },
    });

    const route = useRoute();
    const router = useRouter();
    const isSubmitting = ref(false);
    const successMessage = ref('');
    const resetCode = computed(() => String(route.query.code || '').trim());

    const form = reactive({
        password: '',
        password_confirmation: '',
    });

    const errorMessage = reactive({
        value: '',
    });

    const submit = async () => {
        if (!resetCode.value) {
            errorMessage.value = 'Link di recupero non valido o incompleto.';
            return;
        }
        if (form.password !== form.password_confirmation) {
            errorMessage.value = 'Le password non coincidono.';
            return;
        }
        isSubmitting.value = true;
        errorMessage.value = '';
        successMessage.value = '';
        try {
            const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: resetCode.value,
                    password: form.password,
                    passwordConfirmation: form.password_confirmation,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                errorMessage.value = data?.error?.message || data.message || 'Reset password non riuscito.';
            } else {
                successMessage.value = 'Password aggiornata. Ora puoi accedere.';
                setTimeout(() => router.push('/login?passwordReset=1'), 900);
            }
        } catch (error) {
            console.error('Error:', error);
            errorMessage.value = 'Errore di rete. Riprova.';
        } finally {
            isSubmitting.value = false;
        }
    };
</script>

<template>
    <AuthenticationCard>
        <router-link to="/" class="auth-brand">
            <div class="auth-brand-icon" aria-hidden="true">T</div>
            <span class="auth-brand-name">Tavolo</span>
        </router-link>

        <p class="auth-overline">Nuova password</p>
        <h1 class="auth-title">Reimposta password</h1>
        <p class="auth-subtitle">Scegli una nuova password sicura per il tuo account.</p>

        <Transition name="fade">
            <div v-if="errorMessage.value" class="ds-alert ds-alert-error">
                <i class="bi bi-exclamation-circle"></i>
                <span>{{ errorMessage.value }}</span>
            </div>
        </Transition>
        <Transition name="fade">
            <div v-if="successMessage" class="ds-alert ds-alert-success">
                <i class="bi bi-check-circle"></i>
                <span>{{ successMessage }}</span>
            </div>
        </Transition>

        <form @submit.prevent="submit" class="auth-form">
            <div class="ds-field">
                <InputLabel for="password" value="Nuova password" />
                <TextInput id="password" v-model="form.password" type="password" required autocomplete="new-password" placeholder="Nuova password" />
            </div>

            <div class="ds-field">
                <InputLabel for="password_confirmation" value="Conferma password" />
                <TextInput id="password_confirmation" v-model="form.password_confirmation" type="password" required autocomplete="new-password" placeholder="Conferma password" />
            </div>

            <button type="submit" class="ds-btn ds-btn-primary ds-btn-lg auth-submit" :disabled="isSubmitting || !resetCode">
                <span v-if="isSubmitting" class="ds-spinner"></span>
                <span v-else>Reimposta password</span>
            </button>
        </form>
    </AuthenticationCard>
</template>

<style scoped>
.auth-brand {
  display: flex; align-items: center; justify-content: center;
  gap: 10px; margin-bottom: var(--s-6); text-decoration: none;
}
.auth-brand-icon {
  width: 36px; height: 36px; display: grid; place-items: center;
  background: var(--ink); color: var(--bg); border-radius: 10px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-weight: 700; font-size: 16px; letter-spacing: -0.02em;
}
.auth-brand-name {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em;
}
.auth-overline {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.14em; color: var(--ink-3);
  text-align: center; margin: 0 0 6px;
}
.auth-title {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 26px; font-weight: 700; color: var(--ink);
  text-align: center; margin: 0 0 6px 0; letter-spacing: -0.02em;
}
.auth-subtitle {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 14px; color: var(--ink-3);
  text-align: center; margin: 0 0 var(--s-5) 0;
}
.auth-form { display: flex; flex-direction: column; gap: var(--s-4); }
.auth-submit {
  width: 100%; height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--bg); background: var(--ink);
  border: 1px solid var(--ink); border-radius: var(--r-md);
  cursor: pointer; transition: transform 120ms, background 120ms;
  margin-top: var(--s-2);
}
.auth-submit:hover {
  background: color-mix(in oklab, var(--ink) 90%, var(--ac));
  transform: translateY(-1px);
}
.auth-submit:disabled { opacity: 0.7; cursor: not-allowed; }
.auth-submit .ds-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in oklab, var(--bg) 30%, transparent);
  border-top-color: var(--bg);
  border-radius: 50%;
  animation: fpspin 650ms linear infinite;
}
@keyframes fpspin { to { transform: rotate(360deg); } }
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
