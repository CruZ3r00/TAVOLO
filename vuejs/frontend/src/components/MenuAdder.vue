<script setup>
    import { useStore } from 'vuex';
    import { ref, onMounted, nextTick, computed } from 'vue';
    import { API_BASE } from '@/utils';

    const store = useStore();
    const tkn = store.getters.getToken;

    const props = defineProps({
      // 'dish' (default) | 'beverage' — controlla titolo, category preselezionata e flag is_beverage
      mode: { type: String, default: 'dish' },
    });
    const isBeverageMode = computed(() => props.mode === 'beverage');

    // ViewList: torna alla lista. open-recipe: apri BeverageAdvancedEditor sull'elemento creato
    // (flow del CTA "Configura ricetta →": salva prima, poi apri).
    const emit = defineEmits(['ViewList', 'open-recipe']);

    const imagePreview = ref(null);
    const uploadedImageId = ref(null);
    const isSubmitting = ref(false);
    const submitSuccess = ref(false);

    const name = ref('');
    // Ingredienti: array di stringhe (nomi). Il backend crea le entita
    // Ingredient mancanti via `syncElementRecipe`. Il typeahead suggerisce
    // ingredienti gia presenti nel magazzino dell'owner.
    const ingredients = ref([]);
    const existingIngredients = ref([]);
    const focusedRowIdx = ref(-1);
    const allergens = ref([]);
    const image = ref(null);
    const price = ref(null);
    const category = ref('');
    const customCategory = ref('');
    const useCustomCategory = ref(false);
    // Toggle "questa e' una bevanda": precompilato in base alla mode con cui
    // si entra in MenuAdder. L'utente puo cambiarlo a mano. Settandolo
    // esplicitamente overrida l'auto-classificazione lato backend.
    const isBeverage = ref(isBeverageMode.value);

    const validationError = ref('');
    const submittingForRecipe = ref(false);

    const PREDEFINED_CATEGORIES = [
        'Bevande',
        'Dessert',
        'Pizze classiche',
        'Pizze bianche',
        'Pizze rosse',
        'Primi',
        'Secondi',
        'Primi di pesce',
        'Secondi di pesce',
        'Contorni',
    ];

    // Mappa categorie → reparto destinazione (allineata a Strapi categoryRouting di default).
    // Quando is_beverage = true il reparto è sempre 'bar'.
    const departmentForCategory = (cat) => {
        const c = String(cat || '').toLowerCase();
        if (c.includes('pizz')) return 'pizzeria';
        if (c.includes('bevand')) return 'bar';
        return 'cucina';
    };

    const effectiveCategory = computed(() =>
        useCustomCategory.value ? customCategory.value : category.value,
    );

    const behaviorPreview = computed(() => {
        const bev = !!isBeverage.value;
        const dept = bev ? 'Bar' : departmentForCategory(effectiveCategory.value).replace(/^./, (s) => s.toUpperCase());
        return {
            tabVisibleIn: bev ? 'Menu + Bevande' : 'Solo Menu',
            department: dept,
            barShiftCount: bev ? 'Sì, scalato a ogni vendita' : 'No',
            inventory: bev ? 'Magazzino bevande' : 'Solo ingredienti',
        };
    });

    const payloadPreview = computed(() => {
        const ing = ingredients.value.filter((i) => String(i || '').trim() !== '');
        const all = allergens.value.filter((a) => String(a || '').trim() !== '');
        return {
            name: name.value || '',
            price: Number(price.value) || 0,
            category: effectiveCategory.value || '',
            image: uploadedImageId.value ? '<upload_id>' : null,
            ingredients: ing,
            allergens: all,
            is_beverage: !!isBeverage.value,
        };
    });

    const payloadJson = computed(() => {
        const p = payloadPreview.value;
        const trim = (arr, n = 2) => {
            const head = arr.slice(0, n).map((s) => `"${s}"`).join(', ');
            return arr.length > n ? `${head}, …` : head;
        };
        return `{
  name: "${p.name}",
  price: ${p.price.toFixed(2)},
  category: "${p.category}",
  image: ${p.image ? '<upload_id>' : 'null'},
  ingredients: [${trim(p.ingredients)}],
  allergens: [${trim(p.allergens)}],
  is_beverage: ${p.is_beverage}
}`;
    });

    const previewIcon = computed(() => (isBeverage.value ? '🍷' : '🍝'));
    const previewName = computed(() => name.value || (isBeverage.value ? 'Nuova bevanda' : 'Nuovo elemento'));
    const previewPrice = computed(() => {
        const v = Number(price.value);
        if (!Number.isFinite(v) || v <= 0) return '—';
        return `${v.toFixed(2)} €`;
    });
    const previewCategory = computed(() => effectiveCategory.value || (isBeverageMode.value ? 'Bevande' : 'Categoria'));
    const previewIngredients = computed(() =>
        ingredients.value.filter((i) => String(i || '').trim() !== '').join(', '),
    );
    const previewAllergens = computed(() =>
        allergens.value.filter((a) => String(a || '').trim() !== '').join(', ').toLowerCase(),
    );

    const readErrorMessage = async (response, fallback) => {
        const payload = await response.json().catch(() => null);
        return payload?.error?.message || payload?.message || fallback;
    };

    const uploadImage = async () => {
        if (!image.value) {
            uploadedImageId.value = null;
            return null;
        }
        const formData = new FormData();
        formData.append('files', image.value);
        const response = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tkn}` },
            body: formData,
        });
        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Upload immagine non riuscito.'));
        }
        const result = await response.json();
        uploadedImageId.value = result[0]?.id ?? null;
        return uploadedImageId.value;
    };

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
        const response = await fetch(`${API_BASE}/api/elements`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tkn}`,
            },
            body: JSON.stringify({ data: payload }),
        });
        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Creazione elemento non riuscita.'));
        }
        const data = await response.json();
        return data.data;
    };

    const submit = async ({ thenOpenRecipe = false } = {}) => {
        validationError.value = '';

        if (!name.value || !name.value.trim()) {
            validationError.value = 'Il nome è obbligatorio.';
            return;
        }
        if (!price.value || parseFloat(price.value) <= 0) {
            validationError.value = 'Il prezzo deve essere maggiore di 0.';
            return;
        }
        if (!effectiveCategory.value) {
            validationError.value = 'Seleziona o scrivi una categoria.';
            return;
        }

        // Filtra ingredienti e allergeni vuoti
        ingredients.value = ingredients.value.filter((i) => i.trim() !== '');
        allergens.value = allergens.value.filter((a) => a.trim() !== '');

        isSubmitting.value = true;
        if (thenOpenRecipe) submittingForRecipe.value = true;
        submitSuccess.value = false;
        try {
            await uploadImage();
            const created = await CreateElement();
            submitSuccess.value = true;
            const savedSnapshot = created;
            resetForm();
            if (thenOpenRecipe && savedSnapshot) {
                emit('open-recipe', savedSnapshot);
                return;
            }
            setTimeout(() => { submitSuccess.value = false; }, 2000);
        } catch (error) {
            validationError.value = error?.message || "Errore durante il salvataggio dell'elemento.";
        } finally {
            isSubmitting.value = false;
            submittingForRecipe.value = false;
        }
    };

    const onPrimarySubmit = () => submit();
    const onConfigureRecipe = () => submit({ thenOpenRecipe: true });

    const addIngredient = () => ingredients.value.push('');
    const removeIngredient = (index) => ingredients.value.splice(index, 1);

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

    const isNewIngredient = (index) => {
        const value = String(ingredients.value[index] || '').trim();
        if (!value) return false;
        return !(existingIngredients.value || []).some(
            (ing) => String(ing.name || '').toLowerCase() === value.toLowerCase(),
        );
    };

    const pickIngredient = (index, n) => {
        ingredients.value[index] = n;
        focusedRowIdx.value = -1;
    };

    const onIngredientFocus = (index) => { focusedRowIdx.value = index; };
    const onIngredientBlur = (index) => {
        setTimeout(() => {
            if (focusedRowIdx.value === index) focusedRowIdx.value = -1;
        }, 180);
    };

    const loadExistingIngredients = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/ingredients`, {
                headers: { Authorization: `Bearer ${tkn}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) return;
            const data = await res.json();
            const raw = Array.isArray(data?.data?.ingredients) ? data.data.ingredients : [];
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

    const addAllergen = () => allergens.value.push('');
    const removeAllergen = (index) => allergens.value.splice(index, 1);

    const resetForm = () => {
        imagePreview.value = null;
        uploadedImageId.value = null;
        name.value = '';
        ingredients.value = [];
        allergens.value = [];
        image.value = null;
        price.value = null;
        category.value = isBeverageMode.value ? 'Bevande' : '';
        customCategory.value = '';
        useCustomCategory.value = false;
        isBeverage.value = isBeverageMode.value;
    };

    const handleFile = (event) => {
        const file = event.target.files[0];
        if (file) {
            image.value = file;
            const reader = new FileReader();
            reader.onload = () => { imagePreview.value = reader.result; };
            reader.readAsDataURL(file);
        }
    };

    const onSelectCategory = (cat) => {
        category.value = cat;
        useCustomCategory.value = false;
    };

    const fileInputRef = ref(null);
    const triggerFile = () => fileInputRef.value?.click();

    onMounted(async () => {
        nextTick(() => {
            document.title = isBeverageMode.value ? 'Aggiungi bevanda' : 'Aggiungi elemento al menu';
        });
        if (isBeverageMode.value && !category.value) category.value = 'Bevande';
        await loadExistingIngredients();
    });
