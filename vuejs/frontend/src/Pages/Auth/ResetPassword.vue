<script setup>
    import { useHead } from '@vueuse/head';
    import { reactive } from 'vue';
    import { useRouter } from 'vue-router';
    import { defineRule, configure } from 'vee-validate';
    import AuthenticationCard from '@/components/AuthenticationCard.vue';
    import InputError from '@/components/InputError.vue';
    import InputLabel from '@/components/InputLabel.vue';
    import TextInput from '@/components/TextInput.vue';

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

    const props = defineProps({
        email: String,
        token: String,
    });

    const form = reactive({
        token: props.token,
        email: props.email,
        password: '',
        password_confirmation: '',
    });

    const errorMessage = reactive({
        value: '',
    });

    const router = useRouter();

    const submit = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/password/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(form),
            });

            if (!response.ok) {
            const data = await response.json();
            errorMessage.value = data.message || 'Password reset failed';
            } else {
            const data = await response.json();
            localStorage.setItem('user', JSON.stringify(data));
            router.push('/dashboard');
            }
        } catch (error) {
            console.error('Error:', error);
            errorMessage.value = 'An error occurred';
        }
    };
</script>

<template>
    <AuthenticationCard>
        <div class="auth-brand">
            <div class="auth-brand-icon"><i class="bi bi-shop"></i></div>
            <span class="auth-brand-name">MenuCMS</span>
        </div>

        <h1 class="auth-title">Reimposta password</h1>
        <p class="auth-subtitle">Inserisci la tua nuova password.</p>

        <Transition name="fade">
            <div v-if="errorMessage.value" class="ds-alert ds-alert-error">
                <i class="bi bi-exclamation-circle"></i>
                <span>{{ errorMessage.value }}</span>
            </div>
        </Transition>

        <form @submit.prevent="submit" class="auth-form">
            <div class="ds-field">
                <InputLabel for="email" value="Email" />
                <TextInput id="email" v-model="form.email" type="email" required autofocus autocomplete="username" placeholder="La tua email" />
            </div>

            <div class="ds-field">
                <InputLabel for="password" value="Nuova password" />
                <TextInput id="password" v-model="form.password" type="password" required autocomplete="new-password" placeholder="Nuova password" />
            </div>

            <div class="ds-field">
                <InputLabel for="password_confirmation" value="Conferma password" />
                <TextInput id="password_confirmation" v-model="form.password_confirmation" type="password" required autocomplete="new-password" placeholder="Conferma password" />
            </div>

            <button type="submit" class="ds-btn ds-btn-primary ds-btn-lg auth-submit">
                Reimposta password
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
  text-align: center; margin: 0 0 var(--space-6) 0;
}
.auth-form { display: flex; flex-direction: column; }
.auth-submit { width: 100%; }
</style>
