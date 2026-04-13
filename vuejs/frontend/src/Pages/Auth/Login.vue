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
    <div class="auth-brand">
      <div class="auth-brand-icon">
        <i class="bi bi-shop"></i>
      </div>
      <span class="auth-brand-name">MenuCMS</span>
    </div>

    <h1 class="auth-title">Bentornato!</h1>
    <p class="auth-subtitle">Accedi al tuo account per gestire il menu</p>

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
  gap: var(--space-3);
  margin-bottom: var(--space-8);
}

.auth-brand-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-lg);
  font-size: var(--text-xl);
}

.auth-brand-name {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: var(--tracking-tight);
}

.auth-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
  margin: 0 0 var(--space-2) 0;
  letter-spacing: var(--tracking-tight);
}

.auth-subtitle {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  margin: 0 0 var(--space-6) 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.password-field {
  position: relative;
}

.password-field .ds-input {
  padding-right: 44px;
}

.password-toggle {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: var(--space-1);
  display: flex;
  align-items: center;
  transition: color var(--transition-fast);
}

.password-toggle:hover {
  color: var(--color-text);
}

.auth-links {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-5);
}

.auth-link {
  font-size: var(--text-sm);
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--transition-fast);
}

.auth-link:hover {
  color: var(--color-primary-hover);
}

.auth-submit {
  width: 100%;
  margin-bottom: var(--space-5);
}

.auth-footer-text {
  text-align: center;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}

.auth-link-bold {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 600;
  transition: color var(--transition-fast);
}

.auth-link-bold:hover {
  color: var(--color-primary-hover);
}
</style>
