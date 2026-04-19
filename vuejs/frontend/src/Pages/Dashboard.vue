<script setup>
import { useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import { onMounted, nextTick, ref } from 'vue';
import { useStore } from 'vuex';
import { API_BASE } from '@/utils';

const router = useRouter();
const store = useStore();
const isLoggedIn = ref(false);
const username = ref('');
const elementCount = ref(0);
const categoryCount = ref(0);
const hasSiteConfig = ref(false);
const restaurantName = ref('');
const siteUrl = ref('');
const foodCount = ref(0);
const drinkCount = ref(0);
const uniqueIngredientsCount = ref(0);
const uniqueAllergensCount = ref(0);
const categoriesDetail = ref([]);

const loadStats = async () => {
  const tkn = store.getters.getToken;
  if (!tkn) return;

  try {
    // Recupera info utente
    const userRes = await fetch(`${API_BASE}/api/users/me?populate=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tkn}`,
        'Content-Type': 'application/json',
      },
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      username.value = userData.username;

      // Recupera menu dell'utente
      const menuRes = await fetch(`${API_BASE}/api/menus`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tkn}`,
          'Content-Type': 'application/json',
        },
      });
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        if (menuData.data && menuData.data.length > 0) {
          const elements = menuData.data[0].fk_elements || [];
          elementCount.value = elements.length;
          const cats = new Set(elements.map(el => el.category));
          categoryCount.value = cats.size;

          // Statistiche dettagliate
          const drinkCategories = ['bevande'];
          drinkCount.value = elements.filter(el =>
            drinkCategories.includes(el.category.toLowerCase())
          ).length;
          foodCount.value = elementCount.value - drinkCount.value;

          // Ingredienti unici
          const allIngredients = new Set();
          elements.forEach(el => {
            if (el.ingredients && Array.isArray(el.ingredients)) {
              el.ingredients.forEach(i => allIngredients.add(i.toLowerCase()));
            }
          });
          uniqueIngredientsCount.value = allIngredients.size;

          // Allergeni unici
          const allAllergens = new Set();
          elements.forEach(el => {
            if (el.allergens && Array.isArray(el.allergens)) {
              el.allergens.forEach(a => allAllergens.add(a.toLowerCase()));
            }
          });
          uniqueAllergensCount.value = allAllergens.size;

          // Dettaglio per categoria
          const catMap = {};
          elements.forEach(el => {
            catMap[el.category] = (catMap[el.category] || 0) + 1;
          });
          categoriesDetail.value = Object.entries(catMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        }
      }

      const wcRes = await fetch(`${API_BASE}/api/account/website-config`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tkn}`,
          'Content-Type': 'application/json',
        },
      });
      if (wcRes.ok) {
        const wcData = await wcRes.json();
        if (wcData.data) {
          hasSiteConfig.value = !!wcData.data.site_url;
          restaurantName.value = wcData.data.restaurant_name || '';
          siteUrl.value = wcData.data.site_url || '';
        }
      }
    }
  } catch (error) {
    console.error('Errore nel caricamento statistiche:', error);
  }
};

onMounted(async () => {
  nextTick(() => {
    document.title = 'Dashboard';
  });
  isLoggedIn.value = store.getters.isAuthenticated;
  if (isLoggedIn.value) {
    await loadStats();
  }
});
</script>

