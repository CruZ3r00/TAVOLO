<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import {
    createBillingCheckoutSession,
    createBillingPortalSession,
    fetchBillingStatus,
    syncBillingCheckout,
} from '@/utils';

const route = useRoute();
const router = useRouter();
const store = useStore();

const billing = ref(null);
const errorMessage = ref('');
const noticeMessage = ref('');
const loadingPlan = ref(null);
const portalLoading = ref(false);
const syncing = ref(false);
const token = computed(() => store.getters.getToken);

// Solo 2 piani in renew. Custom non c'è.
const PLANS = {
    starter: {
        key: 'starter',
        name: 'Essenziale',
        price: '€ 39,99',
        period: '/ mese',
        features: [
            'Vista Sala, Cucina, Cassa',
            'Fino a 20 tavoli',
            'Menu digitale + QR',
            'Assistenza via email',
        ],
    },
    pro: {
        key: 'pro',
        name: 'Professionale',
        price: '€ 74,99',
        period: '/ mese',
        features: [
            'Tutto di Essenziale',
            'Prenotazioni online illimitate',
            'Statistiche storiche e report',
            'Scontrino elettronico',
            'Assistenza prioritaria',
        ],
    },
};

// L'altro piano (passa all'altro abbonamento).
const SWITCH_TARGET = { starter: 'pro', pro: 'starter' };

const allPlans = computed(() => Object.values(PLANS));

// Piano corrente: usa subscription_plan dal backend (preferito) o user store.
const currentPlanKey = computed(() => {
    const fromBilling = billing.value?.subscription_plan;
    if (fromBilling && PLANS[fromBilling]) return fromBilling;
    const fromUser = store.getters.getUser?.subscription_plan;
    return fromUser && PLANS[fromUser] ? fromUser : null;
});

const currentPlan = computed(() => (currentPlanKey.value ? PLANS[currentPlanKey.value] : null));
const switchPlan = computed(() => {
    const target = currentPlanKey.value ? SWITCH_TARGET[currentPlanKey.value] : null;
    return target ? PLANS[target] : null;
});

const loadBillingStatus = async () => {
    if (!token.value) return;
    try {
        billing.value = await fetchBillingStatus(token.value);
    } catch (err) {
        console.error('fetchBillingStatus:', err);
    }
};

// Se torniamo da Stripe Checkout con session_id, sincronizza i dati subito —
// non aspettiamo il webhook (potrebbe non arrivare in dev senza tunnel).
const syncIfReturningFromCheckout = async () => {
    const sessionId = typeof route.query.session_id === 'string' ? route.query.session_id : '';
    if (route.query.checkout !== 'success' || !sessionId || !token.value) return;
    syncing.value = true;
    try {
        const synced = await syncBillingCheckout(sessionId, token.value);
        if (synced) {
            billing.value = synced;
            const user = { ...(store.getters.getUser || {}), ...synced };
            store.commit('setUser', user);
            localStorage.setItem('user', JSON.stringify(user));
        }
        noticeMessage.value = 'Pagamento confermato. Puoi accedere all\'app.';
        // Pulizia query string e ridirezione alla dashboard se attivo.
        if (synced && ['active', 'trialing'].includes(synced.subscription_status)) {
            setTimeout(() => router.replace('/dashboard'), 800);
        }
    } catch (err) {
        errorMessage.value = err?.message || 'Sync della sessione Stripe non riuscito.';
    } finally {
        syncing.value = false;
    }
};

