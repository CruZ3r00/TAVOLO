<script setup>
    import { onMounted, ref } from 'vue';
    import { useStore } from 'vuex';
    import Modal from '@/components/Modal.vue';
    import { API_BASE } from '@/utils';

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const tkn = store.getters.getToken;

    //segnale al padre per visualizzare adder, notificare il conteggio elementi e richiedere l'import
    const emit = defineEmits(['AddElement', 'count-changed', 'RequestImport']);

    //variabili per il supporto delle richieste fetch
    const modify = ref(false);
    const modalShow = ref(false);
    const toModify = ref();
    const imagePreview = ref(null);
    const image = ref(null);
    const uploadedImageId = ref(null);
    const searchQuery = ref('');
    const filterCategory = ref('');

    //lista degli elementi
    const list = ref([]);

    // Categorie derivate dalla lista
    const categories = ref([]);

    // Lista filtrata
    const filteredList = () => {
        let result = list.value;
        if (filterCategory.value) {
            result = result.filter(el => el.category === filterCategory.value);
        }
        if (searchQuery.value) {
            const q = searchQuery.value.toLowerCase();
            result = result.filter(el => el.name.toLowerCase().includes(q));
        }
        return result;
    };

    const readErrorMessage = async (response, fallback) => {
        const payload = await response.json().catch(() => null);
        return payload?.error?.message || payload?.message || fallback;
    };

    //caricamento delle immagini su strapi
    const uploadImage = async () => {
        if(!image.value) return
        const formData = new FormData();
        formData.append('files', image.value);
        try {
            const response = await fetch(`${API_BASE}/api/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tkn}`,
                },
                body: formData,
            });
            if (!response.ok) {
                throw new Error(await readErrorMessage(response, 'Upload immagine non riuscito.'));
            }

            const result = await response.json();
            uploadedImageId.value = result[0]?.id ?? null;
            toModify.value.image = { ...(toModify.value.image || {}), id: uploadedImageId.value };
        } catch (error) {
            console.error(error?.message || error);
        }
    };

    //recupero della lista degli elementi nel database presenti nel menu
    const fetchList = async () => {
        try {
            const response =  await fetch(`${API_BASE}/api/menus`, {
                method: "GET",
                headers: {
                    "Content-Type" : "application/json",
                    "Authorization": `Bearer ${tkn}`,
                },
            });

            if (!response.ok) {
                throw new Error(await readErrorMessage(response, 'Errore nel recupero del menu.'));
            }

            const data = await response.json();
            if (data.data && data.data.length > 0) {
                list.value = [...data.data[0].fk_elements];
                categories.value = [...new Set(list.value.map(el => el.category))];
            } else {
                list.value = [];
                categories.value = [];
            }
            emit('count-changed', list.value.length);
        } catch (error) {
            console.error(error);
        }
    }

    //gestisce la visualizzazione del modale per la modifica di un elemento
    const handleModify = (e) => {
        modalShow.value = !modalShow.value;
        toModify.value = JSON.parse(JSON.stringify(e));
        imagePreview.value = null;
    };

    //funzione che fa l'update dell'elemento selezionato
    const update = async () => {
        try {
            const update = await fetch(`${API_BASE}/api/elements/${toModify.value.documentId}`,{
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`,
                },
                body: JSON.stringify({
                    data: {
                        name: toModify.value.name,
                        ingredients: toModify.value.ingredients,
                        allergens: toModify.value.allergens,
                        image: toModify.value.image?.id ?? null,
                        price: toModify.value.price,
                        category: toModify.value.category,
                    }
                })
            });
            if (!update.ok) {
                throw new Error(await readErrorMessage(update, 'Errore durante l\'aggiornamento dell\'elemento.'));
            }

            modalShow.value = false;
            imagePreview.value = null;
            await fetchList();
        } catch (error) {
            console.error(error);
        }
    }

    //function che cancella dal database e dalla lista l'elemento cliccato
    const handleDelete = async (id) => {
        try {
            const del = await fetch(`${API_BASE}/api/elements/${id}`,{
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${tkn}`
                }
            });

            if (!del.ok && del.status !== 204) {
                throw new Error(await readErrorMessage(del, 'Errore durante l\'eliminazione dell\'elemento.'));
            }

            await fetchList();
        } catch (error) {
            console.error(error);
        }
    }

    // funzioni per gestire ingredienti e allergeni nel modale di modifica
    const addIngredient = () => toModify.value.ingredients.push('');
    const removeIngredient = (index) => toModify.value.ingredients.splice(index, 1);
    const addAllergen = () => toModify.value.allergens.push('');
    const removeAllergen = (index) => toModify.value.allergens.splice(index, 1);

    //ricavare url dell'immagine
    const getImageUrl = (obj) => {
        if (!obj) return '';
        if (obj.formats && obj.formats.thumbnail) {
            return `${API_BASE}${obj.formats.thumbnail.url}`;
        }
        return `${API_BASE}${obj.url}`;
    }

    //funzione per gestire il file e la preview dell'immagine
    const handleFile = async (event) => {
        const file = event.target.files[0];
        if ( file ){
            image.value = file;
            const reader = new FileReader();
            reader.onload = () => {
            imagePreview.value = reader.result;
            };
            reader.readAsDataURL(file);
        }
        await uploadImage();
    };

    //quando il componente viene montato recupero la lista degli elementi
    onMounted(async () => {
        document.title = 'Gestione Menu';
        await fetchList();
    });

    // Esposto al parent per permettere il refresh della lista dopo un import bulk
    defineExpose({ refresh: fetchList });
