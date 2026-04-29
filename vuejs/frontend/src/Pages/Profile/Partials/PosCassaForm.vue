<script setup>
/**
 * Sezione "POS / Cassa fiscale" del profilo utente.
 *
 * Tre blocchi:
 *  1. Download installer/app — bottoni che puntano a installer Windows,
 *     Linux AppImage, macOS DMG, Play Store, App Store, APK sideload.
 *  2. Pairing token — genera un token single-use TTL 30min da inserire nel
 *     pos-rt-service installato (PC o mobile) per accoppiarlo all'account.
 *  3. Device collegati — lista dei pos-rt-service registrati: nome, platform,
 *     last_seen, status. Bottone "Revoca" per scollegare.
 *
 * Vincolo architetturale: questa sezione è additiva, non modifica le altre
 * sezioni del profilo. Le funzioni utility live in @/utils (Fase 5).
 */

import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';
import {
  generatePosPairingToken,
  fetchPosDevices,
  revokePosDevice,
  fetchPosInstallers,
} from '@/utils';

const store = useStore();
const tkn = store.getters.getToken;

const installers = ref(null);
const installersLoading = ref(true);
const installersErr = ref('');

const devices = ref([]);
const devicesLoading = ref(true);
const devicesErr = ref('');

const tokenValue = ref('');
const tokenExpiresAt = ref(null);
const tokenTtlMinutes = ref(30);
const generatingToken = ref(false);
const tokenErr = ref('');
const tokenCopied = ref(false);

let tickTimer = null;
const now = ref(Date.now());

const tokenSecondsLeft = computed(() => {
  if (!tokenExpiresAt.value) return 0;
  const ms = new Date(tokenExpiresAt.value).getTime() - now.value;
  return Math.max(0, Math.floor(ms / 1000));
});
const tokenExpired = computed(() => tokenValue.value && tokenSecondsLeft.value === 0);
const tokenCountdown = computed(() => {
  const s = tokenSecondsLeft.value;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
});

const downloadCards = computed(() => {
  if (!installers.value) return [];
  const i = installers.value;
  return [
    {
      key: 'windows',
      label: 'Windows',
      icon: 'bi-windows',
      desc: 'Installer .msi — gira come servizio Windows in background.',
      url: i.windows_msi_url,
      cta: 'Scarica .msi',
    },
    {
      key: 'macos',
      label: 'macOS',
      icon: 'bi-apple',
      desc: 'DMG firmato — installa pos-rt-service come daemon launchd.',
      url: i.macos_dmg_url,
      cta: 'Scarica .dmg',
    },
    {
      key: 'linux',
      label: 'Linux',
      icon: 'bi-terminal',
      desc: 'AppImage portable — esegui senza installazione.',
      url: i.linux_appimage_url,
      cta: 'Scarica AppImage',
    },
    {
      key: 'android',
      label: 'Android',
      icon: 'bi-google-play',
      desc: 'App Play Store — Foreground Service per polling continuo.',
      url: i.android_play_url,
      cta: 'Apri Play Store',
    },
    {
      key: 'ios',
      label: 'iOS',
      icon: 'bi-app-indicator',
      desc: 'App Store — wake-up via APNs silent push.',
      url: i.ios_appstore_url,
      cta: 'Apri App Store',
    },
    {
      key: 'apk',
      label: 'Android APK (sideload)',
      icon: 'bi-android2',
      desc: 'APK diretto per device dedicati (Sunmi, PAX) o test interni.',
      url: i.android_apk_url,
      cta: 'Scarica APK',
    },
  ];
});

const formattedLastSeen = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const isOnline = (device) => {
  if (device.revoked_at) return false;
  if (!device.last_seen) return false;
  const ageMs = Date.now() - new Date(device.last_seen).getTime();
  return ageMs < 90_000; // 90s = 3x heartbeat default
};

const reloadInstallers = async () => {
  installersLoading.value = true;
  installersErr.value = '';
  try {
    installers.value = await fetchPosInstallers();
  } catch (err) {
    installersErr.value = err.message || 'Errore caricamento installer';
  } finally {
    installersLoading.value = false;
  }
};

