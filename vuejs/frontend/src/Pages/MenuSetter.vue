<script setup>
    import { onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue';
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { useStore } from 'vuex';
    import { useRouter, useRoute } from 'vue-router';
    import { API_BASE } from '@/utils';
    import MenuAdder from '@/components/MenuAdder.vue';
    import MenuList from '@/components/MenuList.vue';
    import MenuImporter from '@/components/MenuImporter.vue';
    import IngredientsManager from '@/components/IngredientsManager.vue';

    const store = useStore();
    const router = useRouter();
    const route = useRoute();
    const tkn = store.getters.getToken;

    /** 'list' | 'adder' | 'ingredients' */
    const activeTab = ref('list');

    // Riferimenti ai componenti figli per trigger imperativi
    const importerRef = ref(null);
    const menuListRef = ref(null);

    // Stato import: overlay full-screen e gestione toast
    const isImporting = ref(false);
    const menuElementsCount = ref(0);
    const toast = ref({ show: false, type: 'success', message: '' });
    let toastTimer = null;

    // Rotazione subtitle loading per percezione di progresso
    const loadingSubtitles = [
        "Estrazione testo dall'immagine",
        'Riconoscimento piatti',
        'Strutturazione dati',
    ];
    const loadingSubtitleIdx = ref(0);
    let subtitleTimer = null;

    const startSubtitleRotation = () => {
        loadingSubtitleIdx.value = 0;
        if (subtitleTimer) clearInterval(subtitleTimer);
        subtitleTimer = setInterval(() => {
            loadingSubtitleIdx.value = (loadingSubtitleIdx.value + 1) % loadingSubtitles.length;
        }, 3000);
    };
    const stopSubtitleRotation = () => {
        if (subtitleTimer) {
            clearInterval(subtitleTimer);
            subtitleTimer = null;
        }
    };

    const showToast = (type, message) => {
        if (toastTimer) clearTimeout(toastTimer);
        toast.value = { show: true, type, message };
        toastTimer = setTimeout(() => {
            toast.value.show = false;
        }, type === 'error' ? 5000 : 4000);
    };

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

    const onRequestImport = () => {
        importerRef.value?.trigger();
    };

    const onImportLoadingStart = () => {
        isImporting.value = true;
        startSubtitleRotation();
    };
    const onImportLoadingEnd = () => {
        isImporting.value = false;
        stopSubtitleRotation();
    };

    const onImported = async (payload) => {
        const n = payload?.createdCount ?? 0;
        const mode = payload?.mode;
        const modeLabel = mode === 'replace' ? 'sostituito' : 'aggiornato';
        showToast('success', `Menu ${modeLabel}: ${n} element${n === 1 ? 'o' : 'i'} importat${n === 1 ? 'o' : 'i'}.`);
        await nextTick();
        await menuListRef.value?.refresh?.();
    };

    const onImportError = (msg) => {
        showToast('error', msg || "Errore durante l'import.");
    };

    const onCountChanged = (n) => {
        menuElementsCount.value = Number(n) || 0;
    };

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

    onBeforeUnmount(() => {
        stopSubtitleRotation();
        if (toastTimer) clearTimeout(toastTimer);
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
        <MenuList
            v-else-if="activeTab === 'list'"
            ref="menuListRef"
            @AddElement="handleAdder"
            @RequestImport="onRequestImport"
            @count-changed="onCountChanged"
        />
        <IngredientsManager v-else-if="activeTab === 'ingredients'" />

        <!-- Importer montato sempre nella pagina MenuSetter per sopravvivere a cambi di tab -->
        <MenuImporter
            ref="importerRef"
            :current-count="menuElementsCount"
            @loading-start="onImportLoadingStart"
            @loading-end="onImportLoadingEnd"
            @imported="onImported"
            @error="onImportError"
        />

        <!-- Overlay loading full-screen durante l'analisi OCR -->
        <Teleport to="body">
            <div
                v-if="isImporting"
                class="import-overlay"
                role="status"
                aria-live="polite"
            >
                <div class="spinner-border text-light import-overlay-spinner" aria-hidden="true"></div>
                <h3 class="import-overlay-title">Stiamo analizzando il tuo menu...</h3>
                <p class="import-overlay-subtitle">{{ loadingSubtitles[loadingSubtitleIdx] }}</p>
                <div class="progress import-overlay-progress">
                    <div
                        class="progress-bar progress-bar-striped progress-bar-animated bg-light"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        style="width: 100%"
                    ></div>
                </div>
                <p class="import-overlay-warn">
                    <i class="bi bi-exclamation-triangle-fill"></i>
                    Operazione in corso. Non chiudere o ricaricare la pagina.
                </p>
            </div>
        </Teleport>

        <!-- Toast feedback (success/error) -->
        <Teleport to="body">
            <Transition name="toast">
                <div
                    v-if="toast.show"
                    class="import-toast"
                    :class="toast.type === 'error' ? 'import-toast-error' : 'import-toast-success'"
                    role="alert"
                >
                    <i
                        class="bi"
                        :class="toast.type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill'"
                    ></i>
                    <span>{{ toast.message }}</span>
                    <button
                        type="button"
                        class="import-toast-close"
                        aria-label="Chiudi"
                        @click="toast.show = false"
                    >
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </Transition>
        </Teleport>
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

/* Overlay loading import */
.import-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.78);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
}
.import-overlay-spinner {
    width: 4rem;
    height: 4rem;
}
.import-overlay-title {
    color: #fff;
    font-size: 1.5rem;
    font-weight: 700;
    margin: 24px 0 8px;
    text-align: center;
}
.import-overlay-subtitle {
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.95rem;
    margin: 0 0 16px;
    min-height: 1.5em;
    text-align: center;
    transition: opacity 0.3s ease;
}
.import-overlay-progress {
    width: 280px;
    max-width: 80vw;
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    overflow: hidden;
}
.import-overlay-warn {
    color: #fde68a;
    margin: 28px 0 0;
    font-size: 0.875rem;
    text-align: center;
    display: flex;
    align-items: center;
    gap: 8px;
}
.import-overlay-warn i {
    font-size: 1rem;
}

/* Toast */
.import-toast {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 2200;
    max-width: 420px;
    padding: 14px 18px;
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
    line-height: 1.4;
}
.import-toast-success {
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #6ee7b7;
}
.import-toast-error {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fca5a5;
}
.import-toast i {
    font-size: 1.1rem;
    flex-shrink: 0;
}
.import-toast-close {
    margin-left: auto;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px 4px;
    opacity: 0.7;
    transition: opacity 0.15s;
}
.import-toast-close:hover {
    opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
    transition: opacity 0.25s, transform 0.25s;
}
.toast-enter-from,
.toast-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

@media (max-width: 640px) {
    .import-toast {
        top: 12px;
        right: 12px;
        left: 12px;
        max-width: none;
    }
}
</style>
