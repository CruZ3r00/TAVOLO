<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Footer from '@/components/Footer.vue';

const username = ref('')

const router = useRouter();
const checkLog = async () => {
  const token = sessionStorage.getItem('authToken');
  if(token){
    try {
    const response = await fetch('http://localhost:1337/api/users/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
    });

    const userData = await response.json();
    username.value = userData.username;
    } catch (error) {
        console.error('Errore nel recupero dati utente:', error.message);
    }
  }
  
}
onMounted(() => {
  checkLog();
});

</script>

<template>
  
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

    <nav class="navbar navbar-expand-md sticky-top shadow border-bottom bg-white">
      <div class="container">
        <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
          <span class="bi bi-filter" style="font-size:1.8em"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarSupportedContent">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">
            <li class="nav-item">
              <button @click="router.push('/dashboard')" class="nav-link">
                Home
              </button>
            </li>
            <li class="nav-item">
              <button @click="router.push('/menu-handler')" class="nav-link">
                Menu
              </button>
            </li>
            <li class="nav-item">
              <button @click="router.push('/prefs-handler')" class="nav-link">
                Preferenze
              </button>
            </li>
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                {{ username ? username : 'profile' }}
              </a>
                <ul class="dropdown-menu">
                  <li>
                    <a class="dropdown-item">
                      <button @click="router.push('/profile/show')" class="nav-link" >
                        Profile
                      </button>
                    </a>
                  </li>
                <li>
                  <a class="dropdown-item">
                    <button @click="router.push('/logout')" class="nav-link">
                      Logout
                    </button>
                  </a>
                </li>
              </ul>
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
</style>