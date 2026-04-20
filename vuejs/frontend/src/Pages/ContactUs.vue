<script setup>
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { onMounted, nextTick } from 'vue';

  onMounted(async () => {
          nextTick(() => {
              document.title = 'Contattaci';
          });
  });
</script>

<template>
  <AppLayout>
    <div class="contact-page">
      <div class="contact-container">
        <p class="text-overline">Supporto</p>
        <h1 class="contact-title">Contattaci</h1>
        <p class="contact-subtitle">Puoi contattarci ai seguenti indirizzi email o numeri di telefono.</p>

        <div class="contact-cards">

          <div class="ds-card contact-card">
            <div class="contact-avatar">F</div>
            <div class="contact-info">
              <h3 class="contact-name">Filippo</h3>
              <a href="mailto:filippomanzini02@outlook.com" class="contact-detail">
                <i class="bi bi-envelope"></i>
                filippomanzini02@outlook.com
              </a>
              <a href="tel:+393457903167" class="contact-detail">
                <i class="bi bi-telephone"></i>
                +39 345 790 3167
              </a>
            </div>
          </div>

          <div class="ds-card contact-card">
            <div class="contact-avatar">P</div>
            <div class="contact-info">
              <h3 class="contact-name">Pietro</h3>
              <a href="mailto:comelli.pietro@outlook.com" class="contact-detail">
                <i class="bi bi-envelope"></i>
                comelli.pietro@gmail.com
              </a>
              <a href="tel:+393279152295c@outlo" class="contact-detail">
                <i class="bi bi-telephone"></i>
                +39 327 915 2295
              </a>
            </div>
          </div>

          <div class="ds-card contact-card">
            <div class="contact-avatar">M</div>
            <div class="contact-info">
              <h3 class="contact-name">Mattia</h3>
              <a href="" class="contact-detail">
                <i class="bi bi-envelope"></i>
                Non disponibile
              </a>
              <a href="tel:+393460605599" class="contact-detail">
                <i class="bi bi-telephone"></i>
                +39 346 060 5599
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.contact-page {
    padding: var(--s-8) 0 var(--s-9);
    background: var(--bg);
    min-height: calc(100vh - 64px);
    font-family: var(--f-sans, 'Geist', sans-serif);
}

.contact-container {
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

.contact-title {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-3) 0;
    letter-spacing: -0.03em;
    line-height: 1.1;
}

.contact-subtitle {
    font-size: 15px;
    color: var(--ink-3);
    margin: 0 0 var(--s-7) 0;
    line-height: 1.55;
}

.contact-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--s-4);
}

.contact-card {
    display: flex;
    align-items: flex-start;
    gap: var(--s-4);
    padding: var(--s-5);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    transition: border-color 160ms, transform 160ms;
}
.contact-card:hover {
    border-color: color-mix(in oklab, var(--ac) 30%, var(--line));
    transform: translateY(-2px);
}

.contact-avatar {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    background: var(--ink);
    color: var(--paper);
    border-radius: 50%;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 15px;
    font-weight: 700;
    flex-shrink: 0;
}

.contact-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
}

.contact-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 4px;
    letter-spacing: -0.01em;
}

.contact-detail {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ink-2);
    text-decoration: none;
    transition: color 120ms;
    word-break: break-all;
}
.contact-detail i {
    color: var(--ink-3);
    flex-shrink: 0;
}
.contact-detail:hover {
    color: var(--ac);
}
.contact-detail:hover i {
    color: var(--ac);
}

@media (max-width: 640px) {
    .contact-container { padding: 0 var(--s-4); }
}
</style>
