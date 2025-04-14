<script setup> //Pagina in cui l'utente aggiunge gli elementi al menu
    import { useStore } from 'vuex';
    import { ref, onMounted, nextTick } from 'vue';
    import qs from 'qs';

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const tkn = store.getters.getToken;
    
    const emit = defineEmits(['ViewList']);

    //variabili per il supporto delle richieste fetch
    const elementID = ref();
    const imagePreview = ref(null);
    const uploadedImageId = ref(null);

    //variabili utilizzate nel form da inviare per la richiesta API per creare nuovi record
    const name = ref('');
    const ingredients = ref([]);
    const allergens = ref([]);
    const image = ref(null);
    const price = ref(null);
    const category = ref('');

    //caricamento delle immagini su strapi
    const uploadImage = async () => {
        if(!image.value) return

        const formData = new FormData();
        formData.append('files', image.value);
        try {
            const response = await fetch('http://localhost:1337/api/upload', {
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
            console.log(uploadedImageId.value);
        } catch (error) {
            console.log(error);
        }
    };

    //Creazione di un nuovo record di elemento tramite API strapi 
    const CreateElement = async () => {
        try{
            const response = await fetch('http://localhost:1337/api/elements',{
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                },
                body: JSON.stringify({
                    data: {
                        name: name.value,
                        ingredients: ingredients.value,
                        allergens: allergens.value,
                        image: uploadedImageId.value,
                        price: price.value,
                        category: category.value,
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

    //funzione quando si fa il submit del form che gestisce le altre funzioni e la richiesta finale
    const submit = async () => {
        try {
            const fetchuser = await fetch('http://localhost:1337/api/users/me',{
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
                    
                await uploadImage(); //funzione che carica l'immagine
                await CreateElement(); //funzione che crea l'elemento (chiamate fetch, quindi await)

                //fetch per estrapolare il contenuto di menu con un certo riferimento al sito dell'utente loggato (tramite props da padre)
                const response =  await fetch(`http://localhost:1337/api/menus?${query}`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                    },
                });

                if (response.ok){
                    const data = await response.json();

                    //se non esiste ancora nel database, quindi vuota
                    if(data.data.length <= 0){ 
                        const r = await fetch(`http://localhost:1337/api/menus`,{
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                            },
                            body: JSON.stringify({
                                data: {
                                    fk_user: { //connect per le foreign key
                                        connect: [
                                            { id: d.id},
                                        ]
                                    },
                                    fk_elements:{ //connect per le foreign key
                                        connect: [
                                            { documentId: elementID.value },
                                        ]
                                    }
                                }
                            })
                        });
                    }

                    // se invece esiste aggiornamento della lista degli elementi
                    else {    
                        const menuId = data.data[0].documentId;
                        let newList = [];
                        
                        //fetch per estrapolare la lista tramite il documentId della collection menu
                        const getUpdate = await fetch(`http://localhost:1337/api/menus?${menuId}&populate=*`,{ 
                            method: "GET",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                            },
                        });
                        if (!getUpdate.ok) {
                            throw new Error('Errore nella richiesta');
                        }
                        
                        const dataUpdate = await getUpdate.json();
                        newList = [...newList, ...dataUpdate.data[0].fk_elements.map(el => el.documentId)];
                        newList.push(elementID.value);

                        //fetch per l'aggiornamento del record con documentId -> menuId
                        const update = await fetch(`http://localhost:1337/api/menus/${menuId}`,{
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                            },
                            body: JSON.stringify({
                                data: {
                                    fk_elements:{
                                        connect: [
                                            newList.map(i => ({ documentId: i})),
                                        ]
                                    }
                                },         
                            })
                        });
                    }
                }
            }
        } catch (error) {
            console.log(error);
        }
        resetForm(); //funzione che svuota le variabile e, quindi, il form
    };

    // funzioni per aumentare e dimunire le dimensioni della lista e del forme inerente agli ingredienti
    const addIngredient = () => ingredients.value.push('');
    const removeIngredient = (index) => ingredients.value.splice(index, 1);

    // funzioni per aumentare e dimunire le dimensioni della lista e del forme inerente agli ingredienti
    const addAllergen = () => allergens.value.push('');
    const removeAllergen = (index) => allergens.value.splice(index, 1);

    //funzione per resettare il form
    const resetForm = () => {
        imagePreview.value = null;
        uploadedImageId.value = null;

        //variabili utilizzate nel form da inviare per la richiesta API per creare nuovi record
        name.value = '';
        ingredients.value = [];
        allergens.value = [];
        image.value = null;
        price.value = null;
        category.value = '';
    }

    //funzione per gestire il file e la preview dell'immagine
    const handleFile = (event) => {
        const file = event.target.files[0];
        if ( file ){
            image.value = file;
            // Mostra un'anteprima dell'immagine
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
            document.title = 'Crea il tuo menù';
        });
    });
</script>



<template>
    <button @click="emit('ViewList')" class="btn btn-warning align-right m-5">Torna alla lista</button>
        <form @submit.prevent="submit" class="my-5 mx-5">
            <div class="row">
                <!-- v-model collegato alla variabile relativa al nome -->
                <div class="form-group col-md-7">
                    <label for="inputName">Nome</label>
                    <input type="text" v-model="name" class="form-control" id="inputName" placeholder="Inserisci il nome" required>
                </div>

                <!-- v-model collegato alla variabile relativa al prezzo -->
                <div class="form-group col-md-4">
                    <label for="inputPrice">Prezzo</label>
                    <input type="number" v-model="price" class="form-control" id="inputPrice" step="0.01" placeholder="Inserisci il prezzo" required>
                </div>

            </div>

            <!-- v-model collegato alla variabile relativa agli ingredienti -->
            <div class="form-group col-md-11">
                <label>Ingredienti</label>
                <div v-for="(ingredient, index) in ingredients" :key="index" class="input-group mb-2">
                    <input v-model="ingredients[index]" class="form-control" placeholder="Ingrediente..." required />
                    <button type="button" class="btn btn-danger" @click="removeIngredient(index)">🗑️</button>
                </div>
                <button type="button" class="btn btn-success" @click="addIngredient">+ Aggiungi Ingrediente</button>
            </div>

            <!-- v-model collegato alla variabile relativa agli allergeni -->
            <div class="form-group col-md-11 mt-3">
                <label>Allergeni</label>
                <div v-for="(allergen, index) in allergens" :key="index" class="input-group mb-2">
                    <input v-model="allergens[index]" class="form-control" placeholder="Allergene..." required />
                    <button type="button" class="btn btn-danger" @click="removeAllergen(index)">🗑️</button>
                </div>
                <button type="button" class="btn btn-success" @click="addAllergen">+ Aggiungi Allergene</button>
            </div>

            <!-- v-model collegato alla variabile relativa alla categoria del prodotto -->
            <div class="form-group col-md-11">
                <label for="inputCategory">Categoria</label>
                <select id="inputCategory" v-model="category" class="form-control" required>
                    <option>Bevande</option>
                    <option>Dessert</option>
                    <option>Pizze classice</option>
                    <option>Pizze bianche</option>
                    <option>Pizze rosse</option>
                    <option>Primi</option>
                    <option>Secondi</option>
                    <option>Primi di pesce</option>
                    <option>Secondi di pesce</option>
                    <option>Contorni</option>
                </select>
            </div>
            
            <!-- collegato alla variabile relativa all'immagine con funzione per gestirla-->
            <div class="form-group col-md-2">
                <label for="inputImage">Immagine</label>
                <input type="file" accept="image/*" @change="handleFile" required/>
                <!-- Anteprima dell'immagine -->
                <div v-if="imagePreview">
                    <img :src="imagePreview" alt="Anteprima Immagine" />
                </div>
            </div>

            <!--  submit  -->
            <button type="submit" class="btn btn-primary mt-5">Registra elemento</button>
        </form>
</template>