</script>

<template>
    <div class="ma-shell">
        <!-- Breadcrumb + Header -->
        <header class="ma-head">
            <nav class="ma-crumbs" aria-label="breadcrumb">
                <span class="ma-crumb">Menu</span>
                <span class="ma-crumb-sep" aria-hidden="true">/</span>
                <span class="ma-crumb">{{ isBeverageMode ? 'Bevande' : 'Tutti gli elementi' }}</span>
                <span class="ma-crumb-sep" aria-hidden="true">/</span>
                <span class="ma-crumb ma-crumb--current">
                    {{ isBeverageMode ? 'Nuova bevanda' : 'Nuovo elemento' }}
                </span>
            </nav>
            <div class="ma-title-row">
                <button type="button" class="ma-back-btn" @click="emit('ViewList')" aria-label="Torna alla lista">
                    <i class="bi bi-arrow-left"></i>
                </button>
                <div class="ma-title-block">
                    <h1 class="ma-title">{{ isBeverageMode ? 'Nuova bevanda' : 'Nuovo elemento' }}</h1>
                    <p class="ma-subtitle">
                        {{ isBeverageMode
                            ? 'Aggiungi una bevanda al bar (acqua, vino, lattine, cocktail).'
                            : 'Aggiungi un nuovo piatto al tuo menu.' }}
                    </p>
                </div>
            </div>
        </header>

        <!-- Validation / success banners -->
        <Transition name="ma-fade">
            <div v-if="validationError" class="ma-banner ma-banner--error" role="alert">
                <i class="bi bi-exclamation-circle"></i>
                <span>{{ validationError }}</span>
            </div>
        </Transition>
        <Transition name="ma-fade">
            <div v-if="submitSuccess" class="ma-banner ma-banner--success" role="status">
                <i class="bi bi-check-circle"></i>
                <span>Elemento aggiunto con successo!</span>
            </div>
        </Transition>

        <!-- 2-col layout: form sections | preview -->
        <form class="ma-grid" @submit.prevent="onPrimarySubmit">
            <div class="ma-form-col">
                <!-- 1 · Nome + Prezzo -->
                <section class="ma-section">
                    <aside class="ma-section-head">
                        <div class="ma-section-num-row">
                            <span class="ma-section-num">1</span>
                            <h2 class="ma-section-title">Nome e prezzo</h2>
                        </div>
                        <p class="ma-section-sub">Quello che il cliente vede sulla card del menu.</p>
                    </aside>
                    <div class="ma-section-body">
                        <div class="ma-row-2">
                            <div class="ma-field" style="flex: 1.6;">
                                <label class="ma-label" for="ma-name">Nome</label>
                                <input
                                    id="ma-name"
                                    v-model="name"
                                    type="text"
                                    class="ma-input ma-input--lg"
                                    :placeholder="isBeverageMode ? 'Es. Negroni' : 'Es. Margherita'"
                                    required
                                />
                            </div>
                            <div class="ma-field" style="flex: 1;">
                                <label class="ma-label" for="ma-price">Prezzo</label>
                                <div class="ma-input-suffix-wrap">
                                    <input
                                        id="ma-price"
                                        v-model="price"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        class="ma-input ma-input--lg"
                                        placeholder="0.00"
                                        required
                                    />
                                    <span class="ma-input-suffix">€</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 2 · Categoria -->
                <section class="ma-section">
                    <aside class="ma-section-head">
                        <div class="ma-section-num-row">
                            <span class="ma-section-num">2</span>
                            <h2 class="ma-section-title">Categoria</h2>
                        </div>
                        <p class="ma-section-sub">Determina dove appare l'elemento e a quale reparto va l'ordine.</p>
                    </aside>
                    <div class="ma-section-body">
                        <div v-if="!useCustomCategory">
                            <div class="ma-chip-row">
                                <button
                                    v-for="cat in PREDEFINED_CATEGORIES"
                                    :key="cat"
                                    type="button"
                                    class="ma-chip"
                                    :class="{ 'ma-chip--active': category === cat }"
                                    @click="onSelectCategory(cat)"
                                >{{ cat }}</button>
                            </div>
                            <button
                                type="button"
                                class="ma-link-btn"
                                @click="useCustomCategory = true"
                            >+ Scrivi categoria personalizzata</button>
                        </div>
                        <div v-else>
                            <input
                                v-model="customCategory"
                                type="text"
                                class="ma-input"
                                placeholder="Es. Antipasti di mare, Specialità della casa…"
                                :required="useCustomCategory"
                            />
                            <button
                                type="button"
                                class="ma-link-btn"
                                @click="useCustomCategory = false"
                            >← Torna alla lista predefinita</button>
                        </div>
                    </div>
                </section>

                <!-- 3 · Immagine -->
                <section class="ma-section">
                    <aside class="ma-section-head">
                        <div class="ma-section-num-row">
                            <span class="ma-section-num">3</span>
                            <h2 class="ma-section-title">Immagine</h2>
                        </div>
                        <p class="ma-section-sub">Drag &amp; drop o clicca. Quadrata 1:1 consigliata.</p>
                    </aside>
                    <div class="ma-section-body">
                        <label
                            class="ma-dropzone"
                            tabindex="0"
                            @keydown.enter="triggerFile"
                        >
                            <input ref="fileInputRef" type="file" accept="image/*" class="ma-file-hidden" @change="handleFile" />
                            <div v-if="!imagePreview" class="ma-dropzone-empty">
                                <div class="ma-dropzone-icon" aria-hidden="true">⬆</div>
                                <div class="ma-dropzone-title">Trascina la foto qui</div>
                                <div class="ma-dropzone-meta">
                                    oppure <span class="ma-link-inline">seleziona dal computer</span> · JPG, PNG · max 5MB
                                </div>
                            </div>
                            <div v-else class="ma-dropzone-preview">
                                <img :src="imagePreview" alt="Anteprima" class="ma-dropzone-img" />
                                <span class="ma-link-inline">Clicca per cambiare</span>
                            </div>
                        </label>
                    </div>
                </section>

                <!-- 4 · Conteggio al bar (toggle is_beverage con copy esplicita) -->
                <section class="ma-section">
                    <aside class="ma-section-head">
                        <div class="ma-section-num-row">
                            <span class="ma-section-num">4</span>
                            <h2 class="ma-section-title">Conteggio al bar</h2>
                        </div>
                        <p class="ma-section-sub">Decide se l'elemento entra nei calcoli del turno bar.</p>
                    </aside>
                    <div class="ma-section-body">
                        <label class="ma-toggle-card" :class="{ 'ma-toggle-card--on': isBeverage }">
                            <input v-model="isBeverage" type="checkbox" class="ma-toggle-input" />
                            <span class="ma-toggle-track" :class="{ 'ma-toggle-track--on': isBeverage }" aria-hidden="true">
                                <span class="ma-toggle-thumb"></span>
                            </span>
                            <div class="ma-toggle-text">
                                <div class="ma-toggle-title">Questa è una bevanda</div>
                                <p v-if="isBeverage" class="ma-toggle-copy">
                                    <strong>Attivo.</strong> L'elemento apparirà nella tab <strong>Bevande</strong>,
                                    sarà ordinabile dal <strong>turno bar</strong> e ogni vendita verrà scalata
                                    dalla giacenza. Se è una <em>bottiglia</em> (acqua, vino, lattine) il sistema
                                    conta una vendita per ogni "porzione" servita. Per cocktail e vini al calice,
                                    attiva la <strong>ricetta avanzata</strong> sotto.
                                </p>
                                <p v-else class="ma-toggle-copy">
                                    <strong>Spento.</strong> L'elemento è trattato come piatto: va al reparto
                                    cucina (in base alla categoria), <strong>non</strong> entra nei conteggi del
                                    turno bar e <strong>non</strong> appare nella tab Bevande.
                                </p>

                                <div v-if="isBeverage" class="ma-recipe-cta">
                                    <span class="ma-recipe-cta-icon" aria-hidden="true">✱</span>
                                    <div class="ma-recipe-cta-text">
                                        <div class="ma-recipe-cta-title">Vuoi una ricetta avanzata?</div>
                                        <div class="ma-recipe-cta-sub">
                                            Per cocktail, vini al calice, drink miscelati. Calcolo automatico
                                            delle bottiglie consumate per turno.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        class="ma-btn ma-btn--ghost ma-btn--sm"
                                        :disabled="isSubmitting"
                                        @click.prevent="onConfigureRecipe"
                                    >
                                        <span v-if="submittingForRecipe" class="ma-spinner"></span>
                                        <template v-else>Configura ricetta →</template>
                                    </button>
                                </div>
                            </div>
                        </label>
                    </div>
                </section>

                <!-- 5 · Ingredienti -->
                <section class="ma-section">
                    <aside class="ma-section-head">
                        <div class="ma-section-num-row">
                            <span class="ma-section-num">5</span>
                            <h2 class="ma-section-title">Ingredienti</h2>
                        </div>
                        <p class="ma-section-sub">Typeahead dal magazzino. Aggiungi al volo o seleziona esistente.</p>
                    </aside>
                    <div class="ma-section-body">
                        <div v-for="(_ingredient, index) in ingredients" :key="index" class="ma-list-row">
                            <span class="ma-list-bullet" aria-hidden="true"></span>
                            <div class="ma-typeahead">
                                <input
                                    v-model="ingredients[index]"
                                    class="ma-input ma-input--inline"
                                    placeholder="Cerca o digita un nuovo ingrediente…"
                                    autocomplete="off"
                                    required
                                    @focus="onIngredientFocus(index)"
                                    @blur="onIngredientBlur(index)"
                                />
                                <div
                                    v-if="focusedRowIdx === index && (ingredientSuggestions(index).length > 0 || isNewIngredient(index))"
                                    class="ma-typeahead-pop"
                                    role="listbox"
                                >
                                    <button
                                        v-for="sugg in ingredientSuggestions(index)"
                                        :key="sugg.key || sugg.name"
                                        type="button"
                                        class="ma-typeahead-item"
                                        @mousedown.prevent="pickIngredient(index, sugg.name)"
                                    >
                                        <i class="bi bi-check2 ma-typeahead-icon"></i>
                                        <span class="ma-typeahead-label">{{ sugg.name }}</span>
                                        <span v-if="sugg.count" class="ma-typeahead-meta">
                                            in {{ sugg.count }} {{ sugg.count === 1 ? 'piatto' : 'piatti' }}
                                        </span>
                                    </button>
                                    <button
                                        v-if="isNewIngredient(index)"
                                        type="button"
                                        class="ma-typeahead-item ma-typeahead-item--new"
                                        @mousedown.prevent="pickIngredient(index, ingredients[index].trim())"
                                    >
                                        <i class="bi bi-plus-lg ma-typeahead-icon"></i>
                                        <span>Aggiungi nuovo: <strong>{{ ingredients[index].trim() }}</strong></span>
                                    </button>
                                </div>
                            </div>
                            <button type="button" class="ma-icon-btn" @click="removeIngredient(index)" aria-label="Rimuovi ingrediente">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                        <button type="button" class="ma-link-btn" @click="addIngredient">
                            + Aggiungi ingrediente
                        </button>
                    </div>
                </section>

                <!-- 6 · Allergeni -->
                <section class="ma-section">
                    <aside class="ma-section-head">
                        <div class="ma-section-num-row">
                            <span class="ma-section-num">6</span>
                            <h2 class="ma-section-title">Allergeni</h2>
                        </div>
                        <p class="ma-section-sub">Etichette pubbliche · vengono mostrate al cliente sul menu.</p>
                    </aside>
                    <div class="ma-section-body">
                        <div v-if="allergens.length === 0" class="ma-empty">Nessun allergene specificato.</div>
                        <div v-for="(_allergen, index) in allergens" :key="index" class="ma-list-row">
                            <span class="ma-list-warn" aria-hidden="true">⚠</span>
                            <input
                                v-model="allergens[index]"
                                class="ma-input ma-input--inline"
                                placeholder="Allergene…"
                                required
                            />
                            <button type="button" class="ma-icon-btn" @click="removeAllergen(index)" aria-label="Rimuovi allergene">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                        <button type="button" class="ma-link-btn" @click="addAllergen">
                            + Aggiungi allergene
                        </button>
                    </div>
                </section>
            </div>

            <!-- ── Preview live ── -->
            <aside class="ma-preview-col" aria-label="Anteprima">
                <div class="ma-preview-overline">Come apparirà al cliente</div>
                <div class="ma-preview-card">
                    <div
                        class="ma-preview-img"
                        :class="{ 'ma-preview-img--bev': isBeverage }"
                    >
                        <img v-if="imagePreview" :src="imagePreview" alt="" class="ma-preview-img-real" />
                        <span v-else class="ma-preview-img-emoji" aria-hidden="true">{{ previewIcon }}</span>
                    </div>
                    <div class="ma-preview-card-row">
                        <h3 class="ma-preview-card-name">{{ previewName }}</h3>
                        <span class="ma-preview-card-price">{{ previewPrice }}</span>
                    </div>
                    <span class="ma-preview-card-cat">{{ previewCategory }}</span>
                    <div v-if="previewIngredients" class="ma-preview-card-ings">{{ previewIngredients }}</div>
                    <div v-if="previewAllergens" class="ma-preview-card-allergens">⚠ {{ previewAllergens }}</div>
                </div>

                <div class="ma-preview-behavior">
                    <div class="ma-preview-overline">Comportamento operativo</div>
                    <div class="ma-preview-rows">
                        <div class="ma-preview-row">
                            <span class="ma-preview-row-k">Tab visibile in</span>
                            <strong class="ma-preview-row-v">{{ behaviorPreview.tabVisibleIn }}</strong>
                        </div>
                        <div class="ma-preview-row">
                            <span class="ma-preview-row-k">Reparto destinazione</span>
                            <strong class="ma-preview-row-v">{{ behaviorPreview.department }}</strong>
                        </div>
                        <div class="ma-preview-row">
                            <span class="ma-preview-row-k">Conteggio turno bar</span>
                            <strong class="ma-preview-row-v" :class="{ 'ma-preview-row-v--accent': isBeverage }">
                                {{ behaviorPreview.barShiftCount }}
                            </strong>
                        </div>
                        <div class="ma-preview-row">
                            <span class="ma-preview-row-k">Magazzino</span>
                            <strong class="ma-preview-row-v">{{ behaviorPreview.inventory }}</strong>
                        </div>
                    </div>
                </div>

                <div class="ma-preview-payload">
                    <div class="ma-preview-payload-head">Payload POST /api/elements</div>
                    <pre class="ma-preview-payload-pre">{{ payloadJson }}</pre>
                </div>
            </aside>
        </form>

        <!-- Sticky bottom action bar -->
        <div class="ma-actions-bar">
            <div class="ma-actions-left">
                <span class="ma-actions-tag">POST /api/elements</span>
                <span class="ma-actions-meta">7 campi · stesso schema dish/beverage</span>
            </div>
            <div class="ma-actions-right">
                <button type="button" class="ma-btn ma-btn--ghost" @click="emit('ViewList')">
                    Annulla
                </button>
                <button
                    type="button"
                    class="ma-btn ma-btn--primary"
                    :disabled="isSubmitting"
                    @click="onPrimarySubmit"
                >
                    <span v-if="isSubmitting && !submittingForRecipe" class="ma-spinner"></span>
                    <template v-else>
                        <span>{{ isBeverageMode ? 'Aggiungi al bar' : 'Aggiungi al menu' }}</span>
                        <kbd class="ma-actions-kbd">⏎</kbd>
                    </template>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* ─────────────── Shell ─────────────── */
