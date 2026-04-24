<script setup>
import AppLayout from '@/Layouts/AppLayout.vue';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { store } from '@/store';
import {
    createBillingCheckoutSession,
    createBillingPortalSession,
    fetchBillingStatus,
} from '@/utils';

const route = useRoute();
const billing = ref(null);
const errorMessage = ref('');
const loadingPlan = ref(null);
const portalLoading = ref(false);
const token = computed(() => store.getters.getToken);

const plans = [
    {
        key: 'starter',
        name: 'Starter',
        price: 'EUR 29',
        period: '/ mese',
        features: ['1 ristorante', 'Menu digitale + QR', 'Prenotazioni illimitate', 'Supporto via email'],
        highlight: false,
    },
    {
        key: 'pro',
        name: 'Pro',
        price: 'EUR 59',
        period: '/ mese',
        features: ['Tutto di Starter', 'Ordinazioni in sala', 'Import menu via OCR', 'Supporto prioritario'],
        highlight: true,
    },
    {
        key: 'enterprise',
        name: 'Enterprise',
        price: 'Custom',
        period: '',
        features: ['Tutto di Pro', 'Multi-sede', 'Integrazioni su misura', 'Account manager dedicato'],
        highlight: false,
        disabled: true,
    },
];

const checkoutNotice = computed(() => {
    if (route.query.checkout === 'success') {
        return 'Pagamento completato. Lo stato si aggiorna appena Stripe invia il webhook.';
    }
    if (route.query.checkout === 'retry') {
        return 'Account creato. Scegli di nuovo il piano per completare il pagamento.';
    }
    if (route.query.checkout === 'cancelled') {
        return 'Checkout annullato. Puoi riprendere quando vuoi.';
    }
    return '';
});

const isCurrentPlan = (planKey) => billing.value?.subscription_plan === planKey;

const loadBillingStatus = async () => {
    if (!token.value) return;
    try {
        billing.value = await fetchBillingStatus(token.value);
    } catch (err) {
        console.error(err);
    }
};

const subscribe = async (plan) => {
    if (plan.disabled || !token.value) return;
    errorMessage.value = '';
    loadingPlan.value = plan.key;
    try {
        const session = await createBillingCheckoutSession(plan.key, token.value);
        if (session?.url) window.location.href = session.url;
        else errorMessage.value = 'Sessione Stripe non valida.';
    } catch (err) {
        errorMessage.value = err.message || 'Impossibile avviare il checkout.';
    } finally {
        loadingPlan.value = null;
    }
};

const openPortal = async () => {
    if (!token.value) return;
    errorMessage.value = '';
    portalLoading.value = true;
    try {
        const session = await createBillingPortalSession(token.value);
        if (session?.url) window.location.href = session.url;
        else errorMessage.value = 'Sessione portale non valida.';
    } catch (err) {
        errorMessage.value = err.message || 'Portale Stripe non disponibile.';
    } finally {
        portalLoading.value = false;
    }
};

const handlePlanAction = (plan) => {
    if (isCurrentPlan(plan.key)) {
        openPortal();
        return;
    }
    subscribe(plan);
};

onMounted(() => {
    nextTick(() => {
        document.title = 'Rinnova abbonamento';
    });
    loadBillingStatus();
    const requestedPlan = typeof route.query.plan === 'string' ? route.query.plan : '';
    const plan = plans.find((p) => p.key === requestedPlan && !p.disabled);
    if (route.query.checkout === 'retry' && plan) {
        subscribe(plan);
    }
});
</script>

