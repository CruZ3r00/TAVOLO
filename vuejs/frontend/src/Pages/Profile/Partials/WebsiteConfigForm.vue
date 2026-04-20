<script setup>
import GeneratorQRCode from '@/components/GeneratorQRCode.vue';
import { ref, onMounted } from 'vue';
import { useStore } from 'vuex';
import { API_BASE } from '@/utils';

const store = useStore();
const tkn = store.getters.getToken;

const configId = ref('');
const restaurantName = ref('');
const siteUrl = ref('');
const logoPreview = ref(null);
const logoFile = ref(null);
const uploadedLogoId = ref(null);
const currentLogoUrl = ref(null);
const userDocumentId = ref('');
const isSaving = ref(false);
const saveSuccess = ref(false);
const saveError = ref('');
const apiEndpoint = ref('');
const apiCopied = ref(false);
const copertiInvernali = ref('');
const copertiEstivi = ref('');

const applyConfig = (config) => {
  configId.value = config?.documentId || '';
  restaurantName.value = config?.restaurant_name || '';
  siteUrl.value = config?.site_url || '';
  copertiInvernali.value = config?.coperti_invernali != null ? String(config.coperti_invernali) : '';
  copertiEstivi.value = config?.coperti_estivi != null ? String(config.coperti_estivi) : '';
  currentLogoUrl.value = config?.logo?.url ? `${API_BASE}${config.logo.url}` : null;
  uploadedLogoId.value = config?.logo?.id || null;
};

const fetchConfig = async () => {
  try {
    const userRes = await fetch(`${API_BASE}/api/users/me?populate=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tkn}`,
        'Content-Type': 'application/json',
      },
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      userDocumentId.value = userData.documentId;
      apiEndpoint.value = `${API_BASE}/api/menus/public/${userData.documentId}`;

      const wcRes = await fetch(`${API_BASE}/api/account/website-config`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tkn}`,
          'Content-Type': 'application/json',
        },
      });
      if (wcRes.ok) {
        const wcData = await wcRes.json();
        applyConfig(wcData.data);
      } else {
        const errorData = await wcRes.json().catch(() => ({}));
        saveError.value = errorData?.error?.message || 'Impossibile caricare la configurazione del sito.';
      }
    }
  } catch (error) {
    console.error('Errore nel caricamento configurazione:', error);
  }
};

const handleLogoFile = (event) => {
  const file = event.target.files[0];
  if (file) {
    logoFile.value = file;
    const reader = new FileReader();
    reader.onload = () => {
      logoPreview.value = reader.result;
    };
    reader.readAsDataURL(file);
  }
};

const uploadLogo = async () => {
  if (!logoFile.value) return;
  const formData = new FormData();
  formData.append('files', logoFile.value);
  try {
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tkn}` },
      body: formData,
    });
    if (response.ok) {
      const result = await response.json();
      uploadedLogoId.value = result[0].id;
    }
  } catch (error) {
    console.error('Errore upload logo:', error);
  }
};

const saveConfig = async () => {
  isSaving.value = true;
  saveSuccess.value = false;
  saveError.value = '';

  try {
    await uploadLogo();

    const cInv = parseInt(copertiInvernali.value, 10);
    if (!Number.isFinite(cInv) || cInv < 1 || cInv > 10000) {
      saveError.value = 'Coperti invernali: inserisci un intero tra 1 e 10000.';
      isSaving.value = false;
      return;
    }
    let cEst = null;
    if (copertiEstivi.value !== '' && copertiEstivi.value != null) {
      cEst = parseInt(copertiEstivi.value, 10);
      if (!Number.isFinite(cEst) || cEst < 1 || cEst > 10000) {
        saveError.value = 'Coperti estivi: inserisci un intero tra 1 e 10000 (o lascia vuoto).';
        isSaving.value = false;
        return;
      }
    }

    const bodyData = {
      restaurant_name: restaurantName.value,
      site_url: siteUrl.value,
      coperti_invernali: cInv,
      coperti_estivi: cEst != null ? cEst : cInv,
    };

    if (uploadedLogoId.value) {
      bodyData.logo = uploadedLogoId.value;
    }

    const response = await fetch(`${API_BASE}/api/account/website-config`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${tkn}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyData),
    });

    if (response.ok) {
      const data = await response.json();
      applyConfig(data.data);
      saveSuccess.value = true;
    } else {
      const errorData = await response.json().catch(() => ({}));
      saveError.value = errorData?.error?.message || 'Errore nel salvataggio della configurazione.';
    }
  } catch (error) {
    saveError.value = 'Errore di rete nel salvataggio.';
    console.error(error);
  } finally {
    isSaving.value = false;
    if (saveSuccess.value) {
      setTimeout(() => { saveSuccess.value = false; }, 3000);
    }
  }
};

const copyApiEndpoint = () => {
  navigator.clipboard.writeText(apiEndpoint.value);
  apiCopied.value = true;
  setTimeout(() => { apiCopied.value = false; }, 2000);
};

onMounted(async () => {
  await fetchConfig();
});
</script>