.ma-shell {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 64px);
    background: var(--bg);
    color: var(--ink);
    font-family: var(--f-sans);
    position: relative;
}

/* ─────────────── Header ─────────────── */
.ma-head {
    padding: 18px 28px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
}
.ma-crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-3);
    margin-bottom: 10px;
}
.ma-crumb { color: var(--ink-3); }
.ma-crumb--current { color: var(--ink); font-weight: 600; }
.ma-crumb-sep { color: var(--ink-3); opacity: 0.6; }

.ma-title-row {
    display: flex;
    align-items: center;
    gap: 14px;
}
.ma-back-btn {
    width: 36px; height: 36px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink-2);
    cursor: pointer;
    display: grid; place-items: center;
    transition: background var(--dur-fast), color var(--dur-fast);
    flex-shrink: 0;
}
.ma-back-btn:hover { background: var(--bg-hover); color: var(--ink); }
.ma-back-btn i { font-size: 16px; }
.ma-title-block { min-width: 0; }
.ma-title {
    margin: 0;
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--ink);
}
.ma-subtitle {
    margin: 4px 0 0;
    font-size: 13.5px;
    color: var(--ink-3);
}

/* ─────────────── Banners ─────────────── */
.ma-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 28px;
    font-size: 13.5px;
    border-bottom: 1px solid var(--line);
}
.ma-banner i { font-size: 16px; }
.ma-banner--error {
    background: color-mix(in oklab, var(--danger) 8%, var(--paper));
    color: var(--danger);
}
.ma-banner--success {
    background: color-mix(in oklab, var(--ok) 10%, var(--paper));
    color: var(--ok-ink);
}

