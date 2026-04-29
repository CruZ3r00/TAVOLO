<script setup>
import { useHead } from '@vueuse/head';
import { useRouter } from 'vue-router';
import { ref, computed } from 'vue';

useHead({
  title: 'Registrazione · Tavolo',
  meta: [{ name: 'description', content: 'Crea il tuo account Tavolo' }],
});

const router = useRouter();

const step = ref(1);

// Step 1 — account
const name = ref('');
const surname = ref('');
const username = ref('');
const email = ref('');
const password = ref('');
const passwordConfirm = ref('');
const showPassword = ref(false);
const terms = ref(false);

// Step 2 — restaurant
const restaurantName = ref('');
const address = ref('');
const cap = ref('');
const city = ref('');
const province = ref('');
const vat = ref('');
const copertiInvernali = ref('');
const copertiEstivi = ref('');
const birthDate = ref('');

// Step 3 — plan (we just continue to /choose-plan)
const isLoading = ref(false);
const errorMessage = ref('');

const passwordStrength = computed(() => {
  const v = password.value || '';
  let s = 0;
  if (v.length >= 8) s += 30;
  if (/[A-Z]/.test(v)) s += 20;
  if (/[0-9]/.test(v)) s += 20;
  if (/[^A-Za-z0-9]/.test(v)) s += 20;
  if (v.length >= 12) s += 10;
  return Math.min(s, 100);
});

const passwordHint = computed(() => {
  const s = passwordStrength.value;
  if (!password.value) return 'Inserisci almeno 8 caratteri.';
  if (s < 40) return 'Debole — aggiungi numeri e maiuscole.';
  if (s < 70) return 'Buona — aggiungi un simbolo per renderla forte.';
  return 'Ottima — sicurezza elevata.';
});
const passwordColor = computed(() => {
  const s = passwordStrength.value;
  if (s < 40) return 'var(--danger)';
  if (s < 70) return 'var(--warn)';
  return 'var(--ok)';
});

const submitStep1 = () => {
  errorMessage.value = '';
  if (!name.value || !surname.value || !email.value || !password.value) {
    errorMessage.value = 'Compila tutti i campi obbligatori.';
    return;
  }
  if (!terms.value) {
    errorMessage.value = 'Devi accettare i termini e la privacy.';
    return;
  }
  if (password.value !== passwordConfirm.value) {
    errorMessage.value = 'Le password non coincidono.';
    return;
  }
  if (passwordStrength.value < 40) {
    errorMessage.value = 'La password è troppo debole.';
    return;
  }
  if (!username.value) username.value = email.value.split('@')[0];
  step.value = 2;
};

const submitStep2 = () => {
  errorMessage.value = '';
  if (!restaurantName.value) { errorMessage.value = 'Inserisci il nome del ristorante.'; return; }
  const cInv = parseInt(copertiInvernali.value, 10);
  if (!Number.isFinite(cInv) || cInv < 1 || cInv > 10000) {
    errorMessage.value = 'Coperti invernali: intero tra 1 e 10000.'; return;
  }
  if (copertiEstivi.value !== '' && copertiEstivi.value != null) {
    const cEst = parseInt(copertiEstivi.value, 10);
    if (!Number.isFinite(cEst) || cEst < 1 || cEst > 10000) {
      errorMessage.value = 'Coperti estivi: intero tra 1 e 10000.'; return;
    }
  }
  if (birthDate.value) {
    const bd = new Date(birthDate.value);
    const today = new Date();
    const age = today.getFullYear() - bd.getFullYear();
    if (bd >= today || age > 120 || age < 14) {
      errorMessage.value = 'Data di nascita non valida (età 14-120).'; return;
    }
  }
  step.value = 3;
};

const submitStep3 = () => {
  isLoading.value = true;
  try {
    const cInv = parseInt(copertiInvernali.value, 10);
    const cEst = copertiEstivi.value !== '' ? parseInt(copertiEstivi.value, 10) : null;
    const pending = {
      username: username.value,
      email: email.value,
      password: password.value,
      name: name.value,
      surname: surname.value,
      birth_date: birthDate.value || null,
      coperti_invernali: cInv,
      restaurant_name: restaurantName.value || username.value,
      address: address.value || null,
      city: city.value || null,
      cap: cap.value || null,
      province: province.value || null,
      vat: vat.value || null,
    };
    if (cEst != null) pending.coperti_estivi = cEst;
    sessionStorage.setItem('pending_registration', JSON.stringify(pending));
    router.push('/choose-plan');
  } finally {
    isLoading.value = false;
  }
};

const goBack = () => { if (step.value > 1) step.value -= 1; };
</script>

