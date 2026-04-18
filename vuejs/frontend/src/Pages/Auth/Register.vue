<script setup>
import { useHead } from '@vueuse/head';
import { useRouter } from 'vue-router';
import AuthenticationCard from '@/components/AuthenticationCard.vue';
import Checkbox from '@/components/Checkbox.vue';
import InputLabel from '@/components/InputLabel.vue';
import TextInput from '@/components/TextInput.vue';
import { ref } from 'vue';
import { API_BASE } from '@/utils';

// Page title
useHead({
  title: 'Registrazione',
  meta: [
    { name: 'description', content: 'Pagina di registrazione' },
  ],
});

const username = ref('');
const name = ref('');
const surname = ref('');
const email = ref('');
const birth_date = ref('');
const password = ref('');
const password_confirmation= ref('');
const terms = ref(false);
const copertiInvernali = ref('');
const copertiEstivi = ref('');

const isError = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const showPassword = ref(false);

const router = useRouter();

// Registra l'utente in un'unica chiamata: dati anagrafici e WebsiteConfig
// vengono persistiti server-side durante il flusso di signup.
const createUser = async () => {
  try {
    const payload = {
      username: username.value,
      email: email.value,
      password: password.value,
      name: name.value,
      surname: surname.value,
      birth_date: birth_date.value,
      coperti_invernali: parseInt(copertiInvernali.value, 10),
      restaurant_name: username.value,
    };
    if (copertiEstivi.value !== '' && copertiEstivi.value != null) {
      payload.coperti_estivi = parseInt(copertiEstivi.value, 10);
    }
    const response = await fetch(`${API_BASE}/api/auth/local/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      errorMessage.value = errorData?.error?.message || 'Errore durante la registrazione.';
      isError.value = true;
      return false;
    }

    return true;
  } catch (error) {
    console.error('Errore di rete:', error.message);
    errorMessage.value = 'Errore di rete durante la registrazione.';
    isError.value = true;
    return false;
  }
};

const submit = async () => {
  isError.value = false;
  errorMessage.value = '';

  // Validazione coperti invernali (obbligatori)
  const cInv = parseInt(copertiInvernali.value, 10);
  if (!Number.isFinite(cInv) || cInv < 1 || cInv > 10000) {
    errorMessage.value = 'Inserisci i coperti invernali (intero tra 1 e 10000).';
    isError.value = true;
    return;
  }
  if (copertiEstivi.value !== '' && copertiEstivi.value != null) {
    const cEst = parseInt(copertiEstivi.value, 10);
    if (!Number.isFinite(cEst) || cEst < 1 || cEst > 10000) {
      errorMessage.value = 'Coperti estivi non validi (intero tra 1 e 10000).';
      isError.value = true;
      return;
    }
  }

  // Validazione data di nascita
  if (birth_date.value) {
    const bd = new Date(birth_date.value);
    const today = new Date();
    const age = today.getFullYear() - bd.getFullYear();
    if (bd >= today) {
      errorMessage.value = 'La data di nascita non può essere nel futuro.';
      isError.value = true;
      return;
    }
    if (age > 120 || age < 14) {
      errorMessage.value = 'Inserisci una data di nascita valida (età tra 14 e 120 anni).';
      isError.value = true;
      return;
    }
  }

  if( password.value === password_confirmation.value ){
    isLoading.value = true;
    try {
      const created = await createUser();
      if (created) {
        router.push({ path: '/login', query: { registered: '1' } });
      }
    } finally {
      isLoading.value = false;
    }
  }else{
    errorMessage.value = 'Le due password devono coincidere';
    isError.value = true;
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

    <h1 class="auth-title">Crea il tuo account</h1>
    <p class="auth-subtitle">Inizia a gestire il menu del tuo ristorante</p>

    <!-- Error -->
    <Transition name="fade">
      <div v-if="isError" class="ds-alert ds-alert-error">
        <i class="bi bi-exclamation-circle"></i>
        <span>{{ errorMessage }}</span>
      </div>
    </Transition>

    <form @submit.prevent="submit" class="auth-form">
      <div class="ds-field">
        <InputLabel for="username" value="Username" />
        <TextInput id="username" v-model="username" type="text" placeholder="Il tuo username" required />
      </div>

      <div class="ds-field">
        <InputLabel for="email" value="Email" />
        <TextInput id="email" v-model="email" type="email" placeholder="email@esempio.com" required />
      </div>

      <div class="form-row">
        <div class="ds-field">
          <InputLabel for="name" value="Nome" />
          <TextInput id="name" v-model="name" type="text" placeholder="Nome" required />
        </div>
        <div class="ds-field">
          <InputLabel for="surname" value="Cognome" />
          <TextInput id="surname" v-model="surname" type="text" placeholder="Cognome" required />
        </div>
      </div>

      <div class="ds-field">
        <InputLabel for="birth_date" value="Data di nascita" />
        <TextInput id="birth_date" v-model="birth_date" type="date" required />
      </div>

      <div class="form-row">
        <div class="ds-field">
          <InputLabel for="coperti_invernali" value="Coperti invernali *" />
          <TextInput id="coperti_invernali" v-model="copertiInvernali" type="number" min="1" max="10000" placeholder="Es. 40" required />
        </div>
        <div class="ds-field">
          <InputLabel for="coperti_estivi" value="Coperti estivi" />
          <TextInput id="coperti_estivi" v-model="copertiEstivi" type="number" min="1" max="10000" placeholder="Uguale agli invernali se vuoto" />
        </div>
      </div>

      <div class="ds-field">
        <InputLabel for="password" value="Password" />
        <div class="password-field">
          <TextInput
            id="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Scegli una password"
            required
          />
          <button type="button" class="password-toggle" @click="showPassword = !showPassword" tabindex="-1">
            <i v-if="showPassword" class="bi bi-eye"></i>
            <i v-else class="bi bi-eye-slash"></i>
          </button>
        </div>
      </div>

      <div class="ds-field">
        <InputLabel for="password_confirm" value="Conferma password" />
        <div class="password-field">
          <TextInput
            id="password_confirm"
            v-model="password_confirmation"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Ripeti la password"
            required
          />
          <button type="button" class="password-toggle" @click="showPassword = !showPassword" tabindex="-1">
            <i v-if="showPassword" class="bi bi-eye"></i>
            <i v-else class="bi bi-eye-slash"></i>
          </button>
        </div>
      </div>

      <div class="terms-field">
        <label class="terms-label">
          <Checkbox id="terms" v-model:checked="terms" name="terms" required />
          <span class="terms-text">
            Ho letto e accetto i
            <router-link to="/terms" class="auth-link">termini del servizio</router-link> e la
            <router-link to="/privacy-policy" class="auth-link">politica di privacy</router-link>
          </span>
        </label>
      </div>

      <button type="submit" class="ds-btn ds-btn-primary ds-btn-lg auth-submit" :disabled="isLoading">
        <span v-if="isLoading" class="ds-spinner"></span>
        <span v-else>Registrati</span>
      </button>

      <p class="auth-footer-text">
        Hai già un account?
        <router-link to="/login" class="auth-link-bold">Accedi ora</router-link>
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
  margin-bottom: var(--space-6);
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
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.password-field {
  position: relative;
}

.password-field :deep(.ds-input) {
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

.terms-field {
  margin-bottom: var(--space-5);
}

.terms-label {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  cursor: pointer;
}

.terms-text {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--leading-normal);
}

.auth-link {
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

@media (max-width: 480px) {
  .form-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
