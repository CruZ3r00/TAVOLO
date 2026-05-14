<script setup>
    import { useStore } from 'vuex';
    import { ref, onMounted, nextTick, computed } from 'vue';
    import { API_BASE } from '@/utils';

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const tkn = store.getters.getToken;

    const props = defineProps({
      // 'dish' (default) | 'beverage' — controlla titolo, category preselezionata e flag is_beverage
      mode: { type: String, default: 'dish' },
    });
    const isBeverageMode = computed(() => props.mode === 'beverage');

    const emit = defineEmits(['ViewList']);

    //variabili per il supporto delle richieste fetch
    const imagePreview = ref(null);
    const uploadedImageId = ref(null);
    const isSubmitting = ref(false);
    const submitSuccess = ref(false);

    //variabili utilizzate nel form da inviare per la richiesta API per creare nuovi record
    const name = ref('');
    // Ingredienti: array di stringhe (nomi). Il backend crea le entita
    // Ingredient mancanti via `syncElementRecipe`. Il typeahead suggerisce
    // ingredienti gia presenti nel magazzino dell'owner.
    const ingredients = ref([]);
    const existingIngredients = ref([]); // [{ key, name, ... }]
    const focusedRowIdx = ref(-1);
    const allergens = ref([]);
    const image = ref(null);
    const price = ref(null);
    const category = ref('');
    const customCategory = ref('');
    const useCustomCategory = ref(false);
    // Toggle "questa e' una bevanda": precompilato in base alla mode con cui
    // si entra in MenuAdder (beverage tab → true). L'utente puo cambiarlo
    // a mano. Lasciato a undefined il backend applica l'auto-classificazione
    // sulla categoria; settandolo esplicitamente overrida quella logica.
    const isBeverage = ref(isBeverageMode.value);

    const readErrorMessage = async (response, fallback) => {
        const payload = await response.json().catch(() => null);
        return payload?.error?.message || payload?.message || fallback;
    };

    //caricamento delle immagini su strapi
    const uploadImage = async () => {
        if(!image.value){
            uploadedImageId.value = null;
            return null;
        }

        const formData = new FormData();
        formData.append('files', image.value);
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
        return uploadedImageId.value;
    };

    //Creazione di un nuovo record di elemento tramite API strapi
    const CreateElement = async () => {
        const finalCategory = useCustomCategory.value ? customCategory.value : category.value;
        const payload = {
            name: name.value,
            ingredients: ingredients.value,
            allergens: allergens.value,
            image: uploadedImageId.value,
            price: price.value,
            category: finalCategory,
            is_beverage: !!isBeverage.value,
        };
        const response = await fetch(`${API_BASE}/api/elements`,{
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${tkn}`,
            },
            body: JSON.stringify({ data: payload })
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Creazione elemento non riuscita.'));
        }

        const data = await response.json();
        return data.data;
    };

    const validationError = ref('');

    //funzione quando si fa il submit del form che gestisce le altre funzioni e la richiesta finale
    const submit = async () => {
        validationError.value = '';

        // Validazione prezzo
        if (!price.value || parseFloat(price.value) <= 0) {
            validationError.value = 'Il prezzo deve essere maggiore di 0.';
            return;
        }

        // Filtra ingredienti e allergeni vuoti
        ingredients.value = ingredients.value.filter(i => i.trim() !== '');
        allergens.value = allergens.value.filter(a => a.trim() !== '');

        isSubmitting.value = true;
        submitSuccess.value = false;
        try {
            await uploadImage();
            await CreateElement();
            submitSuccess.value = true;
            resetForm();
            setTimeout(() => { submitSuccess.value = false; }, 2000);
        } catch (error) {
            validationError.value = error?.message || 'Errore durante il salvataggio dell\'elemento.';
        } finally {
            isSubmitting.value = false;
        }
    };

    // funzioni per aumentare e dimunire le dimensioni della lista degli ingredienti
    const addIngredient = () => ingredients.value.push('');
    const removeIngredient = (index) => ingredients.value.splice(index, 1);

    // Tipeahead: filtra `existingIngredients` in base al testo della riga,
    // escludendo quelli gia selezionati nelle altre righe.
    const ingredientSuggestions = (index) => {
      const query = String(ingredients.value[index] || '').trim().toLowerCase();
      const selected = new Set(
        ingredients.value
          .map((v, i) => (i !== index ? String(v || '').trim().toLowerCase() : null))
          .filter(Boolean),
      );
      const filtered = (existingIngredients.value || [])
        .filter((ing) => !selected.has(String(ing.name || '').toLowerCase()))
        .filter((ing) => !query || String(ing.name || '').toLowerCase().includes(query));
      return filtered.slice(0, 6);
    };

    // True se il testo digitato non corrisponde esattamente a nessun
    // ingrediente esistente — mostra il pulsante "Aggiungi nuovo".
    const isNewIngredient = (index) => {
      const value = String(ingredients.value[index] || '').trim();
      if (!value) return false;
      return !(existingIngredients.value || []).some(
        (ing) => String(ing.name || '').toLowerCase() === value.toLowerCase(),
      );
    };

    const pickIngredient = (index, name) => {
      ingredients.value[index] = name;
      focusedRowIdx.value = -1;
    };

    const onIngredientFocus = (index) => { focusedRowIdx.value = index; };
    const onIngredientBlur = (index) => {
      // Delay per permettere il click sul suggerimento (mousedown).
      setTimeout(() => {
        if (focusedRowIdx.value === index) focusedRowIdx.value = -1;
      }, 180);
    };

    /** Carica gli ingredienti gia presenti nel magazzino dell'owner */
    const loadExistingIngredients = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/ingredients`, {
          headers: { Authorization: `Bearer ${tkn}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const raw = Array.isArray(data?.data?.ingredients) ? data.data.ingredients : [];
        // Dedup per nome (case-insensitive) in caso il backend abbia ancora
        // duplicati storici. Mantieni l'entry con count piu' alto.
        const byName = new Map();
        for (const ing of raw) {
          const k = String(ing.name || '').trim().toLowerCase();
          if (!k) continue;
          const existing = byName.get(k);
          if (!existing || Number(ing.count || 0) > Number(existing.count || 0)) {
            byName.set(k, ing);
          }
        }
        existingIngredients.value = [...byName.values()].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''), 'it'),
        );
      } catch (_e) { /* silenzio: il typeahead diventa solo "free text" */ }
    };

    // funzioni per aumentare e dimunire le dimensioni della lista degli allergeni
    const addAllergen = () => allergens.value.push('');
    const removeAllergen = (index) => allergens.value.splice(index, 1);

    //funzione per resettare il form
    const resetForm = () => {
        imagePreview.value = null;
        uploadedImageId.value = null;
        name.value = '';
        ingredients.value = [];
        allergens.value = [];
        image.value = null;
        price.value = null;
        category.value = '';
        customCategory.value = '';
        useCustomCategory.value = false;
        isBeverage.value = isBeverageMode.value;
    }

    //funzione per gestire il file e la preview dell'immagine
    const handleFile = (event) => {
        const file = event.target.files[0];
        if ( file ){
            image.value = file;
            const reader = new FileReader();
            reader.onload = () => {
            imagePreview.value = reader.result;
            };
            reader.readAsDataURL(file);
        }
    };

    //impostazione del titolo della scheda + precompilazione modalita
    onMounted(async () => {
        nextTick(() => {
            document.title = isBeverageMode.value ? 'Aggiungi bevanda' : 'Aggiungi elemento al menu';
        });
        if (isBeverageMode.value && !category.value) {
            category.value = 'Bevande';
        }
        await loadExistingIngredients();
    });
</script>

<template>
    <div class="adder-page">
        <div class="adder-container">
            <!-- Header -->
            <div class="adder-header">
                <div>
                    <h2 class="adder-title">{{ isBeverageMode ? 'Nuova bevanda' : 'Nuovo elemento' }}</h2>
                    <p class="adder-subtitle">
                        {{ isBeverageMode
                            ? 'Aggiungi una bevanda al bar (acqua, vino, lattine, cocktail, ecc.)'
                            : 'Aggiungi un nuovo piatto al tuo menu' }}
                    </p>
                </div>
                <div class="adder-header-actions">
                    <button @click="emit('ViewList')" class="ds-btn ds-btn-secondary">
                        <i class="bi bi-arrow-left"></i>
                        <span>Torna alla lista</span>
                    </button>
                </div>
            </div>

            <!-- Validation error -->
            <Transition name="fade">
                <div v-if="validationError" class="ds-alert ds-alert-error">
                    <i class="bi bi-exclamation-circle"></i>
                    <span>{{ validationError }}</span>
                </div>
            </Transition>

            <!-- Success message -->
            <Transition name="slide-up">
                <div v-if="submitSuccess" class="ds-alert ds-alert-success">
                    <i class="bi bi-check-circle"></i>
                    <span>Elemento aggiunto con successo!</span>
                </div>
            </Transition>

            <!-- Form -->
            <div class="ds-card">
                <div class="ds-card-body">
                    <form @submit.prevent="submit" class="adder-form">
                        <div class="form-row-2">
                            <div class="ds-field" style="flex: 2;">
                                <label class="ds-label">Nome</label>
                                <input type="text" v-model="name" class="ds-input" placeholder="Es. Margherita" required>
                            </div>
                            <div class="ds-field" style="flex: 1;">
                                <label class="ds-label">Prezzo</label>
                                <div class="price-input-wrap">
                                    <input type="number" v-model="price" class="ds-input" step="0.01" min="0.01" placeholder="0.00" required>
                                    <span class="price-suffix">&euro;</span>
                                </div>
                            </div>
                        </div>

                        <div class="form-row-2">
                            <div class="ds-field" style="flex: 1;">
                                <label class="ds-label">Categoria</label>
                                <div v-if="!useCustomCategory">
                                    <select v-model="category" class="ds-input ds-select" :required="!useCustomCategory">
                                        <option value="" disabled>Seleziona una categoria</option>
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
                                    <button type="button" class="toggle-category" @click="useCustomCategory = true">
                                        Scrivi categoria personalizzata
                                    </button>
                                </div>
                                <div v-else>
                                    <input type="text" v-model="customCategory" class="ds-input" placeholder="Nome categoria" :required="useCustomCategory">
                                    <button type="button" class="toggle-category" @click="useCustomCategory = false">
                                        Torna alla lista predefinita
                                    </button>
                                </div>
                            </div>

                            <div class="ds-field" style="flex: 1;">
                                <label class="ds-label">Immagine</label>
                                <label class="file-upload-area" tabindex="0" @keydown.enter="$refs.fileInput.click()">
                                    <input ref="fileInput" type="file" accept="image/*" @change="handleFile" class="file-upload-hidden">
                                    <div v-if="!imagePreview" class="file-upload-content">
                                        <i class="bi bi-cloud-arrow-up file-upload-icon"></i>
                                        <span class="file-upload-text">Clicca per selezionare un'immagine</span>
                                    </div>
                                    <div v-else class="file-upload-preview">
                                        <img :src="imagePreview" alt="Anteprima" class="image-preview" />
                                        <span class="file-upload-change">Clicca per cambiare</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Toggle "Questa e' una bevanda" -->
                        <div class="ds-field bev-toggle-field">
                            <label class="bev-toggle-row">
                                <input type="checkbox" v-model="isBeverage" class="bev-toggle-input">
                                <span class="bev-toggle-track">
                                    <span class="bev-toggle-thumb"></span>
                                </span>
                                <span class="bev-toggle-label">
                                    <strong>Questa e' una bevanda</strong>
                                    <span class="bev-toggle-hint">Compare nella tab Bevande e contribuisce al turno bar.</span>
                                </span>
                            </label>
                        </div>

                        <!-- Ingredients (typeahead: seleziona esistente o crea nuovo) -->
                        <div class="ds-field">
                            <label class="ds-label">Ingredienti</label>
                            <div v-for="(ingredient, index) in ingredients" :key="index" class="list-input-row ingredient-row">
                                <div class="ingredient-combo">
                                    <input
                                        v-model="ingredients[index]"
                                        class="ds-input"
                                        placeholder="Cerca o digita nuovo..."
                                        required
                                        autocomplete="off"
                                        @focus="onIngredientFocus(index)"
                                        @blur="onIngredientBlur(index)"
                                    />
                                    <div
                                        v-if="focusedRowIdx === index && (ingredientSuggestions(index).length > 0 || isNewIngredient(index))"
                                        class="ingredient-dropdown"
                                    >
                                        <button
                                            v-for="sugg in ingredientSuggestions(index)"
                                            :key="sugg.key || sugg.name"
                                            type="button"
                                            class="ingredient-dropdown-item"
                                            @mousedown.prevent="pickIngredient(index, sugg.name)"
                                        >
                                            <i class="bi bi-check2 ingredient-dropdown-icon"></i>
                                            <span>{{ sugg.name }}</span>
                                            <span v-if="sugg.count" class="ingredient-dropdown-meta">
                                                in {{ sugg.count }} {{ sugg.count === 1 ? 'piatto' : 'piatti' }}
                                            </span>
                                        </button>
                                        <button
                                            v-if="isNewIngredient(index)"
                                            type="button"
                                            class="ingredient-dropdown-item ingredient-dropdown-create"
                                            @mousedown.prevent="pickIngredient(index, ingredients[index].trim())"
                                        >
                                            <i class="bi bi-plus-lg ingredient-dropdown-icon"></i>
                                            <span>Aggiungi nuovo ingrediente: <strong>{{ ingredients[index].trim() }}</strong></span>
                                        </button>
                                    </div>
                                </div>
                                <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeIngredient(index)">
                                    <i class="bi bi-x-lg"></i>
                                </button>
                            </div>
                            <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addIngredient">
                                <i class="bi bi-plus"></i>
                                Aggiungi ingrediente
                            </button>
                        </div>

                        <!-- Allergens -->
                        <div class="ds-field">
                            <label class="ds-label">Allergeni</label>
                            <div v-for="(allergen, index) in allergens" :key="index" class="list-input-row">
                                <input v-model="allergens[index]" class="ds-input" placeholder="Allergene..." required />
                                <button type="button" class="ds-btn ds-btn-ghost ds-btn-icon" @click="removeAllergen(index)">
                                    <i class="bi bi-x-lg"></i>
                                </button>
                            </div>
                            <button type="button" class="ds-btn ds-btn-ghost ds-btn-sm" @click="addAllergen">
                                <i class="bi bi-plus"></i>
                                Aggiungi allergene
                            </button>
                        </div>

                        <!-- Submit -->
                        <button type="submit" class="ds-btn ds-btn-primary ds-btn-lg" :disabled="isSubmitting">
                            <span v-if="isSubmitting" class="ds-spinner"></span>
                            <template v-else>
                                <i class="bi bi-check2"></i>
                                <span>Aggiungi al menu</span>
                            </template>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.adder-page {
    padding: var(--space-8) 0;
}

.adder-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 0 var(--space-6);
}

.adder-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    gap: var(--space-4);
}

.adder-header-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    align-items: center;
}

.adder-title {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 var(--space-1) 0;
    letter-spacing: var(--tracking-tight);
}

.adder-subtitle {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
}

.adder-form {
    display: flex;
    flex-direction: column;
}

.form-row-2 {
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

.toggle-category {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--text-sm);
    cursor: pointer;
    padding: var(--space-1) 0;
    font-family: var(--font-family);
    transition: color var(--transition-fast);
}

.toggle-category:hover {
    color: var(--color-primary-hover);
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

.bev-toggle-field { margin: var(--space-2) 0; }
.bev-toggle-row {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-subtle);
    cursor: pointer;
    transition: border-color 160ms;
}
.bev-toggle-row:hover { border-color: var(--color-primary); }
.bev-toggle-input { position: absolute; opacity: 0; pointer-events: none; }
.bev-toggle-track {
    position: relative;
    width: 38px; height: 22px; flex-shrink: 0;
    background: var(--color-border);
    border-radius: 999px;
    transition: background 160ms;
    margin-top: 2px;
}
.bev-toggle-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 18px; height: 18px;
    background: #fff;
    border-radius: 50%;
    transition: transform 160ms;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}
.bev-toggle-input:checked + .bev-toggle-track { background: var(--color-primary); }
.bev-toggle-input:checked + .bev-toggle-track .bev-toggle-thumb { transform: translateX(16px); }
.bev-toggle-label { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
.bev-toggle-label strong { color: var(--color-text); font-weight: 600; }
.bev-toggle-hint { color: var(--color-text-muted); font-size: 12.5px; line-height: 1.4; }

/* Ingredient combobox (typeahead) */
.ingredient-row { align-items: stretch; }
.ingredient-combo { flex: 1; position: relative; }
.ingredient-combo .ds-input { width: 100%; }
.ingredient-dropdown {
    position: absolute;
    left: 0; right: 0; top: 100%;
    background: var(--color-bg, #fff);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 8px 16px rgba(0,0,0,0.15);
    margin-top: 2px;
    z-index: 30;
    max-height: 240px;
    overflow-y: auto;
}
.ingredient-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    color: var(--color-text);
    font-family: var(--font-family);
}
.ingredient-dropdown-item:hover { background: var(--color-bg-subtle); }
.ingredient-dropdown-icon { color: var(--color-text-muted); flex-shrink: 0; }
.ingredient-dropdown-meta {
    margin-left: auto;
    color: var(--color-text-muted);
    font-size: 11px;
}
.ingredient-dropdown-create {
    border-top: 1px solid var(--color-border);
    color: var(--color-primary);
    font-weight: 500;
}
.ingredient-dropdown-create .ingredient-dropdown-icon { color: var(--color-primary); }

@media (max-width: 640px) {
    .form-row-2 {
        flex-direction: column;
    }

    .adder-header {
        flex-direction: column;
    }

    .adder-container {
        padding: 0 var(--space-4);
    }
}
</style>