/* ─────────────── Grid ─────────────── */
.ma-grid {
    display: grid;
    grid-template-columns: 1fr 360px;
    flex: 1;
    min-width: 0;
    padding-bottom: 80px; /* spazio per la sticky bar */
}

.ma-form-col { min-width: 0; }

/* ─────────────── Sezioni ─────────────── */
.ma-section {
    display: flex;
    gap: 24px;
    padding: 22px 28px;
    border-bottom: 1px solid var(--line);
}
.ma-section-head {
    width: 220px;
    flex-shrink: 0;
    padding-top: 4px;
}
.ma-section-num-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}
.ma-section-num {
    width: 22px; height: 22px;
    border-radius: 6px;
    background: var(--ink);
    color: var(--bg);
    display: grid; place-items: center;
    font-family: var(--f-mono);
    font-weight: 700;
    font-size: 11px;
    flex-shrink: 0;
}
.ma-section-title {
    margin: 0;
    font-size: 14.5px;
    font-weight: 650;
    color: var(--ink);
}
.ma-section-sub {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
    line-height: 1.45;
}
.ma-section-body { flex: 1; min-width: 0; }

/* ─────────────── Field primitives ─────────────── */
.ma-row-2 { display: flex; gap: 14px; }
.ma-field { display: flex; flex-direction: column; }
.ma-label {
    display: block;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-2);
    margin-bottom: 6px;
}
.ma-input {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    color: var(--ink);
    font-family: inherit;
    font-size: 14px;
    outline: none;
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.ma-input:focus {
    border-color: var(--ac);
    box-shadow: 0 0 0 3px var(--ac-soft);
}
.ma-input--lg { height: 48px; font-size: 16px; }
.ma-input--inline {
    height: 36px;
    font-size: 13.5px;
    background: transparent;
    border-color: transparent;
}
.ma-input--inline:focus { background: var(--bg); border-color: var(--ac); }
.ma-input-suffix-wrap { position: relative; }
.ma-input-suffix-wrap .ma-input { padding-right: 36px; }
.ma-input-suffix {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    font-size: 14px;
    pointer-events: none;
}

/* ─────────────── Chip categoria ─────────────── */
.ma-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
}
.ma-chip {
    height: 36px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--ink-2);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.ma-chip:hover { background: var(--bg-hover); border-color: var(--line); }
