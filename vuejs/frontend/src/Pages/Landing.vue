<script setup>
import { onMounted, nextTick } from 'vue';
import AppLayout from '@/Layouts/AppLayout.vue';

const serviceProblems = [
  'ordini che non arrivano al reparto giusto',
  'confusione tra sala e cucina',
  'stati non chiari: in preparazione, pronto, servito',
  'troppe comunicazioni a voce',
];

const flowSteps = [
  {
    title: 'Il cameriere inserisce l’ordine',
    body: 'Dal tavolo o da una prenotazione, con note e quantità già ordinate.',
  },
  {
    title: 'Ogni reparto vede solo i suoi piatti',
    body: 'Cucina, bar, pizzeria e altri reparti ricevono la propria coda.',
  },
  {
    title: 'Gli stati avanzano',
    body: 'Da preso a in preparazione, poi pronto, senza chiamate continue.',
  },
  {
    title: 'La sala serve senza errori',
    body: 'Il cameriere vede cosa è pronto e chiude il giro al tavolo.',
  },
];

const features = [
  { icon: 'bi-grid-3x3-gap', title: 'Gestione tavoli', body: 'Tavoli liberi, occupati e ordini aperti sempre visibili.' },
  { icon: 'bi-calendar-check', title: 'Prenotazioni e walk-in', body: 'Prenotazioni, arrivi senza prenotazione e sala nello stesso flusso.' },
  { icon: 'bi-receipt', title: 'Ordini multi-reparto', body: 'Un ordine unico può andare a cucina, bar, pizzeria e altri reparti.' },
  { icon: 'bi-funnel', title: 'Filtri per reparto', body: 'Ogni reparto lavora solo le categorie che gli competono.' },
  { icon: 'bi-arrow-repeat', title: 'Stati ordine in tempo reale', body: 'Preparazione, pronto e servito aggiornati durante il servizio.' },
  { icon: 'bi-people', title: 'Ruoli operativi', body: 'Owner, cameriere, cucina, bar e pizzeria con accessi separati.' },
  { icon: 'bi-diagram-3', title: 'Coordinamento reparti', body: 'Sala, cucina e bar restano sincronizzati senza messaggi sparsi.' },
];

const plans = [
  {
    key: 'starter',
    name: 'Essenziale',
    price: '€ 39,99',
    period: '/ mese',
    label: 'Per partire ordinati',
    body: 'Per locali che vogliono gestire sala, ordini e cucina senza complicare il servizio.',
    features: [
      'Vista sala e tavoli',
      'Prenotazioni e walk-in',
      'Ordini verso cucina',
      'Account cameriere e cucina',
      'Menu digitale con QR',
    ],
  },
  {
    key: 'pro',
    name: 'Professionale',
    price: '€ 74,99',
    period: '/ mese',
    label: 'Per più reparti al lavoro',
    body: 'Per ristoranti, pizzerie e bar con cucina che devono dividere le comande tra più postazioni.',
    features: [
      'Tutto del piano Essenziale',
      'Reparti bar, pizzeria e cucina SG',
      'Smistamento automatico per categoria',
      'Ruoli staff più specifici',
      'Statistiche storiche e report',
    ],
    highlighted: true,
  },
];

onMounted(() => {
  nextTick(() => { document.title = 'COMFORTABLES · Gestionale ristorante in tempo reale'; });
});
</script>