<template>
  <AppLayout>
    <!-- ========== AUTHENTICATED DASHBOARD ========== -->
    <template v-if="isLoggedIn">
      <!-- Hero -->
      <section class="dash-hero">
        <div class="dash-container">
          <div class="dash-hero-content">
            <p class="text-overline">Dashboard</p>
            <h1 class="dash-hero-title">Ciao, {{ username }}</h1>
            <p v-if="restaurantName && restaurantName !== username" class="dash-hero-subtitle">{{ restaurantName }}</p>
          </div>
        </div>
      </section>

      <!-- Stats grid -->
      <section class="dash-section">
        <div class="dash-container">
          <div class="stats-grid">
            <div class="ds-card stat-card" v-motion-slide-visible-bottom :delay="0">
              <div class="ds-stat">
                <div class="ds-stat-icon" style="background: var(--color-primary-light); color: var(--color-primary);">
                  <i class="bi bi-journal-text"></i>
                </div>
                <span class="ds-stat-value">{{ elementCount }}</span>
                <span class="ds-stat-label">Elementi totali</span>
              </div>
            </div>
            <div class="ds-card stat-card" v-motion-slide-visible-bottom :delay="50">
              <div class="ds-stat">
                <div class="ds-stat-icon" style="background: var(--color-warning-light); color: var(--color-warning);">
                  <i class="bi bi-egg-fried"></i>
                </div>
                <span class="ds-stat-value">{{ foodCount }}</span>
                <span class="ds-stat-label">Piatti</span>
              </div>
            </div>
            <div class="ds-card stat-card" v-motion-slide-visible-bottom :delay="100">
              <div class="ds-stat">
                <div class="ds-stat-icon" style="background: var(--color-info-light); color: var(--color-info);">
                  <i class="bi bi-cup-straw"></i>
                </div>
                <span class="ds-stat-value">{{ drinkCount }}</span>
                <span class="ds-stat-label">Bevande</span>
              </div>
            </div>
            <div class="ds-card stat-card" v-motion-slide-visible-bottom :delay="150">
              <div class="ds-stat">
                <div class="ds-stat-icon" style="background: var(--color-accent-light); color: var(--color-accent);">
                  <i class="bi bi-tags"></i>
                </div>
                <span class="ds-stat-value">{{ categoryCount }}</span>
                <span class="ds-stat-label">Categorie</span>
              </div>
            </div>
            <div class="ds-card stat-card" v-motion-slide-visible-bottom :delay="200">
              <div class="ds-stat">
                <div class="ds-stat-icon" style="background: var(--color-bg-muted); color: var(--color-text-secondary);">
                  <i class="bi bi-list-check"></i>
                </div>
                <span class="ds-stat-value">{{ uniqueIngredientsCount }}</span>
                <span class="ds-stat-label">Ingredienti unici</span>
              </div>
            </div>
            <div class="ds-card stat-card" v-motion-slide-visible-bottom :delay="250">
              <div class="ds-stat">
                <div class="ds-stat-icon" style="background: var(--color-destructive-light); color: var(--color-destructive);">
                  <i class="bi bi-exclamation-triangle"></i>
                </div>
                <span class="ds-stat-value">{{ uniqueAllergensCount }}</span>
                <span class="ds-stat-label">Allergeni</span>
              </div>
            </div>
          </div>

          <!-- Detail cards row -->
          <div class="detail-grid">
            <!-- Category breakdown -->
            <div class="ds-card" v-motion-slide-visible-bottom :delay="100">
              <div class="ds-card-header">
                <i class="bi bi-bar-chart" style="color: var(--color-primary);"></i>
                <h3 class="card-title">Elementi per categoria</h3>
              </div>
              <div class="ds-card-body">
                <div v-if="categoriesDetail.length === 0" class="ds-empty">
                  <div class="ds-empty-icon"><i class="bi bi-inbox"></i></div>
                  <p class="ds-empty-description">Nessun elemento nel menu</p>
                </div>
                <div v-for="cat in categoriesDetail" :key="cat.name" class="category-row">
                  <div class="category-row-header">
                    <span class="category-name">{{ cat.name }}</span>
                    <span class="category-count">{{ cat.count }}</span>
                  </div>
                  <div class="ds-progress">
                    <div class="ds-progress-bar" :style="{ width: (cat.count / elementCount * 100) + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Site status -->
            <div class="ds-card" v-motion-slide-visible-bottom :delay="200">
              <div class="ds-card-header">
                <i class="bi bi-globe2" style="color: var(--color-info);"></i>
                <h3 class="card-title">Sito menu</h3>
              </div>
              <div class="ds-card-body">
                <div v-if="hasSiteConfig" class="site-status">
                  <div class="ds-badge ds-badge-accent">Configurato</div>
                  <p class="site-url-label">URL del tuo sito menu:</p>
                  <a :href="siteUrl" target="_blank" class="site-url-link">{{ siteUrl }}</a>
                  <button @click="router.push({ path: '/profile/show', query: { section: 'sito' } })" class="ds-btn ds-btn-secondary site-action-btn">
                    <i class="bi bi-gear"></i>
                    <span>Gestisci configurazione</span>
                  </button>
                </div>
                <div v-else class="site-status site-status-empty">
                  <div class="ds-badge ds-badge-warning">Da configurare</div>
                  <p class="site-url-label">Configura il tuo sito web per renderlo visibile ai clienti.</p>
                  <button @click="router.push({ path: '/profile/show', query: { section: 'sito' } })" class="ds-btn ds-btn-primary site-action-btn">
                    <i class="bi bi-plus-lg"></i>
                    <span>Configura ora</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick actions -->
          <div class="quick-actions">
            <p class="text-overline">Azioni rapide</p>
            <div class="actions-grid">
              <button @click="router.push('/menu-handler')" class="action-card ds-card">
                <i class="bi bi-journal-text action-icon" style="color: var(--color-primary);"></i>
                <span class="action-label">Gestisci Menu</span>
                <i class="bi bi-arrow-right action-arrow"></i>
              </button>
              <button @click="router.push({ path: '/profile/show', query: { section: 'sito' } })" class="action-card ds-card">
                <i class="bi bi-globe2 action-icon" style="color: var(--color-accent);"></i>
                <span class="action-label">Configurazione Sito</span>
                <i class="bi bi-arrow-right action-arrow"></i>
              </button>
              <button @click="router.push('/profile/show')" class="action-card ds-card">
                <i class="bi bi-person action-icon" style="color: var(--color-text-secondary);"></i>
                <span class="action-label">Il tuo Profilo</span>
                <i class="bi bi-arrow-right action-arrow"></i>
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- ========== PUBLIC LANDING ========== -->
    <template v-if="!isLoggedIn">
      <!-- Hero -->
      <section class="landing-hero">
        <div class="dash-container">
          <div class="landing-hero-content">
            <div class="ds-badge ds-badge-primary landing-badge">Il tuo menu digitale</div>
            <h1 class="landing-title">Crea il menu digitale del tuo ristorante</h1>
            <p class="landing-subtitle">Gestisci il tuo menu online, genera un QR code e condividilo con i tuoi clienti. Tutto in un unico posto.</p>
            <div class="landing-cta">
              <button @click="router.push('/register')" class="ds-btn ds-btn-primary ds-btn-lg">
                Inizia gratis
              </button>
              <button @click="router.push('/login')" class="ds-btn ds-btn-secondary ds-btn-lg">
                Accedi
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Features -->
      <section class="landing-features">
        <div class="dash-container">
          <p class="text-overline" style="text-align: center; margin-bottom: var(--space-2);">Funzionalità</p>
          <h2 class="section-title">Cosa offriamo</h2>
          <div class="features-grid">
            <div class="ds-card feature-card" v-motion-slide-visible-bottom :delay="0">
              <div class="feature-icon" style="background: var(--color-primary-light); color: var(--color-primary);">
                <i class="bi bi-journal-richtext"></i>
              </div>
              <h3 class="feature-title">Menu personalizzabile</h3>
              <p class="feature-desc">Aggiungi piatti, prezzi, ingredienti e allergeni in pochi click.</p>
            </div>
            <div class="ds-card feature-card" v-motion-slide-visible-bottom :delay="100">
              <div class="feature-icon" style="background: var(--color-accent-light); color: var(--color-accent);">
                <i class="bi bi-qr-code"></i>
              </div>
              <h3 class="feature-title">QR Code</h3>
              <p class="feature-desc">Genera un QR code per il tuo menu e condividilo ovunque.</p>
            </div>
            <div class="ds-card feature-card" v-motion-slide-visible-bottom :delay="200">
              <div class="feature-icon" style="background: var(--color-info-light); color: var(--color-info);">
                <i class="bi bi-code-slash"></i>
              </div>
              <h3 class="feature-title">API pubblica</h3>
              <p class="feature-desc">Integra il menu nel tuo sito web tramite la nostra API REST.</p>
            </div>
            <div class="ds-card feature-card" v-motion-slide-visible-bottom :delay="300">
              <div class="feature-icon" style="background: var(--color-warning-light); color: var(--color-warning);">
                <i class="bi bi-grid"></i>
              </div>
              <h3 class="feature-title">Categorie</h3>
              <p class="feature-desc">Organizza il menu in categorie per una consultazione facile.</p>
            </div>
          </div>
        </div>
      </section>
    </template>
  </AppLayout>