const subscribe = async (planKey) => {
    if (!token.value) return;
    errorMessage.value = '';
    loadingPlan.value = planKey;
    try {
        const session = await createBillingCheckoutSession(planKey, token.value);
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

const logout = () => {
    store.dispatch('logout');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    router.push('/login');
};

const checkoutNotice = computed(() => {
    if (route.query.checkout === 'cancelled') {
        return 'Checkout annullato. Puoi riprendere quando vuoi.';
    }
    if (route.query.checkout === 'retry') {
        return 'Account creato. Scegli di nuovo il piano per completare il pagamento.';
    }
    return '';
});

onMounted(async () => {
    nextTick(() => { document.title = 'Rinnova abbonamento'; });
    await loadBillingStatus();
    await syncIfReturningFromCheckout();

    // Retry automatico se il flusso ChoosePlan ci ha rimbalzato qui con un piano già scelto.
    const requestedPlan = typeof route.query.plan === 'string' ? route.query.plan : '';
    if (route.query.checkout === 'retry' && PLANS[requestedPlan]) {
        subscribe(requestedPlan);
    }
});
</script>

<template>
    <div class="renew-page">
        <header class="renew-topbar">
            <div class="renew-brand">
                <span class="renew-brand-mark" aria-hidden="true">T</span>
                <span class="renew-brand-text">Tavolo</span>
            </div>
            <button type="button" class="renew-logout" @click="logout">
                <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
                <span>Esci</span>
            </button>
        </header>

        <div class="renew-container">
            <header class="renew-head">
                <p class="text-overline">Abbonamento</p>
                <h1 class="renew-title">
                    {{ currentPlan ? 'Il tuo abbonamento è scaduto' : 'Attiva il tuo piano' }}
                </h1>
                <p class="renew-subtitle">
                    <template v-if="currentPlan">
                        Per continuare a usare Tavolo scegli se proseguire con il tuo piano attuale o passare all'altro.
                    </template>
                    <template v-else>
                        Per continuare a usare Tavolo, completa la sottoscrizione al piano scelto.
                    </template>
                </p>

                <Transition name="fade">
                    <div v-if="syncing" class="renew-status renew-status--info">
                        <span class="ds-spinner" aria-hidden="true"></span>
                        Sincronizzazione pagamento Stripe in corso...
                    </div>
                </Transition>

                <Transition name="fade">
                    <div v-if="noticeMessage && !syncing" class="renew-status renew-status--ok">
                        <i class="bi bi-check-circle"></i>
                        {{ noticeMessage }}
                    </div>
                </Transition>

                <Transition name="fade">
                    <div v-if="checkoutNotice" class="renew-status">{{ checkoutNotice }}</div>
                </Transition>

                <Transition name="fade">
                    <div v-if="errorMessage" class="renew-status renew-status--err">
                        <i class="bi bi-exclamation-circle"></i>
                        {{ errorMessage }}
                    </div>
                </Transition>
            </header>

            <!-- RETURNING USER: due opzioni (continua col tuo / passa all'altro) -->
            <section v-if="currentPlan && switchPlan" class="renew-options">
                <article class="opt-card opt-card-current">
                    <div class="opt-tag opt-tag-current">Il tuo piano</div>
                    <h3 class="plan-name">{{ currentPlan.name }}</h3>
                    <div class="plan-price">
                        <span class="plan-amount">{{ currentPlan.price }}</span>
                        <span class="plan-period">{{ currentPlan.period }}</span>
                    </div>
                    <ul class="plan-features">
                        <li v-for="f in currentPlan.features" :key="f">
                            <i class="bi bi-check-lg"></i>
                            <span>{{ f }}</span>
                        </li>
                    </ul>
                    <button
                        type="button"
                        class="plan-cta plan-cta-primary"
                        :disabled="loadingPlan === currentPlan.key"
                        @click="subscribe(currentPlan.key)"
                    >
                        <span v-if="loadingPlan === currentPlan.key">Apertura...</span>
                        <span v-else>Continua con il tuo abbonamento</span>
                    </button>
                </article>

                <article class="opt-card opt-card-switch">
                    <div class="opt-tag opt-tag-switch">Cambia piano</div>
                    <h3 class="plan-name">{{ switchPlan.name }}</h3>
                    <div class="plan-price">
                        <span class="plan-amount">{{ switchPlan.price }}</span>
                        <span class="plan-period">{{ switchPlan.period }}</span>
                    </div>
                    <ul class="plan-features">
                        <li v-for="f in switchPlan.features" :key="f">
                            <i class="bi bi-check-lg"></i>
                            <span>{{ f }}</span>
                        </li>
                    </ul>
                    <button
                        type="button"
                        class="plan-cta"
                        :disabled="loadingPlan === switchPlan.key"
                        @click="subscribe(switchPlan.key)"
                    >
                        <span v-if="loadingPlan === switchPlan.key">Apertura...</span>
                        <span v-else>Passa a {{ switchPlan.name }}</span>
                    </button>
                </article>
            </section>

            <!-- Nessun piano precedente: mostra entrambi i piani disponibili -->
            <section v-else class="renew-plans">
                <article
                    v-for="p in allPlans"
                    :key="p.key"
                    class="plan-card"
                    :class="{ 'plan-highlight': p.key === 'pro' }"
                >
                    <div v-if="p.key === 'pro'" class="plan-tag">Consigliato</div>
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
                        :class="{ 'plan-cta-primary': p.key === 'pro' }"
                        :disabled="loadingPlan === p.key"
                        @click="subscribe(p.key)"
                    >
                        <span v-if="loadingPlan === p.key">Apertura...</span>
                        <span v-else>Attiva {{ p.name }}</span>
                    </button>
                </article>
            </section>

            <footer v-if="billing?.stripe_customer_id" class="renew-footer">
                <button
                    type="button"
                    class="portal-link"
                    :disabled="portalLoading"
                    @click="openPortal"
                >
                    {{ portalLoading ? 'Apertura portale...' : 'Gestisci fatturazione' }}
                </button>
            </footer>
        </div>
    </div>
</template>

<style scoped>
.renew-page {
    background: var(--bg);
    min-height: 100vh;
    font-family: var(--f-sans, 'Geist', sans-serif);
}

.renew-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s-4) var(--s-6);
    border-bottom: 1px solid var(--line);
    background: var(--bg);
}

.renew-brand { display: flex; align-items: center; gap: var(--s-3); color: var(--ink); }
.renew-brand-mark {
    width: 34px; height: 34px;
    display: grid; place-items: center;
    background: var(--ink); color: var(--bg);
    border-radius: var(--r-md);
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-weight: 700; font-size: 15px; letter-spacing: -0.02em;
}
.renew-brand-text { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }

.renew-logout {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px;
    font-size: 13px; font-weight: 500;
    color: var(--ink-2); background: transparent;
    border: 1px solid var(--line); border-radius: var(--r-md);
    cursor: pointer;
    transition: color 120ms, background 120ms, border-color 120ms;
}
.renew-logout:hover {
    color: var(--ink);
    background: color-mix(in oklab, var(--ink) 5%, transparent);
    border-color: var(--line-strong);
}
.renew-logout i { font-size: 15px; }

.renew-container {
    max-width: 1040px;
    margin: 0 auto;
    padding: var(--s-8) var(--s-6) var(--s-9);
}

.text-overline {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--ink-3);
    margin: 0 0 6px;
}

