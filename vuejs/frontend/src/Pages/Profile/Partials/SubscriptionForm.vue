<script setup>
import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import {
    fetchBillingStatus,
    changeBillingPlan,
    cancelBillingSubscription,
    reactivateBillingSubscription,
    createBillingPortalSession,
} from '@/utils';

const store = useStore();
const token = computed(() => store.getters.getToken);

const PLANS = {
    starter: {
        key: 'starter',
        name: 'Essenziale',
        price: '€ 39,99',
        period: '/ mese',
    },
    pro: {
        key: 'pro',
        name: 'Professionale',
        price: '€ 74,99',
        period: '/ mese',
    },
};
const SWITCH_TARGET = { starter: 'pro', pro: 'starter' };

const billing = ref(null);
const loadingStatus = ref(true);
const errorMessage = ref('');
const successMessage = ref('');

const action = ref(null); // 'change' | 'cancel' | 'reactivate' | 'portal' | null
const confirmAction = ref(null); // pending confirmation modal payload

const planKey = computed(() => billing.value?.subscription_plan || null);
const currentPlan = computed(() => (planKey.value && PLANS[planKey.value]) ? PLANS[planKey.value] : null);
const targetPlan = computed(() => {
    const key = planKey.value ? SWITCH_TARGET[planKey.value] : null;
    return key ? PLANS[key] : null;
});

const periodEnd = computed(() => {
    const raw = billing.value?.subscription_current_period_end;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
});

const status = computed(() => billing.value?.subscription_status || null);
const isCancelPending = computed(() => !!billing.value?.subscription_cancel_at_period_end);
const isCanceled = computed(() => status.value === 'canceled');
const isPastDue = computed(() => status.value === 'past_due');
const hasActiveSub = computed(() => ['active', 'trialing'].includes(status.value));

const statusLabel = computed(() => {
    if (isCanceled.value) return 'Terminato';
    if (isPastDue.value) return 'Da rinnovare';
    if (isCancelPending.value) return 'Annullamento programmato';
    if (status.value === 'trialing') return 'Prova gratuita';
    if (status.value === 'active') return 'Attivo';
    return 'Da configurare';
});

const statusVariant = computed(() => {
    if (isCanceled.value || isPastDue.value) return 'danger';
    if (isCancelPending.value) return 'warn';
    if (hasActiveSub.value) return 'ok';
    return 'muted';
});

const reload = async () => {
    if (!token.value) return;
    loadingStatus.value = true;
    try {
        billing.value = await fetchBillingStatus(token.value);
    } catch (err) {
        errorMessage.value = err?.message || 'Impossibile caricare i dati abbonamento.';
    } finally {
        loadingStatus.value = false;
    }
};

const syncStore = (data) => {
    if (!data) return;
    const user = { ...(store.getters.getUser || {}), ...data };
    store.commit('setUser', user);
    localStorage.setItem('user', JSON.stringify(user));
};

const flash = (msg, isError = false) => {
    errorMessage.value = isError ? msg : '';
    successMessage.value = isError ? '' : msg;
    if (!isError) setTimeout(() => { successMessage.value = ''; }, 4000);
};

const askConfirm = (kind) => {
    errorMessage.value = '';
    successMessage.value = '';
    if (kind === 'change' && !targetPlan.value) return;
    confirmAction.value = kind;
};
const dismissConfirm = () => { confirmAction.value = null; };

const runChangePlan = async () => {
    if (!targetPlan.value) return;
    action.value = 'change';
    try {
        await changeBillingPlan(targetPlan.value.key, token.value);
        await reload();
        if (billing.value) syncStore(billing.value);
        flash(`Piano aggiornato a ${targetPlan.value.name}. La differenza sarà calcolata sulla prossima fattura.`);
    } catch (err) {
        flash(err?.message || 'Cambio piano non riuscito.', true);
    } finally {
        action.value = null;
        confirmAction.value = null;
    }
};

const runCancel = async () => {
    action.value = 'cancel';
    try {
        await cancelBillingSubscription(token.value);
        await reload();
        if (billing.value) syncStore(billing.value);
        flash('Abbonamento annullato. Resterà attivo fino alla data indicata.');
    } catch (err) {
        flash(err?.message || 'Annullamento non riuscito.', true);
    } finally {
        action.value = null;
        confirmAction.value = null;
    }
};

const runReactivate = async () => {
    action.value = 'reactivate';
    try {
        await reactivateBillingSubscription(token.value);
        await reload();
        if (billing.value) syncStore(billing.value);
        flash('Abbonamento riattivato.');
    } catch (err) {
        flash(err?.message || 'Riattivazione non riuscita.', true);
    } finally {
        action.value = null;
        confirmAction.value = null;
    }
};

const openPortal = async () => {
    action.value = 'portal';
    errorMessage.value = '';
    successMessage.value = '';
    try {
        const session = await createBillingPortalSession(token.value);
        if (session?.url) {
            window.location.href = session.url;
            return;
        }
        flash('Portale Stripe non disponibile.', true);
    } catch (err) {
        flash(err?.message || 'Portale Stripe non disponibile.', true);
    } finally {
        action.value = null;
    }
};