<template>
  <AppLayout variant="public" page-title="COMFORTABLES">
    <div class="dashboard-public">
      <section class="public-hero">
        <div class="public-container">
          <div class="public-hero-head">
            <span class="public-eyebrow">
              <span class="tv-pulse"></span>
              Gestionale per ristoranti piccoli e medi
            </span>
            <h1>
              Gestisci sala, ordini e reparti <em>in tempo reale.</em>
            </h1>
            <p>
              COMFORTABLES collega tavoli, prenotazioni e reparti: il cameriere prende
              l’ordine, ogni reparto vede solo ciò che deve preparare, e la sala segue
              tutto senza confusione.
            </p>
            <div class="public-cta" aria-label="Azioni principali">
              <router-link to="/register" class="btn btn-lg btn-accent btn-pill">
                Prova gratis 14 giorni <i class="bi bi-arrow-right" aria-hidden="true"></i>
              </router-link>
              <a href="#come-funziona" class="btn btn-lg btn-pill">
                <i class="bi bi-play-circle" aria-hidden="true"></i> Guarda come funziona
              </a>
            </div>
            <div class="public-microcopy">Nessun vincolo. Puoi disdire quando vuoi.</div>
          </div>
        </div>
      </section>

      <section class="public-problem" aria-labelledby="problem-title">
        <div class="public-container">
          <div class="public-split">
            <div class="public-section-copy">
              <div class="overline">Il problema</div>
              <h2 id="problem-title">Quando il servizio si complica</h2>
              <p>
                Nei momenti pieni basta poco: un piatto detto a voce, una comanda
                persa, un reparto che non sa cosa deve preparare.
              </p>
            </div>
            <ul class="public-problem-list">
              <li v-for="item in serviceProblems" :key="item">
                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="public-solution" aria-labelledby="solution-title">
        <div class="public-container">
          <div class="public-section-h">
            <div class="overline">La soluzione</div>
            <h2 id="solution-title">Un flusso unico, chiaro</h2>
            <p>
              Con COMFORTABLES ogni ordine segue un flusso preciso: viene inserito in sala,
              distribuito automaticamente ai reparti e aggiornato in tempo reale fino al servizio.
            </p>
          </div>
        </div>
      </section>

      <section id="come-funziona" class="public-flow" aria-labelledby="flow-title">
        <div class="public-container">
          <div class="public-section-h">
            <div class="overline">Come funziona</div>
            <h2 id="flow-title">Dal tavolo al reparto, senza passaggi a voce.</h2>
          </div>
          <div class="public-flow-grid">
            <article v-for="(step, index) in flowSteps" :key="step.title" class="public-flow-step">
              <span class="public-flow-number">{{ index + 1 }}</span>
              <h3>{{ step.title }}</h3>
              <p>{{ step.body }}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="public-features" aria-labelledby="features-title">
        <div class="public-container">
          <div class="public-section-h">
            <div class="overline">Funzionalità operative</div>
            <h2 id="features-title">Tutto quello che serve durante il servizio.</h2>
          </div>
          <div class="public-features-grid">
            <article v-for="feature in features" :key="feature.title" class="public-feature">
              <div class="public-feature-icon">
                <i :class="['bi', feature.icon]" aria-hidden="true"></i>
              </div>
              <h3>{{ feature.title }}</h3>
              <p>{{ feature.body }}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="public-benefit" aria-labelledby="benefit-title">
        <div class="public-container">
          <div class="public-benefit-inner">
            <div>
              <div class="overline">Beneficio chiave</div>
              <h2 id="benefit-title">Meno confusione. Più controllo.</h2>
            </div>
            <p>
              Ogni persona vede solo ciò che deve fare. Tutto il resto è già organizzato.
            </p>
          </div>
        </div>
      </section>

      <section class="public-plans" aria-labelledby="plans-title">
        <div class="public-container">
          <div class="public-section-h">
            <div class="overline">Piani</div>
            <h2 id="plans-title">Scegli in base a come lavora il tuo locale.</h2>
            <p>
              I piani non cambiano solo il prezzo: cambiano quanti reparti puoi coordinare
              e quanto dettaglio hai nella gestione del servizio.
            </p>
          </div>
          <div class="public-plans-grid">
            <article
              v-for="plan in plans"
              :key="plan.key"
              class="public-plan"
              :class="{ 'public-plan-highlight': plan.highlighted }"
            >
              <div v-if="plan.highlighted" class="public-plan-tag">Consigliato</div>
              <div class="public-plan-label">{{ plan.label }}</div>
              <h3>{{ plan.name }}</h3>
              <div class="public-plan-price">
                <span>{{ plan.price }}</span>
                <small>{{ plan.period }}</small>
              </div>
              <p>{{ plan.body }}</p>
              <ul>
                <li v-for="feature in plan.features" :key="feature">
                  <i class="bi bi-check2" aria-hidden="true"></i>
                  <span>{{ feature }}</span>
                </li>
              </ul>
              <router-link to="/register" class="btn btn-lg btn-pill" :class="{ 'btn-accent': plan.highlighted }">
                Prova gratis 14 giorni
              </router-link>
            </article>
          </div>
        </div>
      </section>

      <section class="public-cta-box">
        <div class="public-container">
          <div class="public-cta-inner">
            <div>
              <div class="overline" style="color: color-mix(in oklab, white 60%, transparent);">Prova gratuita</div>
              <h3>Prova gratis 14 giorni.</h3>
              <p>Nessun vincolo. Puoi disdire quando vuoi.</p>
            </div>
            <div class="public-cta-actions">
              <router-link to="/register" class="btn btn-lg btn-pill btn-accent">
                Prova gratis 14 giorni <i class="bi bi-arrow-right" aria-hidden="true"></i>
              </router-link>
              <a href="#come-funziona" class="btn btn-lg btn-pill">
                <i class="bi bi-play-circle" aria-hidden="true"></i> Guarda come funziona
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<style scoped>
.dashboard-public {
  font-family: var(--f-sans);
  letter-spacing: -0.005em;
  line-height: 1.5;
  background: var(--bg);
}
.dashboard-public em { font-style: normal; color: var(--ac); }
.public-container { max-width: 1180px; margin: 0 auto; padding: 0 24px; }

