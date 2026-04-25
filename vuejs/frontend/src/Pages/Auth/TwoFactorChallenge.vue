<script setup>
    import { ref, nextTick } from 'vue';
    import { useHead } from '@vueuse/head';
    import { useForm, defineRule, configure } from 'vee-validate';
    import AuthenticationCard from '@/components/AuthenticationCard.vue';
    import InputError from '@/components/InputError.vue';
    import InputLabel from '@/components/InputLabel.vue';
    import TextInput from '@/components/TextInput.vue';

    useHead({
        title: 'Verifica a due fattori',
        meta: [
            { name: 'description', content: 'Two-factor authentication page' },
        ],
    });

    defineRule('required', (value) => (value ? true : 'Questo campo è obbligatorio.'));
    defineRule('numeric', (value) => /^[0-9]+$/.test(value) || 'Il codice deve essere numerico.');

    configure({
        generateMessage: (ctx) => {
            const messages = {
            required: `Il campo ${ctx.field} è obbligatorio.`,
            numeric: 'Il codice deve essere numerico.',
            };
            return messages[ctx.rule.name] || 'Campo non valido.';
        },
    });

    const recovery = ref(false);
    const form = useForm({
        code: '',
        recovery_code: '',
    });

    const recoveryCodeInput = ref(null);
    const codeInput = ref(null);

    const toggleRecovery = async () => {
        recovery.value ^= true;
        await nextTick();

        if (recovery.value) {
            recoveryCodeInput.value.focus();
            form.code = '';
        } else {
            codeInput.value.focus();
            form.recovery_code = '';
        }
    };

    const submit = () => {
        form.post(route('two-factor.login'));
    };
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
                Inserisci il codice di autenticazione dalla tua app.
            </template>
            <template v-else>
                Inserisci uno dei codici di recupero di emergenza.
            </template>
        </p>

        <form @submit.prevent="submit" class="auth-form">
            <div v-if="!recovery" class="ds-field">
                <InputLabel for="code" value="Codice" />
                <TextInput
                    id="code"
                    ref="codeInput"
                    v-model="form.code"
                    type="text"
                    inputmode="numeric"
                    autofocus
                    autocomplete="one-time-code"
                    placeholder="000000"
                />
                <InputError :message="form.errors?.code" />
            </div>

            <div v-else class="ds-field">
                <InputLabel for="recovery_code" value="Codice di recupero" />
                <TextInput
                    id="recovery_code"
                    ref="recoveryCodeInput"
                    v-model="form.recovery_code"
                    type="text"
                    autocomplete="one-time-code"
                    placeholder="Il tuo codice di recupero"
                />
                <InputError :message="form.errors?.recovery_code" />
            </div>

            <div class="tfa-actions">
                <button type="button" class="toggle-link" @click.prevent="toggleRecovery">
                    <template v-if="!recovery">Usa un codice di recupero</template>
                    <template v-else>Usa il codice di autenticazione</template>
                </button>

                <button type="submit" class="ds-btn ds-btn-primary" :disabled="form.processing">
                    <span v-if="form.processing" class="ds-spinner"></span>
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
</style>
