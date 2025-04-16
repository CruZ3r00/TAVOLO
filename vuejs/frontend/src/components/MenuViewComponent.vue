<script setup>
    import { useRoute } from 'vue-router';
    import { ref, onMounted, watch } from 'vue';
    import { fetchMenuElements } from '@/utils';
    import { useStore } from 'vuex';

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const tkn = store.getters.getToken;

    const route = useRoute();
    const restaurant = ref(route.params.restaurant);
    const category = ref(route.params.category);
    const menu = ref([]);
    const menuList = ref([]);
    const data = ref([]);
    
    const getMenu = async () =>{
        try {
            if(restaurant.value){
                data.value = await fetchMenuElements(restaurant.value);
            }else{
                const response = await fetch(`http://192.168.1.36:1337/api/users/me`,{
                    method: "GET",
                    headers: {
                        "Authorization" : `Bearer ${tkn}`,
                        "Content-Type" : "application/json",
                    },
                });

                if(response.ok){
                    const x = await response.json();
                    data.value = await fetchMenuElements(x.documentId);
                }
            }
            
            data.value.data[0].fk_elements.forEach(element => {
                menu.value.push(element);
            });
        } catch (error) {
            console.error(error);
        }
    }

    watch(() => route.params.category, async () => {
        category.value = route.params.category;
        menuList.value = menu.value.filter(item => item.category === category.value);
    });

    //ricavare url dell'immagine
    const getImageUrl = (image) => {
        return `http://192.168.1.36:1337${image.url}`;
    }

    
    //quando il componente viene montato recupero la lista degli elementi
    onMounted(async () => {
        await getMenu();
        menuList.value = menu.value;
        
    });
</script>
<template>
    <!-- lista elementi -->
    <section>
        <ol class="list-group list-group-flush">
            <li v-for="element in menuList" class="list-group-item d-flex justify-content-between align-items-start">
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
            </li>
        </ol>
    </section>
</template>