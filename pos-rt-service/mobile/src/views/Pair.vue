<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { pair, pairByToken } from '../core/pairing';
import { devicePersistence } from '../core/persistence';
import { isApnsAvailable, requestPermissionAndRegister } from '../plugins/apnsRegistration';

const router = useRouter();
const mode = ref<'token' | 'creds'>('token');
const strapiUrl = ref('');
const pairingToken = ref('');
const email = ref('');
const password = ref('');
const deviceName = ref('');
const allowInsecure = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);
const apnsStatus = ref<string | null>(null);

async function onSubmit(e: Event) {
  e.preventDefault();
  error.value = null;
  apnsStatus.value = null;
  submitting.value = true;
  try {
    await devicePersistence.setPlatform(detectPlatform());
    if (mode.value === 'token') {
      const t = pairingToken.value.trim();
      if (!/^[a-f0-9]{64}$/i.test(t)) {
        throw new Error('Il token deve essere 64 caratteri esadecimali.');
      }
      await pairByToken({
        strapiUrl: strapiUrl.value.trim(),
        pairingToken: t,
        deviceName: deviceName.value.trim() || undefined,
        allowInsecure: allowInsecure.value,
      });
    } else {
      await pair({
        strapiUrl: strapiUrl.value.trim(),
        email: email.value.trim(),
        password: password.value,
        deviceName: deviceName.value.trim() || undefined,
        allowInsecure: allowInsecure.value,
      });
    }
    // Solo iOS: chiedi permesso push e registra il token APNs.
    // Best-effort — se l'utente nega o il flow fallisce, l'app funziona
    // comunque tramite polling regolare.
    if (isApnsAvailable()) {
      apnsStatus.value = 'Richiesta permesso notifiche…';
      const res = await requestPermissionAndRegister();
      apnsStatus.value = res.ok
        ? 'Permesso accordato — wake-up in background abilitato.'
        : `Push non abilitate (${res.reason}). L'app userà il polling.`;
    }
    // Piccolo delay perché l'utente possa leggere lo status
    setTimeout(() => router.replace('/dashboard'), apnsStatus.value ? 1500 : 0);
  } catch (err: any) {
    error.value = err?.message || 'Errore sconosciuto';
  } finally {
    submitting.value = false;
  }
}

function detectPlatform(): string {
  try {
    // @ts-expect-error capacitor global
    const cap = window.Capacitor;
    if (cap?.getPlatform) {
      const p = cap.getPlatform();
      return p === 'web' ? 'other' : p;
    }
  } catch (_) { /* ignore */ }
  return 'other';
}
</script>

<template>
  <div class="pair-page">
    <h1>Collega dispositivo</h1>
    <p class="muted">
      Collega questa app al tuo account Strapi. Una volta abbinato, l'app funziona da ponte
      verso i dispositivi POS / RT presenti sulla tua rete locale.
    </p>

    <div class="mode-tabs">
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'token' }"
        @click="mode = 'token'"
      >Token (consigliato)</button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'creds' }"
        @click="mode = 'creds'"
      >Email + password</button>
    </div>

    <form @submit="onSubmit" class="card">
      <label for="strapi_url">URL Strapi</label>
      <input id="strapi_url" v-model="strapiUrl" type="url" required placeholder="https://api.tuodominio.it" />

      <template v-if="mode === 'token'">
        <label for="pairing_token">Token di accoppiamento</label>
        <input
          id="pairing_token"
          v-model="pairingToken"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          minlength="64"
          maxlength="64"
          placeholder="64 caratteri esadecimali"
          required
        />
        <p class="muted" style="font-size: .8rem; margin: -.4rem 0 .8rem;">
          Genera il token dalla pagina profilo Strapi → "POS / Cassa fiscale".
          Scade in 30 minuti, single-use.
        </p>
      </template>

      <template v-else>
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="username" />
        <label for="password">Password</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" />
      </template>

      <label for="device_name">Nome dispositivo (opzionale)</label>
      <input id="device_name" v-model="deviceName" type="text" placeholder="Cassa sala" />

      <label style="display: flex; align-items: center; gap: 0.5rem; margin: 1rem 0;">
        <input v-model="allowInsecure" type="checkbox" style="width: auto; margin: 0;" />
        <span class="muted">Consenti http:// (solo dev locale)</span>
      </label>

      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="apnsStatus" class="success-box">{{ apnsStatus }}</div>

      <button type="submit" :disabled="submitting" class="btn btn-block">
        {{ submitting ? 'Connessione in corso…' : 'Collega' }}
      </button>
    </form>

    <p class="muted" style="margin-top: 1rem; font-size: 0.8rem;">
      Il device_token viene salvato cifrato nello storage del dispositivo.
      Tutta la comunicazione è outbound: l'app non accetta connessioni in entrata.
    </p>
  </div>
</template>

<style scoped>
.pair-page {
  max-width: 480px;
  margin: 0 auto;
}
.mode-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.mode-tab {
  flex: 1;
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--border);
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
}
.mode-tab.active {
  background: var(--accent);
  color: #0b0f13;
  border-color: var(--accent);
  font-weight: 600;
}
</style>
