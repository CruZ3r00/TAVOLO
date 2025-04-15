<script setup>
    import { useRoute } from 'vue-router';
    import { ref,onMounted,watch } from 'vue';
    import MenuLayout from '@/Layouts/MenuLayout.vue';
    import { fetchMenuElements } from '@/utils';

    const route = useRoute();
    const restaurant = ref(route.params.restaurant);
    const category = ref(route.params.category);
    const menu = ref([]);
    const menuList = ref([]);
    
    const getMenu = async () =>{
        try {
            const data = await fetchMenuElements(restaurant.value);   
            console.log(data);
            data.data[0].fk_elements.forEach(element => {
                menu.value.push(element);
            });
        } catch (error) {
            console.log(error);
        }
    }

    watch(() => route.params.category, async () => {
        category.value = route.params.category;
        menuList.value = menu.value.filter(item => item.category === category.value);
    });

    //quando il componente viene montato recupero la lista degli elementi
    onMounted(async () => {
        await getMenu();
        menuList.value = menu.value;
    });
</script>

<template>
    <MenuLayout>

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
    </MenuLayout>
</template>