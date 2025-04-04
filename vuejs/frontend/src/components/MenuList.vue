<script setup>
    import { onMounted, ref } from 'vue';
    import { useStore } from 'vuex';
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

    //lista degli elementi 
    const list = ref([]);

    //recupero della lista degli elementi nel database presenti nel menu
    const fetchList = async () => {
        const query = qs.stringify({
            filters: {
                fk_site:{
                    documentId: {
                        $eq: siteID.value.documentId
                    }, //piu uno perche strapi risponde con un umero in piu ( non sto estrapolando ma facendo uguaglianza )
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
            }
        } catch (error) {
            console.log(error);
        }
    }

    const handleModify = () => {

    };

    const handleDelete = async (id) => {
        const newList = list.value.filter(item => item.id !== id);
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
                        connect: [
                            newList.map(i => ({ documentId: i})),
                        ]
                    }
                },         
            })
        });
        } catch (error) {
            console.log(error);
        }
        

    }

    onMounted(async () => {
        await fetchList();
    });
</script>

<template>
    <button @click="modify = ! modify" class="btn btn-primary m-5"><span v-if="! modify">Modifica</span><span v-else>Annulla</span></button>
    <button @click="emit('AddElement')" class="btn btn-warning m-5">Aggiungi elemento</button>
    <ol class="list-group list-group-flush">
        <li v-for="element in list" class="list-group-item d-flex justify-content-between align-items-start">
            <div class="ms-2 me-auto">
                <div class="fw-bold">{{ element.name}}</div>
                <p>{{ element.ingredients }}</p>
                <p>{{ element.allergens }}</p>
            </div>
            <div v-if="modify">
                <button @click="handleModify" class="badge text-bg-primary rounded-pill"><i class="bi bi-pencil-fill"></i></button>
                <button @click="handleDelete(element.documentId)" class="badge text-bg-danger rounded-pill"><i class="bi bi-trash"></i></button>
            </div>
            
        </li>
    </ol>
</template>