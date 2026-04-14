<script setup>
import { onMounted, ref, computed } from 'vue';
import { useStore } from 'vuex';
import { API_BASE } from '@/utils';

const store = useStore();
const tkn = store.getters.getToken;

/** @type {import('vue').Ref<Array<{key:string,name:string,count:number,dishes:Array<{documentId:string,name:string,available:boolean}>,unavailable:boolean}>>} */
const ingredients = ref([]);
const loading = ref(true);
const error = ref(null);
/** Chiave dell'ingrediente in corso di salvataggio */
const togglingKey = ref(null);
const searchQuery = ref('');
const filterStatus = ref('');

/** Ingredienti filtrati per ricerca e status */
const filteredIngredients = computed(() => {
    let result = ingredients.value;
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase();
        result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (filterStatus.value === 'available') result = result.filter((i) => !i.unavailable);
    if (filterStatus.value === 'unavailable') result = result.filter((i) => i.unavailable);
    return result;
});

const unavailableCount = computed(() => ingredients.value.filter((i) => i.unavailable).length);

/** Carica la lista ingredienti dall'API */
const fetchIngredients = async () => {
    loading.value = true;
    error.value = null;
    try {
        const res = await fetch(`${API_BASE}/api/ingredients`, {
            headers: {
                Authorization: `Bearer ${tkn}`,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        ingredients.value = data.data?.ingredients || [];
    } catch (e) {
        error.value = 'Impossibile caricare gli ingredienti. Riprova.';
        console.error(e);
    } finally {
        loading.value = false;
    }
};

/**
 * Effettua il toggle di un ingrediente (disponibile ↔ terminato)
 * e propaga la disponibilità ai piatti coinvolti.
 * @param {{ key: string, name: string, unavailable: boolean }} ingredient
 */
const toggleIngredient = async (ingredient) => {
    if (togglingKey.value) return;
    togglingKey.value = ingredient.key;
    try {
        const newValue = !ingredient.unavailable;
        const res = await fetch(`${API_BASE}/api/ingredients/toggle`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${tkn}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ingredient: ingredient.name, unavailable: newValue }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Ricarico la lista per ottenere lo stato aggiornato dei piatti
        await fetchIngredients();
    } catch (e) {
        console.error(e);
        error.value = 'Errore durante il salvataggio. Riprova.';
    } finally {
        togglingKey.value = null;
    }
};

onMounted(fetchIngredients);
</script>

<template>
    <div class="ing-page">
        <div class="ing-container">

            <!-- Header -->
            <div class="ing-header">
                <div class="ing-header-left">
                    <h2 class="ing-title">Gestione ingredienti</h2>
                    <span v-if="unavailableCount > 0" class="ds-badge ds-badge-danger">
                        {{ unavailableCount }} terminati
                    </span>
                </div>
                <button @click="fetchIngredients" class="ds-btn ds-btn-secondary" :disabled="loading">
                    <i class="bi" :class="loading ? 'bi-arrow-repeat ing-spin' : 'bi-arrow-clockwise'"></i>
                    <span>Aggiorna</span>
                </button>
            </div>

            <!-- Info banner -->
            <div class="ds-card ing-info-banner">
                <i class="bi bi-info-circle ing-info-icon"></i>
                <p class="ing-info-text">
                    Flagga un ingrediente come <strong>terminato</strong> per nascondere automaticamente
                    tutti i piatti del menu che lo contengono.
                </p>
            </div>

            <!-- Error -->
            <div v-if="error" class="ds-card ing-error">
                <i class="bi bi-exclamation-triangle"></i>
                <span>{{ error }}</span>
                <button @click="fetchIngredients" class="ds-btn ds-btn-secondary ds-btn-sm">Riprova</button>
            </div>

            <!-- Loading skeleton -->
            <div v-if="loading" class="ing-skeleton-list">
                <div v-for="n in 6" :key="n" class="ds-card ing-skeleton-item">
                    <div class="ing-skeleton-bar ing-skeleton-name"></div>
                    <div class="ing-skeleton-bar ing-skeleton-sub"></div>
                </div>
            </div>

            <!-- Empty state -->
            <div v-else-if="ingredients.length === 0" class="ds-card">
                <div class="ds-empty">
                    <div class="ds-empty-icon"><i class="bi bi-basket"></i></div>
                    <p class="ds-empty-title">Nessun ingrediente trovato</p>
                    <p class="ds-empty-description">Aggiungi elementi al menu con ingredienti per vederli qui.</p>
                </div>
            </div>

            <template v-else>
                <!-- Filters -->
                <div class="ds-card ing-filters">
                    <div class="ing-filters-inner">
                        <div class="filter-search">
                            <i class="bi bi-search filter-icon"></i>
                            <input
                                v-model="searchQuery"
                                type="text"
                                class="ds-input filter-input"
                                placeholder="Cerca ingrediente..."
                            >
                        </div>
                        <select v-model="filterStatus" class="ds-input ds-select filter-select">
                            <option value="">Tutti ({{ ingredients.length }})</option>
                            <option value="available">Disponibili</option>
                            <option value="unavailable">Terminati</option>
                        </select>
                    </div>
                </div>

                <!-- No results -->
                <div v-if="filteredIngredients.length === 0" class="ds-card">
                    <div class="ds-empty">
                        <div class="ds-empty-icon"><i class="bi bi-funnel"></i></div>
                        <p class="ds-empty-title">Nessun risultato</p>
                        <p class="ds-empty-description">Prova a modificare i filtri di ricerca.</p>
                    </div>
                </div>

                <!-- Ingredient list -->
                <div v-else class="ing-list">
                    <div
                        v-for="ingredient in filteredIngredients"
                        :key="ingredient.key"
                        class="ds-card ing-item"
                        :class="{ 'ing-item--unavailable': ingredient.unavailable }"
                    >
                        <div class="ing-item-body">
                            <div class="ing-item-info">
                                <div class="ing-item-name-row">
                                    <span class="ing-item-name">{{ ingredient.name }}</span>
                                    <span
                                        class="ds-badge"
                                        :class="ingredient.unavailable ? 'ds-badge-danger' : 'ds-badge-success'"
                                    >
                                        {{ ingredient.unavailable ? 'Terminato' : 'Disponibile' }}
                                    </span>
                                </div>
                                <p class="ing-item-sub">
                                    Presente in
                                    <strong>{{ ingredient.count }}</strong>
                                    {{ ingredient.count === 1 ? 'piatto' : 'piatti' }}
                                    <template v-if="ingredient.dishes.length">
                                        &mdash;
                                        <span class="ing-dishes-list">
                                            <span
                                                v-for="(dish, idx) in ingredient.dishes"
                                                :key="dish.documentId"
                                            >
                                                <span
                                                    class="ing-dish-tag"
                                                    :class="{ 'ing-dish-tag--unavailable': !dish.available }"
                                                >{{ dish.name }}</span>
                                                <template v-if="idx < ingredient.dishes.length - 1">, </template>
                                            </span>
                                        </span>
                                    </template>
                                </p>
                            </div>

                            <!-- Toggle switch -->
                            <label
                                class="ing-toggle"
                                :class="{ 'ing-toggle--loading': togglingKey === ingredient.key }"
                                :title="ingredient.unavailable ? 'Segna come disponibile' : 'Segna come terminato'"
                            >
                                <input
                                    type="checkbox"
                                    class="ing-toggle-input"
                                    :checked="ingredient.unavailable"
                                    :disabled="togglingKey !== null"
                                    @change="toggleIngredient(ingredient)"
                                >
                                <span class="ing-toggle-label">
                                    <i v-if="togglingKey === ingredient.key" class="bi bi-arrow-repeat ing-spin"></i>
                                    <template v-else>
                                        <i v-if="ingredient.unavailable" class="bi bi-x-circle-fill ing-icon-unavailable"></i>
                                        <i v-else class="bi bi-check-circle-fill ing-icon-available"></i>
                                    </template>
                                    <span>{{ ingredient.unavailable ? 'Terminato' : 'Disponibile' }}</span>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            </template>

        </div>
    </div>
</template>

<style scoped>
.ing-page {
    padding: var(--space-8) 0;
}

.ing-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}

/* Header */
.ing-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
}

.ing-header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.ing-title {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
    letter-spacing: var(--tracking-tight);
}

/* Info banner */
.ing-info-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--color-bg-subtle);
    border-left: 3px solid var(--color-primary);
}

