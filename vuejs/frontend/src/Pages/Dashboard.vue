<script setup>
import { useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import { onMounted, nextTick, ref, computed } from 'vue';
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
    const userRes = await fetch(`${API_BASE}/api/users/me?populate=*`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tkn}`, 'Content-Type': 'application/json' },
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      username.value = userData.username;
      const menuRes = await fetch(`${API_BASE}/api/menus`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tkn}`, 'Content-Type': 'application/json' },
      });
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        if (menuData.data && menuData.data.length > 0) {
          const elements = menuData.data[0].fk_elements || [];
          elementCount.value = elements.length;
          const cats = new Set(elements.map(el => el.category));
          categoryCount.value = cats.size;
          const drinkCategories = ['bevande'];
          drinkCount.value = elements.filter(el => drinkCategories.includes((el.category || '').toLowerCase())).length;
          foodCount.value = elementCount.value - drinkCount.value;
          const allIngredients = new Set();
          elements.forEach(el => {
            if (el.ingredients && Array.isArray(el.ingredients)) {
              el.ingredients.forEach(i => allIngredients.add(i.toLowerCase()));
            }
          });
          uniqueIngredientsCount.value = allIngredients.size;
          const allAllergens = new Set();
          elements.forEach(el => {
            if (el.allergens && Array.isArray(el.allergens)) {
              el.allergens.forEach(a => allAllergens.add(a.toLowerCase()));
            }
          });
          uniqueAllergensCount.value = allAllergens.size;
          const catMap = {};
          elements.forEach(el => { catMap[el.category] = (catMap[el.category] || 0) + 1; });
          categoriesDetail.value = Object.entries(catMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        }
      }
      const wcRes = await fetch(`${API_BASE}/api/account/website-config`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tkn}`, 'Content-Type': 'application/json' },
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

const now = ref(new Date());
const serviceTime = computed(() => {
  const d = now.value;
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
});
const todayLabel = computed(() => {
  const d = now.value;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
});

onMounted(async () => {
  nextTick(() => { document.title = 'Tavolo — Dashboard'; });
  isLoggedIn.value = store.getters.isAuthenticated;
  if (isLoggedIn.value) {
    await loadStats();
    setInterval(() => { now.value = new Date(); }, 30000);
  }
});
</script>

<template>
  <AppLayout>
    <!-- ================== AUTH DASHBOARD ================== -->
    <template v-if="isLoggedIn">
      <div class="page" data-role="manager">
        <header class="page-header">
          <div class="page-header-inner">
            <div>
              <div class="page-kicker">Dashboard</div>
              <h1 class="page-title">Buonasera, {{ username || 'Mario' }}</h1>
              <p class="page-sub">{{ todayLabel }} · Servizio aperto alle 19:00</p>
            </div>
            <div class="live-pill">
              <span class="dot-pulse"></span>
              LIVE · {{ serviceTime }}
            </div>
          </div>
        </header>

        <div class="page-body">
          <div class="container">
            <!-- KPI strip -->
            <section class="kpi-grid">
              <article class="kpi kpi--ac fade-up">
                <div class="kpi-label">Elementi menu</div>
                <div class="kpi-value">{{ elementCount }}</div>
                <div class="kpi-delta">{{ categoryCount }} categorie</div>
              </article>
              <article class="kpi fade-up d1">
                <div class="kpi-label">Piatti</div>
                <div class="kpi-value">{{ foodCount }}</div>
                <div class="kpi-delta kpi-delta--up">▲ catalogati</div>
              </article>
              <article class="kpi fade-up d2">
                <div class="kpi-label">Bevande</div>
                <div class="kpi-value">{{ drinkCount }}</div>
                <div class="kpi-delta">in carta</div>
              </article>
              <article class="kpi fade-up d3">
                <div class="kpi-label">Ingredienti</div>
                <div class="kpi-value">{{ uniqueIngredientsCount }}</div>
                <div class="kpi-delta">tracciati</div>
              </article>
              <article class="kpi fade-up d4">
                <div class="kpi-label">Allergeni</div>
                <div class="kpi-value">{{ uniqueAllergensCount }}</div>
                <div class="kpi-delta">segnalati</div>
              </article>
            </section>

            <!-- Detail rows -->
            <section class="detail-row fade-up">
              <!-- Category breakdown -->
              <div class="card card-pad">
                <div class="card-h">
                  <div class="card-h-title">
                    <i class="bi bi-bar-chart-line" aria-hidden="true"></i>
                    <h3>Composizione del menu</h3>
                  </div>
                  <span class="chip chip-info">{{ categoriesDetail.length }} categorie</span>
                </div>
                <div v-if="categoriesDetail.length === 0" class="empty">
                  <div class="empty-icon"><i class="bi bi-inbox"></i></div>
                  <p class="empty-title">Nessun elemento nel menu</p>
                  <p class="empty-desc">Aggiungi il primo piatto per iniziare.</p>
                  <button class="btn btn-primary btn-sm" @click="router.push('/menu-handler')">
                    <i class="bi bi-plus-lg"></i> Apri gestione menu
                  </button>
                </div>
                <div v-else class="cat-list">
                  <div v-for="cat in categoriesDetail" :key="cat.name" class="cat-row">
                    <div class="cat-head">
                      <span class="cat-name">{{ cat.name }}</span>
                      <span class="cat-count">{{ cat.count }}</span>
                    </div>
                    <div class="bar-track">
                      <div class="bar-fill" :style="{ width: (cat.count / Math.max(elementCount, 1) * 100) + '%' }"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Website status -->
              <div class="card card-pad">
                <div class="card-h">
                  <div class="card-h-title">
                    <i class="bi bi-globe2" aria-hidden="true"></i>
                    <h3>Sito pubblico</h3>
                  </div>
                  <span class="chip" :class="hasSiteConfig ? 'chip-ok' : 'chip-warn'">
                    {{ hasSiteConfig ? 'Configurato' : 'Da configurare' }}
                  </span>
                </div>
                <div v-if="hasSiteConfig" class="site-ok">
                  <div class="site-url-block">
                    <div class="site-url-label">Il tuo menu online</div>
                    <a :href="siteUrl" target="_blank" rel="noopener" class="site-url-link">
                      <i class="bi bi-link-45deg"></i>{{ siteUrl }}
                    </a>
                  </div>
                  <div class="site-actions">
                    <button class="btn btn-ghost btn-sm" @click="router.push({ path: '/profile/show', query: { section: 'sito' } })">
                      <i class="bi bi-gear"></i> Gestisci
                    </button>
                    <button class="btn btn-primary btn-sm" @click="router.push({ path: '/profile/show', query: { section: 'sito' } })">
                      <i class="bi bi-qr-code"></i> Vedi QR
                    </button>
                  </div>
                </div>
                <div v-else class="site-empty">
                  <p class="empty-desc">Configura il sito e genera il QR code per renderlo accessibile ai tuoi clienti.</p>
                  <button class="btn btn-primary btn-sm" @click="router.push({ path: '/profile/show', query: { section: 'sito' } })">
                    <i class="bi bi-plus-lg"></i> Configura ora
                  </button>
                </div>
              </div>
            </section>

            <!-- Quick actions -->
            <section class="quick-grid fade-up">
              <button class="quick-card" @click="router.push('/menu-handler')">
                <div class="quick-icon"><i class="bi bi-journal-text"></i></div>
                <div class="quick-body">
                  <div class="quick-title">Gestisci il menu</div>
                  <div class="quick-sub">Aggiungi piatti, importa da PDF</div>
                </div>
                <i class="bi bi-arrow-right quick-arrow"></i>
              </button>
              <button class="quick-card" @click="router.push('/reservations')">
                <div class="quick-icon"><i class="bi bi-calendar-check"></i></div>
                <div class="quick-body">
                  <div class="quick-title">Prenotazioni</div>
                  <div class="quick-sub">Vedi richieste e sala</div>
                </div>
                <i class="bi bi-arrow-right quick-arrow"></i>
              </button>
              <button class="quick-card" @click="router.push('/orders')">
                <div class="quick-icon"><i class="bi bi-grid-3x3-gap"></i></div>
                <div class="quick-body">
                  <div class="quick-title">Sala e ordini</div>
                  <div class="quick-sub">Apri tavoli, porta piatti</div>
                </div>
                <i class="bi bi-arrow-right quick-arrow"></i>
              </button>
              <button class="quick-card" @click="router.push({ path: '/profile/show', query: { section: 'sito' } })">
                <div class="quick-icon"><i class="bi bi-qr-code"></i></div>
                <div class="quick-body">
                  <div class="quick-title">Sito & QR</div>
                  <div class="quick-sub">Condividi il menu online</div>
                </div>
                <i class="bi bi-arrow-right quick-arrow"></i>
              </button>
            </section>
          </div>
        </div>
      </div>
    </template>

    <!-- ================== PUBLIC LANDING ================== -->
    <template v-else>
      <div class="landing">
        <!-- HERO -->
        <section class="hero">
          <div class="container hero-inner">
            <span class="eyebrow fade-up"><span class="dot-pulse"></span> In beta aperta per i ristoranti in Italia</span>
            <h1 class="hero-title fade-up d1">
              Tutto il tuo ristorante, su un <em>tavolo</em> solo.
            </h1>
            <p class="hero-lede fade-up d2">
              Tavolo è il gestionale che fa lavorare insieme sala, cucina e cassa.
              Ordini in tempo reale, prenotazioni online, menu digitale con QR, chiusura conti in un tocco.
              Dal cameriere al titolare, ognuno vede quello che gli serve — e nient'altro.
            </p>
            <div class="hero-ctas fade-up d3">
              <button @click="router.push('/register')" class="btn btn-primary btn-lg btn-pill">
                Inizia gratis per 14 giorni
                <i class="bi bi-arrow-right"></i>
              </button>
              <a href="#come-funziona" class="btn btn-ghost btn-lg btn-pill">Guarda come funziona</a>
            </div>
            <div class="hero-badges fade-up d4">
              <span><i class="bi bi-check2"></i> Nessuna carta richiesta</span>
              <span><i class="bi bi-check2"></i> Setup in 10 minuti</span>
              <span><i class="bi bi-check2"></i> Assistenza in italiano</span>
            </div>

            <!-- Mockup -->
            <div class="hero-preview fade-up d4" aria-hidden="true">
              <div class="win-chrome">
                <div class="chrome-dots"><span></span><span></span><span></span></div>
                <div class="chrome-url">tavolo.app / osteria-bellini</div>
                <div style="width:60px;"></div>
              </div>
              <div class="mock">
                <aside class="mock-side">
                  <div class="mock-brand"><span class="brand-mark">T</span><span>Tavolo</span></div>
                  <div class="mock-nav-item is-active"><i class="bi bi-speedometer2"></i>Dashboard</div>
                  <div class="mock-nav-item"><i class="bi bi-grid-3x3-gap"></i>Sala</div>
                  <div class="mock-nav-item"><i class="bi bi-fire"></i>Cucina <span class="mock-badge">7</span></div>
                  <div class="mock-nav-item"><i class="bi bi-credit-card"></i>Cassa</div>
                  <div class="mock-nav-item"><i class="bi bi-calendar-check"></i>Prenotazioni <span class="mock-badge">3</span></div>
                  <div class="mock-nav-item"><i class="bi bi-journal-text"></i>Menu</div>
                </aside>
                <main class="mock-main">
                  <div class="mock-h">
                    <div>
                      <h4>Buonasera, Mario</h4>
                      <p>Giovedì, 19 settembre · Servizio cena iniziato alle 19:00</p>
                    </div>
                    <div class="mock-live">LIVE · 20:47</div>
                  </div>
                  <div class="mock-kpis">
                    <div class="mock-kpi"><div class="l">Coperti</div><div class="v">72</div><div class="d">▲ +12% vs ieri</div></div>
                    <div class="mock-kpi"><div class="l">Incasso</div><div class="v">€1.284</div><div class="d">▲ +8%</div></div>
                    <div class="mock-kpi"><div class="l">Tavoli attivi</div><div class="v">8<span class="mock-sub">/12</span></div><div class="d">&nbsp;</div></div>
                  </div>
                  <div class="mock-tables">
                    <div class="mock-tbl"><div class="n">01</div><div class="s">Libero</div></div>
                    <div class="mock-tbl is-occupied"><div class="n">03</div><div class="s">€86,50 · 22m</div></div>
                    <div class="mock-tbl is-occupied"><div class="n">06</div><div class="s">€142 · 38m</div></div>
                    <div class="mock-tbl"><div class="n">07</div><div class="s">Libero</div></div>
                    <div class="mock-tbl is-occupied is-ready"><div class="n">08</div><div class="s">Pronto al conto</div></div>
                    <div class="mock-tbl is-occupied"><div class="n">10</div><div class="s">€318 · 52m</div></div>
                    <div class="mock-tbl"><div class="n">11</div><div class="s">Libero</div></div>
                    <div class="mock-tbl"><div class="n">12</div><div class="s">Libero</div></div>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </section>

        <!-- STATS BAND -->
        <div class="stats-band">
          <div class="container stats-inner">
            <div class="stat-item"><div class="stat-v">1.400+</div><div class="stat-l">ristoranti italiani</div></div>
            <div class="stat-item"><div class="stat-v">2,8 M</div><div class="stat-l">coperti serviti all'anno</div></div>
            <div class="stat-item"><div class="stat-v">−32%</div><div class="stat-l">tempo medio al tavolo</div></div>
            <div class="stat-item"><div class="stat-v">98%</div><div class="stat-l">clienti che ci consigliano</div></div>
          </div>
        </div>

        <!-- FEATURES (dark) -->
        <section id="funzionalita" class="section section--dark">
          <div class="container">
            <div class="section-h">
              <div class="kicker">Un gestionale · quattro ruoli</div>
              <h2>Un'interfaccia diversa per ogni persona in squadra.</h2>
              <p>Dalla sala alla cassa passando per la cucina, Tavolo mostra a ognuno solo quello che gli serve per lavorare bene. Senza menù infiniti, senza clic persi.</p>
            </div>
            <div class="roles-grid">
              <article class="role-card-landing">
                <span class="role-num">01</span>
                <div>
                  <div class="role-icon"><i class="bi bi-grid-3x3-gap"></i></div>
                  <h3>Sala</h3>
                  <p>Vedi la sala a colpo d'occhio. Apri un tavolo, aggiungi portate, invia alla cucina.</p>
                </div>
                <ul>
                  <li><i class="bi bi-check2"></i>Griglia tavoli con stato live</li>
                  <li><i class="bi bi-check2"></i>Ordini in 3 tap</li>
                  <li><i class="bi bi-check2"></i>Note allergie evidenziate</li>
                </ul>
              </article>
              <article class="role-card-landing">
                <span class="role-num">02</span>
                <div>
                  <div class="role-icon"><i class="bi bi-fire"></i></div>
                  <h3>Cucina</h3>
                  <p>Board kanban pensato per la brigata. Timer per ogni piatto, avviso quando si va in ritardo.</p>
                </div>
                <ul>
                  <li><i class="bi bi-check2"></i>Stazioni separate (pizza, cucina, bar)</li>
                  <li><i class="bi bi-check2"></i>Avanza di stato con un tap</li>
                  <li><i class="bi bi-check2"></i>Alert quando superi 15 minuti</li>
                </ul>
              </article>
              <article class="role-card-landing">
                <span class="role-num">03</span>
                <div>
                  <div class="role-icon"><i class="bi bi-credit-card-2-back"></i></div>
                  <h3>Cassa</h3>
                  <p>Preconto, scontrino, dividi alla romana. Chiudi un conto in meno di dieci secondi.</p>
                </div>
                <ul>
                  <li><i class="bi bi-check2"></i>Divisione conto automatica</li>
                  <li><i class="bi bi-check2"></i>Contanti, carta, buoni pasto</li>
                  <li><i class="bi bi-check2"></i>Scontrino elettronico integrato</li>
                </ul>
              </article>
              <article class="role-card-landing">
                <span class="role-num">04</span>
                <div>
                  <div class="role-icon"><i class="bi bi-speedometer2"></i></div>
                  <h3>Manager</h3>
                  <p>Dashboard con i numeri che contano. Menu, turni, QR del sito pubblico in un posto solo.</p>
                </div>
                <ul>
                  <li><i class="bi bi-check2"></i>KPI in tempo reale</li>
                  <li><i class="bi bi-check2"></i>Menu digitale con QR incluso</li>
                  <li><i class="bi bi-check2"></i>Storico scontrini e coperti</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <!-- HOW IT WORKS -->
        <section id="come-funziona" class="section section--alt">
          <div class="container">
            <div class="section-h">
              <div class="kicker">Come funziona</div>
              <h2>Dalla scatola al primo coperto in un pomeriggio.</h2>
              <p>Nessun hardware proprietario. Tavolo funziona su qualsiasi iPad, Android o computer che hai già in casa.</p>
            </div>
            <div class="steps">
              <article class="step">
                <h3>Crei l'account</h3>
                <p>Inserisci il nome del ristorante, importi il menu (o parti da un template). 5 minuti.</p>
              </article>
              <article class="step">
                <h3>Disegni la sala</h3>
                <p>Aggiungi tavoli, indichi posti e zone (interni, esterni, privé). Tavolo si adatta alla tua pianta.</p>
              </article>
              <article class="step">
                <h3>Inizi a servire</h3>
                <p>Condividi l'app con la squadra. Ognuno accede con il suo ruolo. Il primo turno è già live.</p>
              </article>
            </div>
          </div>
        </section>

        <!-- QUOTE -->
        <section class="section">
          <div class="quote-wrap">
            <blockquote class="quote">
              "Prima usavamo <em>tre software diversi</em> per sala, cassa e prenotazioni. Con Tavolo abbiamo un solo strumento e la brigata si parla davvero."
            </blockquote>
            <div class="quote-author">
              <div class="quote-avatar">MC</div>
              <div>
                <div class="quote-name">Marta Coletti</div>
                <div class="quote-role">Titolare · Osteria del Borgo, Bologna</div>
              </div>
            </div>
          </div>
        </section>

        <!-- PRICING -->
        <section id="prezzi" class="section section--alt">
          <div class="container">
            <div class="section-h">
              <div class="kicker">Prezzi semplici</div>
              <h2>Un piano che cresce con il ristorante.</h2>
              <p>Nessun costo nascosto, nessuna percentuale sugli incassi. Puoi cambiare o cancellare in qualsiasi momento.</p>
            </div>
            <div class="pricing">
              <article class="price-card">
                <h3>Essenziale</h3>
                <p class="price-sub">Per bistrot e trattorie con un servizio singolo.</p>
                <div class="price">€39,99<span class="price-suffix">/mese</span></div>
                <div class="price-note">IVA esclusa · Fatturato mensilmente</div>
                <ul>
                  <li><i class="bi bi-check2"></i>Vista Sala, Cucina, Cassa</li>
                  <li><i class="bi bi-check2"></i>Fino a 20 tavoli</li>
                  <li><i class="bi bi-check2"></i>Menu digitale + QR</li>
                  <li><i class="bi bi-check2"></i>Assistenza via email</li>
                </ul>
                <button class="btn btn-ghost btn-block btn-pill" @click="router.push('/register')">Inizia gratis</button>
              </article>
              <article class="price-card featured">
                <span class="price-flag">Più scelto</span>
                <h3>Professionale</h3>
                <p class="price-sub">Per ristoranti con sala e dehors attivi tutto l'anno.</p>
                <div class="price">€74,99<span class="price-suffix">/mese</span></div>
                <div class="price-note">IVA esclusa · Fatturato mensilmente</div>
                <ul>
                  <li><i class="bi bi-check2"></i>Tutto di Essenziale</li>
                  <li><i class="bi bi-check2"></i>Prenotazioni online illimitate</li>
                  <li><i class="bi bi-check2"></i>Statistiche storiche e report</li>
                  <li><i class="bi bi-check2"></i>Scontrino elettronico</li>
                  <li><i class="bi bi-check2"></i>Assistenza prioritaria</li>
                </ul>
                <button class="btn btn-primary btn-block btn-pill" @click="router.push('/register')">Prova 14 giorni gratis</button>
              </article>
              <article class="price-card">
                <h3>Catena</h3>
                <p class="price-sub">Per gruppi con più sedi da orchestrare.</p>
                <div class="price">Su misura</div>
                <div class="price-note">Scrivici, ti rispondiamo entro 24 ore</div>
                <ul>
                  <li><i class="bi bi-check2"></i>Tutto di Professionale</li>
                  <li><i class="bi bi-check2"></i>Dashboard multi-sede</li>
                  <li><i class="bi bi-check2"></i>Onboarding dedicato</li>
                  <li><i class="bi bi-check2"></i>SLA e account manager</li>
                </ul>
                <button class="btn btn-ghost btn-block btn-pill" @click="router.push('/contact-us')">Parla con noi</button>
              </article>
            </div>
          </div>
        </section>

        <!-- FAQ -->
        <section id="faq" class="section">
          <div class="container">
            <div class="section-h section-h--center">
              <div class="kicker">Domande frequenti</div>
              <h2>Tutto quello che di solito ci chiedono.</h2>
            </div>
            <div class="faq">
              <details class="faq-q" open>
                <summary>Devo comprare hardware nuovo?</summary>
                <p>No. Tavolo funziona su iPad, smartphone Android e computer che hai già. Per la stampante scontrini consigliamo alcuni modelli economici ma non sono obbligatori: puoi gestire tutto digitalmente.</p>
              </details>
              <details class="faq-q">
                <summary>Cosa succede quando finisce la prova?</summary>
                <p>Al termine dei 14 giorni ti chiediamo se vuoi continuare. Se non decidi nulla, l'account resta in stand-by e i tuoi dati non vengono cancellati: puoi riattivarli quando vuoi.</p>
              </details>
              <details class="faq-q">
                <summary>Funziona se salta la connessione?</summary>
                <p>Sì. Tavolo continua a funzionare offline per tutte le operazioni critiche — prendere ordini, mandare alla cucina, chiudere conti. Quando la rete torna, tutto si sincronizza automaticamente.</p>
              </details>
              <details class="faq-q">
                <summary>Posso importare il mio menu attuale?</summary>
                <p>Certo. Supportiamo import da file CSV o Excel; abbiamo anche un'intelligenza che legge PDF e foto del menu cartaceo e lo trasforma in digitale.</p>
              </details>
              <details class="faq-q">
                <summary>I miei dati sono al sicuro?</summary>
                <p>Sì. Tutti i dati sono criptati in transito e a riposo, conservati in data center europei (GDPR compliant). Puoi esportare o cancellare i tuoi dati in qualsiasi momento con un clic.</p>
              </details>
              <details class="faq-q">
                <summary>Quanto ci metto ad addestrare la squadra?</summary>
                <p>Un turno. L'interfaccia cambia a seconda del ruolo: il cameriere vede solo i tavoli, il cuoco solo la cucina. Non ci sono menu nascosti o funzioni che confondono.</p>
              </details>
            </div>
          </div>
        </section>

        <!-- CTA BAND -->
        <section class="cta-band">
          <div class="container cta-inner">
            <div>
              <h2>Pronto a provarlo nel tuo ristorante?</h2>
              <p>14 giorni gratis, nessuna carta richiesta. Puoi disattivare in qualsiasi momento.</p>
            </div>
            <button @click="router.push('/register')" class="btn btn-primary btn-lg btn-pill">
              Crea il tuo account
              <i class="bi bi-arrow-right"></i>
            </button>
          </div>
        </section>

        <!-- FOOTER -->
        <footer class="landing-footer">
          <div class="container">
            <div class="foot-grid">
              <div>
                <div class="foot-brand">
                  <span class="brand-mark">T</span>
                  <span>Tavolo</span>
                </div>
                <p class="foot-desc">Il gestionale dei ristoranti moderni. Progettato in Italia, tra Bologna e Milano.</p>
              </div>
              <div>
                <h5>Prodotto</h5>
                <ul>
                  <li><a href="#funzionalita">Funzionalità</a></li>
                  <li><a href="#prezzi">Prezzi</a></li>
                  <li><router-link to="/login">Accedi</router-link></li>
                </ul>
              </div>
              <div>
                <h5>Azienda</h5>
                <ul>
                  <li><router-link to="/who-are-us">Chi siamo</router-link></li>
                  <li><router-link to="/contact-us">Contatti</router-link></li>
                </ul>
              </div>
              <div>
                <h5>Legale</h5>
                <ul>
                  <li><router-link to="/terms">Termini</router-link></li>
                  <li><router-link to="/privacy-policy">Privacy</router-link></li>
                </ul>
              </div>
            </div>
            <div class="foot-bottom">
              <div>&copy; {{ new Date().getFullYear() }} Tavolo S.r.l. (fittizia) · P.IVA *da inserire*</div>
              <div>Mantova · Milano · Assistenza: site-alerts@outlook.com</div>
            </div>
          </div>
        </footer>
      </div>
    </template>
  </AppLayout>
</template>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--s-6);
}

/* ======================================================
   AUTH PAGE SHELL
   ====================================================== */
.page {
  min-height: calc(100vh - 64px);
}
.page-header {
  background: var(--bg-2);
  border-bottom: 1px solid var(--line);
  padding: var(--s-8) 0 var(--s-7);
}
.page-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--s-6);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-5);
  flex-wrap: wrap;
}
.page-kicker {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-3);
}
.page-title {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 8px 0 6px;
}
.page-sub {
  font-size: 15px;
  color: var(--ink-2);
  margin: 0;
}
.live-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-2);
  letter-spacing: 0.04em;
}
.dot-pulse {
  width: 7px; height: 7px;
  border-radius: 999px;
  background: var(--ac);
  box-shadow: 0 0 0 0 color-mix(in oklab, var(--ac) 60%, transparent);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--ac) 50%, transparent); }
  50% { box-shadow: 0 0 0 7px color-mix(in oklab, var(--ac) 0%, transparent); }
}
.page-body { padding: var(--s-7) 0 var(--s-9); }

/* ======================================================
   KPI GRID
   ====================================================== */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--s-4);
  margin-bottom: var(--s-6);
}
.kpi {
  padding: var(--s-5);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  transition: transform 200ms ease, border-color 200ms;
}
.kpi:hover { transform: translateY(-2px); border-color: color-mix(in oklab, var(--ac) 30%, var(--line)); }
.kpi--ac { border-color: color-mix(in oklab, var(--ac) 30%, var(--line)); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac) 8%, transparent); }
.kpi-label {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-3);
  margin-bottom: 10px;
}
.kpi-value {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  line-height: 1;
}
.kpi-delta {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 8px;
}
.kpi-delta--up { color: var(--ok); }

/* ======================================================
   DETAIL ROW
   ====================================================== */
.detail-row {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: var(--s-4);
  margin-bottom: var(--s-6);
}
.card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
}
.card-pad { padding: var(--s-5); }
.card-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--line);
}
.card-h-title { display: flex; align-items: center; gap: 10px; }
.card-h-title i { color: var(--ac); font-size: 18px; }
.card-h-title h3 {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
  letter-spacing: -0.01em;
}
.chip {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.chip-info { background: color-mix(in oklab, var(--ink) 8%, transparent); color: var(--ink-2); }
.chip-ok { background: color-mix(in oklab, var(--ok) 15%, transparent); color: var(--ok); }
.chip-warn { background: color-mix(in oklab, var(--warn) 15%, transparent); color: var(--warn); }

.cat-list { display: flex; flex-direction: column; gap: 14px; }
.cat-row { }
.cat-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.cat-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
  text-transform: capitalize;
}
.cat-count {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  color: var(--ink-3);
  font-weight: 600;
}
.bar-track {
  height: 6px;
  background: var(--bg-2);
  border-radius: 999px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ac), color-mix(in oklab, var(--ac) 70%, var(--ink)));
  border-radius: 999px;
  transition: width 420ms ease;
}

.empty {
  text-align: center;
  padding: var(--s-5) var(--s-4);
}
.empty-icon {
  width: 52px; height: 52px;
  display: grid; place-items: center;
  background: var(--bg-2);
  border-radius: 999px;
  font-size: 22px;
  color: var(--ink-3);
  margin: 0 auto var(--s-3);
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  margin: 0 0 6px;
}
.empty-desc {
  font-size: 14px;
  color: var(--ink-2);
  margin: 0 0 var(--s-4);
  line-height: 1.5;
}

.site-ok { display: flex; flex-direction: column; gap: var(--s-4); }
.site-url-label {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  margin-bottom: 6px;
}
.site-url-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 13px;
  color: var(--ac);
  text-decoration: none;
  word-break: break-all;
}
.site-url-link:hover { text-decoration: underline; }
.site-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.site-empty { display: flex; flex-direction: column; gap: var(--s-3); align-items: flex-start; }

/* ======================================================
   QUICK ACTIONS
   ====================================================== */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--s-4);
}
.quick-card {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  cursor: pointer;
  text-align: left;
  transition: transform 180ms ease, border-color 180ms;
  font-family: inherit;
}
.quick-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in oklab, var(--ac) 30%, var(--line));
}
.quick-icon {
  width: 44px; height: 44px;
  display: grid; place-items: center;
  background: color-mix(in oklab, var(--ac) 10%, transparent);
  color: var(--ac);
  border-radius: var(--r-md);
  font-size: 19px;
  flex-shrink: 0;
}
.quick-body { flex: 1; min-width: 0; }
.quick-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 3px;
}
.quick-sub {
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.4;
}
.quick-arrow {
  color: var(--ink-3);
  font-size: 16px;
  transition: transform 180ms, color 180ms;
}
.quick-card:hover .quick-arrow { transform: translateX(3px); color: var(--ac); }

/* ======================================================
   LANDING — HERO
   ====================================================== */
.landing { background: var(--bg); color: var(--ink); }
.hero {
  position: relative;
  padding: 64px 0 72px;
  background:
    radial-gradient(1200px 500px at 85% -10%, color-mix(in oklab, var(--ac) 12%, transparent), transparent 70%),
    radial-gradient(1000px 400px at -10% 90%, color-mix(in oklab, var(--ac) 6%, transparent), transparent 70%),
    var(--bg);
}
.hero-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 10px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-2);
  margin-bottom: var(--s-6);
}
.hero-title {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: clamp(40px, 6.5vw, 72px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.02;
  color: var(--ink);
  margin: 0 auto var(--s-5);
  max-width: 18ch;
}
.hero-title em {
  font-style: normal;
  background: linear-gradient(to bottom, transparent 72%, color-mix(in oklab, var(--ac) 40%, transparent) 72%, color-mix(in oklab, var(--ac) 40%, transparent) 90%, transparent 90%);
  padding: 0 6px;
  border-radius: 4px;
}
.hero-lede {
  max-width: 62ch;
  font-size: clamp(16px, 1.6vw, 19px);
  line-height: 1.55;
  color: var(--ink-2);
  margin: 0 auto var(--s-6);
}
.hero-ctas {
  display: flex;
  gap: var(--s-3);
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: var(--s-5);
}
.hero-badges {
  display: flex;
  gap: var(--s-5);
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: var(--s-8);
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  color: var(--ink-3);
}
.hero-badges span { display: inline-flex; align-items: center; gap: 6px; }
.hero-badges i { color: var(--ac); font-size: 14px; }

/* Mockup */
.hero-preview {
  width: 100%;
  max-width: 1100px;
  margin: var(--s-6) auto 0;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  overflow: hidden;
  box-shadow: 0 40px 80px -20px rgba(0,0,0,0.12), 0 10px 30px -10px rgba(0,0,0,0.06);
}
.win-chrome {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--line);
}
.chrome-dots { display: flex; gap: 6px; }
.chrome-dots span {
  width: 10px; height: 10px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ink) 15%, transparent);
}
.chrome-url {
  flex: 1;
  text-align: center;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  color: var(--ink-3);
  padding: 4px 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  max-width: 280px;
  margin: 0 auto;
}
.mock {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 420px;
}
.mock-side {
  background: var(--bg-2);
  border-right: 1px solid var(--line);
  padding: var(--s-4);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mock-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--line);
}
.mock-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--ink-2);
  border-radius: var(--r-sm);
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-weight: 500;
  text-align: left;
}
.mock-nav-item i { font-size: 14px; opacity: 0.8; }
.mock-nav-item.is-active { background: var(--paper); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px var(--line); }
.mock-nav-item.is-active i { color: var(--ac); opacity: 1; }
.mock-badge {
  margin-left: auto;
  background: var(--ac);
  color: var(--paper);
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
}
.mock-main { padding: var(--s-5); }
.mock-h {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--s-4);
}
.mock-h h4 { font-size: 18px; font-weight: 700; margin: 0 0 2px; letter-spacing: -0.02em; }
.mock-h p { font-size: 12px; color: var(--ink-3); margin: 0; }
.mock-live { font-family: var(--f-mono, 'Geist Mono', monospace); font-size: 11px; color: var(--ink-3); }
.mock-kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
.mock-kpi {
  padding: var(--s-3);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
.mock-kpi .l { font-family: var(--f-mono, 'Geist Mono', monospace); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 6px; }
.mock-kpi .v { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.mock-kpi .d { font-family: var(--f-mono, 'Geist Mono', monospace); font-size: 10px; color: var(--ok); margin-top: 6px; }
.mock-sub { font-size: 14px; color: var(--ink-3); font-weight: 500; }
.mock-tables {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.mock-tbl {
  aspect-ratio: 1.4 / 1;
  padding: 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.mock-tbl .n { font-family: var(--f-mono, 'Geist Mono', monospace); font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
.mock-tbl .s { font-size: 11px; color: var(--ink-3); }
.mock-tbl.is-occupied { background: var(--paper); border-color: color-mix(in oklab, var(--ac) 40%, var(--line)); }
.mock-tbl.is-occupied .s { color: var(--ac); font-weight: 500; }
.mock-tbl.is-ready { background: color-mix(in oklab, var(--ac) 10%, var(--paper)); border-color: var(--ac); }

/* ======================================================
   STATS BAND
   ====================================================== */
.stats-band {
  background: var(--paper);
  border-block: 1px solid var(--line);
  padding: var(--s-6) 0;
}
.stats-inner {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--s-4);
}
.stat-item { text-align: center; }
.stat-v {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: clamp(28px, 3vw, 44px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  line-height: 1;
  margin-bottom: 8px;
}
.stat-l {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}

/* ======================================================
   SECTIONS
   ====================================================== */
.section { padding: clamp(60px, 9vw, 120px) 0; }
.section--alt { background: var(--bg-2); }
.section--dark {
  background: oklch(0.18 0 0);
  color: oklch(0.96 0 0);
  --line: oklch(0.28 0 0);
  --ink: oklch(0.96 0 0);
  --ink-2: oklch(0.78 0 0);
  --ink-3: oklch(0.58 0 0);
  --paper: oklch(0.22 0 0);
  --bg: oklch(0.18 0 0);
  --bg-2: oklch(0.22 0 0);
}
.section-h {
  max-width: 720px;
  margin-bottom: clamp(40px, 6vw, 80px);
}
.section-h--center { margin-inline: auto; text-align: center; }
.kicker {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-3);
  margin-bottom: 14px;
}
.section-h h2 {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--ink);
  margin: 0 0 var(--s-4);
}
.section-h p {
  font-size: clamp(15px, 1.5vw, 18px);
  line-height: 1.55;
  color: var(--ink-2);
  margin: 0;
}

/* Roles grid (dark section) */
.roles-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--s-4);
}
.role-card-landing {
  position: relative;
  padding: var(--s-6);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  transition: transform 200ms, border-color 200ms;
}
.role-card-landing:hover { transform: translateY(-3px); border-color: color-mix(in oklab, var(--ac) 40%, var(--line)); }
.role-num {
  position: absolute;
  top: var(--s-5); right: var(--s-5);
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
}
.role-icon {
  width: 48px; height: 48px;
  display: grid; place-items: center;
  background: color-mix(in oklab, var(--ac) 15%, transparent);
  color: var(--ac);
  border-radius: var(--r-md);
  font-size: 22px;
  margin-bottom: var(--s-4);
}
.role-card-landing h3 {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}
.role-card-landing p {
  font-size: 15px;
  color: var(--ink-2);
  line-height: 1.5;
  margin: 0 0 var(--s-4);
}
.role-card-landing ul {
  list-style: none;
  padding: 0;
  margin: 0;
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.role-card-landing li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--ink-2);
}
.role-card-landing li i { color: var(--ac); font-size: 14px; flex-shrink: 0; }

/* Steps */
.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-5);
  counter-reset: step;
}
.step {
  position: relative;
  padding: var(--s-6);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  counter-increment: step;
}
.step::before {
  content: counter(step, decimal-leading-zero);
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
  display: block;
  margin-bottom: var(--s-3);
}
.step h3 {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 0 0 10px;
}
.step p { font-size: 15px; line-height: 1.55; color: var(--ink-2); margin: 0; }

/* Quote */
.quote-wrap {
  max-width: 820px;
  margin: 0 auto;
  padding: 0 var(--s-6);
  text-align: center;
}
.quote {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: clamp(22px, 3vw, 34px);
  line-height: 1.35;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 0 0 var(--s-5);
  quotes: none;
}
.quote em {
  background: linear-gradient(to bottom, transparent 72%, color-mix(in oklab, var(--ac) 40%, transparent) 72%);
  font-style: normal;
  padding: 0 4px;
}
.quote-author {
  display: inline-flex;
  align-items: center;
  gap: var(--s-3);
}
.quote-avatar {
  width: 48px; height: 48px;
  display: grid; place-items: center;
  background: var(--ink);
  color: var(--paper);
  border-radius: 999px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-weight: 600;
  font-size: 14px;
}
.quote-name { font-weight: 600; color: var(--ink); font-size: 15px; }
.quote-role { font-family: var(--f-mono, 'Geist Mono', monospace); font-size: 12px; color: var(--ink-3); margin-top: 2px; }

/* Pricing */
.pricing {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-4);
  align-items: start;
}
.price-card {
  position: relative;
  padding: var(--s-6);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  display: flex;
  flex-direction: column;
}
.price-card.featured {
  border-color: var(--ink);
  box-shadow: 0 20px 60px -20px rgba(0,0,0,0.15), 0 0 0 1px var(--ink);
  transform: translateY(-4px);
}
.price-flag {
  position: absolute;
  top: 14px; right: 14px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 4px 10px;
  background: var(--ink);
  color: var(--paper);
  border-radius: 999px;
}
.price-card h3 {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  margin: 0 0 6px;
}
.price-sub { font-size: 14px; color: var(--ink-2); line-height: 1.45; margin: 0 0 var(--s-5); }
.price {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 48px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--ink);
  line-height: 1;
  margin-bottom: 4px;
}
.price-suffix {
  font-size: 16px;
  font-weight: 500;
  color: var(--ink-3);
}
.price-note {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  color: var(--ink-3);
  margin-bottom: var(--s-5);
}
.price-card ul {
  list-style: none;
  padding: var(--s-4) 0;
  margin: 0 0 var(--s-5);
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}
.price-card li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--ink-2);
}
.price-card li i { color: var(--ac); flex-shrink: 0; }

/* FAQ */
.faq {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.faq-q {
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--paper);
  overflow: hidden;
  transition: border-color 200ms;
}
.faq-q[open] { border-color: color-mix(in oklab, var(--ac) 30%, var(--line)); }
.faq-q summary {
  padding: var(--s-4) var(--s-5);
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  letter-spacing: -0.01em;
}
.faq-q summary::-webkit-details-marker { display: none; }
.faq-q summary::after {
  content: "+";
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 22px;
  color: var(--ink-3);
  transition: transform 200ms;
  font-weight: 300;
}
.faq-q[open] summary::after { transform: rotate(45deg); color: var(--ac); }
.faq-q p {
  padding: 0 var(--s-5) var(--s-4);
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink-2);
  margin: 0;
}

/* CTA band */
.cta-band {
  padding: clamp(50px, 7vw, 90px) 0;
  border-top: 1px solid var(--line);
  background: linear-gradient(135deg, color-mix(in oklab, var(--ac) 5%, var(--bg)), var(--bg));
}
.cta-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-5);
  flex-wrap: wrap;
}
.cta-inner h2 {
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-size: clamp(24px, 3vw, 38px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 0 0 8px;
}
.cta-inner p { font-size: 16px; color: var(--ink-2); margin: 0; }

/* Footer */
.landing-footer {
  background: var(--bg-2);
  border-top: 1px solid var(--line);
  padding: var(--s-8) 0 var(--s-5);
}
.foot-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: var(--s-5);
  padding-bottom: var(--s-6);
  border-bottom: 1px solid var(--line);
}
.foot-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--f-sans, 'Geist', sans-serif);
  font-weight: 600;
  font-size: 16px;
  color: var(--ink);
  margin-bottom: 12px;
}
.foot-brand .brand-mark {
  width: 28px; height: 28px;
  display: grid; place-items: center;
  background: var(--ink);
  color: var(--paper);
  border-radius: 7px;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-weight: 700;
  font-size: 13px;
}
.foot-desc { font-size: 14px; line-height: 1.55; color: var(--ink-2); max-width: 36ch; margin: 0; }
.landing-footer h5 {
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  font-weight: 500;
  margin: 0 0 var(--s-3);
}
.landing-footer ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.landing-footer ul a {
  font-size: 14px;
  color: var(--ink-2);
  text-decoration: none;
  transition: color 120ms;
}
.landing-footer ul a:hover { color: var(--ac); }
.foot-bottom {
  padding-top: var(--s-4);
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  flex-wrap: wrap;
  font-family: var(--f-mono, 'Geist Mono', monospace);
  font-size: 12px;
  color: var(--ink-3);
}

/* Fade-up */
.fade-up { opacity: 0; transform: translateY(18px); animation: fadeUp 720ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.fade-up.d1 { animation-delay: 70ms; }
.fade-up.d2 { animation-delay: 140ms; }
.fade-up.d3 { animation-delay: 210ms; }
.fade-up.d4 { animation-delay: 280ms; }
@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .fade-up { animation: none; opacity: 1; transform: none; }
  .dot-pulse { animation: none; }
}

/* ======================================================
   RESPONSIVE
   ====================================================== */
@media (max-width: 1080px) {
  .kpi-grid { grid-template-columns: repeat(3, 1fr); }
  .detail-row { grid-template-columns: 1fr; }
  .quick-grid { grid-template-columns: repeat(2, 1fr); }
  .pricing, .steps, .roles-grid { grid-template-columns: 1fr 1fr; }
  .mock { grid-template-columns: 180px 1fr; }
  .foot-grid { grid-template-columns: 1fr 1fr; gap: var(--s-5); }
}
@media (max-width: 720px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .quick-grid { grid-template-columns: 1fr; }
  .pricing, .steps, .roles-grid { grid-template-columns: 1fr; }
  .stats-inner { grid-template-columns: 1fr 1fr; gap: var(--s-5); }
  .hero { padding: 40px 0 48px; }
  .mock-side { display: none; }
  .mock { grid-template-columns: 1fr; }
  .mock-tables { grid-template-columns: repeat(2, 1fr); }
  .cta-inner { flex-direction: column; align-items: flex-start; }
  .price-card.featured { transform: none; }
}
</style>
