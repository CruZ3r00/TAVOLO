<script setup>
import AppLayout from '@/Layouts/AppLayout.vue';
import { onMounted, nextTick } from 'vue';

onMounted(async () => {
    nextTick(() => {
        document.title = 'Termini del servizio';
    });
});

const sections = [
    {
        heading: '1. Oggetto del servizio',
        body: 'Tavolo fornisce un gestionale SaaS per la ristorazione che comprende gestione del menu, prenotazioni, ordinazioni e configurazione del sito pubblico. L\'uso del servizio è soggetto all\'accettazione dei presenti termini.',
    },
    {
        heading: '2. Account e responsabilità',
        body: 'Il cliente è responsabile della custodia delle credenziali di accesso e delle attività svolte dal proprio account. Notifica tempestivamente ogni uso non autorizzato.',
    },
    {
        heading: '3. Dati e proprietà',
        body: 'Il cliente mantiene la proprietà dei dati inseriti (menu, prenotazioni, ordini). Tavolo può trattare i dati esclusivamente per erogare il servizio, nel rispetto della normativa vigente.',
    },
    {
        heading: '4. Fatturazione e sospensione',
        body: 'L\'accesso al servizio è vincolato al pagamento del canone nei termini concordati. In caso di mancato pagamento, Tavolo può sospendere l\'accesso previa notifica.',
    },
    {
        heading: '5. Limitazione di responsabilità',
        body: 'Tavolo si impegna a garantire la continuità del servizio, ma non risponde di danni derivanti da malfunzionamenti di reti, servizi terzi o cause di forza maggiore.',
    },
    {
        heading: '6. Recesso',
        body: 'Il cliente può recedere in qualsiasi momento. L\'esportazione dei dati resta disponibile per 30 giorni dalla chiusura.',
    },
    {
        heading: '7. Modifiche',
        body: 'Tavolo può aggiornare i presenti termini con preavviso di 30 giorni. La prosecuzione dell\'uso del servizio costituisce accettazione delle modifiche.',
    },
];

const lastUpdate = '20 aprile 2026';
</script>

<template>
    <AppLayout>
        <div class="legal-page">
            <div class="legal-container">
                <header class="legal-head">
                    <p class="text-overline">Legale</p>
                    <h1 class="legal-title">Termini del Servizio</h1>
                    <p class="legal-meta">Ultimo aggiornamento: {{ lastUpdate }}</p>
                </header>

                <article class="legal-body">
                    <section v-for="s in sections" :key="s.heading" class="legal-section">
                        <h2 class="legal-heading">{{ s.heading }}</h2>
                        <p class="legal-text">{{ s.body }}</p>
                    </section>
                </article>

                <footer class="legal-footer">
                    <p>Per domande: <a href="mailto:filippomanzini02@outlook.com" class="legal-link">filippomanzini02@outlook.com</a></p>
                </footer>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.legal-page {
    padding: var(--s-8) 0 var(--s-9);
    background: var(--bg);
    min-height: calc(100vh - 64px);
    font-family: var(--f-sans, 'Geist', sans-serif);
}

.legal-container {
    max-width: 760px;
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

.legal-head {
    margin-bottom: var(--s-7);
    padding-bottom: var(--s-5);
    border-bottom: 1px solid var(--line);
}

.legal-title {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-2) 0;
    letter-spacing: -0.03em;
    line-height: 1.1;
}

.legal-meta {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    color: var(--ink-3);
    margin: 0;
    letter-spacing: 0.02em;
}

.legal-body {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
}

.legal-section {
    padding: 0;
}

.legal-heading {
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-2) 0;
    letter-spacing: -0.01em;
}

.legal-text {
    font-size: 15px;
    color: var(--ink-2);
    line-height: 1.65;
    margin: 0;
}

.legal-footer {
    margin-top: var(--s-8);
    padding-top: var(--s-5);
    border-top: 1px solid var(--line);
    font-size: 13px;
    color: var(--ink-3);
}
.legal-footer p { margin: 0; }

.legal-link {
    color: var(--ac);
    text-decoration: none;
    font-weight: 500;
    transition: color 120ms;
}
.legal-link:hover {
    color: color-mix(in oklab, var(--ac) 80%, var(--ink));
    text-decoration: underline;
}

@media (max-width: 640px) {
    .legal-container { padding: 0 var(--s-4); }
}
</style>
