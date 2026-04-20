<script setup>
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { onMounted, nextTick } from 'vue';

    const team = [
        { name: 'Filippo Manzini', role: 'Founder & Chief Technology', initials: 'FM', note: 'Architettura, backend, OCR.' },
        { name: 'Team Design', role: 'Design Studio', initials: 'DS', note: 'Sistema visivo Tavolo.' },
        { name: 'Partner Ristorativi', role: 'Early Adopters', initials: 'PR', note: 'Hanno forgiato il prodotto.' },
    ];

    const values = [
        { icon: 'bi-lightning-charge', title: 'Velocità', text: 'Ogni interazione sotto i 200ms. Ogni decisione, diretta.' },
        { icon: 'bi-shield-check', title: 'Affidabilità', text: 'La cassa chiude sempre. I dati non si perdono.' },
        { icon: 'bi-heart', title: 'Cura del dettaglio', text: 'Il design è il servizio.' },
    ];

    onMounted(() => {
        nextTick(() => {
            document.title = 'Chi siamo';
        });
    });
</script>

<template>
    <AppLayout>
        <div class="about-page">
            <div class="about-container">
                <header class="about-head">
                    <p class="text-overline">Chi siamo</p>
                    <h1 class="about-title">Costruiamo strumenti per chi vive di <em>servizio</em>.</h1>
                    <p class="about-lead">
                        Tavolo nasce da un'osservazione semplice: la ristorazione moderna merita software
                        moderno. Non un gestionale stanco, ma uno strumento che vale i margini di chi lo usa.
                    </p>
                </header>

                <section class="about-values">
                    <article v-for="v in values" :key="v.title" class="value-card">
                        <span class="value-icon"><i :class="['bi', v.icon]" aria-hidden="true"></i></span>
                        <h3 class="value-title">{{ v.title }}</h3>
                        <p class="value-text">{{ v.text }}</p>
                    </article>
                </section>

                <section class="about-team">
                    <header class="team-head">
                        <h2 class="team-title">Chi c'è dietro</h2>
                        <p class="team-sub">Un piccolo gruppo, un grande problema da risolvere.</p>
                    </header>
                    <div class="team-grid">
                        <article v-for="m in team" :key="m.name" class="team-card">
                            <div class="team-avatar" aria-hidden="true">{{ m.initials }}</div>
                            <h3 class="team-name">{{ m.name }}</h3>
                            <p class="team-role">{{ m.role }}</p>
                            <p class="team-note">{{ m.note }}</p>
                        </article>
                    </div>
                </section>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.about-page {
    padding: var(--s-8) 0 var(--s-9);
    background: var(--bg);
    min-height: calc(100vh - 64px);
    font-family: var(--f-sans, 'Geist', sans-serif);
}

.about-container {
    max-width: 960px;
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

.about-head {
    margin-bottom: var(--s-8);
    max-width: 680px;
}

.about-title {
    font-size: clamp(30px, 4vw, 44px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-4) 0;
    letter-spacing: -0.03em;
    line-height: 1.1;
}
.about-title em {
    position: relative;
    font-style: normal;
    color: var(--ac);
}
.about-title em::after {
    content: '';
    position: absolute;
    left: 0; right: 0; bottom: 2px;
    height: 8px;
    background: color-mix(in oklab, var(--ac) 20%, transparent);
    z-index: -1;
    border-radius: 2px;
}

.about-lead {
    font-size: 17px;
    color: var(--ink-2);
    line-height: 1.6;
    margin: 0;
    max-width: 620px;
}

.about-values {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--s-4);
    margin-bottom: var(--s-9);
}

.value-card {
    padding: var(--s-5);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    transition: transform 160ms, border-color 160ms;
}
.value-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in oklab, var(--ac) 30%, var(--line));
}

.value-icon {
    width: 40px; height: 40px;
    display: grid; place-items: center;
    background: color-mix(in oklab, var(--ac) 10%, var(--paper));
    color: var(--ac);
    border-radius: var(--r-sm);
    font-size: 18px;
    margin-bottom: var(--s-3);
}

.value-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 6px;
    letter-spacing: -0.01em;
}

.value-text {
    font-size: 14px;
    color: var(--ink-3);
    line-height: 1.55;
    margin: 0;
}

.about-team {
    padding-top: var(--s-6);
    border-top: 1px solid var(--line);
}

.team-head {
    margin-bottom: var(--s-5);
}
.team-title {
    font-size: 24px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 6px;
    letter-spacing: -0.02em;
}
.team-sub {
    font-size: 14px;
    color: var(--ink-3);
    margin: 0;
}

.team-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--s-4);
}

.team-card {
    padding: var(--s-5);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    text-align: left;
}

.team-avatar {
    width: 48px; height: 48px;
    display: grid; place-items: center;
    background: var(--ink);
    color: var(--paper);
    border-radius: 50%;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: var(--s-3);
}

.team-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 2px;
    letter-spacing: -0.01em;
}

.team-role {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ac);
    font-weight: 500;
    margin: 0 0 10px;
}

.team-note {
    font-size: 13px;
    color: var(--ink-3);
    line-height: 1.5;
    margin: 0;
}

@media (max-width: 640px) {
    .about-container { padding: 0 var(--s-4); }
}
</style>
