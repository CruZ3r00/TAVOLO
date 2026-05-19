<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';

const props = defineProps({
    show: { type: Boolean, default: false },
    order: { type: Object, default: null },
    busy: { type: Boolean, default: false },
    // Coperto a persona — default da WebsiteConfig.cover_charge.
    // Se 0/null l'utente viene avvisato e puo' settare il valore al volo
    // (con opzione di salvarlo permanentemente come default).
    coverCharge: { type: Number, default: 0 },
    // Default persons (override = order.covers se presente)
    defaultPersons: { type: Number, default: 0 },
});

const emit = defineEmits(['close', 'confirm', 'save-cover-default']);

const paymentMethod = ref('simulator');
const submitting = ref(false);
const errorMessage = ref('');
const paymentResult = ref(null);
const isSubmitting = computed(() => props.busy);

// Coperto editabili nel modale (override one-shot).
const persons = ref(0);
const coverPerPerson = ref(0);
const savingDefault = ref(false);

watch(() => props.show, (v) => {
    if (v) {
        paymentMethod.value = 'simulator';
        submitting.value = false;
        errorMessage.value = '';
        paymentResult.value = null;
        // Inizializza persone: prop > order.covers > 1
        persons.value = Number(props.defaultPersons) || Number(props.order?.covers) || 1;
        coverPerPerson.value = Number(props.coverCharge) || 0;
        savingDefault.value = false;
    }
});

watch(() => props.coverCharge, (v) => {
    if (props.show) coverPerPerson.value = Number(v) || coverPerPerson.value;
});
watch(() => props.defaultPersons, (v) => {
    if (props.show && (!persons.value || persons.value === 1)) persons.value = Number(v) || 1;
});

const items = computed(() => props.order?.items || props.order?.fk_items || []);

// Helper: prezzo riga = (prezzo + somma addons) * quantita.
const itemAddonsSum = (it) => {
    const a = it && it.addons;
    if (!Array.isArray(a) || a.length === 0) return 0;
    return a.reduce((s, x) => s + (parseFloat(x.price) || 0), 0);
};
const itemLineTotal = (it) => {
    const p = parseFloat(it?.price) || 0;
    const q = parseInt(it?.quantity, 10) || 0;
    return (p + itemAddonsSum(it)) * q;
};

const subtotal = computed(() => {
    // Preferisci total_amount server-side se disponibile (riflette void/sconti/addons).
    const serverTotal = parseFloat(props.order?.total_amount);
    if (Number.isFinite(serverTotal) && serverTotal > 0) return serverTotal;
    return items.value.reduce((s, it) => s + itemLineTotal(it), 0);
});
const safePersons = computed(() => Math.max(0, Math.floor(Number(persons.value) || 0)));
const safeCoverPerPerson = computed(() => Math.max(0, Number(coverPerPerson.value) || 0));
const coverTotal = computed(() => safePersons.value * safeCoverPerPerson.value);
const grandTotal = computed(() => subtotal.value + coverTotal.value);
const lockVersion = computed(() => props.order?.lock_version ?? 0);

const isCoverConfigured = computed(() => Number(props.coverCharge) > 0);
const isTakeawayOrder = computed(() => props.order?.service_type === 'takeaway');
// Takeaway: niente coperto (asporto).
const showCoverSection = computed(() => !isTakeawayOrder.value);

const fmt = (v) => `€ ${(Number(v) || 0).toFixed(2)}`;

const METHODS = [
    { value: 'simulator', label: 'Chiudi conto', icon: 'bi-receipt-cutoff' },
    { value: 'pos', label: 'POS', icon: 'bi-credit-card' },
    { value: 'fiscal_register', label: 'Cassa fiscale', icon: 'bi-printer' },
];

const confirmLabel = computed(() => (
    paymentMethod.value === 'simulator'
        ? `Chiudi · ${fmt(grandTotal.value)}`
        : `Paga ${fmt(grandTotal.value)}`
));

const doCheckout = () => {
    if (isSubmitting.value) return;
    errorMessage.value = '';
    emit('confirm', {
        payment_method: paymentMethod.value,
        lock_version: lockVersion.value,
        // Info coperto: il backend può ignorarli oggi (display-only sullo
        // scontrino UI); restano nel payload per future integrazioni con il
        // cassetto fiscale / POS reale che vorranno scaricare il dettaglio.
        cover_charge: showCoverSection.value ? {
            per_person: safeCoverPerPerson.value,
            persons: safePersons.value,
            total: coverTotal.value,
        } : null,
    });
};

const onSaveCoverDefault = async () => {
    if (savingDefault.value) return;
    savingDefault.value = true;
    try {
        // Il parent gestisce la chiamata API e il toast; questo modale non
        // sa di /account/website-config. Aspettiamo finché props.coverCharge
        // viene aggiornato dal parent — eventuale errore lo notifica lui.
        emit('save-cover-default', safeCoverPerPerson.value);
    } finally {
        // Lascia il flag a true qualche ms per evitare doppio click; il parent
        // di solito chiude/aggiorna il modale subito.
        setTimeout(() => { savingDefault.value = false; }, 800);
    }
};

