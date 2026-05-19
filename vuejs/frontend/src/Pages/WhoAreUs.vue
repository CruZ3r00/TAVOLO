<script setup>
import { onMounted, nextTick, ref } from 'vue';
import AppLayout from '@/Layouts/AppLayout.vue';
import PaperCardsScene from '@/components/PaperCardsScene.vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const sceneError = ref(false);

const team = [
  { name: 'Filippo Manzini', role: 'Founder & CTO', initials: 'FM', note: 'Architettura, backend, OCR.', accent: true },
  { name: 'Pietro Comelli', role: 'Co-Founder', initials: 'PC', note: 'Prodotto, design, partner ristorativi.', accent: false },
  { name: 'Mattia', role: 'Operations', initials: 'M', note: 'Onboarding e supporto sul campo.', accent: false },
];

const values = [
  { icon: '⚡', title: 'Velocità', text: 'Ogni interazione sotto i 200ms. Decisioni dirette in servizio.' },
  { icon: '🛡', title: 'Affidabilità', text: 'La cassa chiude sempre. I dati non si perdono mai.' },
  { icon: '✱', title: 'Cura del dettaglio', text: 'Il design è il servizio. Niente compromessi sulla forma.' },
];

const milestones = [
  { year: '2024', label: 'Prima riga di codice', sub: "Da un'osservazione in sala.", first: true },
  { year: '2025', label: 'Primi locali a bordo', sub: 'Pizzerie, trattorie, bar.', first: false },
  { year: '2026', label: 'Stack real-time', sub: 'Three.js, Supabase, multi-reparto.', first: false },
  { year: 'Oggi', label: 'Cresciamo coi nostri ristoranti', sub: 'Ogni feature nasce da una richiesta vera.', first: false },
];

const stats = [
  { v: '< 200ms', l: 'Tempo medio di interazione' },
  { v: '99.9%', l: 'Uptime garantito durante il servizio' },
  { v: '6 reparti', l: 'Coordinati in un solo flusso' },
];

onMounted(() => {
  nextTick(() => { document.title = 'Chi siamo · ComforTables'; });
});
</script>

<template>
  <AppLayout>
    <div class="wa-page">

      <!-- HERO con scena Three.js -->
      <section class="wa-hero">
        <div class="wa-scene-wrap" v-if="!sceneError">
          <PaperCardsScene variant="team" :height="520" @scene-error="sceneError = true" />
        </div>
        <div class="wa-scene-fallback" v-else></div>
        <div class="wa-scene-gradient" aria-hidden="true"></div>

        <div class="wa-hero-content">
          <span class="wa-badge">
            <span class="wa-badge-dot" aria-hidden="true"></span>
            Chi siamo
          </span>
          <h1 class="wa-hero-title">
            Costruiamo strumenti<br>
            per chi vive di <em class="wa-accent">servizio<span class="wa-accent-bg" aria-hidden="true"></span></em>.
          </h1>
          <p class="wa-hero-lead">
            COMFORTABLES nasce da un'osservazione semplice: la ristorazione moderna
            merita software moderno. Non un gestionale stanco — uno strumento che vale
            i margini di chi lo usa.
          </p>
        </div>
      </section>

      <!-- Manifesto numeri -->
      <section class="wa-numbers-section">
        <div class="wa-inner">
          <div class="wa-numbers-grid">
            <div v-for="s in stats" :key="s.v" class="wa-stat">
              <div class="wa-stat-value">{{ s.v }}</div>
              <div class="wa-stat-label">{{ s.l }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Valori -->
      <section class="wa-values-section">
        <div class="wa-inner">
          <div class="wa-section-head">
            <p class="wa-eyebrow">I nostri valori</p>
            <h2 class="wa-section-title">Tre principi, niente compromessi.</h2>
          </div>
          <div class="wa-values-grid">
            <article v-for="v in values" :key="v.title" class="wa-value-card">
              <div class="wa-value-icon" aria-hidden="true">{{ v.icon }}</div>
              <h3 class="wa-value-title">{{ v.title }}</h3>
              <p class="wa-value-text">{{ v.text }}</p>
            </article>
          </div>
        </div>
      </section>

      <!-- Timeline -->
      <section class="wa-timeline-section">
        <div class="wa-inner">
          <div class="wa-section-head centered">
            <p class="wa-eyebrow">Il percorso</p>
            <h2 class="wa-section-title">Costruito, riga per riga, accanto a chi serve.</h2>
          </div>
          <div class="wa-timeline">
            <div class="wa-timeline-line" aria-hidden="true"></div>
            <div v-for="m in milestones" :key="m.year" class="wa-milestone">
              <div class="wa-milestone-dot" :class="{ 'wa-milestone-dot--first': m.first }">{{ m.year }}</div>
              <div class="wa-milestone-label">{{ m.label }}</div>
              <div class="wa-milestone-sub">{{ m.sub }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Team -->
      <section class="wa-team-section">
        <div class="wa-inner">
          <div class="wa-section-head centered">
            <p class="wa-eyebrow">Il team</p>
            <h2 class="wa-section-title">Un piccolo gruppo, un grande problema da risolvere.</h2>
          </div>
          <div class="wa-team-grid">
            <article v-for="m in team" :key="m.name" class="wa-team-card" :class="{ 'wa-team-card--accent': m.accent }">
              <div v-if="m.accent" class="wa-team-accent-bar" aria-hidden="true"></div>
              <div class="wa-team-avatar" :class="{ 'wa-team-avatar--accent': m.accent }" aria-hidden="true">{{ m.initials }}</div>
              <h3 class="wa-team-name">{{ m.name }}</h3>
              <div class="wa-team-role">{{ m.role }}</div>
              <p class="wa-team-note">{{ m.note }}</p>
            </article>
          </div>
        </div>
      </section>

      <!-- CTA -->
      <section class="wa-cta-section">
        <div class="wa-inner centered">
          <h2 class="wa-cta-title">Vuoi che il tuo locale diventi il prossimo?</h2>
          <p class="wa-cta-sub">Bastano 5 minuti per provarlo. Niente carta richiesta.</p>
          <div class="wa-cta-buttons">
            <router-link to="/register" class="wa-btn-primary">Iscriviti ora <span aria-hidden="true">→</span></router-link>
            <router-link to="/contact-us" class="wa-btn-ghost">Contattaci</router-link>
          </div>
        </div>
      </section>

    </div>
  </AppLayout>
</template>

<style scoped>
.wa-page {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--f-sans);
  min-height: 100vh;
}

/* ── inner wrapper ── */
.wa-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 32px;
}
.wa-inner.centered,
.centered { text-align: center; }