</template>

<style scoped>
.dash-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-6);
}

/* --- Authenticated Hero --- */
.dash-hero {
  padding: var(--space-10) 0 var(--space-8);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
}

.dash-hero-title {
  font-size: var(--text-3xl);
  font-weight: 800;
  color: var(--color-text);
  margin: var(--space-2) 0;
  letter-spacing: var(--tracking-tight);
}

.dash-hero-subtitle {
  font-size: var(--text-md);
  color: var(--color-text-secondary);
  margin: 0;
}

/* --- Stats --- */
.dash-section {
  padding: var(--space-8) 0 var(--space-12);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-8);
}

.stat-card {
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

/* --- Detail cards --- */
.detail-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: var(--space-6);
  margin-bottom: var(--space-8);
}

.card-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.category-row {
  margin-bottom: var(--space-4);
}

.category-row:last-child {
  margin-bottom: 0;
}

.category-row-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.category-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
}

.category-count {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

/* Site status */
.site-status {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.site-url-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}

.site-url-link {
  font-size: var(--text-sm);
  color: var(--color-primary);
  text-decoration: none;
  word-break: break-all;
  transition: color var(--transition-fast);
}

.site-url-link:hover {
  color: var(--color-primary-hover);
}

.site-action-btn {
  width: 100%;
  margin-top: var(--space-2);
}

/* Quick actions */
.quick-actions {
  margin-bottom: var(--space-8);
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-top: var(--space-4);
}

.action-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  font-family: var(--font-family);
}

