<script setup>
    import { ref } from 'vue';
    import DeleteUserForm from '@/Pages/Profile/Partials/DeleteUserForm.vue';
    import TwoFactorAuthenticationForm from '@/Pages/Profile/Partials/TwoFactorAuthenticationForm.vue';
    import UpdatePasswordForm from '@/Pages/Profile/Partials/UpdatePasswordForm.vue';
    import UpdateProfileInformationForm from '@/Pages/Profile/Partials/UpdateProfileInformationForm.vue';
    import WebsiteConfigForm from '@/Pages/Profile/Partials/WebsiteConfigForm.vue';
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { useStore } from 'vuex';
    import { useRoute } from 'vue-router';
    import { nextTick, onMounted } from 'vue';
    //per recuperare le info dell'utente loggato
    const store = useStore();
    const route = useRoute();

    const sections = [
        { key: 'profilo', label: 'Profilo', icon: 'bi-person' },
        { key: 'cambiopsw', label: 'Password', icon: 'bi-key' },
        { key: 'duefattori', label: 'Due fattori', icon: 'bi-shield-lock' },
        { key: 'sito', label: 'Sito web', icon: 'bi-globe2' },
        { key: 'delete', label: 'Elimina account', icon: 'bi-trash', danger: true },
    ];

    // Se la route arriva con ?section=... e la chiave esiste, apri quella scheda.
    const requestedSection = typeof route.query.section === 'string' ? route.query.section : '';
    const initialSection = sections.some(s => s.key === requestedSection) ? requestedSection : 'profilo';
    const activeSection = ref(initialSection);

    defineProps({
        confirmsTwoFactorAuthentication: Boolean,
        sessions: Array,
    });

    const userinfo = ref('');
    const x = store.getters.getUser;
    userinfo.value = {
        'id': x.documentId,
        'username' :  x.username,
        'email' : x.email,
    }

    // Imposta il titolo della pagina
    onMounted(async () => {
        nextTick(() => {
            document.title = 'Pagina del profilo';
        });
    });
</script>

<template>
    <AppLayout>
        <div class="profile-page">
            <div class="profile-container">
                <!-- Page header -->
                <div class="profile-header">
                    <p class="text-overline">Account</p>
                    <h1 class="profile-title">Il tuo profilo</h1>
                </div>

                <div class="profile-layout">
                    <!-- Sidebar -->
                    <nav class="profile-sidebar">
                        <button
                            v-for="section in sections"
                            :key="section.key"
                            class="sidebar-item"
                            :class="{
                                'sidebar-item-active': activeSection === section.key,
                                'sidebar-item-danger': section.danger
                            }"
                            @click="activeSection = section.key"
                        >
                            <i :class="'bi ' + section.icon"></i>
                            <span>{{ section.label }}</span>
                        </button>
                    </nav>

                    <!-- Content -->
                    <div class="profile-content">
                        <Transition name="fade" mode="out-in">
                            <UpdateProfileInformationForm v-if="activeSection === 'profilo'" :user="userinfo" :key="'profilo'" />
                            <UpdatePasswordForm v-else-if="activeSection === 'cambiopsw'" :id="userinfo.id" :key="'password'" />
                            <TwoFactorAuthenticationForm v-else-if="activeSection === 'duefattori'" :requires-confirmation="confirmsTwoFactorAuthentication" :key="'2fa'" />
                            <WebsiteConfigForm v-else-if="activeSection === 'sito'" :key="'sito'" />
                            <DeleteUserForm v-else-if="activeSection === 'delete'" :key="'delete'" />
                        </Transition>
                    </div>
                </div>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.profile-page {
    padding: var(--s-8) 0 var(--s-9);
    background: var(--bg);
    min-height: calc(100vh - 64px);
}
.profile-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 var(--s-6);
}
.profile-header {
    margin-bottom: var(--s-7);
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
.profile-title {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: clamp(28px, 3.5vw, 40px);
    font-weight: 700;
    color: var(--ink);
    margin: 0;
    letter-spacing: -0.02em;
}
.profile-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: var(--s-7);
    align-items: start;
}
.profile-sidebar {
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: sticky;
    top: 84px;
    padding: 6px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
}
.sidebar-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 500;
    color: var(--ink-2);
    background: none;
    border: none;
    border-radius: var(--r-sm);
    cursor: pointer;
    transition: background 120ms, color 120ms;
    text-align: left;
}
.sidebar-item i { font-size: 16px; opacity: 0.8; }
.sidebar-item:hover { background: color-mix(in oklab, var(--ink) 6%, transparent); color: var(--ink); }
.sidebar-item-active { background: color-mix(in oklab, var(--ac) 12%, transparent); color: var(--ac); }
.sidebar-item-active i { color: var(--ac); opacity: 1; }
.sidebar-item-danger { color: var(--ink-3); }
.sidebar-item-danger:hover { color: var(--dan); background: color-mix(in oklab, var(--dan) 10%, transparent); }
.sidebar-item-danger.sidebar-item-active { color: var(--dan); background: color-mix(in oklab, var(--dan) 12%, transparent); }
.profile-content { min-height: 400px; }

.fade-enter-active, .fade-leave-active { transition: opacity 200ms, transform 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(8px); }

@media (max-width: 820px) {
    .profile-layout { grid-template-columns: 1fr; gap: var(--s-4); }
    .profile-sidebar {
        flex-direction: row;
        overflow-x: auto;
        position: static;
        gap: 2px;
    }
    .sidebar-item { white-space: nowrap; flex-shrink: 0; }
    .profile-container { padding: 0 var(--s-4); }
}
</style>
