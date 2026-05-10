<script setup>
import { defineAsyncComponent, nextTick, onMounted, ref } from 'vue';
import AppLayout from '@/Layouts/AppLayout.vue';

const LandingHeroScene = defineAsyncComponent(() => import('@/components/LandingHeroScene.vue'));

const canUseHeroScene = ref(false);
const canUseFeatureFlipDeck = ref(false);
const canUsePlanOrbit = ref(false);

const LandingFeatureFlipDeck = defineAsyncComponent({
  loader: () => import('@/components/LandingFeatureFlipDeck.vue'),
  onError(error, _retry, fail) {
    console.warn('Landing feature deck unavailable', error);
    canUseFeatureFlipDeck.value = false;
    fail(error);
  },
});

const LandingPlansOrbit = defineAsyncComponent({
  loader: () => import('@/components/LandingPlansOrbit.vue'),
  onError(error, _retry, fail) {
    console.warn('Landing plans orbit unavailable', error);
    canUsePlanOrbit.value = false;
    fail(error);
  },
});

const supportsWebGL = () => {
  if (typeof window === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const context = window.WebGLRenderingContext
    && (canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) || canvas.getContext('experimental-webgl'));

  if (!context) return false;
  context.getExtension?.('WEBGL_lose_context')?.loseContext?.();
  return true;
};

const serviceProblems = [
  { icon: 'bi-signpost-split', title: 'Ordini smistati', body: 'Ogni comanda arriva al reparto giusto.' },
  { icon: 'bi-chat-square-text', title: 'Meno passaggi a voce', body: 'Sala e cucina leggono lo stesso stato.' },
  { icon: 'bi-bag-check', title: 'Asporto nel flusso', body: 'Take away da telefono e sito nella stessa coda.' },
  { icon: 'bi-activity', title: 'Stati chiari', body: 'Preso, in preparazione, pronto, servito.' },
];

const flowSteps = [
  {
    title: 'Il cameriere inserisce l’ordine',
    body: 'Dal tavolo, da una prenotazione o da una richiesta take away.',
    code: 'T7',
    meta: 'Sala · nuovo ordine',
    items: ['Risotto ai funghi', 'Acqua naturale', 'Tiramisù'],
    status: 'Preso',
    icon: 'bi-pencil-square',
    tilt: '-1.8deg',
  },
  {
    title: 'Ogni reparto vede solo i suoi piatti',
    body: 'Cucina, bar, pizzeria e altri reparti ricevono la propria coda.',
    code: 'K',
    meta: 'Cucina · reparto',
    items: ['Risotto ai funghi', 'Tagliata media', 'Verdure grigliate'],
    status: 'In preparazione',
    icon: 'bi-fire',
    tilt: '1.2deg',
  },
  {
    title: 'Gli stati avanzano',
    body: 'Da preso a in preparazione, poi pronto, senza chiamate continue.',
    code: 'B',
    meta: 'Bar · sincronizzato',
    items: ['Acqua naturale', 'Calice rosso', 'Caffè'],
    status: 'Pronto',
    icon: 'bi-check2-circle',
    tilt: '-0.8deg',
  },
  {
    title: 'La sala serve senza errori',
    body: 'Il cameriere vede cosa è pronto, chiude il tavolo o consegna l’asporto.',
    code: 'A12',
    meta: 'Asporto · ritiro 19:10',
    items: ['Burger classico', 'Patate', 'Bibita'],
    status: 'Da ritirare',
    icon: 'bi-bag-check',
    tilt: '1.7deg',
  },
];

const features = [
  { icon: 'bi-grid-3x3-gap', title: 'Gestione tavoli', body: 'Tavoli liberi, occupati e ordini aperti sempre visibili.' },
  { icon: 'bi-calendar-check', title: 'Prenotazioni e walk-in', body: 'Prenotazioni, arrivi senza prenotazione e sala nello stesso flusso.' },
  { icon: 'bi-bag-check', title: 'Take away da telefono e sito', body: 'Ordini da telefono o sito web gestiti nella stessa coda operativa.' },
  { icon: 'bi-receipt', title: 'Ordini multi-reparto', body: 'Un ordine unico può andare a cucina, bar, pizzeria e altri reparti.' },
  { icon: 'bi-funnel', title: 'Filtri per reparto', body: 'Ogni reparto lavora solo le categorie che gli competono.' },
  { icon: 'bi-arrow-repeat', title: 'Stati ordine in tempo reale', body: 'Preparazione, pronto e servito aggiornati durante il servizio.' },
  { icon: 'bi-people', title: 'Ruoli operativi', body: 'Owner, cameriere, cucina, bar e pizzeria con accessi separati.' },
];

