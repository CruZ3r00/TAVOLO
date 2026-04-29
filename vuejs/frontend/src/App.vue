<script setup>
    import { RouterView } from 'vue-router';
</script>

<template>
    <RouterView v-slot="{ Component, route }">
      <Transition name="page">
        <component v-if="Component" :is="Component" :key="route.fullPath" />
      </Transition>
    </RouterView>
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