const onClose = () => {
    if (isSubmitting.value) return;
    emit('close');
};
</script>

<template>
    <Modal :show="show" @close="onClose">
        <template #title>
            <div class="modal-title-wrap">
                <i class="bi bi-receipt-cutoff" aria-hidden="true"></i>
                <h2 class="modal-title">Chiudi conto</h2>
            </div>
        </template>

        <template #body>
            <div class="ckm">
                <!-- Riepilogo items -->
                <div class="ckm-summary">
                    <h3 class="ckm-section-title">Riepilogo</h3>
                    <div class="ckm-items">
                        <div
                            v-for="item in items"
                            :key="item.documentId"
                            class="ckm-item"
                        >
                            <span class="ckm-item-name">
                                {{ item.name }}
                                <span class="ckm-item-qty">x{{ item.quantity }}</span>
                                <span v-if="item.addons && item.addons.length" class="ckm-item-addons">
                                    <span v-for="(addon, idx) in item.addons" :key="idx">
                                        + {{ addon.name }}<template v-if="idx < item.addons.length - 1">,</template>
                                    </span>
                                </span>
                            </span>
                            <span class="ckm-item-total">
                                &euro; {{ itemLineTotal(item).toFixed(2) }}
                            </span>
                        </div>
                    </div>
                    <div class="ckm-line ckm-line--sub">
                        <span class="ckm-line-l">Subtotale</span>
                        <span class="ckm-line-v">{{ fmt(subtotal) }}</span>
                    </div>
                </div>

                <!-- Coperto (solo dine-in) -->
                <div v-if="showCoverSection" class="ckm-cover">
                    <h3 class="ckm-section-title">Coperto</h3>
                    <div v-if="!isCoverConfigured" class="ckm-cover-alert">
                        <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                        <span>
                            Il coperto non è configurato in <strong>Impostazioni</strong>.
                            Inseriscilo qui sotto per questo conto e, se vuoi, salvalo come default.
                        </span>
                    </div>
                    <div v-else class="ckm-cover-hint">
                        <i class="bi bi-info-circle" aria-hidden="true"></i>
                        <span>Default da Impostazioni · modificabile per questo conto.</span>
                    </div>
                    <div class="ckm-cover-row">
                        <div class="ckm-cover-field">
                            <label class="ckm-label" for="ckm-persons">Persone al tavolo</label>
                            <input
                                id="ckm-persons"
                                v-model.number="persons"
                                type="number"
                                min="0"
                                step="1"
                                class="ckm-input"
                            />
                        </div>
                        <div class="ckm-cover-field">
                            <label class="ckm-label" for="ckm-cover">Coperto a persona</label>
                            <div class="ckm-input-suffix-wrap">
                                <input
                                    id="ckm-cover"
                                    v-model.number="coverPerPerson"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    class="ckm-input"
                                />
                                <span class="ckm-input-suffix">€</span>
                            </div>
                        </div>
                        <div class="ckm-cover-field">
                            <label class="ckm-label">Totale coperto</label>
                            <div class="ckm-cover-total">{{ fmt(coverTotal) }}</div>
                        </div>
                    </div>
                    <button
                        v-if="!isCoverConfigured && safeCoverPerPerson > 0"
                        type="button"
                        class="ckm-link-btn"
                        :disabled="savingDefault"
                        @click="onSaveCoverDefault"
                    >
                        <i class="bi bi-bookmark" aria-hidden="true"></i>
                        Salva {{ fmt(safeCoverPerPerson) }} come coperto di default
                    </button>
                </div>

                <!-- Totale finale -->
                <div class="ckm-grand-total">
                    <span>Totale da pagare</span>
                    <strong>{{ fmt(grandTotal) }}</strong>
                </div>

                <!-- Metodo pagamento -->
                <div class="ckm-method">
                    <h3 class="ckm-section-title">Metodo di pagamento</h3>
                    <div class="ckm-method-options">
                        <label
                            v-for="m in METHODS"
                            :key="m.value"
                            :class="['ckm-method-option', { selected: paymentMethod === m.value }]"
                        >
                            <input
                                type="radio"
                                v-model="paymentMethod"
                                :value="m.value"
                                class="visually-hidden"
                            >
                            <i :class="['bi', m.icon]" aria-hidden="true"></i>
                            <span>{{ m.label }}</span>
                        </label>
                    </div>
                </div>

                <!-- Errore -->
                <Transition name="fade">
                    <div v-if="errorMessage" class="ds-alert ds-alert-error" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                        <span>{{ errorMessage }}</span>
                    </div>
                </Transition>

                <!-- Azioni -->
                <div class="form-actions">
                    <button type="button" class="ds-btn ds-btn-ghost" @click="onClose" :disabled="isSubmitting">
                        Annulla
                    </button>
                    <button type="button" class="ds-btn ds-btn-primary" @click="doCheckout" :disabled="isSubmitting">
                        <span v-if="isSubmitting" class="ds-spinner" aria-hidden="true"></span>
                        <template v-else>
                            <i class="bi bi-lock" aria-hidden="true"></i>
                            <span>{{ confirmLabel }}</span>
                        </template>
                    </button>
                </div>
            </div>
        </template>
    </Modal>
