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
    padding: var(--space-10) 0 var(--space-16);
}

.contact-container {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 var(--space-6);
}

.contact-title {
    font-size: var(--text-3xl);
    font-weight: 800;
    color: var(--color-text);
    margin: var(--space-2) 0;
    letter-spacing: var(--tracking-tight);
}

.contact-subtitle {
    font-size: var(--text-md);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-8) 0;
}

.contact-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.contact-card {
    display: flex;
    align-items: flex-start;
    gap: var(--space-5);
    padding: var(--space-6);
}

.contact-avatar {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-radius: var(--radius-full);
    font-size: var(--text-lg);
    font-weight: 700;
    flex-shrink: 0;
}

.contact-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.contact-name {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
}

.contact-detail {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast);
}

.contact-detail:hover {
    color: var(--color-primary);
}
</style>