const heroMetrics = [
  { value: 'Sala', label: 'tavoli e walk-in' },
  { value: 'Cucina', label: 'reparti sincronizzati' },
  { value: 'Asporto', label: 'telefono e sito' },
];

const plans = [
  {
    key: 'starter',
    name: 'Essenziale',
    price: '€ 39,99',
    period: '/ mese',
    label: 'Flusso unico, subito chiaro',
    body: 'Per locali che vogliono gestire sala, tavoli, asporto e cucina in un unico flusso operativo.',
    focus: 'Tutte le comande arrivano a un profilo cucina centrale. Il profilo cameriere resta sempre attivo e la cucina vede l’intera coda da preparare.',
    features: [
      'Vista sala, tavoli, prenotazioni e walk-in',
      'Ordini e take away verso un unico profilo cucina',
      'Account cameriere e cucina sempre inclusi',
      'Menu digitale con QR e gestione stati ordine',
      'Ideale quando un solo banco coordina tutte le preparazioni',
    ],
    note: 'Puoi comunque revisionare gli ordini e seguire lo stato del servizio senza configurare reparti separati.',
  },
  {
    key: 'pro',
    name: 'Professionale',
    price: '€ 74,99',
    period: '/ mese',
    label: 'Reparti guidati e ruoli privati',
    body: 'Per ristoranti, pizzerie e bar con piu postazioni che devono separare automaticamente le comande.',
    focus: 'Sblocca profili semi custom guidati: cucina, bar, pizzeria e cucina SG ricevono solo le categorie assegnate, con revisione manuale sempre possibile.',
    features: [
      'Tutto del piano Essenziale',
      'Smistamento automatico delle comande per ambiente',
      'Account privato per ogni tipo di impiegato',
      'Ogni reparto vede solo le informazioni necessarie',
      'Accesso in anteprima beta alle nuove funzionalita',
      'A breve: gestione ingredienti e magazzino',
    ],
    note: 'Pensato per ridurre rumore in servizio: il bar non legge la cucina, la pizzeria non riceve il banco e la cucina SG resta separata.',
    highlighted: true,
  },
];

// Su legacy build (Vue 2.7 / browser molto vecchi) Three.js puo' fallire al
// runtime anche se WebGL formalmente esiste. Per questo il hero resta legato a
// WebGL + modern build; feature e piani sono DOM/CSS e possono girare anche in
// legacy, salvo preferenza di movimento ridotto.
// eslint-disable-next-line no-undef
const isModernBuild = typeof __MODERN__ !== 'undefined' ? __MODERN__ : true;

onMounted(() => {
  nextTick(() => { document.title = 'COMFORTABLES · Gestionale ristorante in tempo reale'; });
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  canUseHeroScene.value = isModernBuild && !prefersReducedMotion && supportsWebGL();
  canUseFeatureFlipDeck.value = !prefersReducedMotion;
  canUsePlanOrbit.value = !prefersReducedMotion;
});
</script>

