<script setup>
import AppLayout from '@/Layouts/AppLayout.vue';
import GeneratorQRCode from '@/components/GeneratorQRCode.vue';
import { ref, onMounted, nextTick } from 'vue';
import { useStore } from 'vuex';
import qs from 'qs';
import { API_BASE } from '@/utils';

const store = useStore();
const tkn = store.getters.getToken;
const user = store.getters.getUser;

const configId = ref('');
const restaurantName = ref('');
const siteUrl = ref('');
const logoPreview = ref(null);
const logoFile = ref(null);
const uploadedLogoId = ref(null);
const currentLogoUrl = ref(null);
const userId = ref(null);
const userDocumentId = ref('');
const isSaving = ref(false);
const saveSuccess = ref(false);
const saveError = ref('');
const apiEndpoint = ref('');
const apiCopied = ref(false);
const copertiInvernali = ref('');
const copertiEstivi = ref('');

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
      userId.value = userData.id;
      userDocumentId.value = userData.documentId;
      apiEndpoint.value = `${API_BASE}/api/menus/public/${userData.documentId}`;

      // Recupera website-config
      const query = qs.stringify({
        filters: {
          fk_user: { id: { $eq: userData.id } },
        },
        populate: ['logo'],
      });
      const wcRes = await fetch(`${API_BASE}/api/website-configs?${query}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tkn}`,
          'Content-Type': 'application/json',
        },
      });
      if (wcRes.ok) {
        const wcData = await wcRes.json();
        if (wcData.data && wcData.data.length > 0) {
          const config = wcData.data[0];
          configId.value = config.documentId;
          restaurantName.value = config.restaurant_name || '';
          siteUrl.value = config.site_url || '';
          copertiInvernali.value = config.coperti_invernali != null ? String(config.coperti_invernali) : '';
          copertiEstivi.value = config.coperti_estivi != null ? String(config.coperti_estivi) : '';
          if (config.logo) {
            currentLogoUrl.value = `${API_BASE}${config.logo.url}`;
            uploadedLogoId.value = config.logo.id;
          }
        }
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

    if (configId.value) {
      // Aggiorna configurazione esistente
      const response = await fetch(`${API_BASE}/api/website-configs/${configId.value}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tkn}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: bodyData }),
      });
      if (response.ok) {
        saveSuccess.value = true;
        // Aggiorna URL nel profilo utente
        await updateUserUrl();
      } else {
        saveError.value = 'Errore nel salvataggio della configurazione.';
      }
    } else {
      // Crea nuova configurazione
      bodyData.fk_user = { connect: [{ id: userId.value }] };
      const response = await fetch(`${API_BASE}/api/website-configs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tkn}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: bodyData }),
      });
      if (response.ok) {
        const data = await response.json();
        configId.value = data.data.documentId;
        saveSuccess.value = true;
        await updateUserUrl();
      } else {
        saveError.value = 'Errore nella creazione della configurazione.';
      }
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

const updateUserUrl = async () => {
  if (!siteUrl.value || !userId.value) return;
  try {
    await fetch(`${API_BASE}/api/users/${userId.value}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${tkn}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: siteUrl.value }),
    });
  } catch (error) {
    console.error('Errore aggiornamento URL utente:', error);
  }
};

const copyApiEndpoint = () => {
  navigator.clipboard.writeText(apiEndpoint.value);
  apiCopied.value = true;
  setTimeout(() => { apiCopied.value = false; }, 2000);
};

onMounted(async () => {
  nextTick(() => {
    document.title = 'Configurazione Sito Web';
  });
  await fetchConfig();
});
</script>

<template>
  <AppLayout>
    <div class="config-page">
      <div class="config-container">
        <!-- Page header -->
        <div class="config-header">
          <p class="text-overline">Impostazioni</p>
          <h1 class="config-title">Configurazione Sito Web</h1>
          <p class="config-subtitle">Configura il tuo sito web esterno e integra il menu tramite API.</p>
        </div>

        <div class="config-grid">
          <!-- Left column: Settings -->
          <div class="config-left">
            <!-- Settings card -->
            <div class="ds-card">
              <div class="ds-card-header">
                <i class="bi bi-gear" style="color: var(--color-primary);"></i>
                <h3 class="card-section-title">Impostazioni</h3>
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

                  <!-- Feedback -->
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
                  <button class="ds-btn ds-btn-ghost ds-btn-icon" @click="copyApiEndpoint" title="Copia">
                    <i :class="apiCopied ? 'bi bi-check-lg' : 'bi bi-clipboard'"></i>
                  </button>
                </div>
                <p class="api-note">
                  Questa API restituisce il menu completo del tuo ristorante in formato JSON. Non richiede autenticazione.
                </p>
              </div>
            </div>
          </div>

          <!-- Right column: Preview + QR -->
          <div class="config-right">
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
            <div class="ds-card" v-else>
              <div class="ds-empty">
                <div class="ds-empty-icon"><i class="bi bi-globe2"></i></div>
                <p class="ds-empty-description">Inserisci un URL per visualizzare l'anteprima del tuo sito.</p>
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
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.config-page {
  padding: var(--space-8) 0 var(--space-12);
}

.config-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-6);
}

.config-header {
  margin-bottom: var(--space-8);
}

.config-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text);
  margin: var(--space-2) 0;
  letter-spacing: var(--tracking-tight);
}

.config-subtitle {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 0;
}

.config-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: var(--space-6);
  align-items: start;
}

.config-left,
.config-right {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.card-section-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

/* File upload */
.file-upload-area {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
  min-height: 80px;
}

.file-upload-area:hover,
.file-upload-area:focus-within {
  border-color: var(--color-primary);
  background: var(--color-bg-subtle);
}

.file-upload-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
}

.file-upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.file-upload-icon {
  font-size: var(--text-xl);
  color: var(--color-text-muted);
}

.file-upload-text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.file-upload-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.file-upload-change {
  font-size: var(--text-xs);
  color: var(--color-primary);
}

.logo-preview-img {
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  max-height: 80px;
}

/* API */
.api-description {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-3) 0;
}

.api-endpoint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}

.api-method {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-accent);
  background: var(--color-accent-light);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.api-url {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-note {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  line-height: var(--leading-relaxed);
}

/* Preview */
.preview-frame {
  padding: 0;
}

.preview-iframe {
  width: 100%;
  height: 400px;
  border: none;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

/* Responsive */
@media (max-width: 1024px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .config-container {
    padding: 0 var(--space-4);
  }
}
</style>