.ma-chip--active {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
}
.ma-chip--active:hover { background: var(--ink); }

.ma-link-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--ac);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    margin-top: 4px;
}
.ma-link-btn:hover { color: var(--ac-ink); }
.ma-link-inline { color: var(--ac); font-weight: 500; }

/* ─────────────── Dropzone ─────────────── */
.ma-dropzone {
    display: block;
    border: 2px dashed var(--line);
    border-radius: 12px;
    padding: 28px 20px;
    text-align: center;
    background: var(--bg-sunk);
    cursor: pointer;
    transition: border-color var(--dur-fast), background var(--dur-fast);
}
.ma-dropzone:hover, .ma-dropzone:focus-within {
    border-color: var(--ac);
    background: var(--bg-elev);
}
.ma-file-hidden { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
.ma-dropzone-icon { font-size: 28px; margin-bottom: 8px; color: var(--ink-2); }
.ma-dropzone-title { font-size: 14px; color: var(--ink); font-weight: 500; margin-bottom: 4px; }
.ma-dropzone-meta { font-size: 12px; color: var(--ink-3); }
.ma-dropzone-preview { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ma-dropzone-img { max-height: 140px; max-width: 100%; border-radius: 8px; border: 1px solid var(--line); }

/* ─────────────── Toggle is_beverage ─────────────── */
.ma-toggle-card {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
    cursor: pointer;
    transition: border-color var(--dur-fast), background var(--dur-fast);
}
.ma-toggle-card--on {
    border-color: var(--ac);
    background: var(--ac-soft);
}
.ma-toggle-input { position: absolute; opacity: 0; pointer-events: none; }
.ma-toggle-track {
    position: relative;
    width: 42px; height: 24px;
    border-radius: 999px;
    background: var(--line);
    flex-shrink: 0;
    margin-top: 2px;
    transition: background var(--dur-fast);
}
.ma-toggle-track--on { background: var(--ac); }
.ma-toggle-thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 20px; height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
    transition: transform var(--dur-fast);
}
.ma-toggle-track--on .ma-toggle-thumb { transform: translateX(18px); }
.ma-toggle-text { flex: 1; min-width: 0; }
.ma-toggle-title {
    font-size: 14.5px;
    font-weight: 650;
    color: var(--ink);
    margin-bottom: 4px;
}
.ma-toggle-copy {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-2);
    line-height: 1.55;
}
.ma-toggle-copy strong { color: var(--ink); font-weight: 600; }
.ma-toggle-copy em { font-style: italic; color: var(--ink-2); }