<template>
  <AppLayout variant="public" page-title="COMFORTABLES">
    <div class="dashboard-public">
      <section class="public-hero">
        <div class="public-hero-scene-wrap">
          <LandingHeroScene v-if="canUseHeroScene" @scene-error="canUseHeroScene = false" />
          <div v-else class="public-hero-static" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
          </div>
        </div>
        <div class="public-container">
          <div class="public-hero-grid">
            <div class="public-hero-head">
              <span class="public-eyebrow">
                <span class="tv-pulse"></span>
                Gestionale SaaS per ristoranti operativi
              </span>
              <h1>
                Sala, cucina e take away sotto controllo <em>in tempo reale.</em>
              </h1>
              <p>
                COMFORTABLES collega tavoli, prenotazioni, reparti e ordini da asporto:
                il lavoro entra in un unico flusso, ogni postazione vede cosa deve fare
                e il servizio resta leggibile anche quando il locale accelera.
              </p>
              <div class="public-cta" aria-label="Azioni principali">
                <router-link to="/register" class="btn btn-lg btn-accent btn-pill">
                  Iscriviti ora <i class="bi bi-arrow-right" aria-hidden="true"></i>
                </router-link>
                <a href="#come-funziona" class="btn btn-lg btn-pill">
                  <i class="bi bi-play-circle" aria-hidden="true"></i> Guarda come funziona
                </a>
              </div>
              <div class="public-microcopy">Login e registrazione restano leggeri anche su browser datati.</div>
              <dl class="public-hero-metrics" aria-label="Aree operative coperte">
                <div v-for="metric in heroMetrics" :key="metric.value">
                  <dt>{{ metric.value }}</dt>
                  <dd>{{ metric.label }}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section class="public-card-scroll" aria-labelledby="problem-title">
        <div class="public-container">
          <article class="public-context-inner public-stack-card public-stack-card-a">
            <div class="public-section-copy">
              <div class="overline">Dal caos al controllo</div>
              <h2 id="problem-title">Meno confusione. Più controllo.</h2>
              <p>
                Quando il servizio accelera, ogni ordine resta nel suo flusso:
                sala, reparti e asporto lavorano sulla stessa verità.
              </p>
            </div>
            <ul class="public-problem-list">
              <li v-for="item in serviceProblems" :key="item.title">
                <i :class="['bi', item.icon]" aria-hidden="true"></i>
                <strong>{{ item.title }}</strong>
                <span>{{ item.body }}</span>
              </li>
            </ul>
          </article>

          <article class="public-takeaway-inner public-stack-card public-stack-card-b" aria-labelledby="takeaway-title">
            <div class="public-section-copy">
              <div class="overline">Take away integrato</div>
              <h2 id="takeaway-title">Ordini da telefono e sito, senza una seconda gestione.</h2>
              <p>
                L’asporto entra nello stesso pannello del servizio: puoi accettare la richiesta,
                mandarla ai reparti, seguirne la preparazione e segnare il ritiro quando il cliente arriva.
              </p>
            </div>
            <div class="public-takeaway-flow" aria-label="Flusso take away">
              <div>
                <i class="bi bi-phone" aria-hidden="true"></i>
                <span>Telefono</span>
              </div>
              <div>
                <i class="bi bi-globe2" aria-hidden="true"></i>
                <span>Sito web</span>
              </div>
              <div class="is-main">
                <i class="bi bi-kanban" aria-hidden="true"></i>
                <span>Coda operativa</span>
              </div>
              <div>
                <i class="bi bi-fire" aria-hidden="true"></i>
                <span>Reparti</span>
              </div>
              <div>
                <i class="bi bi-bag-check" aria-hidden="true"></i>
                <span>Ritiro</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="public-features" aria-labelledby="features-title">
        <div class="public-container">
          <div v-if="!canUseFeatureFlipDeck" class="public-section-h public-features-fallback-heading">
            <div class="overline">Funzionalità operative</div>
            <h2 id="features-title">Tutto quello che serve durante il servizio.</h2>
          </div>
          <LandingFeatureFlipDeck
            v-if="canUseFeatureFlipDeck"
            :features="features"
            @scene-error="canUseFeatureFlipDeck = false"
          >
            <div class="public-section-h">
              <div class="overline">Funzionalità operative</div>
              <h2 id="features-title">Tutto quello che serve durante il servizio.</h2>
            </div>
          </LandingFeatureFlipDeck>
          <div v-else class="public-features-stack-fallback" aria-label="Funzionalità operative">
            <article
              v-for="(feature, index) in features"
              :key="feature.title"
              class="public-feature public-feature-stack-card"
              :style="{ '--feature-index': index, '--feature-tilt': index % 2 ? '0.55deg' : '-0.55deg', zIndex: 20 + index }"
            >
              <div class="public-feature-icon">
                <i :class="['bi', feature.icon]" aria-hidden="true"></i>
              </div>
              <h3>{{ feature.title }}</h3>
              <p>{{ feature.body }}</p>
            </article>
          </div>
        </div>
      </section>

      <section id="come-funziona" class="public-flow" aria-labelledby="flow-title">
        <div class="public-container">
          <div class="public-section-h">
            <div class="overline">Come funziona</div>
            <h2 id="flow-title">Dal tavolo al reparto, senza passaggi a voce.</h2>
          </div>
          <div class="public-order-stack" aria-label="Flusso ordini sovrapposti">
            <article
              v-for="(step, index) in flowSteps"
              :key="step.title"
              class="public-order-card"
              :style="{ '--card-index': index, '--card-tilt': step.tilt, zIndex: 20 + index }"
            >
              <div class="public-order-head">
                <span class="public-order-code">{{ step.code }}</span>
                <div>
                  <small>{{ step.meta }}</small>
                  <h3>{{ step.title }}</h3>
                </div>
                <span class="public-order-status">
                  <i :class="['bi', step.icon]" aria-hidden="true"></i>
                  {{ step.status }}
                </span>
              </div>
              <p>{{ step.body }}</p>
              <ul class="public-order-items">
                <li v-for="item in step.items" :key="item">
                  <i class="bi bi-dot" aria-hidden="true"></i>
                  <span>{{ item }}</span>
                </li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section class="public-plans" aria-labelledby="plans-title">
        <div class="public-container">
          <div v-if="!canUsePlanOrbit" class="public-section-h public-plans-fallback-heading">
            <div class="overline">Piani</div>
            <h2 id="plans-title">Scegli in base a come lavora il tuo locale.</h2>
            <p>
              I piani non cambiano solo il prezzo: cambiano quanti reparti puoi coordinare
              e quanto dettaglio hai nella gestione del servizio.
            </p>
          </div>
          <LandingPlansOrbit
            v-if="canUsePlanOrbit"
            :plans="plans"
            @scene-error="canUsePlanOrbit = false"
          >
            <div class="public-section-h">
              <div class="overline">Piani</div>
              <h2 id="plans-title">Scegli in base a come lavora il tuo locale.</h2>
              <p>
                I piani non cambiano solo il prezzo: cambiano quanti reparti puoi coordinare
                e quanto dettaglio hai nella gestione del servizio.
              </p>
            </div>
          </LandingPlansOrbit>
          <div v-else class="public-plans-grid public-plans-fallback-stack">
            <article
              v-for="(plan, index) in plans"
              :key="plan.key"
              class="public-plan"
              :class="{ 'public-plan-highlight': plan.highlighted }"
              :style="{ '--plan-index': index, '--plan-tilt': index % 2 ? '0.65deg' : '-0.65deg', zIndex: 30 + index }"
            >
              <div v-if="plan.highlighted" class="public-plan-tag">Consigliato</div>
              <div class="public-plan-label">{{ plan.label }}</div>
              <h3>{{ plan.name }}</h3>
              <div class="public-plan-price">
                <span>{{ plan.price }}</span>
                <small>{{ plan.period }}</small>
              </div>
              <p>{{ plan.body }}</p>
              <div class="public-plan-focus">{{ plan.focus }}</div>
              <ul>
                <li v-for="feature in plan.features" :key="feature">
                  <i class="bi bi-check2" aria-hidden="true"></i>
                  <span>{{ feature }}</span>
                </li>
              </ul>
              <div v-if="plan.note" class="public-plan-note">{{ plan.note }}</div>
              <router-link to="/register" class="btn btn-lg btn-pill" :class="{ 'btn-accent': plan.highlighted }">
                Iscriviti ora
              </router-link>
            </article>
          </div>
        </div>
      </section>

    </div>
  </AppLayout>
