<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import { useRoute } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import DeleteUserForm from '@/Pages/Profile/Partials/DeleteUserForm.vue';
import TwoFactorAuthenticationForm from '@/Pages/Profile/Partials/TwoFactorAuthenticationForm.vue';
import UpdatePasswordForm from '@/Pages/Profile/Partials/UpdatePasswordForm.vue';
import UpdateProfileInformationForm from '@/Pages/Profile/Partials/UpdateProfileInformationForm.vue';
import SubscriptionForm from '@/Pages/Profile/Partials/SubscriptionForm.vue';
import StaffDepartmentsForm from '@/Pages/Profile/Partials/StaffDepartmentsForm.vue';
import WebsiteConfigForm from '@/Pages/Profile/Partials/WebsiteConfigForm.vue';
import PosCassaForm from '@/Pages/Profile/Partials/PosCassaForm.vue';

const store = useStore();
const route = useRoute();

const x = store.getters.getUser || {};
const isPro = computed(() => x?.subscription_plan === 'pro');
const planLabel = computed(() => {
  if (x?.subscription_plan === 'pro') return 'Professionale';
  if (x?.subscription_plan === 'starter') return 'Essenziale';
  return 'Da configurare';
});

const sections = computed(() => ([
  { key: 'profilo',     label: 'Account',          icon: 'bi-person' },
  { key: 'staff',       label: 'Staff attivi',     icon: 'bi-people' },
  { key: 'reparti',     label: 'Reparti',          icon: 'bi-diagram-3', proOnly: true },
  { key: 'sicurezza',   label: 'Sicurezza',        icon: 'bi-shield-lock' },
  { key: 'sito',        label: 'Sito web',         icon: 'bi-globe2' },
  { key: 'poscassa',    label: 'POS / Cassa',      icon: 'bi-credit-card-2-front' },
  { key: 'abbonamento', label: 'Abbonamento',      icon: 'bi-stars' },
  { key: 'delete',      label: 'Elimina account',  icon: 'bi-trash', danger: true },
]));

const resolveSection = (raw) => {
  if (!raw) return 'profilo';
  if (raw === 'cambiopsw' || raw === 'duefattori') return 'sicurezza';
  if (raw === 'piano') return 'abbonamento';
  return sections.value.some(s => s.key === raw) ? raw : 'profilo';
};

const requestedSection = typeof route.query.section === 'string' ? route.query.section : '';
const activeSection = ref(resolveSection(requestedSection));

watch(() => route.query.section, (val) => {
  activeSection.value = resolveSection(typeof val === 'string' ? val : '');
});

defineProps({
  confirmsTwoFactorAuthentication: Boolean,
  sessions: Array,
});

const userinfo = ref({
  id: x?.documentId,
  username: x?.username,
  email: x?.email,
});

const userInitial = computed(() => (x?.username || 'U').charAt(0).toUpperCase());
const fullName = computed(() => {
  const n = [x?.name, x?.surname].filter(Boolean).join(' ');
  return n || x?.username || 'Utente';
});
const restaurantName = computed(() => x?.restaurant_name || x?.username || '');
const heroSub = computed(() => {
  const parts = [x?.email, restaurantName.value].filter(Boolean);
  return parts.join(' · ');
});
const cityChip = computed(() => x?.city || x?.address || '');

const setSection = (key, locked) => {
  if (locked) return;
  activeSection.value = key;
};

onMounted(async () => {
  nextTick(() => { document.title = 'Profilo · ComforTables'; });
});
</script>

