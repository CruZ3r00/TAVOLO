<script setup>
    import { useStore } from 'vuex';
    import { ref, onMounted, nextTick } from 'vue';
    import qs from 'qs';
    import { API_BASE } from '@/utils';
    import MenuImporter from '@/components/MenuImporter.vue';

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const tkn = store.getters.getToken;

    const emit = defineEmits(['ViewList']);

    //variabili per il supporto delle richieste fetch
    const elementID = ref();
    const imagePreview = ref(null);
    const uploadedImageId = ref(null);
    const isSubmitting = ref(false);
    const submitSuccess = ref(false);

    //variabili utilizzate nel form da inviare per la richiesta API per creare nuovi record
    const name = ref('');
    const ingredients = ref([]);
    const allergens = ref([]);
    const image = ref(null);
    const price = ref(null);
    const category = ref('');
    const customCategory = ref('');
    const useCustomCategory = ref(false);

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

            if(response.ok){
                const result = await response.json();
                uploadedImageId.value = result[0].id;
            }
        } catch (error) {
            console.error(error);
        }
    };

    //Creazione di un nuovo record di elemento tramite API strapi
    const CreateElement = async () => {
        try{
            const finalCategory = useCustomCategory.value ? customCategory.value : category.value;
            const response = await fetch(`${API_BASE}/api/elements`,{
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`,
                },
                body: JSON.stringify({
                    data: {
                        name: name.value,
                        ingredients: ingredients.value,
                        allergens: allergens.value,
                        image: uploadedImageId.value,
                        price: price.value,
                        category: finalCategory,
                    }
                })
            });

            if (response.ok){
                const data = await response.json();
                elementID.value = data.data.documentId;
            }

        }catch( error ){
            console.log(error);
        }
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
            const fetchuser = await fetch(`${API_BASE}/api/users/me`,{
                method: "GET",
                headers: {
                    "Authorization" : `Bearer ${tkn}`,
                    "Content-Type" : "application/json",
                },
            });
            if(fetchuser.ok){
                const d = await fetchuser.json();
                //creazione query standard di strapi v5
                const query = qs.stringify({
                    filters: {
                        fk_user:{
                            id: {
                                $eq: d.id
                            },
                        }
                    },
                    populate: "*",
                });

                await uploadImage();
                await CreateElement();

                const response =  await fetch(`${API_BASE}/api/menus?${query}`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${tkn}`,
                    },
                });

                if (response.ok){
                    const data = await response.json();

                    if(data.data.length <= 0){
                        const r = await fetch(`${API_BASE}/api/menus`,{
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${tkn}`,
                            },
                            body: JSON.stringify({
                                data: {
                                    fk_user: {
                                        connect: [
                                            { id: d.id},
                                        ]
                                    },
                                    fk_elements:{
                                        connect: [
                                            { documentId: elementID.value },
                                        ]
                                    }
                                }
                            })
                        });
                    }
                    else {
                        const menuId = data.data[0].documentId;
                        let newList = [];

                        const getUpdate = await fetch(`${API_BASE}/api/menus/${menuId}?populate=*`,{
                            method: "GET",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${tkn}`,
                            },
                        });
                        if (!getUpdate.ok) {
                            throw new Error('Errore nella richiesta');
                        }

                        const dataUpdate = await getUpdate.json();
                        newList = [...newList, ...dataUpdate.data.fk_elements.map(el => el.documentId)];
                        newList.push(elementID.value);

                        const update = await fetch(`${API_BASE}/api/menus/${menuId}`,{
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${tkn}`,
                            },
                            body: JSON.stringify({
                                data: {
                                    fk_elements:{
                                        connect: newList.map(i => ({ documentId: i})),
                                    }
                                },
                            })
                        });
                    }
                }
            }
            submitSuccess.value = true;
            setTimeout(() => { submitSuccess.value = false; }, 2000);
        } catch (error) {
            console.error(error);
        } finally {
            isSubmitting.value = false;
        }
        resetForm();
    };

    // funzioni per aumentare e dimunire le dimensioni della lista degli ingredienti
    const addIngredient = () => ingredients.value.push('');
    const removeIngredient = (index) => ingredients.value.splice(index, 1);

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

    //impostazione del titolo della scheda
    onMounted(async () => {
        nextTick(() => {
            document.title = 'Aggiungi elemento al menu';
        });
    });
</script>

<template>
    <div class="adder-page">
        <div class="adder-container">
            <!-- Header -->
            <div class="adder-header">
                <div>
                    <h2 class="adder-title">Nuovo elemento</h2>
                    <p class="adder-subtitle">Aggiungi un nuovo piatto o bevanda al tuo menu</p>
                </div>
                <div class="adder-header-actions">
                    <MenuImporter @imported="emit('ViewList')" />
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

                        <!-- Ingredients -->
                        <div class="ds-field">
                            <label class="ds-label">Ingredienti</label>
                            <div v-for="(ingredient, index) in ingredients" :key="index" class="list-input-row">
                                <input v-model="ingredients[index]" class="ds-input" placeholder="Ingrediente..." required />
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
