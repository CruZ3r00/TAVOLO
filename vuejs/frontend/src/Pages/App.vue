<script setup>
    import { RouterView } from 'vue-router';
</script>

<template>
    <div id="app">
      <RouterView> </RouterView> <!-- Questo è il punto dove verrà caricato il contenuto della rotta -->
    </div>
</template>
  
<style scoped>
    #app {
        font-family: Arial, sans-serif;
        color: #333;
        margin: 0;
        padding: 0;
    }
    
    header {
        background-color: #4CAF50;
        color: white;
        padding: 10px;
        text-align: center;
    }
    
    footer {
        background-color: #f1f1f1;
        color: #333;
        padding: 10px;
        text-align: center;
        position: absolute;
        bottom: 0;
        width: 100%;
    }
</style>