.ma-recipe-cta {
    margin-top: 10px;
    padding: 8px 12px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
}
.ma-recipe-cta-icon {
    width: 28px; height: 28px;
    border-radius: 7px;
    background: var(--bg-sunk);
    color: var(--ac);
    display: grid; place-items: center;
    font-size: 14px;
    flex-shrink: 0;
}
.ma-recipe-cta-text { flex: 1; min-width: 0; }
.ma-recipe-cta-title { font-weight: 600; color: var(--ink); }
.ma-recipe-cta-sub { color: var(--ink-3); font-size: 12px; }

/* ─────────────── List rows (ingredienti, allergeni) ─────────────── */
.ma-list-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 12px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-bottom: 6px;
}
.ma-list-bullet {
    width: 6px; height: 6px;
    border-radius: 999px;
    background: var(--line);
    flex-shrink: 0;
}
.ma-list-warn { color: var(--danger); font-size: 13px; flex-shrink: 0; }
.ma-icon-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--ink-3);
    width: 28px; height: 28px;
    border-radius: 6px;
    cursor: pointer;
    display: grid; place-items: center;
    transition: background var(--dur-fast), color var(--dur-fast);
}
.ma-icon-btn:hover { background: var(--bg-hover); color: var(--ink); }
.ma-icon-btn i { font-size: 16px; }
.ma-empty {
    font-size: 13px;
    color: var(--ink-3);
    padding: 8px 0;
}