onMounted(reload);
</script>

<template>
    <div class="profile-section">
        <div class="section-header">
            <div class="section-icon"><i class="bi bi-credit-card-2-back"></i></div>
            <div>
                <h3 class="section-title">Abbonamento</h3>
                <p class="section-description">Cambia piano, annulla o riattiva. Carta e fatture si gestiscono dal portale Stripe.</p>
            </div>
        </div>

        <div class="section-body">
            <Transition name="fade">
                <div v-if="errorMessage" class="ds-alert ds-alert-error">
                    <i class="bi bi-exclamation-circle"></i>
                    <span>{{ errorMessage }}</span>
                </div>
            </Transition>
            <Transition name="fade">
                <div v-if="successMessage" class="ds-alert ds-alert-success">
                    <i class="bi bi-check-circle"></i>
                    <span>{{ successMessage }}</span>
                </div>
            </Transition>

            <div v-if="loadingStatus" class="sub-loading">
                <span class="ds-spinner" aria-hidden="true"></span>
                <span>Caricamento stato abbonamento…</span>
            </div>

            <div v-else-if="!currentPlan" class="sub-empty">
                <p>Nessun abbonamento attivo. Attiva un piano dalla pagina di rinnovo.</p>
                <router-link to="/renew-sub" class="ds-btn ds-btn-primary">
                    Vai a Rinnova abbonamento
                </router-link>
            </div>

            <template v-else>
                <div class="sub-card">
                    <div class="sub-card-head">
                        <div class="sub-plan">
                            <span class="sub-plan-name">{{ currentPlan.name }}</span>
                            <span class="sub-plan-price">{{ currentPlan.price }}<span>{{ currentPlan.period }}</span></span>
                        </div>
                        <span :class="['sub-badge', `sub-badge-${statusVariant}`]">
                            {{ statusLabel }}
                        </span>
                    </div>

                    <dl class="sub-meta">
                        <div v-if="periodEnd">
                            <dt>{{ isCancelPending ? 'Termina il' : 'Prossimo rinnovo' }}</dt>
                            <dd>{{ periodEnd }}</dd>
                        </div>
                    </dl>

                    <div v-if="isCancelPending" class="sub-notice sub-notice-warn">
                        <i class="bi bi-info-circle"></i>
                        <span>L'annullamento è programmato. Potrai usare l'app fino al {{ periodEnd || 'termine del periodo' }}, poi l'accesso verrà sospeso.</span>
                    </div>

                    <div v-if="isPastDue" class="sub-notice sub-notice-err">
                        <i class="bi bi-exclamation-triangle"></i>
                        <span>Pagamento in sospeso. Aggiorna il metodo di pagamento dal portale Stripe per evitare la sospensione.</span>
                    </div>

                    <div class="sub-actions">
                        <button
                            v-if="targetPlan && hasActiveSub && !isCancelPending"
                            type="button"
                            class="ds-btn ds-btn-primary"
                            :disabled="action === 'change'"
                            @click="askConfirm('change')"
                        >
                            <i class="bi bi-arrow-left-right"></i>
                            <span>Passa a {{ targetPlan.name }}</span>
                        </button>

                        <button
                            v-if="isCancelPending"
                            type="button"
                            class="ds-btn ds-btn-primary"
                            :disabled="action === 'reactivate'"
                            @click="runReactivate"
                        >
                            <i class="bi bi-arrow-counterclockwise"></i>
                            <span>{{ action === 'reactivate' ? 'Riattivazione…' : 'Riattiva abbonamento' }}</span>
                        </button>

                        <button
                            type="button"
                            class="ds-btn"
                            :disabled="action === 'portal'"
                            @click="openPortal"
                        >
                            <i class="bi bi-receipt"></i>
                            <span>{{ action === 'portal' ? 'Apertura…' : 'Gestisci pagamenti e fatture' }}</span>
                        </button>

                        <button
                            v-if="hasActiveSub && !isCancelPending"
                            type="button"
                            class="ds-btn ds-btn-danger"
                            :disabled="action === 'cancel'"
                            @click="askConfirm('cancel')"
                        >
                            <i class="bi bi-x-circle"></i>
                            <span>Annulla abbonamento</span>
                        </button>
                    </div>
                </div>
            </template>
        </div>

        <!-- Confirmation modal -->
        <Transition name="fade">
            <div v-if="confirmAction" class="sub-modal-backdrop" @click.self="dismissConfirm">
                <div class="sub-modal" role="dialog" aria-modal="true">
                    <h4 v-if="confirmAction === 'change'">
                        Passare a {{ targetPlan?.name }}?
                    </h4>
                    <h4 v-else-if="confirmAction === 'cancel'">
                        Annullare l'abbonamento?
                    </h4>

                    <p v-if="confirmAction === 'change'">
                        Il nuovo prezzo è <strong>{{ targetPlan?.price }}{{ targetPlan?.period }}</strong>.
                        La differenza per il periodo già pagato verrà calcolata in proporzione e applicata
                        sulla <strong>prossima fattura</strong>. Nessun addebito immediato.
                    </p>
                    <p v-else-if="confirmAction === 'cancel'">
                        L'abbonamento resterà attivo fino al <strong>{{ periodEnd || 'termine del periodo corrente' }}</strong>.
                        Dopo quella data l'accesso verrà sospeso. Potrai riattivarlo prima della scadenza.
                    </p>

                    <div class="sub-modal-actions">
                        <button type="button" class="ds-btn" :disabled="!!action" @click="dismissConfirm">
                            Annulla
                        </button>
                        <button
                            v-if="confirmAction === 'change'"
                            type="button"
                            class="ds-btn ds-btn-primary"
                            :disabled="action === 'change'"
                            @click="runChangePlan"
                        >
                            {{ action === 'change' ? 'Aggiornamento…' : `Passa a ${targetPlan?.name}` }}
                        </button>
                        <button
                            v-else-if="confirmAction === 'cancel'"
                            type="button"
                            class="ds-btn ds-btn-danger"
                            :disabled="action === 'cancel'"
                            @click="runCancel"
                        >
                            {{ action === 'cancel' ? 'Annullamento…' : 'Conferma annullamento' }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.sub-loading {
    display: flex; align-items: center; gap: 10px;
    padding: 24px; color: var(--ink-3); font-size: 13.5px;
}
.sub-empty {
    display: flex; flex-direction: column; align-items: flex-start; gap: 14px;
    padding: 16px 0;
    color: var(--ink-2);
}

.sub-card {
    border: 1px solid var(--line);
    border-radius: var(--r-md, 12px);
    background: var(--paper);
    padding: 20px;
    display: flex; flex-direction: column; gap: 16px;
}
.sub-card-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    flex-wrap: wrap;
}
.sub-plan { display: flex; flex-direction: column; gap: 4px; }
.sub-plan-name {
    font-size: 18px; font-weight: 600; letter-spacing: -0.015em;
    color: var(--ink);
}
.sub-plan-price {
    font-size: 14px; font-weight: 500; color: var(--ink-2);
}
.sub-plan-price span { color: var(--ink-3); font-weight: 400; }