.ing-info-icon {
    color: var(--color-primary);
    font-size: var(--text-lg);
    flex-shrink: 0;
    margin-top: 2px;
}

.ing-info-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
}

/* Error */
.ing-error {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    color: var(--color-destructive);
    font-size: var(--text-sm);
}

/* Filters */
.ing-filters {
    padding: var(--space-4);
}

.ing-filters-inner {
    display: flex;
    gap: var(--space-3);
}

.filter-search {
    flex: 1;
    position: relative;
}

.filter-icon {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
}

.filter-input {
    padding-left: 36px;
}

.filter-select {
    width: 200px;
    flex-shrink: 0;
}

/* Skeleton */
.ing-skeleton-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.ing-skeleton-item {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.ing-skeleton-bar {
    background: var(--color-bg-subtle);
    border-radius: var(--radius-sm);
    animation: pulse 1.5s ease-in-out infinite;
}

.ing-skeleton-name {
    height: 18px;
    width: 40%;
}

.ing-skeleton-sub {
    height: 14px;
    width: 60%;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

/* Ingredient list */
.ing-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.ing-item {
    transition: opacity var(--transition-fast);
}

.ing-item--unavailable {
    opacity: 0.75;
}

.ing-item-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4);
    flex-wrap: wrap;
}

.ing-item-info {
    flex: 1;
    min-width: 0;
}

