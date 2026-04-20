<script setup>
import AppLayout from '@/Layouts/AppLayout.vue';
import { onMounted, nextTick } from 'vue';

onMounted(async () => {
    nextTick(() => {
        document.title = 'Privacy policy';
    });
});

const sections = [
    {
        heading: '1. Titolare del trattamento',
        body: 'Il titolare del trattamento è Tavolo. Per ogni richiesta in materia di privacy puoi scriverci all\'indirizzo indicato in fondo a questa pagina.',
    },
    {
        heading: '2. Dati raccolti',
        body: 'Raccogliamo i dati di registrazione (email, nome del ristorante), i dati di configurazione (menu, tavoli, prenotazioni, ordini) e i dati tecnici necessari al funzionamento del servizio (log di accesso, indirizzo IP).',
    },
    {
        heading: '3. Finalità e base giuridica',
        body: 'Trattiamo i dati per erogare il servizio (esecuzione del contratto), per adempiere agli obblighi di legge (fatturazione, fiscalità) e, con il tuo consenso, per inviare comunicazioni di servizio.',
    },
    {
        heading: '4. Conservazione',
        body: 'I dati sono conservati per la durata del contratto e per i periodi successivi richiesti dalla normativa fiscale. Alla chiusura dell\'account i dati vengono cancellati entro 30 giorni, salvo obblighi di legge.',
    },
    {
        heading: '5. Sicurezza',
        body: 'Adottiamo misure tecniche e organizzative adeguate: cifratura in transito (TLS), controllo degli accessi, backup periodici, monitoraggio continuo degli eventi di sicurezza.',
    },
    {
        heading: '6. Diritti dell\'interessato',
        body: 'Hai diritto di accedere ai tuoi dati, rettificarli, cancellarli, limitarne il trattamento e riceverli in formato portabile. Puoi esercitare i tuoi diritti contattandoci in qualsiasi momento.',
    },
    {
        heading: '7. Cookie e tracciamento',
        body: 'Il servizio utilizza esclusivamente cookie tecnici necessari al funzionamento. Non utilizziamo cookie di profilazione o marketing di terze parti.',
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
                    <h1 class="legal-title">Privacy Policy</h1>
                    <p class="legal-meta">Ultimo aggiornamento: {{ lastUpdate }}</p>
                </header>

                <article class="legal-body">
                    <section v-for="s in sections" :key="s.heading" class="legal-section">
                        <h2 class="legal-heading">{{ s.heading }}</h2>
                        <p class="legal-text">{{ s.body }}</p>
                    </section>
                </article>

                <footer class="legal-footer">
                    <p>Per esercitare i tuoi diritti: <a href="mailto:filippomanzini02@outlook.com" class="legal-link">filippomanzini02@outlook.com</a></p>
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
