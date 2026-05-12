<script setup>
    import { ref, nextTick } from 'vue';
    import { useRouter } from 'vue-router';
    import { useStore } from 'vuex';
    import * as yup from 'yup';
    import { useHead } from '@/lib/compat/head.js';
    import { useFormState } from '@/lib/validation/form.js';
    import AuthenticationCard from '@/components/AuthenticationCard.vue';
    import InputError from '@/components/InputError.vue';
    import InputLabel from '@/components/InputLabel.vue';
    import TextInput from '@/components/TextInput.vue';
    import { API_BASE } from '@/utils';
    import { defaultRouteForUser } from '@/staffAccess';

    useHead({
        title: 'Verifica a due fattori',
        meta: [
            { name: 'description', content: 'Two-factor authentication page' },
        ],
    });

    const recovery = ref(false);
    const recoveryCodeInput = ref(null);
    const codeInput = ref(null);
    const errorMessage = ref('');
    const successMessage = ref('');
    const router = useRouter();
    const store = useStore();
    const methods = ref(JSON.parse(sessionStorage.getItem('two_factor_methods') || '[]'));
    const emailHint = ref(sessionStorage.getItem('two_factor_email_hint') || '');
    const emailMode = ref(methods.value.includes('email') && !methods.value.includes('totp'));
    const recoveryAvailable = ref(methods.value.includes('recovery'));

    // Schema dinamico: in modalita' "code" valida `code`, in modalita' "recovery"
    // valida `recovery_code`. Ricostruisco la useFormState ad ogni toggle non e'
    // pratico, quindi usiamo un singolo schema con required condizionale via .when.
    const schema = yup.object({
        code: yup.string().when('$recovery', {
            is: false,
            then: (s) => s.required('Codice obbligatorio.').matches(/^[0-9]+$/, 'Il codice deve essere numerico.'),
            otherwise: (s) => s.notRequired(),
        }),
        recovery_code: yup.string().when('$recovery', {
            is: true,
            then: (s) => s.required('Codice di recupero obbligatorio.'),
            otherwise: (s) => s.notRequired(),
        }),
    });

    // Workaround: yup `.when('$recovery')` richiede `context: { recovery }` al
    // validate. La form.js attuale non supporta context. Soluzione: schema fisso
    // sui due campi e validazione manuale in onSubmit.
    const simpleSchema = yup.object({
        code: yup.string(),
        recovery_code: yup.string(),
    });

    const { values: challengeForm, errors, isSubmitting, handleSubmit, setError } = useFormState({
        schema: simpleSchema,
        initialValues: { code: '', recovery_code: '' },
        onSubmit: async (vals) => {
            errorMessage.value = '';
            successMessage.value = '';
            // Validazione manuale del campo attivo.
            if (!recovery.value) {
                if (!vals.code) { setError('code', 'Codice obbligatorio.'); return; }
                if (!/^[0-9]{6}$/.test(vals.code)) { setError('code', 'Il codice deve essere di 6 cifre.'); return; }
            } else if (!vals.recovery_code) {
                setError('recovery_code', 'Codice di recupero obbligatorio.');
                return;
            }

            try {
                const challengeToken = sessionStorage.getItem('two_factor_challenge_token');
                if (!challengeToken) {
                    router.push('/login');
                    return;
                }

                const resp = await fetch(`${API_BASE}/api/auth/two-factor-challenge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(recovery.value
                        ? { challenge_token: challengeToken, recovery_code: vals.recovery_code }
                        : { challenge_token: challengeToken, code: vals.code }),
                });
                if (!resp.ok) {
                    const data = await resp.json().catch(() => ({}));
                    errorMessage.value = data?.error?.message || data.message || 'Codice non valido.';
                    return;
                }

                const data = await resp.json();
                store.dispatch('login', { user: data.user, token: data.jwt });
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('token', data.jwt);
                sessionStorage.removeItem('two_factor_challenge_token');
                sessionStorage.removeItem('two_factor_pending_user');
                sessionStorage.removeItem('two_factor_methods');
                sessionStorage.removeItem('two_factor_email_hint');

                const pendingPlan = sessionStorage.getItem('pending_plan_after_verification');
                if (['starter', 'pro'].includes(pendingPlan)) {
                    sessionStorage.removeItem('pending_plan_after_verification');
                    router.push({ path: '/renew-sub', query: { checkout: 'retry', plan: pendingPlan } });
                    return;
                }
                router.push(defaultRouteForUser(data.user));
            } catch (err) {
                console.error('2FA error:', err);
                errorMessage.value = 'Errore di rete. Riprova.';
            }
        },
    });

    const toggleRecovery = async () => {
        if (!recoveryAvailable.value) return;
        recovery.value = !recovery.value;
        await nextTick();
        if (recovery.value) {
            recoveryCodeInput.value?.focus?.();
            challengeForm.code = '';
        } else {
            codeInput.value?.focus?.();
            challengeForm.recovery_code = '';
        }
    };

    const resendEmailCode = async () => {
        errorMessage.value = '';
        successMessage.value = '';
        const challengeToken = sessionStorage.getItem('two_factor_challenge_token');
        if (!challengeToken) {
            router.push('/login');
            return;
        }
        try {
            const resp = await fetch(`${API_BASE}/api/auth/two-factor-challenge/email/resend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challenge_token: challengeToken }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                errorMessage.value = data?.error?.message || data.message || 'Impossibile inviare un nuovo codice.';
                return;
            }
            emailHint.value = data.emailHint || emailHint.value;
            successMessage.value = 'Nuovo codice inviato.';
        } catch (err) {
            console.error('2FA resend error:', err);
            errorMessage.value = 'Errore di rete. Riprova.';
        }
    };

    const submit = handleSubmit;
</script>

<template>
    <AuthenticationCard>
        <router-link to="/" class="auth-brand">
            <div class="auth-brand-icon" aria-hidden="true"><i class="bi bi-shield-lock"></i></div>
            <span class="auth-brand-name">Tavolo</span>
        </router-link>

        <p class="auth-overline">2FA</p>
        <h1 class="auth-title">Verifica a due fattori</h1>
        <p class="auth-subtitle">
            <template v-if="!recovery">
                <span v-if="emailMode">Inserisci il codice che abbiamo inviato a {{ emailHint || 'la tua email' }}.</span>
                <span v-else>Inserisci il codice di autenticazione dalla tua app.</span>
            </template>
            <template v-else>
                Inserisci uno dei codici di recupero di emergenza.
            </template>
        </p>

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
            <div v-if="!recovery" class="ds-field">
                <InputLabel for="code" value="Codice" />
                <TextInput
                    id="code"
                    ref="codeInput"
                    v-model="challengeForm.code"
                    type="text"
                    inputmode="numeric"
                    autofocus
                    autocomplete="one-time-code"
                    placeholder="000000"
                />
                <InputError :message="errors.code" />
            </div>

            <div v-else class="ds-field">
                <InputLabel for="recovery_code" value="Codice di recupero" />
                <TextInput
                    id="recovery_code"
                    ref="recoveryCodeInput"
                    v-model="challengeForm.recovery_code"
                    type="text"
                    autocomplete="one-time-code"
                    placeholder="Il tuo codice di recupero"
                />
                <InputError :message="errors.recovery_code" />
            </div>

            <div class="tfa-actions">
                <button v-if="recoveryAvailable" type="button" class="toggle-link" @click.prevent="toggleRecovery">
                    <template v-if="!recovery">Usa un codice di recupero</template>
                    <template v-else>Usa il codice di autenticazione</template>
                </button>
                <button v-else-if="emailMode" type="button" class="toggle-link" @click.prevent="resendEmailCode">
                    Invia nuovo codice
                </button>
                <span v-else></span>

                <button type="submit" class="ds-btn ds-btn-primary" :disabled="isSubmitting">
                    <span v-if="isSubmitting" class="ds-spinner"></span>
                    <span v-else>Accedi</span>
                </button>
            </div>
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
  font-size: 16px;
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
.tfa-actions {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-4); margin-top: var(--s-2);
}
.toggle-link {
  background: none; border: none;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 13px; color: var(--ac);
  cursor: pointer; padding: 0;
  transition: color 120ms;
}
.toggle-link:hover {
  color: color-mix(in oklab, var(--ac) 80%, var(--ink));
  text-decoration: underline;
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