</script>

<template>
    <div class="menu-list-page">
        <div class="menu-container">
            <!-- Header -->
            <div class="menu-header">
                <div class="menu-header-left">
                    <h2 class="menu-title">I tuoi elementi</h2>
                    <span v-if="list.length > 0" class="ds-badge ds-badge-primary">{{ list.length }}</span>
                </div>
                <div class="menu-header-actions">
                    <button @click="emit('RequestImport')" class="ds-btn ds-btn-secondary">
                        <i class="bi bi-file-earmark-arrow-up"></i>
                        <span>Importa da PDF/Immagine</span>
                    </button>
                    <button @click="modify = !modify" class="ds-btn" :class="modify ? 'ds-btn-primary' : 'ds-btn-secondary'">
                        <i class="bi bi-pencil"></i>
                        <span v-if="!modify">Modifica</span>
                        <span v-else>Fine</span>
                    </button>
                    <button @click="emit('AddElement')" class="ds-btn ds-btn-primary">
                        <i class="bi bi-plus-lg"></i>
                        <span>Aggiungi</span>
                    </button>
                </div>
            </div>

            <!-- Filters -->
            <div class="menu-filters ds-card" v-if="list.length > 0">
                <div class="filters-inner">
                    <div class="filter-search">
                        <i class="bi bi-search filter-icon"></i>
                        <input v-model="searchQuery" type="text" class="ds-input filter-input" placeholder="Cerca per nome...">
                    </div>
                    <select v-model="filterCategory" class="ds-input ds-select filter-select">
                        <option value="">Tutte le categorie</option>
                        <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
                    </select>
                </div>
            </div>

            <!-- Empty state -->
            <div v-if="list.length === 0" class="ds-card">
                <div class="ds-empty">
                    <div class="ds-empty-icon">
                        <i class="bi bi-journal-x"></i>
                    </div>
                    <p class="ds-empty-title">Nessun elemento nel menu</p>
                    <p class="ds-empty-description">Inizia aggiungendo il primo elemento al tuo menu.</p>
                    <button @click="emit('AddElement')" class="ds-btn ds-btn-primary">
                        <i class="bi bi-plus-lg"></i>
                        <span>Aggiungi il primo elemento</span>
                    </button>
                </div>
            </div>

            <!-- Element grid -->
            <div class="elements-grid">
                <div v-for="element in filteredList()" :key="element.documentId" class="ds-card element-card" v-motion-slide-visible-bottom>
                    <!-- Image -->
                    <div class="element-image-wrapper">
                        <img v-if="element.image" :src="getImageUrl(element.image)" class="element-image" :alt="element.name">
                        <div v-else class="element-image-placeholder">
                            <i class="bi bi-image"></i>
                        </div>
                    </div>

                    <div class="element-body">
                        <div class="element-header">
                            <h3 class="element-name">{{ element.name }}</h3>
                            <span class="element-price">{{ element.price.toFixed(2) }} &euro;</span>
                        </div>
                        <span class="ds-badge ds-badge-neutral">{{ element.category }}</span>

                        <div v-if="element.ingredients && element.ingredients.length" class="element-detail">
                            <span class="detail-label">Ingredienti</span>
                            <p class="detail-text">{{ element.ingredients.join(', ') }}</p>
                        </div>
                        <div v-if="element.allergens && element.allergens.length" class="element-detail">
                            <span class="detail-label detail-label-danger">Allergeni</span>
                            <p class="detail-text detail-text-danger">{{ element.allergens.join(', ') }}</p>
                        </div>
                    </div>

                    <!-- Edit actions -->
                    <Transition name="slide-up">
                        <div v-if="modify" class="element-actions">
                            <button @click="handleModify(element)" class="ds-btn ds-btn-secondary ds-btn-sm element-action-btn">
                                <i class="bi bi-pencil"></i>
                                <span>Modifica</span>
                            </button>
                            <button @click="handleDelete(element.documentId)" class="ds-btn ds-btn-danger ds-btn-sm element-action-btn">
                                <i class="bi bi-trash"></i>
                                <span>Elimina</span>
                            </button>
                        </div>
                    </Transition>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Modal -->
    <Modal :show="modalShow" @close="modalShow = !modalShow">
        <template #title>
            <h3 class="modal-edit-title">
                <i class="bi bi-pencil"></i>
                Modifica elemento
            </h3>
        </template>
        <template #body>
            <form @submit.prevent="update" class="edit-form">
                <div class="edit-form-row">
                    <div class="ds-field" style="flex: 1;">
                        <label class="ds-label">Nome</label>
                        <input type="text" v-model="toModify.name" class="ds-input" required>
                    </div>
                    <div class="ds-field" style="width: 140px;">
                        <label class="ds-label">Prezzo</label>
                        <div class="price-input-wrap">
                            <input type="number" v-model="toModify.price" class="ds-input" step="0.01" required>
                            <span class="price-suffix">&euro;</span>
                        </div>
                    </div>
                </div>

                <div class="ds-field">
                    <label class="ds-label">Ingredienti</label>
                    <div v-for="(ingredient, index) in toModify.ingredients" :key="index" class="list-input-row">
                        <input v-model="toModify.ingredients[index]" class="ds-input" required />
                        <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeIngredient(index)">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                    <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addIngredient">
                        <i class="bi bi-plus"></i> Aggiungi ingrediente
                    </button>
                </div>

                <div class="ds-field">
                    <label class="ds-label">Allergeni</label>
                    <div v-for="(allergen, index) in toModify.allergens" :key="index" class="list-input-row">
                        <input v-model="toModify.allergens[index]" class="ds-input" required />
                        <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeAllergen(index)">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                    <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addAllergen">
                        <i class="bi bi-plus"></i> Aggiungi allergene
                    </button>
                </div>

                <div class="ds-field">
                    <label class="ds-label">Categoria</label>
                    <select v-model="toModify.category" class="ds-input ds-select" required>
                        <option>Bevande</option>
                        <option>Dessert</option>
                        <option>Pizze classiche</option>
                        <option>Pizze bianche</option>
                        <option>Pizze rosse</option>
                        <option>Primi</option>
                        <option>Secondi</option>
                        <option>Primi di pesce</option>
                        <option>Secondi di pesce</option>
                        <option>Contorni</option>
                    </select>
                </div>

                <div class="ds-field">
                    <label class="ds-label">Immagine</label>
                    <label class="file-upload-area" tabindex="0">
                        <input type="file" accept="image/*" @change="handleFile" class="file-upload-hidden">
                        <div v-if="!imagePreview && !toModify.image" class="file-upload-content">
                            <i class="bi bi-cloud-arrow-up file-upload-icon"></i>
                            <span class="file-upload-text">Clicca per selezionare un'immagine</span>
                        </div>
                        <div v-else class="file-upload-preview">
                            <img v-if="imagePreview" :src="imagePreview" alt="Nuova anteprima" class="image-preview" />
                            <img v-else-if="toModify.image" :src="getImageUrl(toModify.image)" alt="Immagine attuale" class="image-preview" />
                            <span class="file-upload-change">Clicca per cambiare</span>
                        </div>
                    </label>
                </div>

                <button type="submit" class="ds-btn ds-btn-primary" style="width: 100%;">
                    <i class="bi bi-check2"></i>
                    Conferma modifica
                </button>
            </form>
        </template>
    </Modal>
