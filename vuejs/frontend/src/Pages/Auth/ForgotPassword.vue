<script setup>
import { useHead } from '@vueuse/head';
import { useForm, defineRule, configure } from 'vee-validate';
import * as yup from 'yup';
import AuthenticationCard from '@/components/AuthenticationCard.vue';
import InputError from '@/components/InputError.vue';
import InputLabel from '@/components/InputLabel.vue';
import TextInput from '@/components/TextInput.vue';
import { ref } from 'vue';

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
    const response = await fetch('http://localhost:8000/forgotten_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: values.username,
        email: values.email,
      }),
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
    <div class="auth-brand">
      <div class="auth-brand-icon"><i class="bi bi-shop"></i></div>
      <span class="auth-brand-name">MenuCMS</span>
    </div>

    <h1 class="auth-title">Password dimenticata</h1>
    <p class="auth-subtitle">Inserisci il tuo username e la tua email per recuperare la password.</p>

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
        <InputLabel for="username" value="Username" />
        <TextInput id="username" v-model="values.username" type="text" required autofocus autocomplete="username" placeholder="Il tuo username" />
        <InputError :message="errors.username" />
      </div>

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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-8);
}
.auth-brand-icon {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary); color: var(--color-text-inverse);
  border-radius: var(--radius-lg); font-size: var(--text-xl);
}
.auth-brand-name {
  font-size: var(--text-xl); font-weight: 700;
  color: var(--color-text); letter-spacing: var(--tracking-tight);
}
.auth-title {
  font-size: var(--text-2xl); font-weight: 700;
  color: var(--color-text); text-align: center;
  margin: 0 0 var(--space-2) 0; letter-spacing: var(--tracking-tight);
}
.auth-subtitle {
  font-size: var(--text-sm); color: var(--color-text-muted);
  text-align: center; margin: 0 0 var(--space-6) 0;
}
.auth-form { display: flex; flex-direction: column; }
.auth-submit { width: 100%; margin-bottom: var(--space-5); }
.auth-footer-text {
  text-align: center; font-size: var(--text-sm);
  color: var(--color-text-muted); margin: 0;
}
.auth-link-bold {
  color: var(--color-primary); text-decoration: none;
  font-weight: 600; transition: color var(--transition-fast);
}
.auth-link-bold:hover { color: var(--color-primary-hover); }
</style>