/* ── HERO ── */
.wa-hero {
  position: relative;
  padding: 60px 0 80px;
  background: linear-gradient(180deg, var(--bg) 0%, var(--bg-sunk) 100%);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
}
.wa-scene-wrap {
  position: absolute;
  inset: 0;
  opacity: 0.9;
}
.wa-scene-fallback {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 60% 40%, var(--ac-soft), var(--bg-sunk));
}
.wa-scene-gradient {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 40% at 50% 30%, transparent, var(--bg) 80%);
  pointer-events: none;
}
.wa-hero-content {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 32px;
  position: relative;
  z-index: 1;
  text-align: center;
}

.wa-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--paper);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-2);
  margin-bottom: 28px;
  box-shadow: var(--shadow-xs);
}
.wa-badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--ac);
  flex-shrink: 0;
}

.wa-hero-title {
  margin: 0;
  font-size: clamp(36px, 5.5vw, 54px);
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--ink);
  max-width: 780px;
  margin-inline: auto;
}
.wa-accent {
  font-style: normal;
  color: var(--ac);
  position: relative;
}
.wa-accent-bg {
  position: absolute;
  left: 0; right: 0; bottom: 4px;
  height: 10px;
  background: var(--ac-soft);
  z-index: -1;
  border-radius: 2px;
  display: block;
}

.wa-hero-lead {
  margin: 24px auto 0;
  max-width: 580px;
  font-size: 17px;
  line-height: 1.6;
  color: var(--ink-2);
}

/* ── NUMBERS ── */
.wa-numbers-section {
  padding: 64px 32px;
}
.wa-numbers-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 32px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow-xs);
}
.wa-stat {
  text-align: center;
}
.wa-stat-value {
  font-size: clamp(28px, 4vw, 38px);
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.03em;
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.wa-stat-label {
  font-size: 13px;
  color: var(--ink-3);
  margin-top: 8px;
  line-height: 1.4;
}

/* ── VALUES ── */
.wa-values-section {
  padding: 0 32px 80px;
}
.wa-section-head {
  margin-bottom: 36px;
  max-width: 600px;
}
.wa-section-head.centered {
  margin-inline: auto;
}
.wa-eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  margin: 0 0 8px;
}
.wa-section-title {
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
  color: var(--ink);
  margin: 0;
}
.wa-values-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.wa-value-card {
  padding: 24px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 16px;
  transition: border-color var(--dur), transform var(--dur);
}
.wa-value-card:hover {
  border-color: color-mix(in oklab, var(--ac) 35%, var(--line));
  transform: translateY(-2px);
}
.wa-value-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--ac-soft);
  color: var(--ac);
  display: grid;
  place-items: center;
  font-size: 20px;
  margin-bottom: 18px;
}
.wa-value-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--ink);
}
.wa-value-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-3);
}

