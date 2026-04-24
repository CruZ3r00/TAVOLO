<script setup>
import { useHead } from '@vueuse/head';
import { useRouter } from 'vue-router';
import AuthenticationCard from '@/components/AuthenticationCard.vue';
import Checkbox from '@/components/Checkbox.vue';
import InputLabel from '@/components/InputLabel.vue';
import TextInput from '@/components/TextInput.vue';
import { ref } from 'vue';
import { useStore } from 'vuex';
import { API_BASE, createBillingCheckoutSession } from '@/utils';

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
const selectedPlan = ref('pro');

const isError = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const showPassword = ref(false);

const router = useRouter();
const store = useStore();

const plans = [
  {
    key: 'starter',
    name: 'Starter',
    price: 'EUR 39,99',
    desc: 'Menu digitale, QR e prenotazioni.',
  },
  {
    key: 'pro',
    name: 'Professionale',
    price: 'EUR 74,99',
    desc: 'Sala, ordini e import menu via OCR.',
  },
];

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

    return await response.json();
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

  if (!terms.value) {
    errorMessage.value = 'Devi accettare i termini del servizio e la politica di privacy.';
    isError.value = true;
    return;
  }

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
      if (created?.jwt && created?.user) {
        store.dispatch('login', { user: created.user, token: created.jwt });
        localStorage.setItem('user', JSON.stringify(created.user));
        localStorage.setItem('token', created.jwt);

        const session = await createBillingCheckoutSession(selectedPlan.value, created.jwt);
        if (session?.url) {
          window.location.href = session.url;
          return;
        }
        router.push('/renew-sub');
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
    <router-link to="/" class="auth-brand">
      <div class="auth-brand-icon" aria-hidden="true">T</div>
      <span class="auth-brand-name">Tavolo</span>
    </router-link>

    <p class="auth-overline">Registrazione</p>
    <h1 class="auth-title">Crea il tuo account</h1>
    <p class="auth-subtitle">Inizia a gestire il tuo ristorante in pochi secondi</p>

    <!-- Error -->
    <Transition name="fade">
      <div v-if="isError" class="ds-alert ds-alert-error">
        <i class="bi bi-exclamation-circle"></i>
        <span>{{ errorMessage }}</span>
      </div>
    </Transition>

    <form @submit.prevent="submit" class="auth-form" novalidate>
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

      <div class="ds-field">
        <InputLabel value="Piano" />
        <div class="plan-options">
          <label
            v-for="plan in plans"
            :key="plan.key"
            class="plan-option"
            :class="{ 'plan-option-active': selectedPlan === plan.key }"
          >
            <input v-model="selectedPlan" type="radio" name="plan" :value="plan.key" />
            <span class="plan-option-body">
              <span class="plan-option-head">
                <strong>{{ plan.name }}</strong>
                <span>{{ plan.price }}</span>
              </span>
              <span class="plan-option-desc">{{ plan.desc }}</span>
            </span>
          </label>
        </div>
      </div>

      <div class="terms-field">
        <label class="terms-label">
          <Checkbox id="terms" v-model:checked="terms" name="terms" />
          <span class="terms-text">
            Ho letto e accetto i
            <router-link to="/terms" class="auth-link">termini del servizio</router-link> e la
            <router-link to="/privacy-policy" class="auth-link">politica di privacy</router-link>
          </span>
        </label>
      </div>

      <Transition name="fade">
        <div v-if="isError" class="inline-error">
          <i class="bi bi-exclamation-circle"></i>
          <span>{{ errorMessage }}</span>
        </div>
      </Transition>

      <button type="submit" class="ds-btn ds-btn-primary ds-btn-lg auth-submit" :disabled="isLoading">
        <span v-if="isLoading" class="ds-spinner"></span>
        <span v-else>Registrati e vai al pagamento</span>
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
  gap: 10px;
  margin-bottom: var(--s-5);
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
  font-size: 26px;
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
  margin: 0 0 var(--s-5) 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
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

.terms-field {
  margin: var(--s-2) 0 0;
}

.plan-options {
  display: grid;
  gap: var(--s-3);
}

.plan-option {
  display: flex;
  gap: 10px;
  padding: var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--paper);
  cursor: pointer;
}

.plan-option-active {
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink);
}

.plan-option input {
  margin-top: 3px;
}

.plan-option-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.plan-option-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: var(--ink);
}

.plan-option-head span {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  color: var(--ink-2);
  white-space: nowrap;
}

.plan-option-desc {
  font-size: 13px;
  color: var(--ink-3);
  line-height: 1.4;
}

.terms-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.terms-text {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.5;
}

.inline-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: var(--s-3);
  color: var(--danger-ink, #b42318);
  background: var(--danger-bg, #fff1f0);
  border: 1px solid color-mix(in oklab, var(--danger, #d92d20) 30%, var(--line));
  border-radius: var(--r-md);
  font-size: 13px;
  line-height: 1.4;
}

.auth-link {
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
  transition: transform 120ms, background 120ms;
  margin-top: var(--s-2);
}

.auth-submit:hover:not(:disabled) {
  background: color-mix(in oklab, var(--ink) 90%, var(--ac));
  transform: translateY(-1px);
}

.auth-submit:active:not(:disabled) { transform: translateY(0); }

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
  animation: reg-spin 650ms linear infinite;
}

@keyframes reg-spin { to { transform: rotate(360deg); } }

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

@media (max-width: 520px) {
  .form-row {
    grid-template-columns: 1fr;
    gap: var(--s-4);
  }
}
</style>