/* ─────────────── Typeahead (ingredienti) ─────────────── */
.ma-typeahead { flex: 1; position: relative; min-width: 0; }
.ma-typeahead-pop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0; right: 0;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    z-index: 30;
    max-height: 240px;
    overflow-y: auto;
}
.ma-typeahead-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: 13.5px;
    color: var(--ink);
}
.ma-typeahead-item:hover { background: var(--bg-hover); }
.ma-typeahead-icon { color: var(--ink-3); flex-shrink: 0; }
.ma-typeahead-label { flex: 1; }
.ma-typeahead-meta {
    font-size: 11px;
    color: var(--ink-3);
    font-family: var(--f-mono);
}
.ma-typeahead-item--new {
    border-top: 1px solid var(--line);
    background: var(--bg-sunk);
    color: var(--ac);
    font-weight: 500;
}
.ma-typeahead-item--new .ma-typeahead-icon { color: var(--ac); }

/* ─────────────── Preview column ─────────────── */
.ma-preview-col {
    background: var(--bg-sunk);
    border-left: 1px solid var(--line);
    padding: 24px;
    align-self: stretch;
}
.ma-preview-overline {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    margin-bottom: 12px;
}
.ma-preview-card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 14px;
    box-shadow: var(--shadow-sm, var(--shadow-xs));
}
.ma-preview-img {
    width: 100%; height: 130px;
    border-radius: 10px;
    margin-bottom: 12px;
    background: linear-gradient(135deg, oklch(0.96 0.04 60), var(--bg-sunk));
    display: grid; place-items: center;
    font-size: 50px;
    overflow: hidden;
    position: relative;
}
.ma-preview-img--bev {
    background: linear-gradient(135deg, oklch(0.96 0.04 248), var(--bg-sunk));
}
.ma-preview-img-real { width: 100%; height: 100%; object-fit: cover; }
.ma-preview-img-emoji { line-height: 1; }
.ma-preview-card-row {
    display: flex; align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
}
.ma-preview-card-name {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    color: var(--ink);
}
.ma-preview-card-price {
    font-size: 14px;
    font-weight: 700;
    color: var(--ac-ink, var(--ac));
    font-family: var(--f-mono);
}
.ma-preview-card-cat {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--bg-sunk);
    color: var(--ink-2);
    font-size: 11px;
    font-weight: 500;
    margin-bottom: 8px;
}
.ma-preview-card-ings {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.45;
    margin-bottom: 8px;
}
.ma-preview-card-allergens {
    font-size: 11px;
    color: var(--danger);
    font-weight: 500;
}

