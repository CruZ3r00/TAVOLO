<script setup>
import { onMounted, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { API_BASE, createBillingCheckoutSession } from '@/utils';

const router = useRouter();
const store = useStore();

const pending = ref(null);
const animateIn = ref(false);
const submitting = ref(false);
const errorMessage = ref('');

// Mapping UI → backend plan keys (Stripe billing controller accetta solo 'starter' | 'pro').
// 'catena' è una card informativa con CTA contattaci, NON va a Stripe checkout.
const plans = [
    {
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
        side: 'left',
    },
    {
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
        side: 'center',
        highlight: true,
    },
    {
        key: 'catena',
        name: 'Catena',
        price: 'Su misura',
        period: '',
        features: [
            'Tutto di Professionale',
            'Dashboard multi-sede',
            'Onboarding dedicato',
            'SLA e account manager',
        ],
        side: 'right',
        contactOnly: true,
    },
];

onMounted(() => {
    document.title = 'Scegli il piano';
    const stored = sessionStorage.getItem('pending_registration');
    if (!stored) {
        router.replace('/register');
        return;
    }
    try {
        pending.value = JSON.parse(stored);
    } catch (_) {
        sessionStorage.removeItem('pending_registration');
        router.replace('/register');
        return;
    }
    nextTick(() => {
        // Pro è già visibile al mount; le altre due slidano fuori dopo un breve delay.
        setTimeout(() => { animateIn.value = true; }, 350);
    });
});

const registerThenCheckout = async (planKey) => {
    if (!pending.value || submitting.value) return;
    submitting.value = true;
    errorMessage.value = '';
    try {
        // 1) Crea l'utente solo ora che il piano è scelto (idempotenza pre-Stripe).
        const response = await fetch(`${API_BASE}/api/auth/local/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pending.value),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            errorMessage.value = errorData?.error?.message || 'Errore durante la registrazione.';
            return;
        }
        const data = await response.json();
        if (!data?.jwt || !data?.user) {
            errorMessage.value = 'Risposta di registrazione non valida.';
            return;
        }

        // 2) Login locale (token + user nello store/localStorage).
        store.dispatch('login', { user: data.user, token: data.jwt });
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.jwt);
        sessionStorage.removeItem('pending_registration');

        // 3) Stripe Checkout — il backend redirige a success_url (/renew-sub?checkout=success).
        try {
            const session = await createBillingCheckoutSession(planKey, data.jwt);
            if (session?.url) {
                window.location.href = session.url;
                return;
            }
            errorMessage.value = 'Sessione Stripe non disponibile.';
            router.push({ path: '/renew-sub', query: { checkout: 'retry', plan: planKey } });
        } catch (err) {
            errorMessage.value = err?.message || 'Account creato, ma il checkout Stripe non si è avviato.';
            router.push({ path: '/renew-sub', query: { checkout: 'retry', plan: planKey } });
        }
    } catch (_err) {
        errorMessage.value = 'Errore di rete. Riprova.';
    } finally {
        submitting.value = false;
    }
};

const goBack = () => {
    router.push('/register');
};
</script>

<template>
    <div class="cp-page">
        <header class="cp-topbar">
            <button type="button" class="cp-back" @click="goBack" aria-label="Torna indietro">
                <i class="bi bi-arrow-left" aria-hidden="true"></i>
                <span>Modifica dati</span>
            </button>
            <div class="cp-brand">
                <span class="cp-brand-mark" aria-hidden="true">T</span>
                <span class="cp-brand-text">Tavolo</span>
            </div>
        </header>

        <div class="cp-container">
            <header class="cp-head">
                <p class="text-overline">Ultimo passaggio</p>
                <h1 class="cp-title">Scegli il piano per <span v-if="pending">{{ pending.username }}</span></h1>
                <p class="cp-subtitle">
                    L'account verrà creato solo dopo aver scelto il piano e completato il pagamento.
                </p>
            </header>

            <Transition name="fade">
                <div v-if="errorMessage" class="ds-alert ds-alert-error cp-error" role="alert">
                    <i class="bi bi-exclamation-circle"></i>
                    <span>{{ errorMessage }}</span>
                </div>
            </Transition>

            <section class="cp-plans" :class="{ 'is-fanned': animateIn }">
                <article
                    v-for="p in plans"
                    :key="p.key"
                    class="plan-card"
                    :class="[`plan-${p.side}`, { 'plan-highlight': p.highlight }]"
                >
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

                    <div v-if="p.contactOnly" class="plan-addon">
                        <p class="plan-addon-title">
                            <i class="bi bi-stars" aria-hidden="true"></i>
                            Sito web personalizzato
                        </p>
                        <p class="plan-addon-text">
                            Puoi aggiungere al piano la creazione del tuo sito web su misura. Parla con noi prima di proseguire per definire il progetto.
                        </p>
                    </div>

                    <router-link
                        v-if="p.contactOnly"
                        to="/contact-us"
                        class="plan-cta plan-cta-link"
                    >
                        <i class="bi bi-envelope" aria-hidden="true"></i>
                        Contattaci
                    </router-link>
                    <button
                        v-else
                        type="button"
                        class="plan-cta"
                        :class="{ 'plan-cta-primary': p.highlight }"
                        :disabled="submitting"
                        @click="registerThenCheckout(p.key)"
                    >
                        <span v-if="submitting" class="ds-spinner"></span>
                        <span v-else>{{ p.highlight ? 'Inizia con Professionale' : `Inizia con ${p.name}` }}</span>
                    </button>
                </article>
            </section>
        </div>
    </div>
</template>

<style scoped>
.cp-page {
    background: var(--bg);
    min-height: 100vh;
    font-family: var(--f-sans, 'Geist', sans-serif);
}

.cp-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s-4) var(--s-6);
    border-bottom: 1px solid var(--line);
    background: var(--bg);
}
.cp-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    cursor: pointer;
    transition: color 120ms, background 120ms, border-color 120ms;
}
.cp-back:hover {
    color: var(--ink);
    background: var(--bg-hover);
    border-color: var(--line-strong);
}
.cp-back i { font-size: 14px; }

.cp-brand {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    color: var(--ink);
}
.cp-brand-mark {
    width: 34px; height: 34px;
    display: grid; place-items: center;
    background: var(--ink);
    color: var(--bg);
    border-radius: var(--r-md);
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -0.02em;
}
.cp-brand-text {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.02em;
}

.cp-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--s-8) var(--s-6) var(--s-9);
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

.cp-head {
    text-align: center;
    margin-bottom: var(--s-7);
    max-width: 640px;
    margin-left: auto;
    margin-right: auto;
}

.cp-title {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-3) 0;
    letter-spacing: -0.03em;
    line-height: 1.1;
}
.cp-title span { color: var(--ac); }

.cp-subtitle {
    font-size: 16px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.55;
}

.cp-error { margin-bottom: var(--s-5); }

/* === Animation === */
.cp-plans {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--s-4);
    perspective: 1200px;
    min-height: 540px;
}

.plan-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: var(--s-6);
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    transition: transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1),
                opacity 500ms ease,
                border-color 220ms,
                box-shadow 220ms;
    will-change: transform, opacity;
}

/* Pre-animation: side cards stack behind Pro, hidden, scaled down */
.plan-left,
.plan-right {
    grid-column: 2;
    grid-row: 1;
    opacity: 0;
    transform: translateX(0) scale(0.86);
    z-index: 1;
    pointer-events: none;
}

.plan-center {
    grid-column: 2;
    grid-row: 1;
    z-index: 3;
    transform: translateY(0) scale(1);
}

/* Animate-in state: side cards slide out to columns 1 and 3 */
.cp-plans.is-fanned .plan-left {
    grid-column: 1;
    transform: translateX(0) scale(1);
    opacity: 1;
    pointer-events: auto;
    z-index: 2;
}
.cp-plans.is-fanned .plan-right {
    grid-column: 3;
    transform: translateX(0) scale(1);
    opacity: 1;
    pointer-events: auto;
    z-index: 2;
}
.cp-plans.is-fanned .plan-center {
    transform: translateY(-4px) scale(1);
}

.plan-card:hover {
    border-color: color-mix(in oklab, var(--ac) 25%, var(--line));
}
.plan-highlight {
    border-color: var(--ink);
    box-shadow: 0 14px 48px -14px color-mix(in oklab, var(--ink) 28%, transparent);
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
    color: var(--bg);
    background: var(--ink);
    border-radius: 999px;
}

.plan-name {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 600;
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
    font-size: 34px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.03em;
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

.plan-addon {
    background: color-mix(in oklab, var(--ac) 6%, var(--bg-elev));
    border: 1px solid color-mix(in oklab, var(--ac) 20%, var(--line));
    border-radius: var(--r-md);
    padding: var(--s-3);
    margin-bottom: var(--s-4);
}
.plan-addon-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
}
.plan-addon-title i { color: var(--ac); font-size: 14px; }
.plan-addon-text {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-2);
    line-height: 1.5;
}

.plan-cta {
    width: 100%;
    padding: 12px 18px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background 120ms, border-color 120ms, transform 120ms;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-decoration: none;
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
.plan-cta-link i { font-size: 14px; }

.plan-cta .ds-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid color-mix(in oklab, var(--ink) 30%, transparent);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: cp-spin 650ms linear infinite;
}
.plan-cta-primary .ds-spinner {
    border-color: color-mix(in oklab, var(--bg) 30%, transparent);
    border-top-color: var(--bg);
}
@keyframes cp-spin { to { transform: rotate(360deg); } }

.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 880px) {
    .cp-plans {
        grid-template-columns: 1fr;
        min-height: auto;
    }
    .plan-left, .plan-right, .plan-center {
        grid-column: 1;
        grid-row: auto;
        position: static;
    }
    .plan-left { transform: none; opacity: 1; pointer-events: auto; }
    .plan-right { transform: none; opacity: 1; pointer-events: auto; }
    .cp-plans.is-fanned .plan-left,
    .cp-plans.is-fanned .plan-right { grid-column: 1; }
}

@media (max-width: 640px) {
    .cp-topbar { padding: var(--s-3) var(--s-4); }
    .cp-container { padding: var(--s-6) var(--s-4) var(--s-7); }
    .cp-back span { display: none; }
}
</style>
