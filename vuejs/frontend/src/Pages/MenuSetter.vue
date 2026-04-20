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
    border-bottom: 1px solid var(--line);
    background: var(--bg);
    padding: 0 var(--s-6);
    position: sticky;
    top: 64px;
    z-index: 20;
    backdrop-filter: saturate(1.2) blur(8px);
    background: color-mix(in oklab, var(--bg) 82%, transparent);
}
.menu-tabs {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    gap: 0;
}
.menu-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 22px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 500;
    color: var(--ink-3);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 140ms, border-color 140ms;
    margin-bottom: -1px;
    letter-spacing: -0.01em;
}
.menu-tab i { font-size: 15px; opacity: 0.85; }
.menu-tab:hover { color: var(--ink); }
.menu-tab--active {
    color: var(--ink);
    border-bottom-color: var(--ac);
}
.menu-tab--active i { color: var(--ac); opacity: 1; }

@media (max-width: 640px) {
    .menu-tabs-wrapper { padding: 0 var(--s-4); top: 64px; }
    .menu-tab { flex: 1; justify-content: center; padding: 12px 10px; }
}

/* Import overlay */
.import-overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, var(--ink) 85%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    animation: fadeIn 240ms ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.import-overlay-spinner {
    width: 56px; height: 56px;
    border: 3px solid rgba(255,255,255,0.2);
    border-top-color: #fff;
    border-radius: 999px;
    animation: spin 900ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.import-overlay-title {
    color: #fff;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 22px 0 6px;
    text-align: center;
}
.import-overlay-subtitle {
    color: rgba(255,255,255,0.72);
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 13px;
    margin: 0 0 20px;
    min-height: 1.5em;
    text-align: center;
    letter-spacing: 0.02em;
}
.import-overlay-progress {
    width: 320px;
    max-width: 80vw;
    height: 5px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 999px;
    overflow: hidden;
    position: relative;
}
.import-overlay-progress .progress-bar {
    background: linear-gradient(90deg, transparent, var(--ac), transparent) !important;
    background-size: 200% 100% !important;
    animation: shimmer 1.8s linear infinite;
}
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.import-overlay-warn {
    color: color-mix(in oklab, var(--warn) 60%, #fff);
    margin: 26px 0 0;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 12px;
    text-align: center;
    display: flex;
    align-items: center;
    gap: 8px;
    letter-spacing: 0.02em;
}
.import-overlay-warn i { font-size: 14px; }

/* Toast */
.import-toast {
    position: fixed;
    top: 80px;
    right: 24px;
    z-index: 2200;
    max-width: 420px;
    padding: 12px 16px;
    border-radius: var(--r-md);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    line-height: 1.4;
    font-weight: 500;
}
.import-toast-success {
    background: color-mix(in oklab, var(--ok) 12%, var(--paper));
    color: var(--ok);
    border: 1px solid color-mix(in oklab, var(--ok) 30%, transparent);
}
.import-toast-error {
    background: color-mix(in oklab, var(--dan) 12%, var(--paper));
    color: var(--dan);
    border: 1px solid color-mix(in oklab, var(--dan) 30%, transparent);
}
.import-toast i { font-size: 18px; flex-shrink: 0; }
.import-toast-close {
    margin-left: auto;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px 4px;
    opacity: 0.6;
    transition: opacity 0.15s;
}
.import-toast-close:hover { opacity: 1; }

.toast-enter-active, .toast-leave-active { transition: opacity 240ms, transform 240ms; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-10px); }

@media (max-width: 640px) {
    .import-toast {
        top: 76px;
        right: 12px;
        left: 12px;
        max-width: none;
    }
}
</style>