.action-card:hover {
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.action-icon {
  font-size: var(--text-xl);
  flex-shrink: 0;
}

.action-label {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  flex: 1;
}

.action-arrow {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  transition: transform var(--transition-fast);
}

.action-card:hover .action-arrow {
  transform: translateX(3px);
}

/* ========== Landing ========== */
.landing-hero {
  padding: var(--space-20) 0;
  text-align: center;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
}

.landing-hero-content {
  max-width: 640px;
  margin: 0 auto;
}

.landing-badge {
  margin-bottom: var(--space-5);
}

.landing-title {
  font-size: var(--text-4xl);
  font-weight: 800;
  color: var(--color-text);
  margin: 0 0 var(--space-4) 0;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
}

.landing-subtitle {
  font-size: var(--text-lg);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-8) 0;
  line-height: var(--leading-relaxed);
}

.landing-cta {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
}

/* Features */
.landing-features {
  padding: var(--space-16) 0;
}

.section-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  text-align: center;
  margin: 0 0 var(--space-10) 0;
  letter-spacing: var(--tracking-tight);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-6);
}

.feature-card {
  padding: var(--space-6);
  text-align: center;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.feature-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}

.feature-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  font-size: var(--text-xl);
  margin: 0 auto var(--space-4);
}

.feature-title {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 var(--space-2) 0;
}

.feature-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  line-height: var(--leading-relaxed);
}

/* --- Responsive --- */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .actions-grid {
    grid-template-columns: 1fr;
  }

  .landing-title {
    font-size: var(--text-3xl);
  }

  .landing-cta {
    flex-direction: column;
    align-items: center;
  }

  .landing-cta .ds-btn {
    width: 100%;
    max-width: 280px;
  }

  .dash-container {
    padding: 0 var(--space-4);
  }
}

@media (max-width: 640px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>
