<script setup>
    import Footer from '@/components/Footer.vue';
    import { ref, onMounted } from 'vue';
    import { useRoute, useRouter } from 'vue-router';
    import { fetchMenuElements } from '@/utils';

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

    const primary_color = ref('');
    const second_color = ref('');
    const details = ref('');
    const background = ref('');

    const route = useRoute();
    const router = useRouter();

    const restaurant = route.params.restaurant;
    const menuCats = ref([]);
    const mobileOpen = ref(false);

    const populate = async () => {
        try {
            const data = await fetchMenuElements(restaurant);
            data.data.forEach(d => {
                d.fk_elements.forEach(element => {
                    if(!menuCats.value.includes(element.category)){
                        menuCats.value.push(element.category);
                    }
                });
            });
        } catch (error) {
           console.error(error);
        }
    }

    onMounted(async () => {
        await populate();
        primary_color.value = props.primary;
        second_color.value = props.second;
        background.value = props.background;
        details.value = props.details;
    });
</script>

<template>
    <nav class="menu-navbar" :style="{ backgroundColor: background }">
        <div class="menu-navbar-inner">
            <button
                class="menu-navbar-toggle"
                :style="{ color: details }"
                @click="mobileOpen = !mobileOpen"
                aria-label="Toggle navigation"
            >
                <i class="bi bi-filter" style="font-size: 1.5em;"></i>
            </button>

            <ul class="menu-navbar-links" :class="{ 'is-open': mobileOpen }">
                <li v-for="item in menuCats" :key="item">
                    <button
                        @click="router.push('/menu/' + restaurant + '/' + item); mobileOpen = false"
                        class="menu-navbar-link"
                        :style="{ color: details }"
                    >
                        {{ item }}
                    </button>
                </li>
            </ul>
        </div>
    </nav>

    <main class="menu-main">
        <slot />
    </main>

    <Footer />
</template>

<style scoped>
.menu-navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  box-shadow: var(--shadow-sm);
}
.menu-navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
}
.menu-navbar-toggle {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-2);
}
.menu-navbar-links {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.menu-navbar-link {
  background: none;
  border: none;
  font-family: var(--font-family);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  transition: opacity var(--transition-fast), background var(--transition-fast);
}
.menu-navbar-link:hover {
  opacity: 0.7;
  background: rgba(0,0,0,0.05);
}
.menu-main {
  min-height: calc(100vh - 120px);
}

@media (max-width: 768px) {
  .menu-navbar-toggle {
    display: block;
  }
  .menu-navbar-links {
    display: none;
    flex-direction: column;
    width: 100%;
    padding-top: var(--space-3);
  }
  .menu-navbar-links.is-open {
    display: flex;
  }
  .menu-navbar-inner {
    flex-wrap: wrap;
  }
}
</style>
