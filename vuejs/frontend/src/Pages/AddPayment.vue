<script setup>
import AppLayout from '@/Layouts/AppLayout.vue';
import { nextTick, onMounted, ref } from 'vue';
import { store } from '@/store';
import { createBillingPortalSession } from '@/utils';

const loading = ref(false);
const errorMessage = ref('');

const methods = [
    { icon: 'bi-credit-card', title: 'Carta di credito', desc: 'Visa, Mastercard, American Express' },
    { icon: 'bi-bank', title: 'Addebito SEPA', desc: 'Bonifico diretto dal tuo conto bancario' },
    { icon: 'bi-apple', title: 'Apple Pay', desc: 'Paga con Touch ID o Face ID' },
    { icon: 'bi-google', title: 'Google Pay', desc: 'Paga con il tuo account Google' },
];

const openPortal = async () => {
    errorMessage.value = '';
    loading.value = true;
    try {
        const session = await createBillingPortalSession(store.getters.getToken);
        if (session?.url) window.location.href = session.url;
        else errorMessage.value = 'Sessione Stripe non valida.';
    } catch (err) {
        errorMessage.value = err.message || 'Portale pagamenti non disponibile.';
    } finally {
        loading.value = false;
    }
};

onMounted(async () => {
    nextTick(() => {
        document.title = 'Aggiungi metodo di pagamento';
    });
});
</script>

<template>
    <AppLayout>
        <div class="payment-page">
            <div class="payment-container">
                <header class="payment-head">
                    <p class="text-overline">Pagamenti</p>
                    <h1 class="payment-title">Aggiungi metodo di pagamento</h1>
                    <p class="payment-subtitle">
                        Collega un metodo di pagamento per gestire il tuo abbonamento. I tuoi dati sono protetti da Stripe.
                    </p>
                </header>

                <section class="payment-methods">
                    <article v-for="m in methods" :key="m.title" class="method-card">
                        <div class="method-icon"><i :class="['bi', m.icon]" aria-hidden="true"></i></div>
                        <div class="method-body">
                            <h3 class="method-title">{{ m.title }}</h3>
                            <p class="method-desc">{{ m.desc }}</p>
                        </div>
                        <div class="method-cta">
                            <button type="button" class="method-button" :disabled="loading" @click="openPortal">
                                {{ loading ? 'Apertura...' : 'Gestisci' }}
                            </button>
                        </div>
                    </article>
                </section>

                <p v-if="errorMessage" class="payment-error">{{ errorMessage }}</p>

                <div class="payment-note">
                    <i class="bi bi-shield-check"></i>
                    <p>
                        I pagamenti sono elaborati da Stripe. Tavolo non memorizza i dati della tua carta.
                    </p>
                </div>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.payment-page {
    padding: var(--s-8) 0 var(--s-9);
    background: var(--bg);
    min-height: calc(100vh - 64px);
    font-family: var(--f-sans, 'Geist', sans-serif);
}
.payment-container {
    max-width: 720px;
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
.payment-head { margin-bottom: var(--s-7); }
.payment-title {
    font-size: clamp(26px, 3.5vw, 34px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-3);
    line-height: 1.15;
}
.payment-subtitle {
    font-size: 15px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.55;
    max-width: 560px;
}
.payment-methods {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    margin-bottom: var(--s-6);
}
.method-card {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-4) var(--s-5);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
}
.method-icon {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    background: color-mix(in oklab, var(--ac) 10%, var(--paper));
    color: var(--ac);
    border-radius: var(--r-md);
    font-size: 20px;
    flex-shrink: 0;
}
.method-body {
    flex: 1;
    min-width: 0;
}
.method-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 2px;
}
.method-desc {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.45;
}
.method-cta { flex-shrink: 0; }
.method-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink);
    background: var(--bg-2, color-mix(in oklab, var(--ink) 5%, var(--paper)));
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    cursor: pointer;
}
.method-button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
}
.payment-error {
    margin: 0 0 var(--s-4);
    color: #b42318;
    font-size: 13px;
}
.payment-note {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-4);
    background: color-mix(in oklab, var(--ac) 5%, var(--paper));
    border: 1px solid color-mix(in oklab, var(--ac) 18%, var(--line));
    border-radius: var(--r-md);
}
.payment-note i {
    color: var(--ac);
    font-size: 18px;
    flex-shrink: 0;
    margin-top: 1px;
}
.payment-note p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
    line-height: 1.55;
}
@media (max-width: 640px) {
    .payment-container { padding: 0 var(--s-4); }
    .method-card { padding: var(--s-4); }
}
</style>
