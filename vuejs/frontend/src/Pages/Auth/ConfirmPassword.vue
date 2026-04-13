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
        <div class="auth-brand">
            <div class="auth-brand-icon"><i class="bi bi-shield-check"></i></div>
            <span class="auth-brand-name">MenuCMS</span>
        </div>

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
  text-align: center; margin: 0 0 var(--space-2) 0; letter-spacing: var(--tracking-tight);
}
.auth-subtitle {
  font-size: var(--text-sm); color: var(--color-text-muted);
  text-align: center; margin: 0 0 var(--space-6) 0; line-height: var(--leading-relaxed);
}
.auth-form { display: flex; flex-direction: column; }
.auth-submit { width: 100%; }
</style>
