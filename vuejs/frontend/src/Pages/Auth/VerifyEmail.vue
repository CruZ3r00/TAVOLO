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
    <router-link to="/" class="auth-brand">
      <div class="auth-brand-icon" aria-hidden="true"><i class="bi bi-envelope-check"></i></div>
      <span class="auth-brand-name">Tavolo</span>
    </router-link>

    <p class="auth-overline">Email</p>
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
  text-align: center; margin: 0 0 var(--s-5) 0; line-height: 1.55;
}
.verify-actions {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-4); flex-wrap: wrap;
}
.verify-links {
  display: flex; gap: var(--s-4);
}
.auth-link {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 13px; color: var(--ac);
  text-decoration: none; font-weight: 500;
  transition: color 120ms;
}
.auth-link:hover {
  color: color-mix(in oklab, var(--ac) 80%, var(--ink));
  text-decoration: underline;
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