</template>

<style scoped>
.dashboard-public {
  font-family: var(--f-sans);
  letter-spacing: 0;
  line-height: 1.5;
  background: var(--bg);
}
.dashboard-public em { font-style: normal; color: var(--ac); }
.public-container { max-width: 1180px; margin: 0 auto; padding: 0 24px; }

.public-hero {
  position: relative;
  min-height: 590px;
  padding: 64px 0 58px;
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--bg) 90%, white 10%), var(--bg)),
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
.public-hero-scene-wrap {
  position: absolute;
  inset: 0 0 0 42%;
  z-index: 0;
  opacity: 0.95;
}
.public-hero-scene-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(closest-side at 52% 46%, color-mix(in oklab, var(--ac) 18%, transparent), transparent 70%),
    linear-gradient(90deg, var(--bg), color-mix(in oklab, var(--bg) 24%, transparent) 34%, transparent 70%);
  pointer-events: none;
}
.public-hero-static {
  position: absolute;
  inset: 16% 8% 8% 0;
  transform: rotateX(58deg) rotateZ(-28deg);
  transform-style: preserve-3d;
}
.public-hero-static span {
  position: absolute;
  width: 118px;
  height: 74px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper);
  background: color-mix(in oklab, var(--paper) 82%, transparent);
  box-shadow: var(--shadow-md);
}
.public-hero-static span:nth-child(1) { left: 8%; top: 40%; }
.public-hero-static span:nth-child(2) { left: 30%; top: 16%; }
.public-hero-static span:nth-child(3) { left: 55%; top: 44%; }
.public-hero-static span:nth-child(4) {
  left: 70%;
  top: 18%;
  background: color-mix(in oklab, var(--ac) 14%, var(--paper));
}
@keyframes publicStaticFloat {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
  50% { transform: translate3d(10px, -8px, 0) rotate(1.5deg); }
}
.public-hero-static span {
  animation: publicStaticFloat 6s ease-in-out infinite;
}
.public-hero-static span:nth-child(2) { animation-delay: -1.4s; }
.public-hero-static span:nth-child(3) { animation-delay: -2.8s; }
.public-hero-static span:nth-child(4) { animation-delay: -4.2s; }

.public-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(340px, 0.72fr);
  gap: 42px;
  align-items: center;
}