const reloadDevices = async () => {
  devicesLoading.value = true;
  devicesErr.value = '';
  try {
    devices.value = await fetchPosDevices(tkn);
  } catch (err) {
    devicesErr.value = err.message || 'Errore caricamento device';
  } finally {
    devicesLoading.value = false;
  }
};

const onGenerateToken = async () => {
  generatingToken.value = true;
  tokenErr.value = '';
  tokenCopied.value = false;
  try {
    const data = await generatePosPairingToken(tkn, tokenTtlMinutes.value);
    tokenValue.value = data.token;
    tokenExpiresAt.value = data.expires_at;
  } catch (err) {
    tokenErr.value = err.message || 'Generazione token fallita';
  } finally {
    generatingToken.value = false;
  }
};

const copyToken = async () => {
  if (!tokenValue.value) return;
  try {
    await navigator.clipboard.writeText(tokenValue.value);
    tokenCopied.value = true;
    setTimeout(() => { tokenCopied.value = false; }, 2000);
  } catch (err) {
    tokenErr.value = 'Impossibile copiare. Selezionalo manualmente.';
  }
};

const onRevoke = async (device) => {
  if (!confirm(`Revocare il device "${device.name}"? Il pos-rt-service installato perderà l'accesso.`)) return;
  try {
    await revokePosDevice(device.documentId, tkn);
    await reloadDevices();
  } catch (err) {
    devicesErr.value = err.message || 'Revoca fallita';
  }
};

