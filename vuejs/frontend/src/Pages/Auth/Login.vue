<script setup>
import { useHead } from '@vueuse/head';
import { useRouter, useRoute } from 'vue-router';
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import { API_BASE } from '@/utils';
import { defaultRouteForUser } from '@/staffAccess';

useHead({
  title: 'Accedi · ComforTables',
  meta: [{ name: 'description', content: 'Accedi a ComforTables per gestire il tuo ristorante' }],
});

const store = useStore();
const router = useRouter();
const route = useRoute();

const identifier = ref('');
const password = ref('');
const showPassword = ref(false);
const remember = ref(true);
const isLoading = ref(false);
const errorMessage = ref('');

const justRegistered = computed(() => route.query.registered === '1');
const registrationNeedsVerification = computed(() => route.query.registered === 'verify');
const emailConfirmed = computed(() => route.query.confirmed === '1');
const passwordReset = computed(() => route.query.passwordReset === '1');

const submit = async () => {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await fetch(`${API_BASE}/api/auth/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: identifier.value, password: password.value }),
    });
    if (response.ok) {
      const data = await response.json();
      let user = data.user;
      try {
        const meResponse = await fetch(`${API_BASE}/api/users/me`, {
          headers: { Authorization: `Bearer ${data.jwt}` },
        });
        if (meResponse.ok) {
          user = await meResponse.json();
        }
      } catch (_err) { /* login resta valido anche se /me non risponde */ }
      store.dispatch('login', { user, token: data.jwt });
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', data.jwt);
      const pendingPlan = route.query.plan || sessionStorage.getItem('pending_plan_after_verification');
      if (['starter', 'pro'].includes(pendingPlan)) {
        sessionStorage.removeItem('pending_plan_after_verification');
        router.push({ path: '/renew-sub', query: { checkout: 'retry', plan: pendingPlan } });
        return;
      }
      router.push(defaultRouteForUser(user));
    } else {
      errorMessage.value = 'Credenziali non valide. Riprova.';
    }
  } catch (_err) {
    errorMessage.value = 'Errore di rete. Riprova più tardi.';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="au-shell">
    <div class="au-pane">
      <router-link to="/" class="au-brand">
        <span class="tv-brand-mark">C</span>
        <span class="brand-text">ComforTables</span>
      </router-link>

      <div class="au-form-wrap">
        <div class="au-form-h">
          <h1>Bentornato.</h1>
          <p>Accedi per riprendere il servizio.</p>
        </div>

        <div v-if="justRegistered" class="au-trial">
          <i class="bi bi-check-circle-fill"></i>
          <div>
            <strong>Registrazione completata</strong>
            <span>Accedi con le credenziali appena create.</span>
          </div>
        </div>

        <div v-if="registrationNeedsVerification" class="au-trial">
          <i class="bi bi-envelope-check-fill"></i>
          <div>
            <strong>Controlla la tua email</strong>
            <span>Ti abbiamo inviato il link per confermare l'account prima dell'accesso.</span>
          </div>
        </div>

        <div v-if="emailConfirmed" class="au-trial">
          <i class="bi bi-check-circle-fill"></i>
          <div>
            <strong>Email confermata</strong>
            <span>Ora puoi accedere al tuo account ComforTables.</span>
          </div>
        </div>

        <div v-if="passwordReset" class="au-trial">
          <i class="bi bi-check-circle-fill"></i>
          <div>
            <strong>Password aggiornata</strong>
            <span>Accedi con la nuova password.</span>
          </div>
        </div>

        <div v-if="errorMessage" class="au-trial" style="background: var(--danger-bg); border-color: color-mix(in oklab, var(--danger) 25%, transparent);">
          <i class="bi bi-exclamation-circle-fill" style="color: var(--danger);"></i>
          <div>
            <strong>Errore</strong>
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <form class="au-form" @submit.prevent="submit">
          <label class="fl-field">
            <span class="fl-label">Email o username</span>
            <span class="fl-input">
              <i class="bi bi-envelope"></i>
              <input v-model="identifier" type="text" placeholder="marta@osteriadelborgo.it" required autocomplete="username" />
            </span>
          </label>

          <label class="fl-field">
            <span class="fl-label-row">
              <span class="fl-label">Password</span>
              <router-link to="/forgot-password" class="fl-link">Password dimenticata?</router-link>
            </span>
            <span class="fl-input">
              <i class="bi bi-lock"></i>
              <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="••••••••••" required autocomplete="current-password" />
              <button type="button" class="fl-eye" @click="showPassword = !showPassword" tabindex="-1" aria-label="Mostra/nascondi password">
                <i :class="['bi', showPassword ? 'bi-eye-slash' : 'bi-eye']"></i>
              </button>
            </span>
          </label>

          <label class="fl-check">
            <input v-model="remember" type="checkbox" />
            <span></span>
            <span>Mantieni l'accesso su questo dispositivo</span>
          </label>

          <button type="submit" class="btn btn-accent btn-lg" style="width: 100%;" :disabled="isLoading">
            <span v-if="isLoading" class="au-spinner"></span>
            <span v-else>Accedi</span>
            <i v-if="!isLoading" class="bi bi-arrow-right"></i>
          </button>

          <p class="au-switch">
            Non hai ancora un account?
            <router-link to="/register">Registrati</router-link>
          </p>
        </form>
      </div>

      <footer class="au-foot">
        <span>© {{ new Date().getFullYear() }} ComforTables</span>
        <div>
          <router-link to="/terms">Termini</router-link>
          <router-link to="/privacy-policy">Privacy</router-link>
          <router-link to="/contact-us">Aiuto</router-link>
        </div>
      </footer>
    </div>

    <aside class="au-side">
      <div class="au-side-content">
        <div class="overline" style="color: color-mix(in oklab, white 60%, transparent);">Servizio in corso</div>
        <h2>Tutto sotto controllo, anche stasera.</h2>
        <p>Coperti gestiti, tavoli aperti, scontrini fiscali stampati. ComforTables è la consolle di servizio della tua brigata.</p>

        <div class="au-side-mock">
          <div class="au-side-mock-h">
            <span class="tv-pulse"></span>
            <span>LIVE · Demo</span>
          </div>
          <div class="au-side-mock-grid">
            <div class="au-side-mock-stat"><span>Coperti</span><strong>72</strong></div>
            <div class="au-side-mock-stat"><span>Incasso</span><strong>€1.284</strong></div>
            <div class="au-side-mock-stat"><span>Tavoli</span><strong>8/12</strong></div>
          </div>
          <div class="au-side-mock-bars">
            <div v-for="(v, i) in [60, 82, 55, 90, 72, 95, 88]" :key="i" :style="{ height: v + '%' }"></div>
          </div>
          <div class="au-side-mock-foot">
            <i class="bi bi-shield-check"></i>
            <span>Stampante RT certificata · POS connesso</span>
          </div>
        </div>

        <div class="au-quote">
          <p>"Ho ridotto del 30% il tempo medio al tavolo. La cucina riceve gli ordini in due tap."</p>
          <span><strong>Marta Rossi</strong> · Osteria del Borgo, Mantova</span>
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