</template>

<style scoped>
.menu-list-page {
    padding: var(--space-8) 0;
}

.menu-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--space-6);
}

/* Header */
.menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    flex-wrap: wrap;
    gap: var(--space-3);
}

.menu-header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.menu-title {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
    letter-spacing: var(--tracking-tight);
}

.menu-header-actions {
    display: flex;
    gap: var(--space-3);
}

/* Filters */
.menu-filters {
    margin-bottom: var(--space-6);
    padding: var(--space-4);
}

.filters-inner {
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
    width: 220px;
    flex-shrink: 0;
}

/* Element grid */
.elements-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-5);
}

.element-card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.element-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
}

.element-image-wrapper {
    height: 160px;
    overflow: hidden;
}

.element-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--transition-slow);
}

.element-card:hover .element-image {
    transform: scale(1.03);
}

.element-image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-subtle);
    color: var(--color-text-muted);
    font-size: var(--text-2xl);
}

.element-body {
    padding: var(--space-4);
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.element-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
}

.element-name {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
}

.element-price {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-primary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}

.element-detail {
    margin-top: var(--space-1);
}

.detail-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.detail-label-danger {
    color: var(--color-destructive);
}

.detail-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 2px 0 0;
}

.detail-text-danger {
    color: var(--color-destructive);
}