.public-hero-head { text-align: left; max-width: 720px; }
.public-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--paper); border: 1px solid var(--line);
  padding: 6px 14px 6px 10px; border-radius: 999px;
  font-size: 12.5px; font-weight: 500; color: var(--ink-2);
  margin-bottom: 18px; box-shadow: var(--shadow-xs);
}
.public-hero h1 {
  font-size: 54px; line-height: 1.03;
  letter-spacing: 0; font-weight: 650;
  margin: 0 0 18px; color: var(--ink); text-wrap: balance;
}
.public-hero p {
  font-size: 17px; line-height: 1.5;
  color: var(--ink-2); max-width: 660px; margin: 0 0 24px; text-wrap: pretty;
}
.public-cta { display: flex; gap: 10px; justify-content: flex-start; flex-wrap: wrap; margin-bottom: 10px; }
.public-microcopy { font-size: 13px; color: var(--ink-3); }
.public-hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 20px 0 0;
  max-width: 610px;
}
.public-hero-metrics div {
  padding: 11px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
  background: color-mix(in oklab, var(--paper) 82%, transparent);
  box-shadow: var(--shadow-xs);
}
.public-hero-metrics dt {
  margin: 0 0 3px;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
}
.public-hero-metrics dd {
  margin: 0;
  color: var(--ink-3);
  font-size: 12.5px;
}
.public-ops-panel {
  justify-self: end;
  width: min(360px, 100%);
  padding: 14px;
  border: 1px solid color-mix(in oklab, var(--line) 80%, transparent);
  border-radius: 18px;
  background: var(--paper);
  background: color-mix(in oklab, var(--paper) 86%, transparent);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
}
.public-ops-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 3px 11px;
  color: var(--ink-3);
  font-size: 12.5px;
}
.public-ops-top strong { color: var(--ink); font-feature-settings: "tnum"; }
.public-ops-cols { display: grid; gap: 8px; }
.public-ops-cols article {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 4px 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-elev);
}
.public-ops-cols article.is-accent {
  border-color: color-mix(in oklab, var(--ac) 34%, var(--line));
  background: var(--paper);
  background: color-mix(in oklab, var(--ac) 7%, var(--paper));
}
.public-ops-k {
  grid-row: span 2;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--bg-sunk);
  color: var(--ink);
  font-weight: 800;
  font-size: 13px;
}
.public-ops-cols strong {
  color: var(--ink);
  font-size: 13.5px;
  min-width: 0;
}
.public-ops-cols small {
  color: var(--ink-3);
  font-size: 12px;
}

.public-card-scroll,
.public-flow,
.public-plans {
  padding: 36px 0 42px;
  background: var(--bg);
}
.public-flow {
  --flow-sticky-top: 84px;
  --flow-heading-space: clamp(88px, 12vh, 108px);
  --flow-handoff-space: clamp(210px, 26vh, 250px);
  --flow-handoff-pull: clamp(-250px, -26vh, -210px);
}
.public-flow .public-container {
  min-height: calc(100vh - var(--flow-sticky-top) + var(--flow-handoff-space));
  perspective: 1200px;
}
.public-features {
  --feature-fallback-sticky-top: 84px;
  --feature-fallback-heading-space: clamp(150px, 20vh, 184px);
  padding: 42px 0;
  background: var(--bg-sunk, var(--bg-2));
}
.public-plans {
  --plan-fallback-sticky-top: 84px;
  --plan-fallback-heading-space: clamp(164px, 22vh, 206px);
}
.public-card-scroll .public-container {
  min-height: 470px;
  perspective: 1200px;
}

.public-section-h { max-width: 760px; margin: 0 auto 24px; text-align: center; }
.public-section-h h2,
.public-section-copy h2 {
  font-size: 34px; line-height: 1.12;
  letter-spacing: 0; font-weight: 650; margin: 12px 0 0;
  color: var(--ink); text-wrap: balance;
}
.public-section-h p,
.public-section-copy p {
  margin: 16px 0 0;
  font-size: 15px;
  color: var(--ink-2);
  line-height: 1.6;
}

.public-split,
.public-context-inner {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 30px;
  align-items: center;
}
.public-context-inner {
  padding: 20px 22px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--paper);
  box-shadow: 0 18px 48px -34px rgb(0 0 0 / 0.3), var(--shadow-xs);
}
.public-stack-card {
  position: sticky;
  transform-origin: center top;
  transition: transform var(--dur), box-shadow var(--dur);
}
.public-stack-card-a {
  top: 84px;
  z-index: 1;
  transform: rotateX(2.2deg) rotateZ(-0.6deg);
}
.public-stack-card-b {
  top: 114px;
  z-index: 2;
  margin-top: 28px;
  transform: rotateX(1.6deg) rotateZ(0.7deg);
}
.public-stack-card-a .public-section-copy h2 {
  font-size: 28px;
}
.public-stack-card-a .public-section-copy p {
  margin-top: 10px;
}
.public-section-copy { max-width: 520px; }
.public-problem-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.public-problem-list li {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 2px 10px;
  align-items: center;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  color: var(--ink-2);
  box-shadow: var(--shadow-xs);
}
.public-problem-list i {
  grid-row: span 2;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--ac-soft);
  color: var(--ac);
  font-size: 16px;
}
.public-problem-list strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}
.public-problem-list span {
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.35;
}