<template>
  <div class="au-shell">
    <div class="au-pane">
      <router-link to="/" class="au-brand">
        <span class="tv-brand-mark">T</span>
        <span class="brand-text">Tavolo</span>
      </router-link>

      <div class="au-form-wrap">
        <div class="au-form-h">
          <h1>
            {{ step === 1 ? "Crea l'account" : step === 2 ? 'Il tuo ristorante' : 'Scegli il piano' }}
          </h1>
          <p>
            {{ step === 1 ? 'Iniziamo dai tuoi dati. Servono 30 secondi.' : step === 2 ? 'Servono per fatturazione e configurazione.' : 'Cambi quando vuoi, senza vincoli.' }}
          </p>
        </div>

        <div class="au-progress">
          <div class="au-progress-bar"><span :style="{ width: (step * 33.3) + '%' }"></span></div>
          <span>Passo {{ step }} di 3</span>
        </div>

        <div v-if="errorMessage" class="au-trial" style="background: var(--danger-bg); border-color: color-mix(in oklab, var(--danger) 25%, transparent);">
          <i class="bi bi-exclamation-circle-fill" style="color: var(--danger);"></i>
          <div>
            <strong>Errore</strong>
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <!-- STEP 1 -->
        <form v-if="step === 1" class="au-form" @submit.prevent="submitStep1">
          <div class="fl-row">
            <label class="fl-field">
              <span class="fl-label">Nome *</span>
              <span class="fl-input"><i class="bi bi-person"></i><input v-model="name" type="text" placeholder="Marta" required /></span>
            </label>
            <label class="fl-field">
              <span class="fl-label">Cognome *</span>
              <span class="fl-input"><i class="bi bi-person"></i><input v-model="surname" type="text" placeholder="Rossi" required /></span>
            </label>
          </div>
          <label class="fl-field">
            <span class="fl-label">Email lavorativa *</span>
            <span class="fl-input"><i class="bi bi-envelope"></i><input v-model="email" type="email" placeholder="marta@miristoranti.it" required /></span>
            <span class="fl-help">Useremo questa email per l'accesso.</span>
          </label>
          <label class="fl-field">
            <span class="fl-label">Username (opzionale)</span>
            <span class="fl-input"><i class="bi bi-at"></i><input v-model="username" type="text" placeholder="mrossi" /></span>
            <span class="fl-help">Se lasci vuoto, useremo la parte prima della @ dell'email.</span>
          </label>
          <label class="fl-field">
            <span class="fl-label">Data di nascita (opzionale)</span>
            <span class="fl-input"><i class="bi bi-calendar3"></i><input v-model="birthDate" type="date" /></span>
          </label>
          <label class="fl-field">
            <span class="fl-label">Password *</span>
            <span class="fl-input">
              <i class="bi bi-lock"></i>
              <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Almeno 8 caratteri" required autocomplete="new-password" />
              <button type="button" class="fl-eye" @click="showPassword = !showPassword" tabindex="-1"><i :class="['bi', showPassword ? 'bi-eye-slash' : 'bi-eye']"></i></button>
            </span>
            <span class="fl-meter">
              <span class="bar"><span :style="{ width: passwordStrength + '%', background: passwordColor }"></span></span>
              <em>{{ passwordHint }}</em>
            </span>
          </label>
          <label class="fl-field">
            <span class="fl-label">Conferma password *</span>
            <span class="fl-input"><i class="bi bi-lock"></i><input v-model="passwordConfirm" type="password" placeholder="Ripeti la password" required autocomplete="new-password" /></span>
          </label>
          <label class="fl-check">
            <input v-model="terms" type="checkbox" />
            <span></span>
            <span>Accetto i <router-link to="/terms">Termini</router-link> e la <router-link to="/privacy-policy">Privacy</router-link></span>
          </label>
          <button type="submit" class="btn btn-accent btn-lg" style="width: 100%;">
            Continua <i class="bi bi-arrow-right"></i>
          </button>
        </form>

        <!-- STEP 2 -->
        <form v-else-if="step === 2" class="au-form" @submit.prevent="submitStep2">
          <label class="fl-field">
            <span class="fl-label">Nome del ristorante *</span>
            <span class="fl-input"><i class="bi bi-shop"></i><input v-model="restaurantName" type="text" placeholder="Osteria del Borgo" required /></span>
          </label>
          <div class="fl-row">
            <label class="fl-field" style="flex: 2;">
              <span class="fl-label">Indirizzo</span>
              <span class="fl-input"><i class="bi bi-geo-alt"></i><input v-model="address" type="text" placeholder="Via Roma 24" /></span>
            </label>
            <label class="fl-field">
              <span class="fl-label">CAP</span>
              <span class="fl-input"><input v-model="cap" type="text" placeholder="46100" /></span>
            </label>
          </div>
          <div class="fl-row">
            <label class="fl-field" style="flex: 2;">
              <span class="fl-label">Città</span>
              <span class="fl-input"><input v-model="city" type="text" placeholder="Mantova" /></span>
            </label>
            <label class="fl-field">
              <span class="fl-label">Provincia</span>
              <span class="fl-input"><input v-model="province" type="text" placeholder="MN" /></span>
            </label>
          </div>
          <label class="fl-field">
            <span class="fl-label">Partita IVA</span>
            <span class="fl-input"><i class="bi bi-receipt"></i><input v-model="vat" type="text" placeholder="01234567890" /></span>
            <span class="fl-help">Necessaria per emettere scontrini fiscali.</span>
          </label>
          <div class="fl-row">
            <label class="fl-field">
              <span class="fl-label">Coperti invernali *</span>
              <span class="fl-input"><i class="bi bi-snow"></i><input v-model="copertiInvernali" type="number" min="1" max="10000" placeholder="44" required /></span>
            </label>
            <label class="fl-field">
              <span class="fl-label">Coperti estivi (opzionale)</span>
              <span class="fl-input"><i class="bi bi-sun"></i><input v-model="copertiEstivi" type="number" min="1" max="10000" placeholder="60" /></span>
            </label>
          </div>
          <div class="au-actions-row">
            <button type="button" class="btn btn-lg" @click="goBack">
              <i class="bi bi-arrow-left"></i> Indietro
            </button>
            <button type="submit" class="btn btn-accent btn-lg" style="flex: 1;">
              Continua <i class="bi bi-arrow-right"></i>
            </button>
          </div>
        </form>

        <!-- STEP 3 -->
        <div v-else class="au-form">
          <div class="au-trial">
            <i class="bi bi-gift"></i>
            <div>
              <strong>14 giorni gratis</strong>
              <span>Nessun addebito ora. Inserisci la carta solo alla fine del periodo. Annulli quando vuoi.</span>
            </div>
          </div>
          <p class="fl-help">Cliccando su "Continua" andrai alla pagina di scelta del piano. Lì potrai confrontare i piani disponibili e completare la registrazione tramite Stripe.</p>
          <div class="au-actions-row">
            <button type="button" class="btn btn-lg" @click="goBack">
              <i class="bi bi-arrow-left"></i> Indietro
            </button>
            <button type="button" class="btn btn-accent btn-lg" style="flex: 1;" :disabled="isLoading" @click="submitStep3">
              <span v-if="isLoading" class="au-spinner"></span>
              <span v-else>Scegli il piano <i class="bi bi-rocket-takeoff"></i></span>
            </button>
          </div>
        </div>

        <p class="au-switch">
          Hai già un account?
          <router-link to="/login">Accedi</router-link>
        </p>
      </div>

      <footer class="au-foot">
        <span>© {{ new Date().getFullYear() }} Tavolo S.r.l.</span>
        <div>
          <router-link to="/terms">Termini</router-link>
          <router-link to="/privacy-policy">Privacy</router-link>
        </div>
      </footer>
    </div>

    <aside class="au-side">
      <div class="au-side-content">
        <div class="overline" style="color: color-mix(in oklab, white 60%, transparent);">14 giorni gratis</div>
        <h2>Inizia subito. Senza carta. Senza setup.</h2>
        <p>Crea l'account in 2 minuti. Stampante fiscale e POS si configurano dopo, quando vuoi.</p>
        <ol class="au-steps">
          <li :class="{ on: step >= 1 }"><span>1</span><div><strong>Account</strong><em>Email e password sicura</em></div></li>
          <li :class="{ on: step >= 2 }"><span>2</span><div><strong>Ristorante</strong><em>Nome, indirizzo, partita IVA</em></div></li>
          <li :class="{ on: step >= 3 }"><span>3</span><div><strong>Piano</strong><em>Scegli e conferma</em></div></li>
        </ol>
        <div class="au-includes">
          <span><i class="bi bi-check2-circle"></i>Menu QR pubblico incluso</span>
          <span><i class="bi bi-check2-circle"></i>Setup guidato 1-a-1</span>
          <span><i class="bi bi-check2-circle"></i>Annulli quando vuoi</span>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.au-shell .brand-text { font-family: var(--f-sans); font-size: 18px; letter-spacing: -0.025em; font-weight: 600; }
.au-spinner {
  width: 16px; height: 16px;
  border: 2px solid color-mix(in oklab, var(--ac-contrast) 30%, transparent);
  border-top-color: var(--ac-contrast);
  border-radius: 50%;
  animation: au-spin 650ms linear infinite;
}
@keyframes au-spin { to { transform: rotate(360deg); } }
</style>