/* Element actions */
.element-actions {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
}

.element-action-btn {
    flex: 1;
}

/* Modal */
.modal-edit-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 0;
}

.edit-form {
    display: flex;
    flex-direction: column;
}

.edit-form-row {
    display: flex;
    gap: var(--space-4);
}

.price-input-wrap {
    position: relative;
}

.price-input-wrap .ds-input {
    padding-right: 32px;
}

.price-suffix {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
}

.list-input-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
}

.list-input-row .ds-input {
    flex: 1;
}

.file-upload-area {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
    min-height: 80px;
}

.file-upload-area:hover,
.file-upload-area:focus-within {
    border-color: var(--color-primary);
    background: var(--color-bg-subtle);
}

.file-upload-hidden {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    overflow: hidden;
}

.file-upload-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
}

.file-upload-icon {
    font-size: var(--text-xl);
    color: var(--color-text-muted);
}

.file-upload-text {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
}

.file-upload-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
}

.file-upload-change {
    font-size: var(--text-xs);
    color: var(--color-primary);
}

.image-preview {
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    max-height: 100px;
}

/* Responsive */
@media (max-width: 1024px) {
    .elements-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 640px) {
    .elements-grid {
        grid-template-columns: 1fr;
    }

    .filters-inner {
        flex-direction: column;
    }

    .filter-select {
        width: 100%;
    }

    .menu-container {
        padding: 0 var(--space-4);
    }
}
</style>