<template>
    <AppLayout>
        <div class="renew-page">
            <div class="renew-container">
                <header class="renew-head">
                    <p class="text-overline">Abbonamento</p>
                    <h1 class="renew-title">Rinnova il tuo piano</h1>
                    <p class="renew-subtitle">
                        Scegli il piano piu adatto alla tua attivita. Puoi cambiarlo o disdirlo in qualsiasi momento.
                    </p>
                    <div v-if="billing?.subscription_status" class="billing-status">
                        <span>{{ billing.subscription_status }}</span>
                        <span v-if="billing.subscription_current_period_end">
                            fino al {{ new Date(billing.subscription_current_period_end).toLocaleDateString('it-IT') }}
                        </span>
                    </div>
                    <p v-if="checkoutNotice" class="renew-notice">{{ checkoutNotice }}</p>
                    <p v-if="errorMessage" class="renew-error">{{ errorMessage }}</p>
                </header>

                <section class="renew-plans">
                    <article v-for="p in plans" :key="p.name" class="plan-card" :class="{ 'plan-highlight': p.highlight }">
                        <div v-if="p.highlight" class="plan-tag">Consigliato</div>
                        <h3 class="plan-name">{{ p.name }}</h3>
                        <div class="plan-price">
                            <span class="plan-amount">{{ p.price }}</span>
                            <span class="plan-period">{{ p.period }}</span>
                        </div>
                        <ul class="plan-features">
                            <li v-for="f in p.features" :key="f">
                                <i class="bi bi-check-lg"></i>
                                <span>{{ f }}</span>
                            </li>
                        </ul>
                        <button
                            type="button"
                            class="plan-cta"
                            :class="{ 'plan-cta-primary': p.highlight }"
                            :disabled="p.disabled || loadingPlan === p.key"
                            @click="handlePlanAction(p)"
                        >
                            <span v-if="loadingPlan === p.key">Apertura...</span>
                            <span v-else-if="p.disabled">Contattaci</span>
                            <span v-else-if="isCurrentPlan(p.key)">Gestisci piano</span>
                            <span v-else>Attiva piano</span>
                        </button>
                    </article>
                </section>

                <footer class="renew-footer">
                    <button
                        v-if="billing?.subscription_status"
                        type="button"
                        class="portal-link"
                        :disabled="portalLoading"
                        @click="openPortal"
                    >
                        {{ portalLoading ? 'Apertura portale...' : 'Gestisci fatturazione' }}
                    </button>
                    <p>Hai domande sul tuo piano? <router-link to="/contact-us" class="renew-link">Contattaci</router-link></p>
                </footer>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.renew-page {
    padding: var(--s-8) 0 var(--s-9);
    background: var(--bg);
    min-height: calc(100vh - 64px);
    font-family: var(--f-sans, 'Geist', sans-serif);
}
.renew-container {
    max-width: 1040px;
    margin: 0 auto;
    padding: 0 var(--s-6);
}
.text-overline {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-3);
    margin: 0 0 6px;
}
.renew-head {
    text-align: center;
    margin: 0 auto var(--s-8);
    max-width: 620px;
}
.renew-title {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-3);
    line-height: 1.1;
}
.renew-subtitle {
    font-size: 16px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.55;
}
.billing-status,
.renew-notice,
.renew-error {
    margin-top: var(--s-4);
    font-size: 13px;
    line-height: 1.45;
}
.billing-status {
    display: inline-flex;
    gap: 8px;
    padding: 7px 11px;
    color: var(--ink-2);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
}
.renew-notice { color: var(--ink-2); }
.renew-error { color: #b42318; }
.renew-plans {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--s-4);
    margin-bottom: var(--s-8);
}
.plan-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: var(--s-6);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
}
.plan-highlight {
    border-color: var(--ink);
    box-shadow: 0 10px 40px -12px color-mix(in oklab, var(--ink) 20%, transparent);
}
.plan-tag {
    position: absolute;
    top: -10px;
    left: var(--s-5);
    padding: 4px 10px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--paper);
    background: var(--ink);
    border-radius: 999px;
}
.plan-name {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
    margin: 0 0 var(--s-3);
    letter-spacing: 0.14em;
    text-transform: uppercase;
}
.plan-price {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: var(--s-5);
}
.plan-amount {
    font-size: 34px;
    font-weight: 700;
    color: var(--ink);
    line-height: 1;
}
.plan-period {
    font-size: 14px;
    color: var(--ink-3);
}
.plan-features {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--s-5);
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
}
.plan-features li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 14px;
    color: var(--ink-2);
    line-height: 1.5;
}
.plan-features i {
    color: var(--ac);
    flex-shrink: 0;
    margin-top: 2px;
}
.plan-cta {
    width: 100%;
    padding: 11px 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    cursor: pointer;
}
.plan-cta:disabled {
    cursor: not-allowed;
    opacity: 0.72;
}
.plan-cta-primary {
    color: var(--paper);
    background: var(--ink);
    border-color: var(--ink);
}
.renew-footer {
    text-align: center;
    font-size: 13px;
    color: var(--ink-3);
}
.renew-footer p { margin: 0; }
.renew-link,
.portal-link {
    color: var(--ac);
    text-decoration: none;
    font-weight: 600;
}
.portal-link {
    display: inline-block;
    margin-bottom: var(--s-3);
    background: transparent;
    border: 0;
    cursor: pointer;
}
.renew-link:hover,
.portal-link:hover {
    text-decoration: underline;
}
@media (max-width: 640px) {
    .renew-container { padding: 0 var(--s-4); }
}
</style>
