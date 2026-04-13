<script setup>
    import { RouterView, useRoute } from 'vue-router';
    import { computed } from 'vue';

    const route = useRoute();
    const routeKey = computed(() => route.fullPath);
</script>

<template>
    <div id="app">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="routeKey" />
        </Transition>
      </RouterView>
    </div>
</template>

<style>
    #app {
        font-family: var(--font-family);
        color: var(--color-text);
        margin: 0;
        padding: 0;
        min-height: 100vh;
    }
</style>
