<script setup>
import { useHead } from '@vueuse/head';
import { useForm, defineRule, configure } from 'vee-validate';
import * as yup from 'yup';
import AuthenticationCard from '@/components/AuthenticationCard.vue';
import InputError from '@/components/InputError.vue';
import InputLabel from '@/components/InputLabel.vue';
import TextInput from '@/components/TextInput.vue';
import { ref } from 'vue';
import { API_BASE } from '@/utils';

const errorMessage = ref('');
const successMessage = ref('');

useHead({
  title: 'Password dimenticata',
  meta: [
    { name: 'description', content: 'Password reset request' },
  ],
});

defineRule('required', (value) => (value ? true : 'This field is required'));
defineRule('email', (value) =>
  /^\S+@\S+\.\S+$/.test(value) || 'Please enter a valid email address.'
);
configure({
  generateMessage: (ctx) => {
    const messages = {
      required: `The field ${ctx.field} is required.`,
      email: 'Please enter a valid email address.',
    };
    return messages[ctx.rule.name] || 'Invalid field.';
  },
});

const schema = yup.object({
  username: yup.string().required('Username is required'),
  email: yup.string().required('The email is mandatory.').email('Please enter a valid email address.'),
});

const { values, errors, isSubmitting, handleSubmit } = useForm({
  validationSchema: schema,
});

const submit = handleSubmit(async () => {
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: values.email }),
        });


    if (!response.ok) {
      const data = await response.json();
      errorMessage.value = data.message || 'Error during verification.';
    } else {
      successMessage.value = 'Identity confirmed. Proceed to reset password.';
    }
  } catch (error) {
    console.error('Errore:', error);
    errorMessage.value = 'An unexpected error occurred';
  }

  values.username = '';
  values.email = '';
});
</script>

<template>
  <AuthenticationCard>
    <router-link to="/" class="auth-brand">
      <div class="auth-brand-icon" aria-hidden="true">T</div>
      <span class="auth-brand-name">Tavolo</span>
    </router-link>

    <p class="auth-overline">Recupero</p>
    <h1 class="auth-title">Password dimenticata</h1>
    <p class="auth-subtitle">Inserisci username ed email per recuperare l'accesso.</p>

    <Transition name="fade">
      <div v-if="successMessage" class="ds-alert ds-alert-success">
        <i class="bi bi-check-circle"></i>
        <span>{{ successMessage }}</span>
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="errorMessage" class="ds-alert ds-alert-error">
        <i class="bi bi-exclamation-circle"></i>
        <span>{{ errorMessage }}</span>
      </div>
    </Transition>

    <form @submit.prevent="submit" class="auth-form">

      <div class="ds-field">
        <InputLabel for="email" value="Email" />
        <TextInput id="email" v-model="values.email" type="email" required autocomplete="email" placeholder="La tua email" />
        <InputError :message="errors.email" />
      </div>

      <button type="submit" class="ds-btn ds-btn-primary ds-btn-lg auth-submit" :disabled="isSubmitting">
        <span v-if="isSubmitting" class="ds-spinner"></span>
        <span v-else>Conferma identita'</span>
      </button>

      <p class="auth-footer-text">
        <router-link to="/login" class="auth-link-bold">Torna al login</router-link>
      </p>
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
  font-size: 18px; font-weight: 700;
  color: var(--ink); letter-spacing: -0.02em;
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
  width: 100%; display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; height: 46px;
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
.auth-submit .ds-spinner {
  width: 16px; height: 16px;
  border: 2px solid color-mix(in oklab, var(--paper) 30%, transparent);
  border-top-color: var(--paper); border-radius: 50%;
  animation: fpspin 650ms linear infinite;
}
@keyframes fpspin { to { transform: rotate(360deg); } }
.auth-footer-text {
  text-align: center;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 14px; color: var(--ink-3);
  margin: var(--s-5) 0 0;
}
.auth-link-bold {
  color: var(--ink); text-decoration: none;
  font-weight: 600; transition: color 120ms;
}
.auth-link-bold:hover { color: var(--ac); }
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
