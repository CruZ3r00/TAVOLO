<script setup>
    import { onMounted, nextTick } from 'vue';
    import MenuLayout from '@/Layouts/MenuLayout.vue';
    import MenuViewComponent from '@/components/MenuViewComponent.vue';
    import { ref } from 'vue';
    import { useRoute } from 'vue-router';
    import qs from 'qs';

    const route = useRoute();
    const restaurant = ref(route.params.restaurant);

    const primary_color = ref('');
    const second_color = ref('');
    const background = ref('');
    const details = ref('');

    const fetchPrefs = async () => {
        try {
            const query = qs.stringify({
                filters: {
                    documentId:{
                        $eq: restaurant.value
                    }
                },
                populate: "*",
            });
            const fetchuser = await fetch(`http://localhost:1337/api/users?${query}`,{
                method: "GET",
                headers: {
                    "Content-Type" : "application/json",
                },
            });
            if(fetchuser.ok){
                const data = await fetchuser.json();
                primary_color.value = data[0].fk_prefs.primary_color;
                second_color.value = data[0].fk_prefs.second_color;
                details.value = data[0].fk_prefs.details;
                background.value = data[0].fk_prefs.background;
            }

        } catch (error) {
            console.error(error);
        }
    }

    onMounted(async () => {
        await fetchPrefs();
        nextTick(() => {
            document.title = 'Menu';
        });

        const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/particles.js";
            script.onload = () => {
                particlesJS("particles-js", {
                    particles: {
                        number: {
                            value: 150,
                            density: {
                                enable: true,
                                value_area: 800
                            }
                        },
                        color: {
                            value: second_color.value
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
                        line_linked: {
                            enable: true,
                            distance: 150,
                            color: second_color.value,
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
                    interactivity: {
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
    <MenuLayout :primary="primary_color" :second="second_color" :background="background" :details="details">
        <section class="menu-hero" :style="{ backgroundColor: primary_color }">
            <div id="particles-js" class="menu-hero-particles"></div>
            <div class="menu-hero-overlay"></div>
            <div class="menu-hero-content">
                <h1 class="menu-hero-title">BENVENUTO</h1>
                <p class="menu-hero-subtitle">Vuoi dare uno sguardo al menu?</p>
            </div>
        </section>

        <section>
            <MenuViewComponent :primary="primary_color" :second="second_color" :background="background" :details="details"/>
        </section>
    </MenuLayout>
</template>

<style scoped>
.menu-hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60vh;
  overflow: hidden;
}
.menu-hero-particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}
.menu-hero-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.1);
  z-index: 1;
}
.menu-hero-content {
  position: relative;
  z-index: 2;
  text-align: center;
  color: #fff;
}
.menu-hero-title {
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  margin: 0 0 var(--space-3) 0;
}
.menu-hero-subtitle {
  font-size: var(--text-lg);
  opacity: 0.9;
  margin: 0;
}

@media (max-width: 768px) {
  .menu-hero {
    height: 40vh;
  }
  .menu-hero-title {
    font-size: var(--text-2xl);
  }
}
</style>
