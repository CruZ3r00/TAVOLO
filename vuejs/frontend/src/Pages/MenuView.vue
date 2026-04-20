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
    min-height: 380px;
    overflow: hidden;
}
.menu-hero-particles {
    position: absolute;
    inset: 0;
    z-index: 1;
}
.menu-hero-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.22) 100%);
    z-index: 1;
}
.menu-hero-content {
    position: relative;
    z-index: 2;
    text-align: center;
    color: #fff;
    padding: 0 var(--s-6, 24px);
}
.menu-hero-title {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: clamp(40px, 8vw, 72px);
    font-weight: 800;
    letter-spacing: -0.04em;
    margin: 0 0 var(--s-3, 12px) 0;
    line-height: 1;
    text-shadow: 0 2px 24px rgba(0, 0, 0, 0.25);
}
.menu-hero-subtitle {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: clamp(15px, 2vw, 19px);
    opacity: 0.92;
    margin: 0;
    font-weight: 400;
    letter-spacing: -0.01em;
}

@media (max-width: 768px) {
    .menu-hero { height: 45vh; min-height: 300px; }
}
</style>
