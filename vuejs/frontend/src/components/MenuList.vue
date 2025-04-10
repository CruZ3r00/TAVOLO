<script setup>
    import { onMounted, ref } from 'vue';
    import { useStore } from 'vuex';
    import Modal from '@/components/Modal.vue';
    import qs from 'qs';

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const tkn = store.getters.getToken;

    //segnale al padre per visualizzare adder
    const emit = defineEmits(['AddElement']);

    //contiene le info del sito collegate all'utente
    const props = defineProps({
        siteid: 'Object',
    })

    //variabili per il supporto delle richieste fetch
    const siteID = ref(props.siteid);
    const modify = ref(false);
    const menuId = ref();
    const modalShow = ref(false);
    const toModify = ref();
    const imagePreview = ref(null);
    const image = ref(null);
    const uploadedImageId = ref(null);

    //lista degli elementi 
    const list = ref([]);

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
                toModify.value.image.id = result[0].id;
            }
        } catch (error) {
            console.log(error);
        }
    };

    //recupero della lista degli elementi nel database presenti nel menu
    const fetchList = async () => {
        list.value = []
        //query di strapi v5 con qs
        const query = qs.stringify({
            filters: {
                fk_site:{
                    documentId: {
                        $eq: siteID.value.documentId
                    }, 
                }
            },
            // Popolare anche il campo 'image' della relazione fk_elements
            populate: {
                fk_elements: {
                    populate: ['image']  
                }
            },
        });

        try {
            const response =  await fetch(`http://localhost:1337/api/menus?${query}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                },
            });
            if (response.ok){
                const data = await response.json();
                list.value = [...list.value, ...data.data[0].fk_elements];
                console.log(list);
                menuId.value = data.data[0].documentId;
            }
        } catch (error) {
            console.log(error);
        }
    }

    //gestisce la visualizzazione del modale per la modifica di un elemento e lo salva in una variabile utilizzabile dal modale
    const handleModify = (e) => {
        modalShow.value = !modalShow.value;
        toModify.value = e;
        console.log(toModify);
    };

    //funzione che fa l'update dell'elemento selezionato, con le modifiche apportate nel form
    const update = async () => {
        try {
            await handleDelete(toModify.value.documentId);
            //funzione che aggiorna direttamente l'elemento nel db
            const update = await fetch(`http://localhost:1337/api/elements`,{
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                },
                body: JSON.stringify({
                    data: {
                        name: toModify.value.name,
                        ingredients: toModify.value.ingredients,
                        allergens: toModify.value.allergens,
                        image: toModify.value.image.id,
                        price: toModify.value.price,
                        category: toModify.value.category,
                    }
                })
            });
            if( update.ok ){
                const data = await update.json();
                list.value.push(data.data);
                //re-connect di tutta la lista gia salvata con fetchlist, che contiene anche l'id dell'elemento modificato
                const reconnect = await fetch(`http://localhost:1337/api/menus/${menuId.value}`,{
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                    },
                    body: JSON.stringify({
                        data: {
                            fk_elements:{
                                connect: [ list.value.map(i =>({ documentId: i.documentId})) ]
                            }
                        },         
                    })
                });
                if (reconnect.ok){
                    await fetchList();
                }
            }
            
            
        } catch (error) {
            console.log(error);
        }
    }

    //function che cancella dal database e dalla lista l'elemento cliccato
    const handleDelete = async (id) => {
        try {
            const update = await fetch(`http://localhost:1337/api/menus/${menuId.value}`,{
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
            },
            body: JSON.stringify({
                    data: {
                        //disconnect elemina la connessione con menu
                        fk_elements:{
                            disconnect: { documentId: id },
                        }
                    },         
                })
            });

            //fetch che elimina il record dal database
            if (update.ok){
                const del = await fetch(`http://localhost:1337/api/elements/${id}`,{
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${tkn}`
                    }
                });
                
                //se a buon fine elimino dalla lista
                if (del.ok){
                    list.value = list.value.filter(item => item.documentId !== id);
                }
            }
        } catch (error) {
            console.log(error);
        }
        

    }

    // funzioni per aumentare e dimunire le dimensioni della lista e del forme inerente agli ingredienti
    const addIngredient = () => toModify.value.ingredients.push('');
    const removeIngredient = (index) => toModify.value.ingredients.splice(index, 1);

    // funzioni per aumentare e dimunire le dimensioni della lista e del forme inerente agli ingredienti
    const addAllergen = () => toModify.value.allergens.push('');
    const removeAllergen = (index) => toModify.value.allergens.splice(index, 1);

    //ricavare url dell'immagine
    const getImageUrl = (obj) => {
        return `http://localhost:1337${obj.formats.thumbnail.url}`;
    }

    //funzione per gestire il file e la preview dell'immagine
    const handleFile = async (event) => {
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
        await uploadImage();
    };

    //quando il componente viene montato recupero la lista degli elementi
    onMounted(async () => {
        await fetchList();
    });
</script>

<template>
    <!-- bottoni in top -->
    <div class="row">
        <button @click="modify = ! modify" class="btn btn-primary m-5 col-md-2 "><span v-if="! modify">Modifica</span><span v-else>Annulla</span></button>
        <button @click="emit('AddElement')" class="btn btn-warning m-5 col-md-2 ms-auto">Aggiungi elemento</button>
    </div>
    
    <!-- lista degli elementi -->
    <section>
        <ol class="list-group list-group-flush">
            <li v-for="element in list" class="list-group-item d-flex justify-content-between align-items-start">
                <!--
                    la variabile element contiene i seguenti dati:
                        { 
                            "id": 82, 
                            "documentId": "ac2x9zfp380ao4xhk4hxg5s9", 
                            "name": "Margherita", 
                            "allergens": [ 
                                "Glutine", "Lattosio" 
                            ], 
                            "price": 6.5, 
                            "createdAt": "2025-04-05T12:40:44.852Z", 
                            "updatedAt": "2025-04-05T12:40:44.852Z", 
                            "publishedAt": "2025-04-05T12:40:44.856Z", 
                            "category": "Pizze classice", 
                            "ingredients": [ 
                                "Pomodoro", 
                                "Mozzarella", 
                                "Basilico" 
                                ], 
                            "image":{
                                "id": 51,
                                "documentId": "qnh2zddb5bwsuvdhsnb5ykbu",
                                "name": "immagine_2025-04-07_111125018.png",
                                "alternativeText": null,
                                "caption": null,
                                "width": 363,
                                "height": 352,
                                "formats": {
                                    "thumbnail": {
                                        "ext": ".png",
                                        "url": "/uploads/thumbnail_immagine_2025_04_07_111125018_8bf7488465.png",
                                        "hash": "thumbnail_immagine_2025_04_07_111125018_8bf7488465",
                                        "mime": "image/png",
                                        "name": "thumbnail_immagine_2025-04-07_111125018.png",
                                        "path": null,
                                        "size": 73.56,
                                        "width": 161,
                                        "height": 156,
                                        "sizeInBytes": 73557
                                    }
                                },
                                "hash": "immagine_2025_04_07_111125018_8bf7488465",
                                "ext": ".png",
                                "mime": "image/png",
                                "size": 105.72,
                                "url": "/uploads/immagine_2025_04_07_111125018_8bf7488465.png",
                                "previewUrl": null,
                                "provider": "local",
                                "provider_metadata": null,
                                "createdAt": "2025-04-07T09:11:29.647Z",
                                "updatedAt": "2025-04-07T09:11:29.647Z",
                                "publishedAt": "2025-04-07T09:11:29.648Z"
                            }
                        }  
                -->
                <div class="ms-2 me-auto">
                    <div class="fw-bold">{{ element.name}}</div>
                    <p>{{ element.ingredients }}</p>
                    <p>{{ element.allergens }}</p>
                    <img
                        v-if="element.image"
                        :src="getImageUrl(element.image)"
                        alt="Immagine"
                    />
                </div>
                <div v-if="modify">
                    <button @click="handleModify(element)" class="badge text-bg-primary rounded-pill"><i class="bi bi-pencil-fill"></i></button>
                    <button @click="handleDelete(element.documentId)" class="badge text-bg-danger rounded-pill"><i class="bi bi-trash"></i></button>
                </div>
            </li>
        </ol>
    </section>


    <!-- modale per la modifica di un elemento, utilizzare la varaibile toModify (stessa struttura di sopra, stesso form di menu adder) -->
    <section>
        <Modal :show="modalShow" @close="modalShow = !modalShow">
            <template #title>Modifica</template>
            <template #body>
                <form @submit.prevent="update" class="my-5 mx-5">
                    <div class="row">
                        <!-- v-model collegato alla variabile relativa al nome -->
                        <div class="form-group col-md-7">
                            <label for="inputName">Nome</label>
                            <input type="text" v-model="toModify.name" class="form-control" id="inputName" :placeholder="toModify.name" required>
                        </div>

                        <!-- v-model collegato alla variabile relativa al prezzo -->
                        <div class="form-group col-md-4">
                            <label for="inputPrice">Prezzo</label>
                            <input type="number" v-model="toModify.price" class="form-control" id="inputPrice" step="0.01" :placeholder="toModify.price" required>
                        </div>
                    </div>

                    <!-- v-model collegato alla variabile relativa agli ingredienti -->
                    <div class="form-group col-md-11">
                        <label>Ingredienti</label>
                        <div v-for="(ingredient, index) in toModify.ingredients" :key="index" class="input-group mb-2">
                            <input v-model="toModify.ingredients[index]" class="form-control" :placeholder="toModify.ingredients[index]" required />
                            <button type="button" class="btn btn-danger" @click="removeIngredient(index)">🗑️</button>
                        </div>
                        <button type="button" class="btn btn-success" @click="addIngredient">+ Aggiungi Ingrediente</button>
                    </div>

                    <!-- v-model collegato alla variabile relativa agli allergeni -->
                    <div class="form-group col-md-11 mt-3">
                        <label>Allergeni</label>
                        <div v-for="(allergen, index) in toModify.allergens" :key="index" class="input-group mb-2">
                            <input v-model="toModify.allergens[index]" class="form-control" :placeholder="toModify.allergens[index]" required />
                            <button type="button" class="btn btn-danger" @click="removeAllergen(index)">🗑️</button>
                        </div>
                        <button type="button" class="btn btn-success" @click="addAllergen">+ Aggiungi Allergene</button>
                    </div>

                    <!-- v-model collegato alla variabile relativa alla categoria del prodotto -->
                    <div class="form-group col-md-11">
                        <label for="inputCategory">Categoria</label>
                        <select id="inputCategory" v-model="toModify.category" class="form-control" required>
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
                        <input type="file" accept="image/*" @change="handleFile"/>
                        <!-- Anteprima dell'immagine -->
                        <div v-if="imagePreview">
                            <img :src="imagePreview" alt="Anteprima Immagine" />
                        </div>
                        <div v-else>
                            <img :src="getImageUrl(toModify.image)" alt="Anteprima Immagine" />
                        </div>
                       
                    </div>

                    <!--  submit  -->
                    <button type="submit" class="btn btn-primary mt-5">Conferma modifica</button>
                </form>
            </template>
        </Modal>
    </section>
</template>