<template>
  <div class="wcf">
    <!-- Settings card -->
    <div class="ds-card">
      <div class="ds-card-header">
        <i class="bi bi-gear" style="color: var(--color-primary);"></i>
        <h3 class="card-section-title">Impostazioni sito</h3>
      </div>
      <div class="ds-card-body">
        <form @submit.prevent="saveConfig">
          <div class="ds-field">
            <label class="ds-label">Nome del ristorante</label>
            <input type="text" v-model="restaurantName" class="ds-input" placeholder="Es. Pizzeria Da Mario" required>
          </div>

          <div class="ds-field">
            <label class="ds-label">URL del sito web</label>
            <input type="url" v-model="siteUrl" class="ds-input" placeholder="https://www.mioristorante.it">
            <p class="ds-helper">L'URL del tuo sito web dove verrà visualizzato il menu.</p>
          </div>

          <div class="ds-field">
            <label class="ds-label">Coperti invernali *</label>
            <input type="number" min="1" max="10000" v-model="copertiInvernali" class="ds-input" placeholder="Es. 40" required>
            <p class="ds-helper">Capienza massima nei mesi invernali. Usata per il controllo overbooking.</p>
          </div>

          <div class="ds-field">
            <label class="ds-label">Coperti estivi</label>
            <input type="number" min="1" max="10000" v-model="copertiEstivi" class="ds-input" placeholder="Uguale agli invernali se vuoto">
            <p class="ds-helper">Capienza massima nei mesi estivi (default aprile-ottobre).</p>
          </div>

          <div class="ds-field">
            <label class="ds-label">Logo del ristorante</label>
            <label class="file-upload-area" tabindex="0">
              <input type="file" accept="image/*" @change="handleLogoFile" class="file-upload-hidden">
              <div v-if="!logoPreview && !currentLogoUrl" class="file-upload-content">
                <i class="bi bi-cloud-arrow-up file-upload-icon"></i>
                <span class="file-upload-text">Clicca per caricare il logo</span>
              </div>
              <div v-else class="file-upload-preview">
                <img :src="logoPreview || currentLogoUrl" :alt="logoPreview ? 'Anteprima logo' : 'Logo attuale'" class="logo-preview-img">
                <span class="file-upload-change">Clicca per cambiare</span>
              </div>
            </label>
          </div>

          <Transition name="fade">
            <div v-if="saveSuccess" class="ds-alert ds-alert-success">
              <i class="bi bi-check-circle"></i>
              <span>Configurazione salvata con successo!</span>
            </div>
          </Transition>
          <Transition name="fade">
            <div v-if="saveError" class="ds-alert ds-alert-error">
              <i class="bi bi-exclamation-circle"></i>
              <span>{{ saveError }}</span>
            </div>
          </Transition>

          <button type="submit" class="ds-btn ds-btn-primary" :disabled="isSaving">
            <span v-if="isSaving" class="ds-spinner"></span>
            <template v-else>
              <i class="bi bi-check2"></i>
              <span>Salva configurazione</span>
            </template>
          </button>
        </form>
      </div>
    </div>

    <!-- API card -->
    <div class="ds-card">
      <div class="ds-card-header">
        <i class="bi bi-code-slash" style="color: var(--color-accent);"></i>
        <h3 class="card-section-title">API pubblica</h3>
      </div>
      <div class="ds-card-body">
        <p class="api-description">Usa questo endpoint per integrare il menu nel tuo sito web:</p>
        <div class="api-endpoint">
          <span class="api-method">GET</span>
          <code class="api-url">{{ apiEndpoint }}</code>
          <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="copyApiEndpoint" title="Copia">
            <i :class="apiCopied ? 'bi bi-check-lg' : 'bi bi-clipboard'"></i>
          </button>
        </div>
        <p class="api-note">
          Questa API restituisce il menu completo del tuo ristorante in formato JSON. Non richiede autenticazione.
        </p>
      </div>
    </div>

    <!-- Preview -->
    <div class="ds-card" v-if="siteUrl">
      <div class="ds-card-header">
        <i class="bi bi-eye" style="color: var(--color-info);"></i>
        <h3 class="card-section-title">Anteprima sito</h3>
      </div>
      <div class="preview-frame">
        <iframe :src="siteUrl" class="preview-iframe"
          sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>
      </div>
    </div>

    <!-- QR Code -->
    <div class="ds-card">
      <div class="ds-card-header">
        <i class="bi bi-qr-code" style="color: var(--color-primary);"></i>
        <h3 class="card-section-title">QR Code</h3>
      </div>
      <div class="ds-card-body">
        <GeneratorQRCode :siteUrl="siteUrl" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.wcf {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}
.card-section-title {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
  letter-spacing: -0.01em;
}

/* File upload */
.file-upload-area {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed var(--line);
  border-radius: var(--r-md);
  padding: var(--s-5);
  cursor: pointer;
  transition: border-color 160ms, background 160ms;
  min-height: 92px;
  background: var(--bg-2);
}
.file-upload-area:hover,
.file-upload-area:focus-within {
  border-color: var(--ac);
  background: color-mix(in oklab, var(--ac) 5%, var(--paper));
}
.file-upload-hidden { position: absolute; width: 0; height: 0; opacity: 0; overflow: hidden; }
.file-upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.file-upload-icon { font-size: 24px; color: var(--ink-3); }
.file-upload-text {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  color: var(--ink-3);
  letter-spacing: 0.02em;
}
.file-upload-preview { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.file-upload-change {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  color: var(--ac);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.logo-preview-img {
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  max-height: 96px;
  background: var(--paper);
}

/* API block */
.api-description {
  font-size: 14px;
  color: var(--ink-2);
  margin: 0 0 var(--s-3);
  line-height: 1.55;
}
.api-endpoint {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  margin-bottom: var(--s-3);
}
.api-method {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  font-weight: 700;
  color: var(--paper);
  background: var(--ink);
  padding: 3px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  letter-spacing: 0.06em;
}
.api-url {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 13px;
  color: var(--ink);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.api-note {
  font-size: 13px;
  color: var(--ink-3);
  margin: 0;
  line-height: 1.55;
}

/* Preview iframe */
.preview-frame { padding: 0; }
.preview-iframe {
  width: 100%;
  height: 440px;
  border: none;
  border-radius: 0 0 var(--r-lg) var(--r-lg);
  background: var(--paper);
}

.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(4px); }
</style>