.ing-item-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-bottom: var(--space-1);
}

.ing-item-name {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
}

.ing-item-sub {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
}

.ing-dishes-list {
    color: var(--color-text-secondary);
}

.ing-dish-tag {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
}

.ing-dish-tag--unavailable {
    text-decoration: line-through;
    color: var(--color-destructive);
}

/* Toggle */
.ing-toggle {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    flex-shrink: 0;
}

.ing-toggle--loading {
    opacity: 0.6;
    cursor: wait;
}

.ing-toggle-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    overflow: hidden;
}

.ing-toggle-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-full, 9999px);
    font-size: var(--text-sm);
    font-weight: 500;
    border: 1.5px solid var(--color-border);
    transition: all var(--transition-fast);
    user-select: none;
    background: var(--color-bg);
}

.ing-toggle-input:not(:disabled) + .ing-toggle-label:hover {
    border-color: var(--color-primary);
    background: var(--color-bg-subtle);
}

.ing-toggle-input:checked + .ing-toggle-label {
    background: rgba(var(--color-destructive-rgb, 220, 38, 38), 0.08);
    border-color: var(--color-destructive);
    color: var(--color-destructive);
}

.ing-icon-available {
    color: var(--color-success, #16a34a);
}

.ing-icon-unavailable {
    color: var(--color-destructive);
}

/* Spin animation */
.ing-spin {
    animation: spin 0.8s linear infinite;
    display: inline-block;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 640px) {
    .ing-container {
        padding: 0 var(--space-4);
    }

    .ing-filters-inner {
        flex-direction: column;
    }

    .filter-select {
        width: 100%;
    }

    .ing-item-body {
        flex-direction: column;
        align-items: flex-start;
    }

    .ing-toggle {
        width: 100%;
    }

    .ing-toggle-label {
        width: 100%;
        justify-content: center;
    }
}
</style>
