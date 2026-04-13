<script setup>
import { ref, onMounted } from 'vue';
import QRCode from 'qrcode';
import { useStore } from 'vuex';
import InputLabel from '@/components/InputLabel.vue';
import InputError from '@/components/InputError.vue';
import TextInput from '@/components/TextInput.vue';
import { API_BASE } from '@/utils';

const store = useStore();

const loading = ref(false);
const enabled = ref(false);
const pending = ref(false);
const qrDataUrl = ref('');
const setupKey = ref('');
const recoveryCodes = ref([]);
const code = ref('');
const errorMsg = ref('');
const successMsg = ref('');

const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${store.getters.getToken}`,
});

const resetMessages = () => { errorMsg.value = ''; successMsg.value = ''; };

const loadStatus = async () => {
    try {
        const r = await fetch(`${API_BASE}/api/account/2fa/status`, { headers: authHeaders() });
        if (r.ok) {
            const d = await r.json();
            enabled.value = !!d.enabled;
            pending.value = !!d.pending;
        }
    } catch {}
};

const renderQr = async (otpauth) => {
    qrDataUrl.value = await QRCode.toDataURL(otpauth, { scale: 6, margin: 2, errorCorrectionLevel: 'M' });
};

const enableTwoFactor = async () => {
    resetMessages();
    loading.value = true;
    try {
        const r = await fetch(`${API_BASE}/api/account/2fa/enable`, { method: 'POST', headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) { errorMsg.value = d?.error?.message || 'Errore'; return; }
        setupKey.value = d.secret;
        recoveryCodes.value = d.recoveryCodes || [];
        await renderQr(d.otpauth);
        pending.value = true;
        enabled.value = false;
    } catch {
        errorMsg.value = 'Errore di rete';
    } finally {
        loading.value = false;
    }
};

const confirmTwoFactor = async () => {
    resetMessages();
    if (!/^\d{6}$/.test(code.value)) { errorMsg.value = 'Inserisci un codice di 6 cifre'; return; }
    loading.value = true;
    try {
        const r = await fetch(`${API_BASE}/api/account/2fa/confirm`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ code: code.value }),
        });
        const d = await r.json();
        if (!r.ok) { errorMsg.value = d?.error?.message || 'Codice non valido'; return; }
        enabled.value = true;
        pending.value = false;
        qrDataUrl.value = '';
        setupKey.value = '';
        code.value = '';
        successMsg.value = '2FA attivato con successo';
    } catch {
        errorMsg.value = 'Errore di rete';
    } finally {
        loading.value = false;
    }
};

const disableTwoFactor = async () => {
    resetMessages();
    if (!confirm('Sei sicuro di voler disabilitare l\'autenticazione a due fattori?')) return;
    loading.value = true;
    try {
        const r = await fetch(`${API_BASE}/api/account/2fa/disable`, { method: 'DELETE', headers: authHeaders() });
        if (!r.ok) { errorMsg.value = 'Errore durante la disabilitazione'; return; }
        enabled.value = false;
        pending.value = false;
        qrDataUrl.value = '';
        setupKey.value = '';
        recoveryCodes.value = [];
        successMsg.value = '2FA disabilitato';
    } catch {
        errorMsg.value = 'Errore di rete';
    } finally {
        loading.value = false;
    }
};

const regenerateRecovery = async () => {
    resetMessages();
    loading.value = true;
    try {
        const r = await fetch(`${API_BASE}/api/account/2fa/recovery`, { method: 'POST', headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) { errorMsg.value = 'Errore'; return; }
        recoveryCodes.value = d.recoveryCodes || [];
        successMsg.value = 'Codici di recupero rigenerati';
    } catch {
        errorMsg.value = 'Errore di rete';
    } finally {
        loading.value = false;
    }
};

onMounted(loadStatus);
</script>

<template>
    <div class="ds-card">
        <div class="ds-card-header">
            <i class="bi bi-shield-lock" style="color: var(--color-primary);"></i>
            <h3 class="section-title">Autenticazione a due fattori</h3>
        </div>
        <div class="ds-card-body">
            <Transition name="fade">
                <div v-if="errorMsg" class="ds-alert ds-alert-error">
                    <i class="bi bi-exclamation-circle"></i><span>{{ errorMsg }}</span>
                </div>
            </Transition>
            <Transition name="fade">
                <div v-if="successMsg" class="ds-alert ds-alert-success">
                    <i class="bi bi-check-circle"></i><span>{{ successMsg }}</span>
                </div>
            </Transition>

            <div class="tfa-status">
                <div v-if="enabled" class="ds-alert ds-alert-success">
                    <i class="bi bi-shield-check"></i>
                    <span>Hai abilitato l'autenticazione a due fattori.</span>
                </div>
                <div v-else-if="pending" class="ds-alert ds-alert-warning">
                    <i class="bi bi-shield-exclamation"></i>
                    <span>Completa la configurazione per attivare la protezione.</span>
                </div>
                <div v-else class="ds-alert ds-alert-info">
                    <i class="bi bi-info-circle"></i>
                    <span>L'autenticazione a due fattori non è attiva.</span>
                </div>
            </div>

            <div v-if="pending && qrDataUrl" class="tfa-qr-section">
                <p class="tfa-instruction">Scansiona il QR con la tua app di autenticazione (Google Authenticator, Authy, 1Password...) oppure inserisci manualmente la setup key.</p>
                <div class="tfa-qr-wrapper">
                    <img :src="qrDataUrl" alt="QR 2FA" style="max-width: 200px;" />
                </div>
                <div v-if="setupKey" class="tfa-setup-key">
                    <span class="ds-label">Setup Key:</span>
                    <code class="setup-key-code">{{ setupKey }}</code>
                </div>
            </div>

            <div v-if="pending" class="ds-field">
                <InputLabel for="code" value="Codice di verifica" />
                <TextInput
                    id="code"
                    v-model="code"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    placeholder="000000"
                    @keyup.enter="confirmTwoFactor"
                />
            </div>

            <div v-if="recoveryCodes.length > 0" class="recovery-section">
                <p class="tfa-instruction"><strong>Codici di recupero</strong> — salvali in un posto sicuro. Ogni codice può essere usato una volta se perdi il dispositivo.</p>
                <ul class="recovery-list">
                    <li v-for="rc in recoveryCodes" :key="rc"><code>{{ rc }}</code></li>
                </ul>
            </div>

            <div class="tfa-actions-row">
                <button v-if="!enabled && !pending" class="ds-btn ds-btn-primary" :disabled="loading" @click="enableTwoFactor">
                    <i class="bi bi-shield-lock"></i><span>Attiva</span>
                </button>
                <button v-if="pending" class="ds-btn ds-btn-primary" :disabled="loading" @click="confirmTwoFactor">
                    <span>Conferma</span>
                </button>
                <button v-if="enabled" class="ds-btn ds-btn-secondary" :disabled="loading" @click="regenerateRecovery">
                    <span>Rigenera codici</span>
                </button>
                <button v-if="enabled || pending" class="ds-btn ds-btn-danger" :disabled="loading" @click="disableTwoFactor">
                    <span>Disabilita</span>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.section-title { font-size: var(--text-base); font-weight: 600; margin: 0; }
.tfa-status { margin-bottom: var(--space-5); }
.tfa-qr-section { margin-bottom: var(--space-5); }
.tfa-instruction { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0 0 var(--space-4) 0; }
.tfa-qr-wrapper { display: inline-flex; padding: var(--space-4); background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-lg); margin-bottom: var(--space-3); }
.tfa-setup-key { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
.setup-key-code { font-family: var(--font-mono); font-size: var(--text-sm); padding: var(--space-1) var(--space-2); background: var(--color-bg-subtle); border-radius: var(--radius-sm); }
.recovery-section { margin: var(--space-4) 0; padding: var(--space-4); background: var(--color-bg-subtle); border-radius: var(--radius-md); }
.recovery-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
.recovery-list code { font-family: var(--font-mono); font-size: var(--text-sm); }
.tfa-actions-row { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-5); }
</style>
