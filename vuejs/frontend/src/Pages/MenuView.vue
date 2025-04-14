<script setup>
    import { useRoute } from 'vue-router';
    import { ref } from 'vue';
    import MenuLayout from '@/Layouts/MenuLayout.vue';
    const route = useRoute();

    const handleChange = (cat) => {
        console.log(cat);
    }
</script>

<template>
    <MenuLayout @change="handleChange">
        
    </MenuLayout>
</template>