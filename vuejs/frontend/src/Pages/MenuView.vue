<script setup>
    import { useRoute } from 'vue-router';
    import { ref,onMounted,watch, nextTick } from 'vue';
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

    //ricavare url dell'immagine
    const getImageUrl = (image) => {
        return `http://localhost:1337${image.url}`;
    }

    //quando il componente viene montato recupero la lista degli elementi
    onMounted(async () => {
        await getMenu();
        menuList.value = menu.value;
        nextTick(() => {
            document.title = 'Menu';
        });
        // Dynamically load the Particles.js script
        const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/particles.js";
            script.onload = () => {
                // Initialize Particles.js after the script is loaded
                particlesJS("particles-js", {
                    particles: {
                        number: {
                            value: 150, // Adjust particle count
                            density: {
                                enable: true,
                                value_area: 800
                            }
                        },
                        color: {
                            value: "#FFD700" // color of particles
                        },
                        shape: {
                            type: "polygon",
                            stroke: {
                                width: 0,
                                color: "#000000"
                            }
                        },
                        opacity: {
                            value: 0.5,
                            anim: {
                                enable: false
                            }
                        },
                        size: {
                            value: 3,
                            random: true,
                            anim: {
                                enable: false
                            }
                        },
                        line_linked: { //linee between particles
                            enable: true,
                            distance: 150,
                            color: "#FFD700",
                            opacity: 0.4,
                            width: 1
                        },
                        move: {
                            enable: true,
                            speed: 1,
                            direction: "none",
                            random: false,
                            straight: false,
                            out_mode: "out",
                            bounce: false
                        }
                    },
                    interactivity: { //way to interact with particles
                        detect_on: "canvas",
                        events: {
                            onhover: {
                                enable: true,
                                mode: "repulse"
                            },
                            onclick: {
                                enable: true,
                                mode: "push"
                            }
                        },
                        modes: {
                            repulse: {
                                distance: 200,
                                duration: 0.4
                            },
                            push: {
                                particles_nb: 4
                            }
                        }
                    },
                    retina_detect: true
                });
            };
            document.body.appendChild(script);
    });
</script>

<template>
    <MenuLayout>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

        <section class="d-flex align-items-center justify-content-center" style="height: 60vh; position: relative; background-color: #1E3A8A; background-size: cover; background-position: center;">
            <!-- Particles Background -->
            <div id="particles-js" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></div>
        
            <!-- Overlay for Opacity -->
            <div class="position-absolute top-0 start-0 w-100 h-100" style="background-color: rgba(0, 0, 0, 0.1); z-index: 1;"></div>
        
            <!-- Content for banner -->
            <div class="container text-center text-light" style="z-index: 2;">
                <h1 class="display-3">BENVENUTO</h1>
                <p class="p-2 lead">Vuoi dare uno sguardo al menu?</p>
            </div>
        </section>

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