onMounted(() => {
  reloadInstallers();
  reloadDevices();
  tickTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
  <div class="pos-section">
    <header class="section-head">
      <p class="text-overline">Integrazione</p>
      <h2 class="section-title">POS / Cassa fiscale</h2>
      <p class="section-sub">
        Collega un pos-rt-service installato sul PC della cassa o sul telefono per pilotare
        la cassa fiscale (RT) e il terminale POS direttamente dalla tua rete locale.
      </p>
    </header>

    <!-- 1. Download -->
    <section class="card">
      <h3 class="card-title">
        <i class="bi bi-cloud-download"></i> Scarica installer / app
      </h3>
      <p class="card-sub">
        Scegli la piattaforma del tuo dispositivo. L'app/installer è solo un ponte tra Strapi
        e i tuoi device fisici: tutto il traffico è uscente, nessuna porta da aprire.
      </p>
      <div v-if="installersErr" class="alert alert-err">{{ installersErr }}</div>
      <div v-if="installersLoading" class="muted">Caricamento link…</div>
      <div v-else class="download-grid">
        <article v-for="card in downloadCards" :key="card.key" class="dl-card">
          <i :class="['bi', card.icon, 'dl-icon']"></i>
          <h4>{{ card.label }}</h4>
          <p>{{ card.desc }}</p>
          <a v-if="card.url" :href="card.url" class="btn btn-primary" target="_blank" rel="noopener">
            {{ card.cta }}
          </a>
          <button v-else class="btn btn-disabled" disabled>Presto disponibile</button>
        </article>
      </div>
    </section>

    <!-- 2. Pairing token -->
    <section class="card">
      <h3 class="card-title">
        <i class="bi bi-key"></i> Token di accoppiamento
      </h3>
      <p class="card-sub">
        Genera un codice usa-e-getta da inserire nel pos-rt-service installato. Il token
        scade dopo {{ tokenTtlMinutes }} minuti e funziona una sola volta.
      </p>

      <div v-if="tokenErr" class="alert alert-err">{{ tokenErr }}</div>

      <div v-if="!tokenValue" class="row-end">
        <label class="ttl-input">
          Validità (minuti)
          <input v-model.number="tokenTtlMinutes" type="number" min="5" max="1440" />
        </label>
        <button class="btn btn-primary" :disabled="generatingToken" @click="onGenerateToken">
          {{ generatingToken ? 'Generazione…' : 'Genera token' }}
        </button>
      </div>

      <div v-else class="token-result" :class="{ 'token-expired': tokenExpired }">
        <div class="token-row">
          <code class="token-value">{{ tokenValue }}</code>
          <button class="btn btn-ghost" @click="copyToken">
            <i class="bi" :class="tokenCopied ? 'bi-check-lg' : 'bi-clipboard'"></i>
            {{ tokenCopied ? 'Copiato' : 'Copia' }}
          </button>
        </div>
        <div class="token-meta">
          <span v-if="tokenExpired" class="badge-expired">Scaduto</span>
          <span v-else class="badge-active">Valido • {{ tokenCountdown }}</span>
          <button class="btn btn-ghost btn-sm" @click="onGenerateToken" :disabled="generatingToken">
            Rigenera
          </button>
        </div>
        <ol class="token-steps">
          <li>Apri pos-rt-service sul PC o nell'app mobile.</li>
          <li>Quando ti chiede l'accoppiamento, incolla il token qui sopra.</li>
          <li>Inserisci l'URL del tuo Strapi e completa.</li>
        </ol>
      </div>
    </section>

    <!-- 3. Device collegati -->
    <section class="card">
      <h3 class="card-title">
        <i class="bi bi-hdd-rack"></i> Device collegati
        <button class="btn btn-ghost btn-sm refresh-btn" @click="reloadDevices" :disabled="devicesLoading">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      </h3>

      <div v-if="devicesErr" class="alert alert-err">{{ devicesErr }}</div>
      <div v-if="devicesLoading" class="muted">Caricamento…</div>
      <div v-else-if="devices.length === 0" class="empty-state">
        <i class="bi bi-hdd-network empty-ico"></i>
        <p>Nessun device collegato. Genera un token sopra e accoppia il tuo primo pos-rt-service.</p>
      </div>
      <ul v-else class="device-list">
        <li v-for="d in devices" :key="d.documentId" class="device-row">
          <div class="device-info">
            <div class="device-name">
              <span :class="['status-dot', isOnline(d) ? 'on' : 'off']"></span>
              {{ d.name }}
            </div>
            <div class="device-meta">
              <span>{{ d.platform || '—' }}</span>
              <span>•</span>
              <span>visto: {{ formattedLastSeen(d.last_seen) }}</span>
              <span v-if="d.version">• v{{ d.version }}</span>
              <span v-if="d.revoked_at" class="device-revoked">• REVOCATO</span>
            </div>
          </div>
          <button v-if="!d.revoked_at" class="btn btn-danger btn-sm" @click="onRevoke(d)">
            Revoca
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.pos-section { display: flex; flex-direction: column; gap: var(--s-6, 1.25rem); }
.section-head { margin-bottom: var(--s-4, 0.75rem); }
.text-overline {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.14em; color: var(--ink-3); margin: 0 0 6px;
}
.section-title {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: clamp(22px, 2.4vw, 28px); font-weight: 700; color: var(--ink);
  margin: 0 0 8px; letter-spacing: -0.01em;
}
.section-sub { color: var(--ink-2); margin: 0; line-height: 1.55; }

.card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-lg, 12px);
  padding: var(--s-6, 1.25rem);
}
.card-title {
  display: flex; align-items: center; gap: 0.6rem;
  margin: 0 0 0.4rem; font-size: 1.05rem; font-weight: 600; color: var(--ink);
}
.card-title i { font-size: 1.2rem; color: var(--ac); }
.card-sub { color: var(--ink-2); margin: 0 0 1rem; font-size: 0.95rem; }

.muted { color: var(--ink-3); font-size: 0.9rem; padding: 0.5rem 0; }

.alert {
  padding: 0.65rem 0.85rem; border-radius: var(--r-sm, 8px);
  font-size: 0.9rem; margin-bottom: 0.75rem;
}
.alert-err {
  background: color-mix(in oklab, var(--dan) 12%, transparent);
  border: 1px solid color-mix(in oklab, var(--dan) 35%, transparent);
  color: var(--dan);
}

