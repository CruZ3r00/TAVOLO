<script setup>
    import { useHead } from '@vueuse/head';
    import { ref } from 'vue';
    import { useForm, defineRule, configure } from 'vee-validate';
    import * as yup from 'yup';
    import AuthenticationCard from '@/components/AuthenticationCard.vue';
    import InputError from '@/components/InputError.vue';
    import InputLabel from '@/components/InputLabel.vue';
    import TextInput from '@/components/TextInput.vue';

    useHead({
        title: 'Area protetta',
        meta: [{ name: 'description', content: 'Password confirmation' }],
    });

    defineRule('required', (value) => (value ? true : 'Questo campo è obbligatorio.'));
    configure({
        generateMessage: (ctx) => {
            const messages = {
            required: `Il campo ${ctx.field} è obbligatorio.`,
            };
            return messages[ctx.rule.name] || 'Campo non valido.';
        },
    });

    const schema = yup.object({
        password: yup.string().required('La password è obbligatoria.'),
    });

    const { values, errors, isSubmitting, handleSubmit, resetForm } = useForm({
        validationSchema: schema,
    });

    const passwordInput = ref(null);

    const submit = handleSubmit(() => {
        console.log('Password confirmed:', values.password);
        resetForm();
        passwordInput.value.focus();
    });
</script>

<template>
    <AuthenticationCard>
        <router-link to="/" class="auth-brand">
            <div class="auth-brand-icon" aria-hidden="true"><i class="bi bi-shield-check"></i></div>
            <span class="auth-brand-name">Tavolo</span>
        </router-link>

        <p class="auth-overline">Verifica</p>
        <h1 class="auth-title">Area protetta</h1>
        <p class="auth-subtitle">
            Questa è un'area protetta dell'applicazione. Conferma la tua password prima di continuare.
        </p>

        <form @submit.prevent="submit" class="auth-form">
            <div class="ds-field">
                <InputLabel for="password" value="Password" />
                <TextInput
                    id="password"
                    ref="passwordInput"
                    v-model="values.password"
                    type="password"
                    required
                    autocomplete="current-password"
                    autofocus
                    placeholder="La tua password"
                />
                <InputError :message="errors.password" />
            </div>

            <button
                type="submit"
                class="ds-btn ds-btn-primary ds-btn-lg auth-submit"
                :disabled="isSubmitting"
            >
                <span v-if="isSubmitting" class="ds-spinner"></span>
                <span v-else>Conferma</span>
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
  background: var(--ink); color: var(--paper); border-radius: 10px;
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
  text-align: center; margin: 0 0 var(--s-5) 0; line-height: 1.5;
}
.auth-form { display: flex; flex-direction: column; gap: var(--s-4); }
.auth-submit {
  width: 100%; height: 46px;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--paper); background: var(--ink);
  border: 1px solid var(--ink); border-radius: var(--r-md);
  cursor: pointer; transition: transform 120ms, background 120ms;
  margin-top: var(--s-2);
}
.auth-submit:hover:not(:disabled) {
  background: color-mix(in oklab, var(--ink) 90%, var(--ac));
  transform: translateY(-1px);
}
.auth-submit:disabled { opacity: 0.7; cursor: not-allowed; }
</style>
