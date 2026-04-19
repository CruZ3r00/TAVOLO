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
    padding: var(--space-8) 0 var(--space-12);
}

.profile-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 0 var(--space-6);
}

.profile-header {
    margin-bottom: var(--space-8);
}

.profile-title {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: var(--space-2) 0 0;
    letter-spacing: var(--tracking-tight);
}

.profile-layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: var(--space-8);
    align-items: start;
}

/* Sidebar */
.profile-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    position: sticky;
    top: 80px;
}

.sidebar-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
}

.sidebar-item:hover {
    background: var(--color-bg-subtle);
    color: var(--color-text);
}

.sidebar-item-active {
    background: var(--color-primary-subtle);
    color: var(--color-primary);
}

.sidebar-item-danger {
    color: var(--color-text-muted);
}

.sidebar-item-danger:hover {
    color: var(--color-destructive);
    background: var(--color-destructive-light);
}

.sidebar-item-danger.sidebar-item-active {
    color: var(--color-destructive);
    background: var(--color-destructive-light);
}

/* Content */
.profile-content {
    min-height: 400px;
}

.profile-section-title {
    font-size: var(--text-base);
    font-weight: 600;
    margin: 0;
}

@media (max-width: 768px) {
    .profile-layout {
        grid-template-columns: 1fr;
        gap: var(--space-4);
    }

    .profile-sidebar {
        flex-direction: row;
        overflow-x: auto;
        position: static;
        gap: var(--space-1);
        padding-bottom: var(--space-2);
    }

    .sidebar-item {
        white-space: nowrap;
        flex-shrink: 0;
    }

    .profile-container {
        padding: 0 var(--space-4);
    }
}
</style>
