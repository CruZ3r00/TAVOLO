<script setup>
import { computed } from 'vue';
import { useHead } from '@vueuse/head';
import { useForm } from 'vee-validate';
import AuthenticationCard from '@/components/AuthenticationCard.vue';

useHead({
    title: 'Verifica Email',
    meta: [
        { name: 'description', content: 'Please verify your email address to continue' },
    ],
});

const form = useForm();

const props = defineProps({
    status: String,
});

const verificationLinkSent = computed(() => props.status === 'verification-link-sent');

const submit = () => {
    form.post(route('verification.send'));
};
</script>

<template>
  <AuthenticationCard>
    <div class="auth-brand">
      <div class="auth-brand-icon"><i class="bi bi-shop"></i></div>
      <span class="auth-brand-name">MenuCMS</span>
    </div>

    <h1 class="auth-title">Verifica email</h1>
    <p class="auth-subtitle">
      Prima di continuare, verifica il tuo indirizzo email cliccando sul link che ti abbiamo inviato. Se non hai ricevuto l'email, te ne invieremo un'altra.
    </p>

    <Transition name="fade">
      <div v-if="verificationLinkSent" class="ds-alert ds-alert-success">
        <i class="bi bi-check-circle"></i>
        <span>Un nuovo link di verifica è stato inviato al tuo indirizzo email.</span>
      </div>
    </Transition>

    <form @submit.prevent="submit">
      <div class="verify-actions">
        <button type="submit" class="ds-btn ds-btn-primary" :disabled="form.processing">
          <span v-if="form.processing" class="ds-spinner"></span>
          <span v-else>Invia nuovamente</span>
        </button>

        <div class="verify-links">
          <router-link to="/profile/show" class="auth-link">Modifica profilo</router-link>
          <router-link to="/logout" class="auth-link">Esci</router-link>
        </div>
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
  text-align: center; margin: 0 0 var(--space-6) 0; line-height: var(--leading-relaxed);
}
.verify-actions {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-4); flex-wrap: wrap;
}
.verify-links {
  display: flex; gap: var(--space-4);
}
.auth-link {
  font-size: var(--text-sm); color: var(--color-primary);
  text-decoration: none; font-weight: 500;
  transition: color var(--transition-fast);
}
.auth-link:hover { color: var(--color-primary-hover); }
</style>
