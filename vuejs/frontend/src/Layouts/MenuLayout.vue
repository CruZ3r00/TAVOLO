<script setup>
    import Footer from '@/components/Footer.vue';
    import { ref,onMounted } from 'vue';
    import { useRoute, useRouter } from 'vue-router';
    import { fetchMenuElements } from '@/utils';
    
    const route =  useRoute();
    const router =  useRouter();

    const restaurant = route.params.restaurant;
    const menuCats = ref([]);

    //funzione per popolare il menu del sito-menu
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
           console.log(error); 
        }
    }

    //quando il componente viene montato recupero la lista degli elementi
    onMounted(async () => {
        await populate();
    });
</script>

<template>
  
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

    <nav class="navbar navbar-expand-md sticky-top shadow border-bottom bg-white">
      <div class="container">
        <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
          <span class="bi bi-filter" style="font-size:1.8em; color:#00A8CC;"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarSupportedContent">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">
            <li class="nav-item" v-for="item in menuCats">
              <button @click="router.push('/menu/' + restaurant + '/' + item)" class="nav-link">
                {{ item }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </nav>

    <div>

        <div class="min-h-screen bg-gray-100">
            <!-- Page Content -->
            <main>
                <slot />
            </main>
        </div>
    </div>
    <div class="position-relative" style="z-index: 2;">
      <Footer />
    </div>
</template>

<style scoped>
    #particles-js {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        z-index: 1; /* Place particles behind content */
    }
    .nav-link{
      color:#2D2D2D;
    }
    .nav-link:hover{
      color: #00A8CC;
    }
</style>