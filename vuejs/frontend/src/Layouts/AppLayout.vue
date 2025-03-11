<script setup>
import { useRouter } from 'vue-router';
import Footer from '@/Components/Footer.vue';

const router = useRouter();


</script>

<template>
  
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  
  <section>
    <nav class="navbar navbar-expand-md sticky-top shadow border-bottom bg-white">
      <div class="container">
        <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
          <span class="bi bi-filter" style="font-size:1.8em"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarSupportedContent">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">
            
          </ul>
        </div>
      </div>
    </nav>
  </section>

  <section>
    <div>

        <div class="min-h-screen bg-gray-100">
            <!-- Page Content -->
            <main style="background-color: #f5eee1;">
                <slot />
            </main>
        </div>
    </div>
  </section>
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