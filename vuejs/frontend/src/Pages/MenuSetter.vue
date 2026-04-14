<script setup>
    import { onMounted, ref, nextTick, watch } from 'vue';
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { useStore } from 'vuex';
    import { useRouter, useRoute } from 'vue-router';
    import { API_BASE } from '@/utils';
    import MenuAdder from '@/components/MenuAdder.vue';
    import MenuList from '@/components/MenuList.vue';
    import IngredientsManager from '@/components/IngredientsManager.vue';

    const store = useStore();
    const router = useRouter();
    const route = useRoute();
    const tkn = store.getters.getToken;

    /** 'list' | 'adder' | 'ingredients' */
    const activeTab = ref('list');

    const verifyPayment = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/users/me`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${tkn}`,
                    'Content-Type': 'application/json',
                },
            });
            if (response.ok) {
                const data = await response.json();
                if (data.payment_method == null && 0) router.push('/add-payment');
                else if (new Date(data.end_subscription) < new Date() && 0) router.push('/renew-sub');
                else return true;
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleAdder = () => { activeTab.value = 'adder'; };
    const handleList = () => { activeTab.value = 'list'; };
    const handleIngredients = () => { activeTab.value = 'ingredients'; };

    // Reset alla lista quando si torna su /menu-handler con navigazione Vue Router
    watch(() => route.fullPath, () => {
        if (route.path === '/menu-handler') {
            activeTab.value = 'list';
        }
    });

    onMounted(async () => {
        nextTick(() => { document.title = 'Gestione Menu'; });
        await verifyPayment();
        activeTab.value = 'list';
    });
</script>

<template>
    <AppLayout>
        <!-- Tab navigation (visibile solo in modalità lista o ingredienti, non durante l'aggiunta) -->
        <div v-if="activeTab !== 'adder'" class="menu-tabs-wrapper">
            <div class="menu-tabs">
                <button
                    class="menu-tab"
                    :class="{ 'menu-tab--active': activeTab === 'list' }"
                    @click="handleList"
                >
                    <i class="bi bi-list-ul"></i>
                    <span>Menu</span>
                </button>
                <button
                    class="menu-tab"
                    :class="{ 'menu-tab--active': activeTab === 'ingredients' }"
                    @click="handleIngredients"
                >
                    <i class="bi bi-basket"></i>
                    <span>Ingredienti</span>
                </button>
            </div>
        </div>

        <MenuAdder v-if="activeTab === 'adder'" @ViewList="handleList" />
        <MenuList v-else-if="activeTab === 'list'" @AddElement="handleAdder" />
        <IngredientsManager v-else-if="activeTab === 'ingredients'" />
    </AppLayout>
</template>

<style scoped>
.menu-tabs-wrapper {
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg);
    padding: 0 var(--space-6);
}

.menu-tabs {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    gap: 0;
}

.menu-tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast);
    margin-bottom: -1px;
}

.menu-tab:hover {
    color: var(--color-text);
}

.menu-tab--active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
}

@media (max-width: 640px) {
    .menu-tabs-wrapper {
        padding: 0 var(--space-4);
    }

    .menu-tab {
        flex: 1;
        justify-content: center;
        padding: var(--space-3) var(--space-3);
    }
}
</style>
