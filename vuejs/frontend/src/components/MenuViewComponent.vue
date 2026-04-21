<script setup>
    import { useRoute } from 'vue-router';
    import { ref, onMounted, watch } from 'vue';
    import { API_BASE, fetchMenuElements } from '@/utils';
    import { useStore } from 'vuex';

    const props = defineProps({
        primary: {
            type: String,
            required: true,
        },
        second: {
            type: String,
            required: true,
        },
        background: {
            type: String,
            required: true,
        },
        details: {
            type: String,
            required: true,
        },
    })

    const primary_color = ref(props.primary);
    const second_color = ref(props.second);
    const details = ref(props.details);
    const background = ref(props.background);

    watch(() => props, () => {
        primary_color.value = props.primary;
        second_color.value = props.second;
        details.value = props.details;
        background.value = props.background;
    },{ deep: true });

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
                const response = await fetch(`${API_BASE}/api/users/me`,{
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

    const getImageUrl = (image) => {
        return `${API_BASE}${image.url}`;
    }

    onMounted(async () => {
        await getMenu();
        menuList.value = menu.value;
    });
</script>

<template>
    <section class="menu-view-section">
        <div class="menu-view-list">
            <div
                v-for="element in menuList"
                :key="element.id"
                class="menu-view-item"
                :style="{ backgroundColor: background, color: primary_color }"
            >
                <img
                    v-if="element.image"
                    :src="getImageUrl(element.image)"
                    :alt="element.name"
                    class="menu-view-image"
                />
                <div class="menu-view-info">
                    <h3 class="menu-view-name">{{ element.name }}</h3>
                    <p v-if="element.ingredients && element.ingredients.length" class="menu-view-detail">
                        <i class="bi bi-list-ul"></i> {{ element.ingredients }}
                    </p>
                    <p v-if="element.allergens && element.allergens.length" class="menu-view-detail menu-view-allergens">
                        <i class="bi bi-exclamation-triangle"></i> {{ element.allergens }}
                    </p>
                </div>
            </div>
        </div>

        <div v-if="menuList.length === 0" class="menu-view-empty">
            <i class="bi bi-journal-x"></i>
            <p>Nessun elemento trovato</p>
        </div>
    </section>
</template>

<style scoped>
.menu-view-section {
  padding: var(--space-6) var(--space-4);
  max-width: 900px;
  margin: 0 auto;
}
.menu-view-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.menu-view-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  transition: box-shadow var(--transition-fast);
}
.menu-view-item:hover {
  box-shadow: var(--shadow-md);
}
.menu-view-image {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.menu-view-info {
  flex: 1;
  min-width: 0;
}
.menu-view-name {
  font-size: var(--text-md);
  font-weight: 600;
  margin: 0 0 var(--space-1) 0;
}
.menu-view-detail {
  font-size: var(--text-sm);
  opacity: 0.8;
  margin: var(--space-1) 0 0 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.menu-view-allergens {
  opacity: 0.6;
  font-style: italic;
}
.menu-view-empty {
  text-align: center;
  padding: var(--space-12) 0;
  opacity: 0.5;
}
.menu-view-empty i {
  font-size: var(--text-3xl);
  display: block;
  margin-bottom: var(--space-3);
}
</style>