.public-takeaway-inner {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(360px, 1fr);
  gap: 22px;
  align-items: center;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--paper);
  box-shadow: 0 22px 58px -36px rgb(0 0 0 / 0.34), var(--shadow-xs);
}
.public-takeaway-flow {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.public-takeaway-flow div {
  min-height: 76px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-sunk);
  color: var(--ink-2);
  text-align: center;
  font-size: 12.5px;
  font-weight: 600;
}
.public-takeaway-flow div.is-main {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
  transform: translateY(-6px);
  box-shadow: var(--shadow-md);
}
.public-takeaway-flow i {
  color: var(--ac);
  font-size: 19px;
}
.public-takeaway-flow .is-main i { color: var(--paper); }

.public-order-stack {
  max-width: 780px;
  margin: var(--flow-handoff-pull) auto 0;
  min-height: calc(100vh - var(--flow-sticky-top) - var(--flow-heading-space) + var(--flow-handoff-space));
  padding: 0 0 20px;
  perspective: 1200px;
}
.public-flow .public-section-h {
  position: sticky;
  top: var(--flow-sticky-top);
  z-index: 35;
  min-height: calc(var(--flow-heading-space) + var(--flow-handoff-space));
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
.public-order-card {
  position: sticky;
  top: calc(var(--flow-sticky-top) + var(--flow-heading-space) + (var(--card-index) * 12px));
  margin-top: -14px;
  min-height: 154px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--paper);
  background:
    linear-gradient(135deg, color-mix(in oklab, var(--paper) 96%, white 4%), var(--paper)),
    var(--paper);
  box-shadow: 0 18px 46px -26px rgb(0 0 0 / 0.28), var(--shadow-xs);
  transform: rotateX(2.5deg) rotateZ(var(--card-tilt)) translateY(calc(var(--card-index) * 2px));
  transform-origin: center top;
  transition: transform var(--dur), box-shadow var(--dur), border-color var(--dur);
}
.public-order-card:first-child { margin-top: 0; }
.public-order-card:hover {
  border-color: color-mix(in oklab, var(--ac) 30%, var(--line));
  box-shadow: 0 24px 60px -28px rgb(0 0 0 / 0.34), var(--shadow-sm);
  transform: rotateX(1.5deg) rotateZ(var(--card-tilt)) translateY(calc(var(--card-index) * 2px - 2px));
}
.public-order-head {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}
.public-order-code {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--bg-sunk);
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px var(--line);
}
.public-order-head small {
  display: block;
  margin-bottom: 3px;
  color: var(--ink-3);
  font-size: 11.5px;
}
.public-order-head h3,
.public-feature h3 {
  margin: 0 0 8px;
  font-size: 18px;
  letter-spacing: 0;
  font-weight: 600;
  color: var(--ink);
}
.public-order-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border-radius: 999px;
  background: var(--ac-soft);
  color: var(--ac-ink);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.public-order-card p,