.sub-badge {
    display: inline-flex; align-items: center;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 11.5px; font-weight: 600;
    letter-spacing: 0.04em; text-transform: uppercase;
    border: 1px solid transparent;
}
.sub-badge-ok { background: color-mix(in oklab, var(--ok) 14%, var(--paper)); color: var(--ok-ink, var(--ok)); border-color: color-mix(in oklab, var(--ok) 32%, transparent); }
.sub-badge-warn { background: color-mix(in oklab, var(--warn, #b45309) 14%, var(--paper)); color: var(--warn, #b45309); border-color: color-mix(in oklab, var(--warn, #b45309) 32%, transparent); }
.sub-badge-danger { background: color-mix(in oklab, var(--danger) 12%, var(--paper)); color: var(--danger); border-color: color-mix(in oklab, var(--danger) 32%, transparent); }
.sub-badge-muted { background: var(--bg-2, var(--paper)); color: var(--ink-3); border-color: var(--line); }

.sub-meta {
    margin: 0; padding: 0;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;
}
.sub-meta > div { display: flex; flex-direction: column; gap: 2px; }
.sub-meta dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); margin: 0; }
.sub-meta dd { margin: 0; font-size: 14px; font-weight: 500; color: var(--ink); }

.sub-notice {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px;
    border-radius: var(--r-sm, 8px);
    font-size: 13px; line-height: 1.5;
}
.sub-notice i { flex-shrink: 0; font-size: 16px; margin-top: 1px; }
.sub-notice-warn { background: color-mix(in oklab, var(--warn, #b45309) 8%, var(--paper)); color: var(--warn, #b45309); border: 1px solid color-mix(in oklab, var(--warn, #b45309) 24%, transparent); }
.sub-notice-err { background: color-mix(in oklab, var(--danger) 8%, var(--paper)); color: var(--danger); border: 1px solid color-mix(in oklab, var(--danger) 24%, transparent); }

.sub-actions {
    display: flex; flex-wrap: wrap; gap: 10px;
    padding-top: 4px;
}

.sub-modal-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0, 0, 0, 0.45);
    display: grid; place-items: center;
    padding: 16px;
}
.sub-modal {
    background: var(--paper);
    border-radius: var(--r-lg, 14px);
    border: 1px solid var(--line);
    padding: 24px;
    max-width: 480px; width: 100%;
    box-shadow: var(--shadow-lg, 0 20px 60px rgba(0, 0, 0, 0.18));
}
.sub-modal h4 { margin: 0 0 12px; font-size: 18px; font-weight: 600; color: var(--ink); }
.sub-modal p { margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: var(--ink-2); }
.sub-modal-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }

.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