.ma-preview-behavior {
    margin-top: 16px;
    padding: 14px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
}
.ma-preview-rows { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; }
.ma-preview-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}
.ma-preview-row-k { color: var(--ink-3); }
.ma-preview-row-v { color: var(--ink); font-weight: 600; }
.ma-preview-row-v--accent { color: var(--ac-ink, var(--ac)); }

.ma-preview-payload {
    margin-top: 16px;
    padding: 12px;
    background: var(--ink);
    color: var(--bg);
    border-radius: 10px;
    font-family: var(--f-mono);
    font-size: 11px;
}
.ma-preview-payload-head { opacity: 0.6; margin-bottom: 4px; }
.ma-preview-payload-pre {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--bg);
    font-family: var(--f-mono);
    white-space: pre-wrap;
    word-break: break-word;
}

/* ─────────────── Sticky bottom action bar ─────────────── */
.ma-actions-bar {
    position: sticky;
    bottom: 0;
    left: 0; right: 0;
    height: 64px;
    border-top: 1px solid var(--line);
    background: var(--paper);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 28px;
    z-index: 20;
}
.ma-actions-left {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: var(--ink-3);
}
.ma-actions-tag {
    font-family: var(--f-mono);
    padding: 2px 6px;
    background: var(--bg-sunk);
    border-radius: 4px;
    color: var(--ink-2);
}
.ma-actions-meta { color: var(--ink-3); }
.ma-actions-right {
    margin-left: auto;
    display: flex; align-items: center; gap: 10px;
}

/* ─────────────── Buttons ─────────────── */
.ma-btn {
    appearance: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 16px;
    height: 40px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    background: var(--paper);
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.ma-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ma-btn--ghost {
    background: var(--paper);
    color: var(--ink-2);
}
.ma-btn--ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.ma-btn--primary {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
}
.ma-btn--primary:hover:not(:disabled) {
    background: var(--ac);
    border-color: var(--ac);
    color: var(--bg);
}
.ma-btn--sm { height: 32px; padding: 0 12px; font-size: 12.5px; }
.ma-actions-kbd {
    font-family: var(--f-mono);
    font-size: 10.5px;
    padding: 2px 6px;
    border-radius: 4px;
    background: color-mix(in oklab, var(--bg) 30%, transparent);
    border: 1px solid color-mix(in oklab, var(--bg) 50%, transparent);
    opacity: 0.8;
}

.ma-spinner {
    width: 14px; height: 14px;
    border: 2px solid color-mix(in oklab, var(--ink-3) 40%, transparent);
    border-top-color: var(--ac);
    border-radius: 50%;
    display: inline-block;
    animation: ma-spin 700ms linear infinite;
}
@keyframes ma-spin { to { transform: rotate(360deg); } }

/* ─────────────── Transizioni ─────────────── */
.ma-fade-enter-active, .ma-fade-leave-active {
    transition: opacity 180ms, transform 180ms;
}
.ma-fade-enter-from, .ma-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* ─────────────── Responsive ─────────────── */
@media (max-width: 1100px) {
    .ma-grid { grid-template-columns: 1fr 320px; }
}
@media (max-width: 980px) {
    .ma-grid { grid-template-columns: 1fr; }
    .ma-preview-col {
        border-left: none;
        border-top: 1px solid var(--line);
    }
    .ma-section { flex-direction: column; gap: 12px; }
    .ma-section-head { width: 100%; padding-top: 0; }
}
@media (max-width: 640px) {
    .ma-head { padding: 14px 16px; }
    .ma-section { padding: 18px 16px; }
    .ma-row-2 { flex-direction: column; gap: 12px; }
    .ma-actions-bar { padding: 0 16px; }
    .ma-actions-left { display: none; }
    .ma-preview-col { padding: 16px; }
}
</style>
