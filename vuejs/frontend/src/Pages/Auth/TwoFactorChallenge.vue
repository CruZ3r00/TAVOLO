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
        <div class="auth-brand">
            <div class="auth-brand-icon"><i class="bi bi-shield-lock"></i></div>
            <span class="auth-brand-name">MenuCMS</span>
        </div>

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
  gap: var(--space-3); margin-bottom: var(--space-8);
}
.auth-brand-icon {
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  background: var(--color-primary); color: var(--color-text-inverse);
  border-radius: var(--radius-lg); font-size: var(--text-xl);
}
.auth-brand-name {
  font-size: var(--text-xl); font-weight: 700;
  color: var(--color-text); letter-spacing: var(--tracking-tight);
}
.auth-title {
  font-size: var(--text-2xl); font-weight: 700; color: var(--color-text);
  text-align: center; margin: 0 0 var(--space-2) 0;
}
.auth-subtitle {
  font-size: var(--text-sm); color: var(--color-text-muted);
  text-align: center; margin: 0 0 var(--space-6) 0;
}
.auth-form { display: flex; flex-direction: column; }
.tfa-actions {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
}
.toggle-link {
  background: none; border: none; font-family: var(--font-family);
  font-size: var(--text-sm); color: var(--color-primary);
  cursor: pointer; text-decoration: underline; padding: 0;
  transition: color var(--transition-fast);
}
.toggle-link:hover { color: var(--color-primary-hover); }
</style>