.renew-head {
    text-align: center;
    margin: 0 auto var(--s-7);
    max-width: 620px;
}
.renew-title {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-3) 0;
    letter-spacing: -0.03em;
    line-height: 1.1;
}
.renew-subtitle {
    font-size: 16px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.55;
}

.renew-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: var(--s-4);
    padding: 8px 14px;
    border-radius: var(--r-md);
    font-size: 13px;
    line-height: 1.4;
    background: color-mix(in oklab, var(--ink) 4%, var(--bg-elev));
    border: 1px solid var(--line);
    color: var(--ink-2);
}
.renew-status--ok {
    color: var(--ok-ink, var(--ink));
    background: var(--ok-bg, color-mix(in oklab, var(--ok) 10%, var(--bg-elev)));
    border-color: color-mix(in oklab, var(--ok) 30%, transparent);
}
.renew-status--err {
    color: var(--danger-ink, var(--ink));
    background: var(--danger-bg, color-mix(in oklab, var(--danger) 10%, var(--bg-elev)));
    border-color: color-mix(in oklab, var(--danger) 30%, transparent);
}
.renew-status--info {
    color: var(--info-ink, var(--ink));
    background: var(--info-bg, color-mix(in oklab, var(--info) 8%, var(--bg-elev)));
    border-color: color-mix(in oklab, var(--info) 30%, transparent);
}
.renew-status .ds-spinner {
    width: 12px; height: 12px;
    border: 2px solid color-mix(in oklab, var(--ink) 20%, transparent);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: rs-spin 650ms linear infinite;
}
@keyframes rs-spin { to { transform: rotate(360deg); } }

