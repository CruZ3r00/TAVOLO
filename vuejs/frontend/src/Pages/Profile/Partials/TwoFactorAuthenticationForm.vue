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
    <div class="profile-section">
        <div class="section-header">
            <div class="section-icon"><i class="bi bi-shield-lock"></i></div>
            <div>
                <h3 class="section-title">Autenticazione a due fattori</h3>
                <p class="section-description">Proteggi l'accesso al tuo account con un secondo fattore.</p>
            </div>
        </div>
        <div class="section-body">
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
.profile-section {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    font-family: var(--f-sans, 'Geist', sans-serif);
    overflow: hidden;
}
.section-header {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-5);
    border-bottom: 1px solid var(--line);
}
.section-icon {
    width: 36px; height: 36px;
    display: grid; place-items: center;
    background: color-mix(in oklab, var(--ac) 10%, var(--paper));
    color: var(--ac);
    border-radius: var(--r-sm);
    font-size: 16px;
    flex-shrink: 0;
}
.section-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 2px;
    letter-spacing: -0.01em;
}
.section-description {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.5;
}
.section-body {
    padding: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
}
.tfa-status { display: contents; }
.tfa-qr-section {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-4);
    background: var(--bg-2, color-mix(in oklab, var(--ink) 3%, var(--paper)));
    border: 1px solid var(--line);
    border-radius: var(--r-md);
}
.tfa-instruction {
    font-size: 13px;
    color: var(--ink-2);
    margin: 0;
    line-height: 1.55;
}
.tfa-qr-wrapper {
    display: inline-flex;
    padding: var(--s-4);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    align-self: flex-start;
}
.tfa-setup-key {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.tfa-setup-key :deep(.ds-label) {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    margin: 0;
}
.setup-key-code {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 13px;
    padding: 3px 8px;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    letter-spacing: 0.04em;
}
.recovery-section {
    padding: var(--s-4);
    background: color-mix(in oklab, var(--warn) 6%, var(--paper));
    border: 1px solid color-mix(in oklab, var(--warn) 22%, var(--line));
    border-radius: var(--r-md);
}
.recovery-section .tfa-instruction { margin-bottom: var(--s-3); }
.recovery-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
}
.recovery-list code {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    padding: 4px 8px;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    display: block;
    letter-spacing: 0.03em;
}
.tfa-actions-row {
    display: flex;
    gap: var(--s-3);
    flex-wrap: wrap;
    margin-top: var(--s-2);
}
.tfa-actions-row :deep(.ds-btn) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 600;
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background 120ms, transform 120ms;
    border: 1px solid transparent;
}
.tfa-actions-row :deep(.ds-btn-primary) {
    color: var(--paper);
    background: var(--ink);
    border-color: var(--ink);
}
.tfa-actions-row :deep(.ds-btn-primary:hover) {
    background: color-mix(in oklab, var(--ink) 90%, var(--ac));
    transform: translateY(-1px);
}
.tfa-actions-row :deep(.ds-btn-secondary) {
    color: var(--ink-2);
    background: var(--paper);
    border-color: var(--line);
}
.tfa-actions-row :deep(.ds-btn-secondary:hover) {
    background: color-mix(in oklab, var(--ink) 5%, var(--paper));
    color: var(--ink);
}
.tfa-actions-row :deep(.ds-btn-danger) {
    color: var(--paper);
    background: var(--dan);
    border-color: var(--dan);
}
.tfa-actions-row :deep(.ds-btn-danger:hover) {
    background: color-mix(in oklab, var(--dan) 88%, var(--ink));
    transform: translateY(-1px);
}
.tfa-actions-row :deep(.ds-btn:disabled) {
    opacity: 0.55; cursor: not-allowed; transform: none;
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
