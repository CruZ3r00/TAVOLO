<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';

const props = defineProps({
    show: { type: Boolean, default: false },
    order: { type: Object, default: null },
});

const emit = defineEmits(['close', 'confirm']);

const paymentMethod = ref('simulator');
const submitting = ref(false);
const errorMessage = ref('');
const paymentResult = ref(null);

watch(() => props.show, (v) => {
    if (v) {
        paymentMethod.value = 'simulator';
        submitting.value = false;
        errorMessage.value = '';
        paymentResult.value = null;
    }
});

const items = computed(() => props.order?.items || []);
const totalAmount = computed(() => parseFloat(props.order?.total_amount || 0).toFixed(2));
const lockVersion = computed(() => props.order?.lock_version ?? 0);

const METHODS = [
    { value: 'simulator', label: 'Chiudi conto', icon: 'bi-receipt-cutoff' },
    { value: 'pos', label: 'POS', icon: 'bi-credit-card' },
    { value: 'fiscal_register', label: 'Cassa fiscale', icon: 'bi-printer' },
];

const confirmLabel = computed(() => (
    paymentMethod.value === 'simulator'
        ? 'Chiudi conto'
        : `Paga € ${totalAmount.value}`
));

const doCheckout = () => {
    errorMessage.value = '';
    emit('confirm', {
        payment_method: paymentMethod.value,
        lock_version: lockVersion.value,
    });
};

const onClose = () => {
    if (submitting.value) return;
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
                            </span>
                            <span class="ckm-item-total">
                                &euro; {{ (parseFloat(item.price) * parseInt(item.quantity, 10)).toFixed(2) }}
                            </span>
                        </div>
                    </div>
                    <div class="ckm-total-row">
                        <span class="ckm-total-label">Totale</span>
                        <span class="ckm-total-value">&euro; {{ totalAmount }}</span>
                    </div>
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
                    <button type="button" class="ds-btn ds-btn-ghost" @click="onClose" :disabled="submitting">
                        Annulla
                    </button>
                    <button type="button" class="ds-btn ds-btn-primary" @click="doCheckout" :disabled="submitting">
                        <span v-if="submitting" class="ds-spinner" aria-hidden="true"></span>
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
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin: 0 0 var(--s-2) 0;
}

.ckm-summary {
    display: flex;
    flex-direction: column;
    padding: 14px 16px;
    background: var(--bg-2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
}
.ckm-items {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 220px;
    overflow-y: auto;
}
.ckm-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px dashed var(--line);
    font-size: 13px;
}
.ckm-item:last-child { border-bottom: none; }
.ckm-item-name {
    color: var(--ink-2);
    font-weight: 500;
}
.ckm-item-qty {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    color: var(--ink-3);
    margin-left: 6px;
    font-weight: 600;
    font-size: 12px;
}
.ckm-item-total {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-weight: 600;
    color: var(--ink);
    flex-shrink: 0;
}

.ckm-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0 4px;
    margin-top: 8px;
    border-top: 2px solid var(--line);
}
.ckm-total-label {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-3);
}
.ckm-total-value {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 24px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.02em;
}

.ckm-method-options {
    display: flex;
    gap: var(--s-2);
}
.ckm-method-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--paper);
    cursor: pointer;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
    transition: border-color 120ms, background 120ms, color 120ms, transform 120ms;
    text-align: center;
}
.ckm-method-option i {
    font-size: 22px;
    color: var(--ink-3);
    transition: color 120ms;
}
.ckm-method-option:hover {
    border-color: color-mix(in oklab, var(--ink) 20%, var(--line));
    background: var(--bg-2);
    transform: translateY(-1px);
}
.ckm-method-option.selected {
    border-color: var(--ac);
    background: color-mix(in oklab, var(--ac) 8%, var(--paper));
    color: var(--ac);
    box-shadow: 0 0 0 1px var(--ac);
}
.ckm-method-option.selected i { color: var(--ac); }

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-3);
    padding-top: var(--s-3);
    border-top: 1px solid var(--line);
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

@media (max-width: 640px) {
    .ckm-method-options {
        flex-direction: column;
    }
    .form-actions {
        flex-direction: column-reverse;
    }
    .form-actions :deep(.ds-btn) {
        width: 100%;
    }
}
</style>