<template>
  <AppLayout page-title="Profilo">
    <div class="md-main">
      <header class="md-top">
        <div>
          <div class="overline">Profilo · {{ fullName }}</div>
          <h1>Il tuo profilo</h1>
          <p>Account, reparti, integrazioni POS e configurazioni del locale.</p>
        </div>
        <div class="md-top-tools">
          <router-link to="/logout" class="btn btn-sm">
            <i class="bi bi-box-arrow-right"></i><span>Esci</span>
          </router-link>
        </div>
      </header>

      <!-- ===== Hero card ===== -->
      <div class="ct-pf-hero ct-fade-in">
        <div class="ct-pf-hero__avatar">{{ userInitial }}</div>
        <div class="ct-pf-hero__body">
          <div class="ct-pf-hero__name">{{ fullName }}</div>
          <div class="ct-pf-hero__sub">{{ heroSub }}</div>
          <div class="ct-pf-hero__chips">
            <span class="chip ok"><i class="bi bi-patch-check"></i> Verificato</span>
            <span class="chip ac">Piano · {{ planLabel }}</span>
            <span v-if="cityChip" class="chip"><i class="bi bi-geo-alt"></i> {{ cityChip }}</span>
          </div>
        </div>
      </div>

      <!-- ===== Tabs ===== -->
      <div class="pf-tabs" role="tablist">
        <button
          v-for="s in sections"
          :key="s.key"
          type="button"
          role="tab"
          class="pf-tab"
          :class="{
            active: activeSection === s.key,
            'pf-tab--locked': s.proOnly && !isPro,
            'pf-tab--danger': s.danger,
          }"
          :aria-selected="activeSection === s.key"
          :title="s.proOnly && !isPro ? 'Disponibile con il piano Professionale' : ''"
          @click="setSection(s.key, s.proOnly && !isPro)"
        >
          <i :class="['bi', s.icon]"></i>
          <span>{{ s.label }}</span>
          <span v-if="s.proOnly && !isPro" class="lock-pill">PRO</span>
        </button>
      </div>

      <!-- ===== Content ===== -->
      <div class="pf-content">
        <Transition name="fade" mode="out-in">
          <div v-if="activeSection === 'profilo'" :key="'profilo'" class="pf-stack">
            <UpdateProfileInformationForm :user="userinfo" />
          </div>

          <StaffDepartmentsForm
            v-else-if="activeSection === 'staff'"
            :key="'staff'"
            mode="staff"
          />

          <StaffDepartmentsForm
            v-else-if="activeSection === 'reparti' && isPro"
            :key="'reparti'"
            mode="routing"
          />

          <div v-else-if="activeSection === 'reparti'" :key="'reparti-locked'" class="ct-card">
            <div class="ct-card__head">
              <span class="ct-card__icon"><i class="bi bi-diagram-3"></i></span>
              <div class="ct-card__title-wrap">
                <h3 class="ct-card__title">Smistamento categorie ai reparti</h3>
                <p class="ct-card__subtitle">
                  Funzione del piano Professionale.
                </p>
              </div>
            </div>
            <div class="ct-locked-panel">
              <div class="ct-locked-panel__ico">
                <i class="bi bi-lock-fill"></i>
              </div>
              <h4>Disponibile con il piano Professionale</h4>
              <p>
                Con l'Essenziale tutte le categorie arrivano in Cucina. Passa al
                Professionale per smistare bar, pizzeria e cucina senza glutine in
                code separate.
              </p>
              <button type="button" class="btn btn-accent" @click="setSection('abbonamento', false)">
                Scopri il Professionale <i class="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>

          <div v-else-if="activeSection === 'sicurezza'" :key="'sicurezza'" class="pf-stack">
            <UpdatePasswordForm :id="userinfo.id" />
            <TwoFactorAuthenticationForm :requires-confirmation="confirmsTwoFactorAuthentication" />
          </div>

          <WebsiteConfigForm v-else-if="activeSection === 'sito'" :key="'sito'" />
          <PosCassaForm v-else-if="activeSection === 'poscassa'" :key="'poscassa'" />
          <SubscriptionForm v-else-if="activeSection === 'abbonamento'" :key="'abbonamento'" />
          <DeleteUserForm v-else-if="activeSection === 'delete'" :key="'delete'" />
        </Transition>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.pf-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 18px;
}
.pf-stack { display: flex; flex-direction: column; gap: 16px; }
.pf-tab--danger { color: var(--danger); }
.pf-tab--danger.active {
  border-bottom-color: var(--danger);
  color: var(--danger);
}
.pf-tab--locked {
  opacity: 0.55;
  cursor: not-allowed;
}
.pf-tab--locked:hover { color: var(--ink-3); }

.fade-enter-active, .fade-leave-active {
  transition: opacity 200ms, transform 200ms;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 720px) {
  .ct-pf-hero {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }
}
</style>
