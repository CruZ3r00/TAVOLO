<script setup>
import { onMounted, nextTick, ref } from 'vue';
import AppLayout from '@/Layouts/AppLayout.vue';
import PaperCardsScene from '@/components/PaperCardsScene.vue';

const sceneError = ref(false);
const reason = ref('demo');
const sent = ref(false);
const form = ref({ locale: '', email: '', telefono: '', messaggio: '', privacy: false });
const formError = ref('');

// Backend Strapi non espone /api/contact: usiamo mailto: come fallback
// (vincolo confermato nel handoff). Destinatario confermato dall'utente.
const CONTACT_RECIPIENT = 'support@comfortables.eu';

// Validatori basici (no nuove dipendenze).
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
const isValidPhone = (s) => /^[+\d][\d\s().-]{6,}$/.test(String(s || '').trim());

const reasonLabelFor = (k) => {
  const r = reasons.find((x) => x.k === k);
  return r ? r.label : k;
};

const reasons = [
  { k: 'demo', icon: '▶', label: 'Voglio provare COMFORTABLES', sub: 'Demo guidata o tour del prodotto' },
  { k: 'pricing', icon: '€', label: 'Domande sui piani', sub: 'Essenziale vs Professionale' },
  { k: 'support', icon: '?', label: 'Supporto tecnico', sub: "Problema con un'installazione attiva" },
  { k: 'partner', icon: '⌥', label: 'Partnership', sub: 'Distribuzione, integrazioni, rivendita' },
];

const contacts = [
  {
    name: 'Filippo Manzini', role: 'Founder & CTO', initials: 'FM',
    mail: 'filippomanzini02@outlook.com', tel: '+39 345 790 3167',
    hours: 'Lun–Ven · 9:00–19:00', accent: true,
  },
  {
    name: 'Pietro Comelli', role: 'Co-Founder', initials: 'PC',
    mail: 'comelli.pietro@gmail.com', tel: '+39 327 915 2295',
    hours: 'Lun–Ven · 10:00–18:00', accent: false,
  },
  {
    name: 'Mattia', role: 'Operations', initials: 'M',
    mail: null, tel: '+39 346 060 5599',
    hours: 'Sempre, anche durante il servizio', accent: false,
  },
];

const faqs = [
  { q: 'Quanto ci vuole per partire?', a: 'Demo + setup base in 30 minuti. Importi il menu da foto e sei operativo.' },
  { q: 'Posso provare prima di pagare?', a: 'Sì, 14 giorni di prova senza carta richiesta.' },
  { q: 'Funziona offline?', a: 'Lato server no, ma i tablet operativi sono cache-friendly e tengono i comandi locali se la rete cade un istante.' },
  { q: 'Migrate dati dal mio vecchio gestionale?', a: 'Sì, gratis nel primo onboarding. Bastano CSV, PDF o foto del menu.' },
];

const openFaqs = ref(new Set());
const toggleFaq = (i) => {
  const s = new Set(openFaqs.value);
  s.has(i) ? s.delete(i) : s.add(i);
  openFaqs.value = s;
};

