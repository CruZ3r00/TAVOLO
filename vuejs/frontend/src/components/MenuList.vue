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
        const query = qs.stringify({
            filters: {
                fk_site:{
                    documentId: {
                        $eq: siteID.value.documentId
                    }, 
                }
            },
            populate: "fk_elements",
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
                
                menuId.value = data.data[0].documentId;
                console.log(list.value);
            }
        } catch (error) {
            console.log(error);
        }
    }

    const handleModify = (e) => {
        modalShow.value = !modalShow.value;
        toModify.value = e;
    };

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
                        fk_elements:{
                            disconnect: { documentId: id },
                        }
                    },         
                })
            });

            if (update.ok){
                list.value = list.value.filter(item => item.documentId !== id);
            }
        } catch (error) {
            console.log(error);
        }
        

    }

    onMounted(async () => {
        await fetchList();
    });
</script>

<template>
    <div class="row">
        <button @click="modify = ! modify" class="btn btn-primary m-5 col-md-2 "><span v-if="! modify">Modifica</span><span v-else>Annulla</span></button>
        <button @click="emit('AddElement')" class="btn btn-warning m-5 col-md-2 ms-auto">Aggiungi elemento</button>
    </div>
    
    <section>
        <ol class="list-group list-group-flush">
            <li v-for="element in list" class="list-group-item d-flex justify-content-between align-items-start">
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

    <section>
        <Modal :show="modalShow" @close="modalShow = !modalShow;">
            <template #title>Modifica</template>
            <template #body>
                <form @submit.prevent="submit" class="my-5 mx-5">
                    <div class="row">

                        <div class="form-group col-md-7">
                            <label for="inputName">Nome</label>
                            <input type="text" v-model="name" class="form-control" id="inputName" placeholder="Inserisci il nome" required>
                        </div>

                        <div class="form-group col-md-4">
                            <label for="inputPrice">Prezzo</label>
                            <input type="number" v-model="price" class="form-control" id="inputPrice" step="0.01" placeholder="Inserisci il prezzo" required>
                        </div>

                    </div>

                    <div class="form-group col-md-11">
                        <label for="inputIngredients">Ingredienti </label>
                        <textarea v-model="ingredients" class="form-control" rows="4" cols="50" id="inputIngredients" placeholder="Lista degli ingredienti..."  required/>
                    </div>

                    <div class="form-group col-md-11">
                        <label for="inputAllergens">Allergeni</label>
                        <textarea v-model="allergens" class="form-control" rows="4" cols="50" id="inputAllergens" placeholder="Lista degli allergeni..." required/>
                    </div>

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
                    
                    <div class="form-group col-md-2">
                        <label for="inputImage">Immagine</label>
                        <input type="file" accept="image/*" @change="handleFile" required/>
                        <!-- Anteprima dell'immagine -->
                        <div v-if="imagePreview">
                            <img :src="imagePreview" alt="Anteprima Immagine" />
                        </div>
                    </div>

                    <button type="submit" class="btn btn-primary mt-5">Registra elemento</button>
                </form>
            </template>
        </Modal>
    </section>
</template>