/* Returning user: due card affiancate */
.renew-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-5);
    max-width: 820px;
    margin: 0 auto;
}

.opt-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: var(--s-6);
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    transition: transform 160ms, border-color 160ms, box-shadow 160ms;
}
.opt-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in oklab, var(--ac) 25%, var(--line));
}
.opt-card-current {
    border-color: var(--ink);
    box-shadow: 0 10px 40px -12px color-mix(in oklab, var(--ink) 22%, transparent);
}

.opt-tag {
    position: absolute;
    top: -10px;
    left: var(--s-5);
    padding: 4px 10px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.1em;
    border-radius: 999px;
}
.opt-tag-current { color: var(--bg); background: var(--ink); }
.opt-tag-switch {
    color: var(--ac);
    background: color-mix(in oklab, var(--ac) 12%, var(--bg-elev));
    border: 1px solid color-mix(in oklab, var(--ac) 30%, transparent);
}

/* Stile piani condiviso */
.renew-plans {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--s-4);
    max-width: 820px;
    margin: 0 auto;
}

.plan-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: var(--s-6);
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    transition: transform 160ms, border-color 160ms, box-shadow 160ms;
}
.plan-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in oklab, var(--ac) 25%, var(--line));
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
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--bg); background: var(--ink);
    border-radius: 999px;
}

.plan-name {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px; font-weight: 600;
    color: var(--ink-3);
    margin: 0 0 var(--s-3);
    text-transform: uppercase;
    letter-spacing: 0.14em;
}

.plan-price {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: var(--s-5);
}
.plan-amount {
    font-size: 34px; font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.03em;
    line-height: 1;
}
.plan-period { font-size: 14px; color: var(--ink-3); }

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
    padding: 12px 18px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px; font-weight: 600;
    color: var(--ink);
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background 120ms, border-color 120ms, transform 120ms;
}
.plan-cta:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--line-strong);
    transform: translateY(-1px);
}
.plan-cta:disabled { opacity: 0.7; cursor: not-allowed; }
.plan-cta-primary {
    color: var(--bg);
    background: var(--ink);
    border-color: var(--ink);
}
.plan-cta-primary:hover:not(:disabled) {
    background: color-mix(in oklab, var(--ink) 90%, var(--ac));
    border-color: var(--ink);
}

.renew-footer {
    text-align: center;
    margin-top: var(--s-7);
}
.portal-link {
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    padding: 8px 14px;
    font-size: 13px;
    color: var(--ink-2);
    cursor: pointer;
    transition: color 120ms, background 120ms, border-color 120ms;
}
.portal-link:hover:not(:disabled) {
    color: var(--ink);
    background: var(--bg-hover);
    border-color: var(--line-strong);
}
.portal-link:disabled { opacity: 0.6; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 720px) {
    .renew-options { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
    .renew-topbar { padding: var(--s-3) var(--s-4); }
    .renew-container { padding: var(--s-6) var(--s-4) var(--s-7); }
}
</style>