</template>

<style scoped>
.modal-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
}
.modal-title-wrap i {
    font-size: 18px;
    color: var(--ac);
}
.modal-title {
    margin: 0;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
}

.ckm {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    font-family: var(--f-sans, 'Geist', sans-serif);
}
.ckm-section-title {
    margin: 0 0 var(--s-3);
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.ckm-summary { display: flex; flex-direction: column; gap: var(--s-2); }
.ckm-items {
    display: flex; flex-direction: column;
    gap: 6px;
    max-height: 260px;
    overflow-y: auto;
    padding: var(--s-3);
    background: var(--bg-sunk);
    border: 1px solid var(--line);
    border-radius: 10px;
}
.ckm-item {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
    font-size: 13px;
    color: var(--ink);
}
.ckm-item-name { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ckm-item-qty {
    font-family: var(--f-mono); font-size: 11px;
    color: var(--ink-3);
    padding: 1px 6px;
    background: var(--paper);
    border-radius: 999px;
}
.ckm-item-addons {
    font-size: 11px;
    color: var(--ink-3, var(--color-text-muted));
    flex-basis: 100%;
    margin-top: 2px;
}
.ckm-item-total {
    font-family: var(--f-mono); font-weight: 700;
    color: var(--ink); flex-shrink: 0;
}

.ckm-line {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 4px;
    font-size: 13px;
}
.ckm-line-l { color: var(--ink-2); }
.ckm-line-v { font-family: var(--f-mono); font-weight: 600; color: var(--ink); }

.ckm-cover {
    display: flex; flex-direction: column; gap: var(--s-3);
    padding: var(--s-4);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
}
.ckm-cover-alert {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 10px 12px;
    background: color-mix(in oklab, var(--warn, var(--ac)) 12%, var(--paper));
    color: var(--ink);
    border: 1px solid color-mix(in oklab, var(--warn, var(--ac)) 30%, transparent);
    border-radius: 8px;
    font-size: 12.5px;
    line-height: 1.45;
}
.ckm-cover-alert i { color: var(--warn, var(--ac)); flex-shrink: 0; margin-top: 2px; }
.ckm-cover-hint {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: var(--ink-3);
}
.ckm-cover-hint i { color: var(--ac); }
.ckm-cover-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--s-3);
}
.ckm-cover-field { display: flex; flex-direction: column; gap: 4px; }
.ckm-label {
    font-size: 12px; font-weight: 600;
    color: var(--ink-2);
}
.ckm-input {
    width: 100%;
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    color: var(--ink);
    font-family: inherit;
    font-size: 14px;
    outline: none;
}
.ckm-input:focus { border-color: var(--ac); box-shadow: 0 0 0 3px var(--ac-soft); }
.ckm-input-suffix-wrap { position: relative; }
.ckm-input-suffix-wrap .ckm-input { padding-right: 32px; }
.ckm-input-suffix {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
    color: var(--ink-3); font-size: 13px; pointer-events: none;
}
.ckm-cover-total {
    height: 38px;
    display: inline-flex; align-items: center; justify-content: flex-end;
    padding: 0 12px;
    background: var(--bg-sunk);
    border: 1px solid var(--line);
    border-radius: 8px;
    font-family: var(--f-mono);
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
}
.ckm-link-btn {
    align-self: flex-start;
    background: none; border: none; padding: 0;
    color: var(--ac); font-family: inherit;
    font-size: 12.5px; font-weight: 500;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
}
.ckm-link-btn:hover:not(:disabled) { color: var(--ac-ink); }
.ckm-link-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.ckm-grand-total {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px;
    background: var(--ink); color: var(--bg);
    border-radius: 10px;
    font-size: 15px; font-weight: 600;
}
.ckm-grand-total strong {
    font-family: var(--f-mono);
    font-size: 22px;
    font-weight: 700;
}

.ckm-method { display: flex; flex-direction: column; gap: var(--s-3); }
.ckm-method-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}
.ckm-method-option {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 14px 10px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    cursor: pointer;
    transition: background var(--dur-fast), border-color var(--dur-fast);
    font-size: 12.5px; color: var(--ink-2);
}
.ckm-method-option i { font-size: 20px; color: var(--ink-2); }
.ckm-method-option:hover { background: var(--bg-hover); }
.ckm-method-option.selected {
    background: var(--ac-soft);
    border-color: var(--ac);
    color: var(--ac-ink);
}
.ckm-method-option.selected i { color: var(--ac-ink); }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0; }

.form-actions {
    display: flex; justify-content: flex-end; gap: var(--s-3);
    padding-top: var(--s-2);
    border-top: 1px solid var(--line);
}

@media (max-width: 640px) {
    .ckm-cover-row { grid-template-columns: 1fr; }
    .ckm-method-options { grid-template-columns: 1fr; }
    .form-actions { flex-direction: column-reverse; }
    .form-actions :deep(.ds-btn) { width: 100%; }
}
</style>
