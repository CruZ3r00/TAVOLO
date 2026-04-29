<script setup>
import { onMounted, nextTick } from 'vue';
import AppLayout from '@/Layouts/AppLayout.vue';

onMounted(() => {
  nextTick(() => { document.title = 'Tavolo · Il gestionale dei ristoranti moderni'; });
});
</script>

<template>
  <AppLayout variant="public" page-title="Tavolo">
    <div class="dashboard-public">
      <section class="public-hero">
        <div class="public-container">
          <div class="public-hero-head">
            <span class="public-eyebrow"><span class="tv-pulse"></span> Il gestionale che fa girare il servizio</span>
            <h1>
              Sala, cucina, cassa: <em>un solo gestionale</em>
              <br />che fa girare il ristorante.
            </h1>
            <p>
              Apri tavoli e mandi ordini in 3 tap. Stampi scontrini fiscali con stampante RT.
              Incassi con POS Bluetooth. Gestisci prenotazioni online dal tuo sito personalizzato.
              Tutto da iPad, Android o computer che hai gia.
            </p>
            <div class="public-cta">
              <router-link to="/register" class="btn btn-lg btn-accent btn-pill">
                Prova 14 giorni gratis <i class="bi bi-arrow-right"></i>
              </router-link>
              <router-link to="/login" class="btn btn-lg btn-pill">
                <i class="bi bi-box-arrow-in-right"></i> Accedi
              </router-link>
            </div>
            <div class="public-badges">
              <span><i class="bi bi-check2"></i> Nessuna carta richiesta</span>
              <span><i class="bi bi-check2"></i> Setup in 10 minuti</span>
              <span><i class="bi bi-check2"></i> Stampa fiscale certificata AdE</span>
              <span><i class="bi bi-check2"></i> Funziona offline</span>
            </div>
          </div>
        </div>
      </section>

      <section class="public-features">
        <div class="public-container">
          <div class="public-section-h">
            <div class="overline">Funzionalita reali . in produzione</div>
            <h2>Sei <em>flussi</em> che non ti rallentano.</h2>
          </div>
          <div class="public-features-grid">
            <article class="public-feature">
              <div class="public-feature-icon"><i class="bi bi-grid-3x3-gap"></i></div>
              <h3>Gestione sala e ordini</h3>
              <p>Apri un tavolo, aggiungi portate e mandale alla cucina in 3 tap. Note, allergie, divisione conto.</p>
            </article>
            <article class="public-feature">
              <div class="public-feature-icon"><i class="bi bi-fire"></i></div>
              <h3>KDS per la brigata</h3>
              <p>Board kanban per la cucina: ogni stazione vede la sua coda. Da fare > in prep > pronto in un tap.</p>
            </article>
            <article class="public-feature">
              <div class="public-feature-icon"><i class="bi bi-credit-card-2-back"></i></div>
              <h3>Pagamenti POS + RT</h3>
              <p>App scaricabile su qualsiasi dispositivo: connetti il POS via Bluetooth e la stampante fiscale via WiFi.</p>
            </article>
            <article class="public-feature">
              <div class="public-feature-icon"><i class="bi bi-calendar-check"></i></div>
              <h3>Prenotazioni & arrivi</h3>
              <p>Tutte le richieste in una board kanban: in attesa, confermate, in sala. Conferma con un tap.</p>
            </article>
            <article class="public-feature">
              <div class="public-feature-icon"><i class="bi bi-globe2"></i></div>
              <h3>Sito pubblico + QR menu</h3>
              <p>Ogni abbonamento include un menu digitale con QR. In piu puoi richiedere un sito personalizzato.</p>
            </article>
            <article class="public-feature">
              <div class="public-feature-icon"><i class="bi bi-bar-chart-line"></i></div>
              <h3>Statistiche e insight</h3>
              <p>Coperti, incasso, scontrino medio, piatti piu amati. Tutto storicizzato, esportabile, confrontabile.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="public-cta-box">
        <div class="public-container">
          <div class="public-cta-inner">
            <div>
              <div class="overline" style="color: color-mix(in oklab, white 60%, transparent);">Pronto a iniziare?</div>
              <h3>Prova Tavolo gratis per 14 giorni.</h3>
              <p>Senza carta. Senza setup. Cambi quando vuoi.</p>
            </div>
            <div class="public-cta-actions">
              <router-link to="/register" class="btn btn-lg btn-pill btn-accent">
                <i class="bi bi-rocket-takeoff"></i> Inizia ora
              </router-link>
              <router-link to="/contact-us" class="btn btn-lg btn-pill">
                <i class="bi bi-chat-dots"></i> Parla con noi
              </router-link>
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
  padding: 80px 0 80px;
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

.public-hero-head { text-align: center; max-width: 900px; margin: 0 auto; }
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
  color: var(--ink-2); max-width: 720px; margin: 0 auto 32px; text-wrap: pretty;
}
.public-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 24px; }
.public-badges {
  display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;
  font-size: 13px; color: var(--ink-3);
}
.public-badges span { display: inline-flex; align-items: center; gap: 6px; }
.public-badges i { color: var(--ok); }

.public-features { padding: 80px 0; background: var(--bg-sunk, var(--bg-2)); }
.public-section-h { max-width: 760px; margin: 0 auto 48px; text-align: center; }
.public-section-h h2 {
  font-size: clamp(28px, 3.6vw, 44px); line-height: 1.1;
  letter-spacing: -0.03em; font-weight: 600; margin: 12px 0 0; text-wrap: balance;
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
.public-feature h3 {
  margin: 0 0 8px; font-size: 18px;
  letter-spacing: -0.02em; font-weight: 600; color: var(--ink);
}
.public-feature p { margin: 0; font-size: 14px; color: var(--ink-2); line-height: 1.5; }

.public-cta-box { padding: 80px 0; background: var(--bg); }
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

@media (max-width: 1080px) { .public-features-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 720px) {
  .public-hero { padding: 56px 0; }
  .public-features { padding: 56px 0; }
  .public-features-grid { grid-template-columns: 1fr; }
  .public-cta-box { padding: 40px 0; }
  .public-cta-inner { padding: 32px; }
  .public-cta-inner h3 { font-size: 22px; }
}
</style>