.public-hero {
  position: relative;
  padding: 80px 0 72px;
  background:
    radial-gradient(60% 60% at 80% 0%, color-mix(in oklab, var(--ac) 12%, transparent), transparent 60%),
    radial-gradient(50% 50% at 0% 30%, color-mix(in oklab, var(--info) 8%, transparent), transparent 60%),
    var(--bg);
  overflow: hidden;
}
.public-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, color-mix(in oklab, var(--ink) 4%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in oklab, var(--ink) 4%, transparent) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black, transparent 80%);
  pointer-events: none;
}
.public-hero .public-container { position: relative; z-index: 1; }

.public-hero-head { text-align: center; max-width: 920px; margin: 0 auto; }
.public-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--paper); border: 1px solid var(--line);
  padding: 6px 14px 6px 10px; border-radius: 999px;
  font-size: 12.5px; font-weight: 500; color: var(--ink-2);
  margin-bottom: 28px; box-shadow: var(--shadow-xs);
}
.public-hero h1 {
  font-size: clamp(36px, 5vw, 60px); line-height: 1.05;
  letter-spacing: -0.035em; font-weight: 600;
  margin: 0 0 24px; color: var(--ink); text-wrap: balance;
}
.public-hero p {
  font-size: clamp(15px, 1.6vw, 19px); line-height: 1.55;
  color: var(--ink-2); max-width: 760px; margin: 0 auto 32px; text-wrap: pretty;
}
.public-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 14px; }
.public-microcopy { font-size: 13px; color: var(--ink-3); }

.public-problem,
.public-flow,
.public-benefit,
.public-plans {
  padding: 72px 0;
  background: var(--bg);
}
.public-solution,
.public-features {
  padding: 72px 0;
  background: var(--bg-sunk, var(--bg-2));
}

.public-section-h { max-width: 760px; margin: 0 auto 44px; text-align: center; }
.public-section-h h2,
.public-section-copy h2,
.public-benefit h2 {
  font-size: clamp(28px, 3.6vw, 44px); line-height: 1.1;
  letter-spacing: -0.03em; font-weight: 600; margin: 12px 0 0;
  color: var(--ink); text-wrap: balance;
}
.public-section-h p,
.public-section-copy p,
.public-benefit p {
  margin: 16px 0 0;
  font-size: 16px;
  color: var(--ink-2);
  line-height: 1.6;
}

.public-split {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 40px;
  align-items: center;
}
.public-section-copy { max-width: 520px; }
.public-problem-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.public-problem-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 18px;
  color: var(--ink-2);
  box-shadow: var(--shadow-xs);
}
.public-problem-list i { color: var(--warn, var(--ac)); font-size: 18px; }

