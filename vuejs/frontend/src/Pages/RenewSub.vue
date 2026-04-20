<script setup>
import AppLayout from '@/Layouts/AppLayout.vue';
import { onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

onMounted(() => {
    nextTick(() => {
        document.title = 'Rinnova abbonamento';
    });
});

const plans = [
    {
        name: 'Starter',
        price: '€ 29',
        period: '/ mese',
        features: [
            '1 ristorante',
            'Menu digitale + QR',
            'Prenotazioni illimitate',
            'Supporto via email',
        ],
        highlight: false,
    },
    {
        name: 'Pro',
        price: '€ 59',
        period: '/ mese',
        features: [
            'Tutto di Starter',
            'Ordinazioni in sala',
            'Import menu via OCR',
            'Supporto prioritario',
        ],
        highlight: true,
    },
    {
        name: 'Enterprise',
        price: 'Custom',
        period: '',
        features: [
            'Tutto di Pro',
            'Multi-sede',
            'Integrazioni su misura',
            'Account manager dedicato',
        ],
        highlight: false,
    },
];
</script>

<template>
    <AppLayout>
        <div class="renew-page">
            <div class="renew-container">
                <header class="renew-head">
                    <p class="text-overline">Abbonamento</p>
                    <h1 class="renew-title">Rinnova il tuo piano</h1>
                    <p class="renew-subtitle">
                        Scegli il piano più adatto alla tua attività. Puoi cambiarlo o disdirlo in qualsiasi momento.
                    </p>
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
                        <button type="button" class="plan-cta" :class="{ 'plan-cta-primary': p.highlight }" disabled>
                            Presto disponibile
                        </button>
                    </article>
                </section>

                <footer class="renew-footer">
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
    margin-bottom: var(--s-8);
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
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
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--paper);
    background: var(--ink);
    border-radius: 999px;
}

.plan-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink-3);
    margin: 0 0 var(--s-3);
    letter-spacing: -0.01em;
    text-transform: uppercase;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    letter-spacing: 0.14em;
}

.plan-price {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: var(--s-5);
}
.plan-amount {
    font-family: var(--f-sans, 'Geist', sans-serif);
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

.plan-cta {
    width: 100%;
    padding: 11px 18px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    cursor: not-allowed;
    opacity: 0.85;
    transition: background 120ms, border-color 120ms;
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
.renew-link {
    color: var(--ac);
    text-decoration: none;
    font-weight: 500;
    transition: color 120ms;
}
.renew-link:hover {
    color: color-mix(in oklab, var(--ac) 80%, var(--ink));
    text-decoration: underline;
}

@media (max-width: 640px) {
    .renew-container { padding: 0 var(--s-4); }
}
</style>
