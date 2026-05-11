<script setup>
    import { computed, ref } from 'vue';
    import { useRoute, useRouter } from 'vue-router';
    import * as yup from 'yup';
    import { useHead } from '@/lib/compat/head.js';
    import { useFormState } from '@/lib/validation/form.js';
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

    const route = useRoute();
    const router = useRouter();
    const successMessage = ref('');
    const errorMessage = ref('');
    const resetCode = computed(() => String(route.query.code || '').trim());

    const schema = yup.object({
        password: yup.string().required('Password richiesta.'),
        password_confirmation: yup.string()
            .required('Conferma la password.')
            .oneOf([yup.ref('password')], 'Le password non coincidono.'),
    });

    const { values: resetForm, errors, isSubmitting, handleSubmit } = useFormState({
        schema,
        initialValues: { password: '', password_confirmation: '' },
        onSubmit: async (vals) => {
            errorMessage.value = '';
            successMessage.value = '';
            if (!resetCode.value) {
                errorMessage.value = 'Link di recupero non valido o incompleto.';
                return;
            }
            try {
                const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: resetCode.value,
                        password: vals.password,
                        passwordConfirmation: vals.password_confirmation,
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
            }
        },
    });

    const submit = handleSubmit;
</script>

<template>
    <AuthenticationCard>
        <router-link to="/" class="auth-brand">
            <div class="auth-brand-icon" aria-hidden="true">C</div>
            <span class="auth-brand-name">ComforTables</span>
        </router-link>

        <p class="auth-overline">Nuova password</p>
        <h1 class="auth-title">Reimposta password</h1>
        <p class="auth-subtitle">Scegli una nuova password sicura per il tuo account.</p>

        <Transition name="fade">
            <div v-if="errorMessage" class="ds-alert ds-alert-error">
                <i class="bi bi-exclamation-circle"></i>
                <span>{{ errorMessage }}</span>
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
                <TextInput id="password" v-model="resetForm.password" type="password" required autocomplete="new-password" placeholder="Nuova password" />
                <InputError :message="errors.password" />
            </div>

            <div class="ds-field">
                <InputLabel for="password_confirmation" value="Conferma password" />
                <TextInput id="password_confirmation" v-model="resetForm.password_confirmation" type="password" required autocomplete="new-password" placeholder="Conferma password" />
                <InputError :message="errors.password_confirmation" />
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
