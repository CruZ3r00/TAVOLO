<script setup>
    import { useHead } from '@vueuse/head';
    import { reactive } from 'vue';
    import { useRouter } from 'vue-router';
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
            const response = fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: form.code,
                    password: form.password,
                    passwordConfirmation: form.password_confirmation,
                }),
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

        <form @submit.prevent="submit" class="auth-form">
            <div class="ds-field">
                <InputLabel for="email" value="codice OTP" />
                <TextInput id="email" v-model="form.code" type="email" required autofocus autocomplete="username" placeholder="La tua email" />
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
  gap: 10px; margin-bottom: var(--s-6); text-decoration: none;
}
.auth-brand-icon {
  width: 36px; height: 36px; display: grid; place-items: center;
  background: var(--ink); color: var(--paper); border-radius: 10px;
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
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--paper); background: var(--ink);
  border: 1px solid var(--ink); border-radius: var(--r-md);
  cursor: pointer; transition: transform 120ms, background 120ms;
  margin-top: var(--s-2);
}
.auth-submit:hover {
  background: color-mix(in oklab, var(--ink) 90%, var(--ac));
  transform: translateY(-1px);
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