const handleSubmit = () => {
  formError.value = '';
  const f = form.value;

  if (!String(f.locale || '').trim()) {
    formError.value = 'Inserisci il nome del locale.';
    return;
  }
  const hasEmail = String(f.email || '').trim() !== '';
  const hasPhone = String(f.telefono || '').trim() !== '';
  if (!hasEmail && !hasPhone) {
    formError.value = 'Inserisci almeno un recapito (email o telefono).';
    return;
  }
  if (hasEmail && !isValidEmail(f.email)) {
    formError.value = "L'indirizzo email non sembra valido.";
    return;
  }
  if (hasPhone && !isValidPhone(f.telefono)) {
    formError.value = 'Il numero di telefono non sembra valido.';
    return;
  }
  if (!f.privacy) {
    formError.value = 'Devi acconsentire al trattamento dei dati per essere ricontattato.';
    return;
  }

  // Costruisci mailto: con tutti i dati nel body. Nessun POST: backend non
  // ha /api/contact e il vincolo del handoff è no-modifiche-Strapi.
  const subject = `[ComforTables] Richiesta · ${reasonLabelFor(reason.value)}`;
  const bodyLines = [
    `Locale: ${f.locale}`,
    `Email: ${f.email || '(non fornita)'}`,
    `Telefono: ${f.telefono || '(non fornito)'}`,
    `Motivo: ${reasonLabelFor(reason.value)}`,
    '',
    'Messaggio:',
    f.messaggio || '(nessun messaggio)',
  ];
  const mailto = `mailto:${CONTACT_RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
  window.location.href = mailto;
  sent.value = true;
};

onMounted(() => {
  nextTick(() => { document.title = 'Contattaci · ComforTables'; });
});
</script>

<template>
  <AppLayout>
    <div class="ct-page">

      <!-- HERO -->
      <section class="ct-hero">
        <div class="ct-scene-wrap" v-if="!sceneError">
          <PaperCardsScene variant="contact" :height="420" @scene-error="sceneError = true" />
        </div>
        <div class="ct-scene-fallback" v-else></div>
        <div class="ct-scene-gradient" aria-hidden="true"></div>

        <div class="ct-hero-content">
          <span class="ct-sla-badge">
            <span class="ct-sla-dot" aria-hidden="true"></span>
            Risposta media: 2 ore lavorative
          </span>
          <h1 class="ct-hero-title">
            Parliamone di <em class="ct-accent">persona</em>.
          </h1>
          <p class="ct-hero-lead">
            Niente bot, niente ticket persi. Dietro ogni messaggio c'è uno di noi tre.
          </p>
        </div>
      </section>

      <!-- Reason picker + form -->
      <section class="ct-main-section">
        <div class="ct-main-inner">

          <!-- LEFT: guided picker -->
          <div class="ct-picker">
            <p class="ct-step-eyebrow">1 · Di cosa vuoi parlare?</p>
            <h2 class="ct-picker-title">Scegli un motivo, ti instradiamo alla persona giusta.</h2>
            <div class="ct-reasons">
              <button
                v-for="r in reasons"
                :key="r.k"
                type="button"
                class="ct-reason-btn"
                :class="{ 'ct-reason-btn--active': reason === r.k }"
                @click="reason = r.k"
              >
                <span class="ct-reason-icon" :class="{ 'ct-reason-icon--active': reason === r.k }" aria-hidden="true">{{ r.icon }}</span>
                <span class="ct-reason-text">
                  <span class="ct-reason-label">{{ r.label }}</span>
                  <span class="ct-reason-sub">{{ r.sub }}</span>
                </span>
                <span class="ct-reason-radio" :class="{ 'ct-reason-radio--active': reason === r.k }" aria-hidden="true">
                  <span v-if="reason === r.k" class="ct-reason-radio-dot"></span>
                </span>
              </button>
            </div>
          </div>

          <!-- RIGHT: form -->
          <div class="ct-form-wrap">
            <p class="ct-step-eyebrow">2 · Lascia un recapito</p>
            <h3 class="ct-form-title">Ti contattiamo entro 2 ore lavorative.</h3>

            <div v-if="!sent">
              <form class="ct-form" @submit.prevent="handleSubmit">
                <div class="ct-field">
                  <label class="ct-label">Nome del locale</label>
                  <input v-model="form.locale" type="text" class="ct-input" placeholder="Trattoria da Pino" required>
                </div>
                <div class="ct-field-row">
                  <div class="ct-field">
                    <label class="ct-label">Email <span class="ct-label-opt">(o telefono)</span></label>
                    <input v-model="form.email" type="email" class="ct-input" placeholder="info@locale.it">
                  </div>
                  <div class="ct-field">
                    <label class="ct-label">Telefono <span class="ct-label-opt">(o email)</span></label>
                    <input v-model="form.telefono" type="tel" class="ct-input" placeholder="+39 …">
                  </div>
                </div>
                <div class="ct-field">
                  <label class="ct-label">Messaggio <span class="ct-label-opt">(opzionale)</span></label>
                  <textarea
                    v-model="form.messaggio"
                    class="ct-textarea"
                    rows="4"
                    placeholder="Es. siamo una pizzeria con bar e cucina, vorremmo capire come funziona lo smistamento…"
                  ></textarea>
                </div>
                <label class="ct-privacy">
                  <input v-model="form.privacy" type="checkbox" class="ct-privacy-check" required>
                  <span>Acconsento al trattamento dei dati per essere ricontattato. Mai newsletter, mai spam.</span>
                </label>
                <p v-if="formError" class="ct-form-error" role="alert">
                  <span aria-hidden="true">⚠</span>
                  <span>{{ formError }}</span>
                </p>
                <button type="submit" class="ct-submit-btn">
                  Invia messaggio <span aria-hidden="true">→</span>
                </button>
                <p class="ct-direct-mail">
                  Si aprirà il tuo client email predefinito · oppure scrivi a
                  <a :href="`mailto:${CONTACT_RECIPIENT}`" class="ct-mail-link">{{ CONTACT_RECIPIENT }}</a>
                </p>
              </form>
            </div>

            <div v-else class="ct-success">
              <div class="ct-success-icon" aria-hidden="true">✓</div>
              <h3 class="ct-success-title">Messaggio inviato</h3>
              <p class="ct-success-sub">Ti rispondiamo entro 2 ore lavorative.</p>
            </div>
          </div>

        </div>
      </section>

      <!-- Direct contacts -->
      <section class="ct-contacts-section">
        <div class="ct-inner">
          <div class="ct-section-head centered">
            <p class="ct-eyebrow">Vuoi parlare con qualcuno direttamente?</p>
            <h2 class="ct-section-title">Tutti i recapiti, niente filtri.</h2>
          </div>
          <div class="ct-contacts-grid">
            <article v-for="c in contacts" :key="c.name" class="ct-contact-card" :class="{ 'ct-contact-card--accent': c.accent }">
              <span v-if="c.accent" class="ct-primo-badge">PRIMO CONTATTO</span>
              <div class="ct-contact-avatar" :class="{ 'ct-contact-avatar--accent': c.accent }" aria-hidden="true">{{ c.initials }}</div>
              <h3 class="ct-contact-name">{{ c.name }}</h3>
              <div class="ct-contact-role">{{ c.role }}</div>
              <div class="ct-contact-links">
                <a v-if="c.mail" :href="`mailto:${c.mail}`" class="ct-contact-link">
                  <span class="ct-link-icon" aria-hidden="true">✉</span>
                  <span>{{ c.mail }}</span>
                </a>
                <span v-else class="ct-contact-link ct-contact-link--muted">
                  <span class="ct-link-icon" aria-hidden="true">✉</span>
                  <span>Non disponibile</span>
                </span>
                <a :href="`tel:${c.tel.replace(/\s/g, '')}`" class="ct-contact-link">
                  <span class="ct-link-icon" aria-hidden="true">☏</span>
                  <span>{{ c.tel }}</span>
                </a>
                <div class="ct-contact-link ct-contact-link--muted">
                  <span class="ct-link-icon" aria-hidden="true">◷</span>
                  <span>{{ c.hours }}</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section class="ct-faq-section">
        <div class="ct-inner ct-inner--narrow">
          <div class="ct-section-head centered">
            <h2 class="ct-section-title">Risposte rapide</h2>
          </div>
          <div class="ct-faq-list">
            <div v-for="(f, i) in faqs" :key="i" class="ct-faq-item">
              <button type="button" class="ct-faq-q" @click="toggleFaq(i)" :aria-expanded="openFaqs.has(i)">
                <span>{{ f.q }}</span>
                <span class="ct-faq-icon" :class="{ 'ct-faq-icon--open': openFaqs.has(i) }" aria-hidden="true">+</span>
              </button>
              <div v-if="openFaqs.has(i)" class="ct-faq-a">{{ f.a }}</div>
            </div>
          </div>
        </div>
      </section>

    </div>
  </AppLayout>
</template>

<style scoped>
.ct-page {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--f-sans);
  min-height: 100vh;
}

/* ── inner ── */
.ct-inner { max-width: 1100px; margin: 0 auto; padding: 0 32px; }
.ct-inner--narrow { max-width: 880px; }
.centered { text-align: center; }

/* ── HERO ── */
.ct-hero {
  position: relative;
  padding: 50px 0 30px;
  background: linear-gradient(180deg, var(--bg) 0%, var(--bg-sunk) 100%);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
}
.ct-scene-wrap {
  position: absolute;
  inset: 0;
  opacity: 0.85;
}
.ct-scene-fallback {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 40% 40%, var(--ac-soft), var(--bg-sunk));
}
.ct-scene-gradient {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 50% 40% at 50% 40%, transparent, var(--bg) 85%);
  pointer-events: none;
}
.ct-hero-content {
  max-width: 880px;
  margin: 0 auto;
  padding: 0 32px;
  position: relative;
  z-index: 1;
  text-align: center;
}
.ct-sla-badge {
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
  margin-bottom: 22px;
  box-shadow: var(--shadow-xs);
}
.ct-sla-dot {
  width: 6px; height: 6px;
  border-radius: 999px;
  background: var(--ok);
  flex-shrink: 0;
}
.ct-hero-title {
  margin: 0;
  font-size: clamp(34px, 5vw, 52px);
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--ink);
  max-width: 720px;
  margin-inline: auto;
}
.ct-accent {
  font-style: normal;
  color: var(--ac);
}
.ct-hero-lead {
  margin: 20px auto 0;
  max-width: 520px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink-2);
}

/* ── MAIN (picker + form) ── */
.ct-main-section {
  padding: 60px 32px;
  max-width: 1100px;
  margin: 0 auto;
}
.ct-main-inner {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 32px;
  align-items: start;
}

/* Picker */
.ct-step-eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  margin: 0 0 8px;
}
.ct-picker-title {
  margin: 0 0 22px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.ct-reasons { display: flex; flex-direction: column; gap: 10px; }
.ct-reason-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur), background var(--dur), box-shadow var(--dur);
  box-shadow: var(--shadow-xs);
  color: var(--ink);
}
.ct-reason-btn--active {
  border-color: var(--ac);
  background: var(--ac-soft);
  box-shadow: 0 0 0 3px var(--ac-soft);
}
.ct-reason-icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--bg-sunk);
  color: var(--ac);
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
  transition: background var(--dur), color var(--dur);
}
.ct-reason-icon--active {
  background: var(--ac);
  color: var(--ac-contrast);
}
.ct-reason-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ct-reason-label {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--ink);
  display: block;
}
.ct-reason-sub {
  font-size: 12.5px;
  color: var(--ink-3);
  display: block;
}
.ct-reason-radio {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--line-strong);
  background: transparent;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: border-color var(--dur), background var(--dur);
}
.ct-reason-radio--active {
  border-color: var(--ac);
  background: var(--ac);
}
.ct-reason-radio-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--ac-contrast);
  display: block;
}

/* Form */
.ct-form-wrap {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 28px;
  box-shadow: var(--shadow-md);
  position: sticky;
  top: 80px;
}
.ct-form-title {
  margin: 0 0 18px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--ink);
}
.ct-form { display: flex; flex-direction: column; gap: 12px; }
.ct-field { display: flex; flex-direction: column; gap: 6px; }
.ct-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ct-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}
.ct-label-opt {
  font-weight: 400;
  color: var(--ink-3);
}
.ct-input {
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-sunk);
  color: var(--ink);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color var(--dur);
  width: 100%;
  box-sizing: border-box;
}
.ct-input:focus { border-color: var(--ac); }
.ct-textarea {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-sunk);
  color: var(--ink);
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  outline: none;
  transition: border-color var(--dur);
  width: 100%;
  box-sizing: border-box;
}
.ct-textarea:focus { border-color: var(--ac); }
.ct-privacy {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12.5px;
  color: var(--ink-3);
  cursor: pointer;
  line-height: 1.4;
}
.ct-privacy-check { margin-top: 2px; flex-shrink: 0; }
.ct-form-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 0;
  padding: 10px 12px;
  background: color-mix(in oklab, var(--danger) 10%, var(--paper));
  color: var(--danger);
  border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.4;
}
.ct-submit-btn {
  height: 48px;
  margin-top: 4px;
  border: none;
  border-radius: 10px;
  background: var(--ink);
  color: var(--bg);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity var(--dur);
}
.ct-submit-btn:hover { opacity: 0.88; }
.ct-direct-mail {
  font-size: 11.5px;
  color: var(--ink-3);
  text-align: center;
  margin: 4px 0 0;
}
.ct-mail-link { color: var(--ac); font-weight: 500; text-decoration: none; }
.ct-mail-link:hover { text-decoration: underline; }

/* Success */
.ct-success {
  text-align: center;
  padding: 20px 0;
}
.ct-success-icon {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--ac-soft);
  color: var(--ac);
  display: grid;
  place-items: center;
  margin: 0 auto 16px;
  font-size: 26px;
}
.ct-success-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}
.ct-success-sub {
  margin: 0;
  font-size: 14px;
  color: var(--ink-3);
}

/* ── CONTACTS ── */
.ct-contacts-section {
  padding: 60px 32px 80px;
  background: var(--bg-sunk);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.ct-eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  margin: 0 0 8px;
}
.ct-section-head {
  margin-bottom: 36px;
}
.ct-section-title {
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 0;
}
.ct-contacts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.ct-contact-card {
  position: relative;
  padding: 24px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.ct-contact-card:hover {
  box-shadow: var(--shadow-sm);
}
.ct-contact-card--accent {
  border-color: color-mix(in oklab, var(--ac) 35%, var(--line));
}
.ct-primo-badge {
  position: absolute;
  top: 16px; right: 16px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--ac);
  color: var(--ac-contrast);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: var(--f-mono);
}
.ct-contact-avatar {
  width: 52px; height: 52px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--bg);
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 700;
  font-family: var(--f-mono);
  margin-bottom: 16px;
}
.ct-contact-avatar--accent {
  background: var(--ac);
  color: var(--ac-contrast);
}
.ct-contact-name {
  margin: 0 0 2px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.ct-contact-role {
  font-family: var(--f-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ac);
  font-weight: 500;
  margin-bottom: 16px;
}
.ct-contact-links { display: flex; flex-direction: column; gap: 10px; }
.ct-contact-link {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--ink-2);
  text-decoration: none;
  word-break: break-all;
  transition: color var(--dur);
}
.ct-contact-link:hover { color: var(--ac); }
.ct-contact-link--muted { color: var(--ink-3); }
.ct-contact-link--muted:hover { color: var(--ink-3); }
.ct-link-icon {
  width: 24px; height: 24px;
  border-radius: 6px;
  background: var(--bg-sunk);
  color: var(--ac);
  display: grid;
  place-items: center;
  font-size: 12px;
  flex-shrink: 0;
}

/* ── FAQ ── */
.ct-faq-section {
  padding: 60px 32px 80px;
}
.ct-faq-list { display: flex; flex-direction: column; gap: 8px; margin-top: 32px; }
.ct-faq-item {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
  overflow: hidden;
}
.ct-faq-q {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--ink);
  font-family: inherit;
}
.ct-faq-q:hover { background: var(--bg-hover); }
.ct-faq-icon {
  color: var(--ink-3);
  font-size: 20px;
  font-weight: 300;
  flex-shrink: 0;
  transition: transform var(--dur);
}
.ct-faq-icon--open { transform: rotate(45deg); }
.ct-faq-a {
  padding: 0 18px 14px;
  font-size: 13.5px;
  color: var(--ink-3);
  line-height: 1.55;
}

/* ── RESPONSIVE ── */
@media (max-width: 860px) {
  .ct-main-section { padding: 40px 20px; }
  .ct-main-inner { grid-template-columns: 1fr; }
  .ct-form-wrap { position: static; }
  .ct-contacts-section { padding: 40px 20px 60px; }
  .ct-contacts-grid { grid-template-columns: 1fr; }
  .ct-faq-section { padding: 40px 20px 60px; }
  .ct-inner { padding: 0 20px; }
  .ct-inner--narrow { padding: 0 20px; }
}
@media (max-width: 640px) {
  .ct-hero { padding: 36px 0 24px; }
  .ct-hero-content { padding: 0 20px; }
  .ct-hero-title { font-size: 30px; }
  .ct-field-row { grid-template-columns: 1fr; }
}
</style>
