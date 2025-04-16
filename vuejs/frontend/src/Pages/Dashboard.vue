<script setup> //dashboard accessibile a tutti che visualizza tutte le info e le spiegazioni ( come link esterni ) del servizio offerto
import { useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import { onMounted, nextTick } from 'vue';

const router = useRouter();
// Set the window title when page is mounted
onMounted(() => {
  nextTick(() => {
    document.title = 'Dashboard';
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
    <AppLayout>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

        <section class="d-flex align-items-center justify-content-center" style="height: 60vh; position: relative; background-color: #1E3A8A; background-size: cover; background-position: center;">
            <!-- Particles Background -->
            <div id="particles-js" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></div>
        
            <!-- Overlay for Opacity -->
            <div class="position-absolute top-0 start-0 w-100 h-100" style="background-color: rgba(0, 0, 0, 0.1); z-index: 1;"></div>
        
            <!-- Content for banner -->
            <div class="container text-center text-light" style="z-index: 2;">
                <h1 class="display-3">VUOI CREARE IL TUO MENU?</h1>
                <p class="p-2 lead">Benvenuto</p>
            </div>
        </section>

        <!-- Content for carousel -->
         
        <div class="my-5 text-center align-items-center justify-content-center"><h1 class="display-5 fw-bold text-body-emphasis" style="color: #2D2D2D;">Cosa <span style="text-decoration: underline; text-decoration-color: #00A8CC;">offriamo</span>?</h1></div>
        <section class="align-items-center justify-content-center mx-5" style="height: 20vh; position:relative; background-size: cover; background-position: center;">
            <div class="rounded-3" style="background-color: rgba(0, 0, 0, 0.02);">
                <div id="multiItemCarousel" class="carousel slide carousel-fade text-center align-items-center justify-content-center" data-bs-ride="carousel">
                    <div class="carousel-indicators"> 
                        <!-- Bottom's button -->
                        <button type="button" data-bs-target="#multiItemCarousel" data-bs-slide-to="0" class="active" aria-current="true" aria-label="Slide 1" style="background-color: #00A8CC;"></button>
                        <button type="button" data-bs-target= "#multiItemCarousel" data-bs-slide-to="1" aria-label="Slide 2" style="background-color: #00A8CC;"></button>
                        <button type="button" data-bs-target="#multiItemCarousel" data-bs-slide-to="2"  aria-label="Slide 3" style="background-color: #00A8CC;"></button>
                        <button type="button" data-bs-target="#multiItemCarousel" data-bs-slide-to="3"  aria-label="Slide 4" style="background-color: #00A8CC;"></button>
                    </div>
                    <!-- da reindirizzare verso la pagina che spiega e mostra un tour guidato delle funzioni relative -->
                    <div class="carousel-inner">
                        <div class="carousel-item active mt-5 mb-5" @click="router.push('/menu-handler')" style="color:#00A8CC">
                            <i class="bi bi-book display-1 mb-4 d-block w-100"></i>
                            <h5 class="fw-bold pt-3" style="color:#2D2D2D;">Personalizzazione del menu</h5>
                        </div>
                        <div class="carousel-item mt-5 mb-5" @click="router.push('/prefs-handler')" style="color:#00A8CC">
                            <i class="bi bi-brush display-1 mb-4 d-block w-100"></i>
                            <h5 class="fw-bold pt-3" style="color:#2D2D2D;">Personalizzazione delle interfacce</h5>
                        </div>
                        <div class="carousel-item mt-5 mb-5" style="color:#00A8CC">
                            <i class="bi bi bi-card-list display-1 mb-4 d-block w-100"></i>
                            <h5 class="fw-bold pt-3" style="color:#2D2D2D;">Divisione delle categorie</h5>
                        </div>
                         <!-- da aggiunger -->
                        <div class="carousel-item mt-5 mb-5" style="color:#00A8CC">
                            <i class="bi bi-qr-code display-1 mb-4 d-block w-100"></i>
                            <h5 class="fw-bold pt-3" style="color:#2D2D2D;">QR code per accedere al menu online</h5>
                        </div>
                    </div>
                    
                    <!-- frecce laterali del carousel-->
                    <button class="carousel-control-prev" type="button" data-bs-target="#multiItemCarousel" data-bs-slide="prev">
                        <i class="bi bi-chevron-double-left" style="color: #00A8CC;"></i>
                    </button>
                    <button class="carousel-control-next" type="button" data-bs-target="#multiItemCarousel" data-bs-slide="next">
                        <i class="bi bi-chevron-double-right"  style="color: #00A8CC;"></i>
                    </button>
                </div>
            </div>
        </section>

        <!-- sezione marketing che spiega offerte e funzionamento dell'abbonamento -->        
        <section class="py-5">
            
        </section>

        <!-- sezione per la spiegazione dell'utilizzo della pagina di aggiunta elementi al menu -->        
        <section class="py-5">
            
        </section>

        <!-- sezione per la spiegazione dell'utilizzo della pagina di settaggio delle preferenze -->        
        <section class="py-5">
            
        </section>

        <!-- sezione per la spiegazione del funzionamento del menu -->        
        <section class="py-5">
            
        </section>

        <!-- sezione che spiega come utilizzare il qr code -->        
        <section class="py-5">
            
        </section>
        
    </AppLayout>
</template>

<style scoped>
    .home-page {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-size: cover;
    background-position: center;
    }

    /* Content Container */
    .content-container {
    background-color: #f5eee1;
    border-radius: 15px;
    padding: 2rem;
    text-align: center;
    width: 450px;
    max-width: 90%;
    margin: 0 auto; /* Center the form */
    box-shadow: 0 8px 20px rgba(255, 255, 255, 0.3);
    }

    /* Title of the Card */
    .title {
    font-size: 2rem;
    font-weight: bold;
    text-align: center;
    margin-bottom: 1rem;
    text-shadow: 3px 3px 8px rgba(0, 0, 0, 0.4);
    }

    /* Description under the title */
    .description {
    font-size: 1.3rem;
    color: #f39c12;
    margin-bottom: 2rem;
    text-shadow: 3px 3px 8px rgba(0, 0, 0, 0.4);
    }

    /* Game Selector Form */
    .game-selection-card {
    background-color: #ffffff;
    padding: 2.5rem;
    text-align: center;
    border: 1.5px solid #f5eee1;
    }

    /* Game Selector Button Style */
    .game-selection-button {
    background-color: #2ecc71;
    color: white;
    padding: 10px;
    width: 100%;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    }

    .game-selection-button:hover {
    background-color: #27ae60;
    }
</style>