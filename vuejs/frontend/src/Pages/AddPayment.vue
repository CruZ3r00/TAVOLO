<script setup> //Pagina che permettera' l'inserimento di un nuovo metodo di pagamento
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { nextTick } from 'vue'; 

    // Imposta il titolo della pagina
    onMounted(async () => {
            nextTick(() => {
                document.title = 'Aggiungi metodo di pagamento';
            });
    });
</script>

<template>
    <AppLayout>
        
    </AppLayout>
</template>