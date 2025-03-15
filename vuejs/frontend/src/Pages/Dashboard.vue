<script setup>
import { useRouter } from 'vue-router';
import AppLayout from '@/Layouts/AppLayout.vue';
import { ref, watch, onMounted, nextTick } from 'vue';

const router = useRouter();

const selectedGame = ref(null);

// Update the title of the window whenever the game selection changes
watch(selectedGame, (newGame) => {
  nextTick(() => {
    document.title = newGame ? `Playing: ${newGame}` : 'Dashboard';
  });
});

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
                    value: 100, // Adjust particle count
                    density: {
                        enable: true,
                        value_area: 800
                    }
                },
                color: {
                    value: "#ffffff" // White particles
                },
                shape: {
                    type: "edge",
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
                    color: "#ffffff",
                    opacity: 0.4,
                    width: 1
                },
                move: {
                    enable: true,
                    speed: 2,
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
    <AppLayout>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

        <section class="d-flex align-items-center justify-content-center" style="height: 60vh; position: relative; background-color: #27ae60; background-size: cover; background-position: center;">
            <!-- Particles Background -->
            <div id="particles-js" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></div>
        
            <!-- Overlay for Opacity -->
            <div class="position-absolute top-0 start-0 w-100 h-100" style="background-color: rgba(0, 0, 0, 0.1); z-index: 1;"></div>
        
            <!-- Content -->
            <div class="container text-center text-light" style="z-index: 2;">
                <h1 class="display-3">VUOI CREARE IL TUO MENU?</h1>
                <p class="p-2 lead">Benvenuto</p>
            </div>
        </section>

        <section class="py-5">
            <div class="container text-center">
                <h1 class="display-5 fw-bold text-body-emphasis pb-5">Cosa <span style="text-decoration: underline; text-decoration-color: rgb(27, 27, 255);">offriamo</span>?</h1>

                
            </div>
        </section>

        
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