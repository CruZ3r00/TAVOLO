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


    //lista degli elementi 
    const list = ref([]);

    //recupero della lista degli elementi nel database presenti nel menu
    const fetchList = async () => {

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
    };

    //funzione che fa l'update dell'elemento selezionato, con le modifiche apportate nel form
    const update = async () => {
        try {
            
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

            //fetch che elimina il record dal database, da testare
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
                            "image": null }  ( al momento perche da sistemare menuAdder s)
                -->
                <div class="ms-2 me-auto">
                    <div class="fw-bold">{{ element.name}}</div>
                    <p>{{ element.ingredients }}</p>
                    <p>{{ element.allergens }}</p>
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
        <Modal :show="modalShow" @close="modalShow = !modalShow;">
            <template #title>Modifica</template>
            <template #body>
                <form @submit.prevent="update" class="my-5 mx-5">
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
                    <button type="submit" class="btn btn-primary mt-5">Conferma modifica</button>
                </form>
            </template>
        </Modal>
    </section>
</template>