/* Download grid */
.download-grid {
  display: grid; gap: 0.85rem;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.dl-card {
  display: flex; flex-direction: column; gap: 0.35rem;
  padding: 1rem; border: 1px solid var(--line);
  border-radius: var(--r-sm, 8px); background: var(--bg, transparent);
}
.dl-icon { font-size: 1.6rem; color: var(--ac); margin-bottom: 0.25rem; }
.dl-card h4 { margin: 0; font-size: 1rem; color: var(--ink); font-weight: 600; }
.dl-card p { margin: 0 0 0.6rem; color: var(--ink-3); font-size: 0.85rem; line-height: 1.4; flex: 1; }

/* Token */
.row-end { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
.ttl-input { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--ink-2); }
.ttl-input input {
  width: 110px; padding: 0.5rem 0.6rem; border: 1px solid var(--line);
  border-radius: var(--r-sm, 8px); background: var(--paper); color: var(--ink);
  font-family: var(--f-mono, monospace);
}

.token-result {
  border: 1px solid var(--line); border-radius: var(--r-sm, 8px);
  padding: 1rem; background: color-mix(in oklab, var(--ac) 4%, transparent);
}
.token-expired {
  background: color-mix(in oklab, var(--dan) 6%, transparent);
  border-color: color-mix(in oklab, var(--dan) 40%, transparent);
}
.token-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
.token-value {
  flex: 1; min-width: 200px; padding: 0.5rem 0.7rem;
  font-family: var(--f-mono, monospace); font-size: 0.85rem;
  background: var(--paper); border: 1px solid var(--line);
  border-radius: var(--r-sm, 8px); color: var(--ink);
  word-break: break-all; user-select: all;
}
.token-meta {
  display: flex; align-items: center; gap: 0.75rem;
  margin-bottom: 0.75rem; font-size: 0.85rem;
}
.badge-active, .badge-expired {
  padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
  font-family: var(--f-mono, monospace); letter-spacing: 0.04em;
}
.badge-active {
  background: color-mix(in oklab, var(--ac) 18%, transparent); color: var(--ac);
}
.badge-expired {
  background: color-mix(in oklab, var(--dan) 18%, transparent); color: var(--dan);
}
.token-steps {
  margin: 0; padding-left: 1.25rem; color: var(--ink-2);
  font-size: 0.9rem; line-height: 1.6;
}

/* Device list */
.device-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.device-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.7rem 0.85rem; border: 1px solid var(--line);
  border-radius: var(--r-sm, 8px); background: var(--bg, transparent);
}
.device-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.device-name {
  display: flex; align-items: center; gap: 0.5rem;
  font-weight: 600; color: var(--ink);
}
.status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.status-dot.on { background: var(--ac); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac) 18%, transparent); }
.status-dot.off { background: var(--ink-3); }
.device-meta {
  display: flex; gap: 0.4rem; flex-wrap: wrap;
  font-size: 0.8rem; color: var(--ink-3); font-family: var(--f-mono, monospace);
}
.device-revoked { color: var(--dan); font-weight: 600; }

.empty-state {
  text-align: center; padding: 1.5rem 1rem;
  color: var(--ink-3);
}
.empty-ico { font-size: 2rem; opacity: 0.4; }
.empty-state p { margin: 0.5rem 0 0; font-size: 0.9rem; }

/* Buttons (consistent with profile design) */
.btn {
  display: inline-flex; align-items: center; gap: 6px; justify-content: center;
  padding: 0.55rem 1rem; border-radius: var(--r-sm, 8px);
  font-family: var(--f-sans, sans-serif); font-size: 0.9rem; font-weight: 500;
  border: 1px solid transparent; cursor: pointer; text-decoration: none;
  transition: background 120ms, border-color 120ms;
}
.btn-primary { background: var(--ac); color: var(--paper, #fff); }
.btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.btn-ghost { background: transparent; color: var(--ink-2); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: color-mix(in oklab, var(--ink) 6%, transparent); color: var(--ink); }
.btn-danger { background: var(--dan); color: #fff; }
.btn-disabled { background: color-mix(in oklab, var(--ink) 8%, transparent); color: var(--ink-3); cursor: not-allowed; }
.btn-sm { padding: 0.35rem 0.7rem; font-size: 0.8rem; }
.btn:disabled { opacity: 0.6; cursor: wait; }
.refresh-btn { margin-left: auto; }
</style>