.public-flow-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.public-flow-step {
  position: relative;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 22px;
  min-height: 190px;
}
.public-flow-number {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--ac-soft);
  color: var(--ac);
  font-weight: 700;
  margin-bottom: 18px;
}
.public-flow-step h3,
.public-feature h3 {
  margin: 0 0 8px;
  font-size: 18px;
  letter-spacing: -0.02em;
  font-weight: 600;
  color: var(--ink);
}
.public-flow-step p,
.public-feature p {
  margin: 0;
  font-size: 14px;
  color: var(--ink-2);
  line-height: 1.5;
}

.public-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.public-feature {
  background: var(--paper); border: 1px solid var(--line);
  border-radius: 14px; padding: 24px;
  transition: transform var(--dur), box-shadow var(--dur), border-color var(--dur);
}
.public-feature:hover {
  transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--line-strong);
}
.public-feature-icon {
  width: 44px; height: 44px;
  background: var(--ac-soft); border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ac); font-size: 22px; margin-bottom: 16px;
}

.public-benefit-inner {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 42px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr);
  gap: 28px;
  align-items: center;
  box-shadow: var(--shadow-xs);
}
.public-benefit p { margin: 0; font-size: 18px; }

.public-plans-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: stretch;
}
.public-plan {
  position: relative;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 30px;
  box-shadow: var(--shadow-xs);
}
.public-plan-highlight {
  border-color: color-mix(in oklab, var(--ac) 45%, var(--line));
  box-shadow: var(--shadow-md);
}
.public-plan-tag {
  position: absolute;
  top: 18px;
  right: 18px;
  background: var(--ac);
  color: var(--paper);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}
.public-plan-label {
  color: var(--ink-3);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}
.public-plan h3 {
  margin: 0 0 12px;
  color: var(--ink);
  font-size: 26px;
  letter-spacing: -0.03em;
}
.public-plan-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 14px;
}
.public-plan-price span {
  color: var(--ink);
  font-size: 34px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.035em;
}
.public-plan-price small { color: var(--ink-3); font-size: 14px; }
.public-plan p {
  margin: 0 0 20px;
  color: var(--ink-2);
  font-size: 15px;
  line-height: 1.55;
}
.public-plan ul {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: grid;
  gap: 10px;
}
.public-plan li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--ink-2);
  font-size: 14px;
}
.public-plan li i {
  color: var(--ok);
  margin-top: 2px;
}

.public-cta-box { padding: 72px 0 80px; background: var(--bg); }
.public-cta-inner {
  background: var(--ink); color: var(--paper);
  border-radius: 24px; padding: 56px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 32px; flex-wrap: wrap;
  background:
    radial-gradient(80% 80% at 100% 0%, color-mix(in oklab, var(--ac) 50%, var(--ink)), var(--ink) 70%);
}
.public-cta-inner h3 { margin: 8px 0 12px; font-size: 28px; letter-spacing: -0.03em; font-weight: 600; }
.public-cta-inner p { margin: 0; opacity: 0.78; font-size: 15px; max-width: 440px; }
.public-cta-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.public-cta-inner :deep(.btn) {
  background: color-mix(in oklab, var(--paper) 12%, transparent);
  border-color: color-mix(in oklab, var(--paper) 25%, transparent);
  color: var(--paper);
}
.public-cta-inner :deep(.btn:hover) { background: color-mix(in oklab, var(--paper) 22%, transparent); }
.public-cta-inner :deep(.btn-accent) {
  background: var(--paper); color: var(--ink); border-color: var(--paper);
}
.public-cta-inner :deep(.btn-accent:hover) { background: color-mix(in oklab, var(--paper) 90%, var(--ac)); }

@media (max-width: 1080px) {
  .public-features-grid { grid-template-columns: 1fr 1fr; }
  .public-flow-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 820px) {
  .public-split,
  .public-benefit-inner,
  .public-plans-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 720px) {
  .public-hero { padding: 56px 0; }
  .public-problem,
  .public-solution,
  .public-flow,
  .public-features,
  .public-benefit,
  .public-plans { padding: 56px 0; }
  .public-features-grid,
  .public-flow-grid { grid-template-columns: 1fr; }
  .public-flow-step { min-height: 0; }
  .public-cta-box { padding: 40px 0; }
  .public-cta-inner,
  .public-benefit-inner { padding: 32px; }
  .public-cta-inner h3 { font-size: 22px; }
}
</style>
