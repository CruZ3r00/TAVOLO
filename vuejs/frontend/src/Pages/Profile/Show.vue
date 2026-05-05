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

const sections = [
  { key: 'profilo', label: 'Account', icon: 'bi-person' },
  { key: 'staff', label: 'Reparti', icon: 'bi-people' },
  { key: 'sicurezza', label: 'Sicurezza', icon: 'bi-shield-lock' },
  { key: 'sito', label: 'Sito web', icon: 'bi-globe2' },
  { key: 'poscassa', label: 'POS / Cassa fiscale', icon: 'bi-credit-card-2-front' },
  { key: 'delete', label: 'Elimina account', icon: 'bi-trash', danger: true },
];

const resolveSection = (raw) => {
  if (!raw) return 'profilo';
  // backward compat: vecchie chiavi cambiopsw/duefattori -> sicurezza
  if (raw === 'cambiopsw' || raw === 'duefattori') return 'sicurezza';
  return sections.some(s => s.key === raw) ? raw : 'profilo';
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

const userinfo = ref('');
const x = store.getters.getUser;
userinfo.value = {
  id: x?.documentId,
  username: x?.username,
  email: x?.email,
};

const userInitial = computed(() => (x?.username || 'U').charAt(0).toUpperCase());
const fullName = computed(() => {
  const n = [x?.name, x?.surname].filter(Boolean).join(' ');
  return n || x?.username || 'Utente';
});
const subscriptionLabel = computed(() => {
  const status = x?.subscription_status;
  if (status === 'active') return 'Attivo';
  if (status === 'trialing') return 'Prova gratuita';
  if (status === 'past_due') return 'Da rinnovare';
  return 'Da configurare';
});

onMounted(async () => {
  nextTick(() => { document.title = 'Profilo · Tavolo'; });
});
</script>

<template>
  <AppLayout page-title="Profilo">
    <div class="md-main">
      <header class="md-top">
        <div>
          <div class="overline">Profilo · {{ fullName }}</div>
          <h1>Il tuo profilo</h1>
          <p>Gestisci dati personali, ristorante, sicurezza e configurazioni POS.</p>
        </div>
        <div class="md-top-tools">
          <router-link to="/logout" class="btn btn-sm">
            <i class="bi bi-box-arrow-right"></i><span>Esci</span>
          </router-link>
        </div>
      </header>

      <div class="pf-hero">
        <div class="pf-avatar">
          <span>{{ userInitial }}</span>
        </div>
        <div class="pf-hero-info">
          <h2>{{ fullName }}</h2>
          <p>{{ userinfo.email }}</p>
          <div class="pf-hero-meta">
            <span class="chip ok"><i class="bi bi-patch-check"></i> Account verificato</span>
            <span class="chip ac">Piano · {{ subscriptionLabel }}</span>
          </div>
        </div>
      </div>

      <div class="pf-tabs">
        <button
          v-for="s in sections"
          :key="s.key"
          type="button"
          class="pf-tab"
          :class="{ active: activeSection === s.key, 'pf-tab--danger': s.danger }"
          @click="activeSection = s.key"
        >
          <i :class="['bi', s.icon]"></i> {{ s.label }}
        </button>
      </div>

      <div class="pf-content">
        <Transition name="fade" mode="out-in">
          <div v-if="activeSection === 'profilo'" :key="'profilo'" class="pf-stack">
            <UpdateProfileInformationForm :user="userinfo" />
            <SubscriptionForm />
          </div>

          <StaffDepartmentsForm v-else-if="activeSection === 'staff'" :key="'staff'" />

          <div v-else-if="activeSection === 'sicurezza'" :key="'sicurezza'" class="pf-stack">
            <UpdatePasswordForm :id="userinfo.id" />
            <TwoFactorAuthenticationForm :requires-confirmation="confirmsTwoFactorAuthentication" />
          </div>

          <WebsiteConfigForm v-else-if="activeSection === 'sito'" :key="'sito'" />
          <PosCassaForm v-else-if="activeSection === 'poscassa'" :key="'poscassa'" />
          <DeleteUserForm v-else-if="activeSection === 'delete'" :key="'delete'" />
        </Transition>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.pf-content { display: flex; flex-direction: column; gap: 16px; }
.pf-stack { display: flex; flex-direction: column; gap: 16px; }
.pf-tab--danger { color: var(--danger); }
.pf-tab--danger.active { border-bottom-color: var(--danger); color: var(--danger); }

.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(8px); }
</style>
