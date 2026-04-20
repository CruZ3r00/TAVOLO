<script setup>
import { useHead } from '@vueuse/head';
import { useRouter, useRoute } from 'vue-router';
import AuthenticationCard from '@/components/AuthenticationCard.vue';
import InputLabel from '@/components/InputLabel.vue';
import TextInput from '@/components/TextInput.vue';
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import { API_BASE } from '@/utils';


useHead({
    title: 'Login',
    meta: [{ name: 'description', content: 'Pagina di login' }],
});

const store = useStore();

const username = ref('');
const password = ref('');
const errorMessage = ref('');
const isLoading = ref(false);
const isError = ref(false);
const showPassword = ref(false);

const router = useRouter();
const route = useRoute();
const justRegistered = computed(() => route.query.registered === '1');

const submit = async () => {
    isLoading.value = true;
    errorMessage.value = '';
    try {
        const response = await fetch(`${API_BASE}/api/auth/local`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: username.value, password: password.value }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log(data);
            // Saving in the Storage
            store.dispatch('login', { user: data.user, token: data.jwt });
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('token', data.jwt);
            router.push('/dashboard'); // Redirects to dashboard
        } else {
            const errorData = await response.json();
            console.log(errorData);
            errorMessage.value = 'Credenziali non valide. Riprova.';
            isError.value = true;
        }
    } catch (error) {
        errorMessage.value = 'Errore di rete. Riprova più tardi.';
        isError.value = true;
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
  <AuthenticationCard>
    <!-- Brand -->
    <router-link to="/" class="auth-brand">
      <div class="auth-brand-icon" aria-hidden="true">T</div>
      <span class="auth-brand-name">Tavolo</span>
    </router-link>

    <p class="auth-overline">Accesso</p>
    <h1 class="auth-title">Bentornato</h1>
    <p class="auth-subtitle">Entra per gestire il tuo ristorante</p>

    <!-- Registration success -->
    <Transition name="fade">
      <div v-if="justRegistered" class="ds-alert ds-alert-success">
        <i class="bi bi-check-circle"></i>
        <span>Registrazione completata! Accedi con le tue credenziali.</span>
      </div>
    </Transition>

    <!-- Error -->
    <Transition name="fade">
      <div v-if="isError" class="ds-alert ds-alert-error">
        <i class="bi bi-exclamation-circle"></i>
        <span>{{ errorMessage }}</span>
      </div>
    </Transition>

    <form @submit.prevent="submit" class="auth-form">
      <div class="ds-field">
        <InputLabel for="username" value="Username o Email" />
        <TextInput
          id="username"
          v-model="username"
          type="text"
          class="ds-input"
          required
          placeholder="Il tuo username o email"
        />
      </div>

      <div class="ds-field">
        <InputLabel for="password" value="Password" />
        <div class="password-field">
          <TextInput
            id="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            class="ds-input"
            placeholder="La tua password"
            required
          />
          <button
            type="button"
            class="password-toggle"
            @click="showPassword = !showPassword"
            tabindex="-1"
          >
            <i v-if="showPassword" class="bi bi-eye"></i>
            <i v-else class="bi bi-eye-slash"></i>
          </button>
        </div>
      </div>

      <div class="auth-links">
        <router-link to="/forgot-password" class="auth-link">Password dimenticata?</router-link>
      </div>

      <button type="submit" class="ds-btn ds-btn-primary ds-btn-lg auth-submit" :disabled="isLoading">
        <span v-if="isLoading" class="ds-spinner"></span>
        <span v-else>Accedi</span>
      </button>

      <p class="auth-footer-text">
        Non hai un account?
        <router-link to="/register" class="auth-link-bold">Registrati ora</router-link>
      </p>
    </form>
  </AuthenticationCard>
</template>

<style scoped>
.auth-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: var(--s-6);
  text-decoration: none;
}

.auth-brand-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: var(--paper);
  border-radius: 10px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.02em;
}

.auth-brand-name {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.02em;
}

.auth-overline {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-3);
  text-align: center;
  margin: 0 0 6px;
}

.auth-title {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 28px;
  font-weight: 700;
  color: var(--ink);
  text-align: center;
  margin: 0 0 6px 0;
  letter-spacing: -0.02em;
}

.auth-subtitle {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 14px;
  color: var(--ink-3);
  text-align: center;
  margin: 0 0 var(--s-6) 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.password-field {
  position: relative;
}

.password-field :deep(.input) {
  padding-right: 44px;
}

.password-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--ink-3);
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  border-radius: var(--r-sm);
  transition: color 120ms, background 120ms;
}

.password-toggle:hover {
  color: var(--ink);
  background: color-mix(in oklab, var(--ink) 6%, transparent);
}

.auth-links {
  display: flex;
  justify-content: flex-end;
  margin-top: -4px;
}

.auth-link {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 13px;
  color: var(--ac);
  text-decoration: none;
  font-weight: 500;
  transition: color 120ms;
}

.auth-link:hover {
  color: color-mix(in oklab, var(--ac) 80%, var(--ink));
  text-decoration: underline;
}

.auth-submit {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--paper);
  background: var(--ink);
  border: 1px solid var(--ink);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: transform 120ms, background 120ms, box-shadow 120ms;
  margin-top: var(--s-2);
}

.auth-submit:hover:not(:disabled) {
  background: color-mix(in oklab, var(--ink) 90%, var(--ac));
  transform: translateY(-1px);
}

.auth-submit:active:not(:disabled) {
  transform: translateY(0);
}

.auth-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.auth-submit .ds-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in oklab, var(--paper) 30%, transparent);
  border-top-color: var(--paper);
  border-radius: 50%;
  animation: auth-spin 650ms linear infinite;
}

@keyframes auth-spin { to { transform: rotate(360deg); } }

.auth-footer-text {
  text-align: center;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 14px;
  color: var(--ink-3);
  margin: var(--s-5) 0 0;
}

.auth-link-bold {
  color: var(--ink);
  text-decoration: none;
  font-weight: 600;
  transition: color 120ms;
}

.auth-link-bold:hover {
  color: var(--ac);
}

.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
