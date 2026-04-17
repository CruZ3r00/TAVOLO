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
    { value: 'simulator', label: 'Simulatore', icon: 'bi-bug' },
    { value: 'pos', label: 'POS', icon: 'bi-credit-card' },
    { value: 'fiscal_register', label: 'Cassa fiscale', icon: 'bi-printer' },
];

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
                            <span>Paga &euro; {{ totalAmount }}</span>
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
    gap: var(--space-2);
    color: var(--color-primary);
}
.modal-title {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
}

.ckm {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.ckm-section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 var(--space-2) 0;
}

.ckm-summary {
    display: flex;
    flex-direction: column;
}
.ckm-items {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 200px;
    overflow-y: auto;
}
.ckm-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-sm);
}
.ckm-item-name {
    color: var(--color-text);
}
.ckm-item-qty {
    color: var(--color-text-muted);
    margin-left: var(--space-1);
    font-weight: 600;
}
.ckm-item-total {
    font-weight: 600;
    color: var(--color-text-secondary);
    flex-shrink: 0;
}

.ckm-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) 0 0;
    margin-top: var(--space-1);
}
.ckm-total-label {
    font-size: var(--text-base);
    font-weight: 700;
    color: var(--color-text);
}
.ckm-total-value {
    font-size: var(--text-xl, 1.25rem);
    font-weight: 700;
    color: var(--color-primary);
}

.ckm-method-options {
    display: flex;
    gap: var(--space-2);
}
.ckm-method-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    transition: all var(--transition-fast);
    text-align: center;
}
.ckm-method-option i {
    font-size: var(--text-xl, 1.25rem);
}
.ckm-method-option:hover {
    border-color: var(--color-border-hover);
    background: var(--color-bg-subtle);
}
.ckm-method-option.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
    color: var(--color-primary);
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
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
    .form-actions .ds-btn {
        width: 100%;
    }
}
</style>