/* ── TIMELINE ── */
.wa-timeline-section {
  padding: 80px 32px;
  background: var(--bg-sunk);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.wa-timeline {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  position: relative;
  margin-top: 48px;
}
.wa-timeline-line {
  position: absolute;
  top: 30px;
  left: 30px;
  right: 30px;
  height: 2px;
  background: linear-gradient(90deg, var(--ac) 0%, var(--line) 100%);
  opacity: 0.5;
  pointer-events: none;
}
.wa-milestone {
  text-align: center;
  position: relative;
  padding: 0 8px;
}
.wa-milestone-dot {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--paper);
  border: 2px solid var(--line-strong);
  color: var(--ink);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  margin: 0 auto 16px;
  font-family: var(--f-mono);
  letter-spacing: -0.01em;
  position: relative;
  z-index: 1;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--dur);
}
.wa-milestone-dot--first {
  background: var(--ac);
  border-color: var(--ac);
  color: var(--ac-contrast);
}
.wa-milestone-label {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 4px;
  line-height: 1.3;
}
.wa-milestone-sub {
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.4;
}

/* ── TEAM ── */
.wa-team-section {
  padding: 80px 32px;
}
.wa-team-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 48px;
}
.wa-team-card {
  padding: 28px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.wa-team-card:hover {
  border-color: color-mix(in oklab, var(--ac) 25%, var(--line));
  box-shadow: var(--shadow-sm);
}
.wa-team-accent-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--ac);
}
.wa-team-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--bg);
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 700;
  font-family: var(--f-mono);
  margin-bottom: 16px;
  letter-spacing: -0.01em;
}
.wa-team-avatar--accent {
  background: var(--ac);
  color: var(--ac-contrast);
}
.wa-team-name {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--ink);
}
.wa-team-role {
  font-family: var(--f-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ac);
  font-weight: 500;
  margin-bottom: 12px;
}
.wa-team-note {
  margin: 0;
  font-size: 13.5px;
  color: var(--ink-3);
  line-height: 1.5;
}

/* ── CTA ── */
.wa-cta-section {
  padding: 80px 32px;
  background: var(--bg-sunk);
  border-top: 1px solid var(--line);
}
.wa-cta-title {
  margin: 0 auto 16px;
  font-size: clamp(26px, 3.5vw, 36px);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
  color: var(--ink);
  max-width: 720px;
}
.wa-cta-sub {
  margin: 0 auto 28px;
  max-width: 520px;
  font-size: 16px;
  color: var(--ink-3);
  line-height: 1.55;
}
.wa-cta-buttons {
  display: inline-flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}
.wa-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 22px;
  border-radius: 12px;
  border: 1px solid var(--ac);
  background: var(--ac);
  color: var(--ac-contrast);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity var(--dur);
}
.wa-btn-primary:hover { opacity: 0.88; }
.wa-btn-ghost {
  display: inline-flex;
  align-items: center;
  height: 52px;
  padding: 0 22px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink);
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  transition: border-color var(--dur), background var(--dur);
}
.wa-btn-ghost:hover { border-color: var(--ink); background: var(--bg-hover); }

/* ── RESPONSIVE ── */
@media (max-width: 860px) {
  .wa-inner { padding: 0 20px; }
  .wa-hero-content { padding: 0 20px; }
  .wa-numbers-grid { grid-template-columns: 1fr; gap: 16px; padding: 24px; }
  .wa-values-grid { grid-template-columns: 1fr; }
  .wa-timeline { grid-template-columns: 1fr; }
  .wa-timeline-line { display: none; }
  .wa-milestone { display: flex; gap: 16px; text-align: left; align-items: flex-start; margin-bottom: 20px; }
  .wa-milestone-dot { margin: 0; flex-shrink: 0; width: 48px; height: 48px; font-size: 10px; }
  .wa-team-grid { grid-template-columns: 1fr; }
  .wa-numbers-section { padding: 40px 20px; }
  .wa-values-section { padding: 0 20px 48px; }
  .wa-timeline-section { padding: 48px 20px; }
  .wa-team-section { padding: 48px 20px; }
  .wa-cta-section { padding: 48px 20px; }
}

@media (max-width: 640px) {
  .wa-hero { padding: 40px 0 60px; }
  .wa-hero-title { font-size: 30px; }
}
</style>