.public-feature p {
  margin: 0;
  font-size: 14px;
  color: var(--ink-2);
  line-height: 1.5;
}
.public-order-items {
  list-style: none;
  margin: 12px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--line);
  display: flex;
  gap: 8px 14px;
  flex-wrap: wrap;
  color: var(--ink-3);
  font-size: 12.5px;
}
.public-order-items li {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.public-order-items i {
  color: var(--ac);
  font-size: 15px;
  line-height: 1;
}

.public-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.public-features-fallback-heading {
  position: sticky;
  top: var(--feature-fallback-sticky-top);
  z-index: 35;
  min-height: var(--feature-fallback-heading-space);
  margin-bottom: 0;
}
.public-features-stack-fallback {
  min-height: 560px;
  max-width: 730px;
  margin: 0 auto;
  padding: 0 0 24px;
  perspective: 1200px;
}
.public-feature {
  background: var(--paper); border: 1px solid var(--line);
  border-radius: 14px; padding: 18px;
  transition: transform var(--dur), box-shadow var(--dur), border-color var(--dur);
}
.public-feature-stack-card {
  position: sticky;
  top: calc(var(--feature-fallback-sticky-top) + var(--feature-fallback-heading-space) + (var(--feature-index) * 10px));
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  margin-top: -8px;
  min-height: clamp(140px, 21vh, 178px);
  padding: 18px 24px 18px 26px;
  background: var(--paper);
  box-shadow: 0 18px 46px -28px rgb(0 0 0 / 0.28), var(--shadow-xs);
  transform: rotateX(2deg) rotateZ(var(--feature-tilt)) translateY(calc(var(--feature-index) * 2px));
}
.public-feature-stack-card:first-child {
  margin-top: 0;
}
.public-feature:hover {
  transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--line-strong);
}
.public-feature-stack-card:hover {
  transform: rotateX(1.4deg) rotateZ(var(--feature-tilt)) translateY(calc(var(--feature-index) * 2px - 2px));
}
.public-feature-icon {
  grid-row: 1 / span 2;
  width: 46px; height: 46px;
  background: var(--ac-soft); border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ac); font-size: 21px; margin: 0;
}
.public-feature-stack-card h3,
.public-feature-stack-card p {
  grid-column: 2;
}
.public-plans-fallback-heading {
  position: sticky;
  top: var(--plan-fallback-sticky-top);
  z-index: 35;
  min-height: var(--plan-fallback-heading-space);
  margin-bottom: 0;
}
.public-plans-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: stretch;
}
.public-plan {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 24px;
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
  margin: 0 0 9px;
  color: var(--ink);
  font-size: 26px;
  letter-spacing: 0;
  font-weight: 650;
}
.public-plan-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 10px;
}
.public-plan-price span {
  color: var(--ink);
  font-size: 31px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0;
}
.public-plan-price small { color: var(--ink-3); font-size: 14px; }
.public-plan p {
  margin: 0 0 12px;
  color: var(--ink-2);
  font-size: 15px;
  line-height: 1.55;
}
.public-plan-focus,
.public-plan-note {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-sunk);
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.45;
  padding: 10px 12px;
}
.public-plan-focus {
  margin-bottom: 14px;
}
.public-plan-note {
  margin: 0 0 16px;
}
.public-plan ul {
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
  display: grid;
  gap: 7px;
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
.public-plan .btn {
  margin-top: auto;
  align-self: flex-start;
}
.public-plan-highlight .btn {
  background: var(--ac);
  border-color: var(--ac);
  color: var(--paper);
  box-shadow: var(--shadow-sm);
}
.public-plan-highlight .btn:hover {
  background: color-mix(in oklab, var(--ac) 88%, black 12%);
  border-color: color-mix(in oklab, var(--ac) 88%, black 12%);
  color: var(--paper);
}

@media (max-width: 1080px) {
  .public-hero {
    min-height: 0;
    padding: 58px 0;
  }
  .public-hero-grid {
    grid-template-columns: 1fr;
    gap: 30px;
  }
  .public-hero-scene-wrap {
    inset: 18% 0 auto 25%;
    height: 320px;
    opacity: 0.5;
  }
  .public-ops-panel {
    justify-self: start;
    width: min(420px, 100%);
  }
  .public-takeaway-inner {
    grid-template-columns: 1fr;
  }
  .public-features-grid { grid-template-columns: 1fr 1fr; }
  .public-features {
    --feature-fallback-sticky-top: 72px;
    --feature-fallback-heading-space: clamp(140px, 20vh, 174px);
  }
  .public-feature-stack-card {
    top: calc(var(--feature-fallback-sticky-top) + var(--feature-fallback-heading-space) + (var(--feature-index) * 10px));
  }
  .public-flow {
    --flow-sticky-top: 72px;
    --flow-heading-space: clamp(104px, 15vh, 126px);
    --flow-handoff-space: clamp(190px, 24vh, 230px);
    --flow-handoff-pull: clamp(-230px, -24vh, -190px);
  }
  .public-order-card {
    top: calc(var(--flow-sticky-top) + var(--flow-heading-space) + (var(--card-index) * 10px));
  }
}
@media (max-width: 820px) {
  .public-split,
  .public-context-inner,
  .public-takeaway-inner,
  .public-plans-grid {
    grid-template-columns: 1fr;
  }
  .public-hero h1 {
    font-size: 42px;
  }
  .public-section-h h2,
  .public-section-copy h2 {
    font-size: 30px;
  }
  .public-takeaway-flow {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .public-plans {
    --plan-fallback-sticky-top: 72px;
    --plan-fallback-heading-space: clamp(146px, 21vh, 190px);
  }
  .public-plans-fallback-stack {
    display: block;
    min-height: 780px;
    max-width: 560px;
    margin: 0 auto;
    perspective: 1000px;
  }
  .public-plans-fallback-stack .public-plan {
    position: sticky;
    top: calc(var(--plan-fallback-sticky-top) + var(--plan-fallback-heading-space) + (var(--plan-index) * 14px));
    margin-top: -12px;
    transform: rotateX(1.8deg) rotateZ(var(--plan-tilt));
  }
  .public-plans-fallback-stack .public-plan:first-child {
    margin-top: 0;
  }
  .public-ops-panel {
    justify-self: start;
  }
}
@media (max-width: 720px) {
  .public-hero { padding: 34px 0 42px; }
  .public-hero-scene-wrap {
    display: block;
    inset: 0 -34% auto 6%;
    height: 340px;
    opacity: 0.42;
  }
  .public-hero-scene-wrap::after {
    background:
      radial-gradient(closest-side at 52% 46%, color-mix(in oklab, var(--ac) 16%, transparent), transparent 70%),
      linear-gradient(180deg, transparent, var(--bg) 86%);
  }
  .public-hero h1 {
    font-size: 34px;
  }
  .public-hero p {
    font-size: 15px;
  }
  .public-hero-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .public-hero-metrics div {
    padding: 9px 8px;
  }
  .public-hero-metrics dt {
    font-size: 14px;
  }
  .public-hero-metrics dd {
    font-size: 11.5px;
  }
  .public-card-scroll,
  .public-flow,
  .public-features,
  .public-plans { padding: 34px 0; }
  .public-flow {
    --flow-handoff-space: clamp(248px, 35vh, 308px);
    --flow-handoff-pull: clamp(-308px, -35vh, -248px);
  }
  .public-card-scroll .public-container {
    min-height: 570px;
    perspective: 1000px;
  }
  .public-stack-card {
    position: sticky;
  }
  .public-stack-card-a {
    top: 72px;
    transform: rotateX(2deg) rotateZ(-0.5deg);
  }
  .public-stack-card-b {
    top: 94px;
    margin-top: 18px;
    transform: rotateX(1.4deg) rotateZ(0.6deg);
  }
  .public-features-grid,
  .public-problem-list,
  .public-takeaway-flow { grid-template-columns: 1fr; }
  .public-features-stack-fallback {
    min-height: 690px;
  }
  .public-feature-stack-card {
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 13px;
    top: calc(var(--feature-fallback-sticky-top) + var(--feature-fallback-heading-space) + (var(--feature-index) * 10px));
    min-height: 142px;
    margin-top: -8px;
    padding: 16px 17px 16px 19px;
    transform: rotateX(2deg) rotateZ(var(--feature-tilt)) translateY(calc(var(--feature-index) * 2px));
  }
  .public-feature-icon {
    width: 40px;
    height: 40px;
    font-size: 19px;
  }
  .public-feature-stack-card:hover {
    transform: rotateX(1.4deg) rotateZ(var(--feature-tilt)) translateY(calc(var(--feature-index) * 2px - 2px));
  }
  .public-takeaway-flow div.is-main {
    transform: none;
  }
  .public-order-stack { padding-top: 0; }
  .public-order-card {
    position: sticky;
    top: calc(var(--flow-sticky-top) + var(--flow-heading-space) + (var(--card-index) * 10px));
    margin-top: -10px;
    transform: rotateX(2deg) rotateZ(var(--card-tilt)) translateY(calc(var(--card-index) * 2px));
  }
  .public-order-card:first-child { margin-top: 0; }
  .public-order-card:hover {
    transform: rotateX(1.4deg) rotateZ(var(--card-tilt)) translateY(calc(var(--card-index) * 2px - 2px));
  }
  .public-order-head {
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .public-order-code {
    width: 42px;
    height: 42px;
  }
  .public-order-status {
    grid-column: 1 / -1;
    justify-self: start;
  }
  .public-takeaway-inner { padding: 22px; }
  .public-plans-fallback-stack {
    min-height: 760px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .public-hero-static span {
    animation: none;
  }
  .public-card-scroll .public-container {
    min-height: 0;
  }
  .public-stack-card {
    position: relative;
    top: auto;
    transform: none;
  }
  .public-flow .public-section-h {
    position: relative;
    top: auto;
    min-height: 0;
    margin-bottom: 24px;
  }
  .public-features-fallback-heading,
  .public-plans-fallback-heading {
    position: relative;
    top: auto;
    min-height: 0;
    margin-bottom: 24px;
  }
  .public-stack-card-b {
    margin-top: 10px;
  }
  .public-order-card {
    position: relative;
    top: auto;
    margin-top: 10px;
    transform: none;
  }
  .public-features-stack-fallback,
  .public-plans-fallback-stack {
    min-height: 0;
  }
  .public-feature-stack-card,
  .public-plans-fallback-stack .public-plan {
    position: relative;
    top: auto;
    margin-top: 10px;
    transform: none;
  }
  .public-order-card:hover {
    transform: none;
  }
  .public-feature-stack-card:hover,
  .public-plans-fallback-stack .public-plan:hover {
    transform: none;
  }
}
</style>
