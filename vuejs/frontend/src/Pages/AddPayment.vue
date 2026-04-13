<script setup>
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { onMounted, nextTick } from 'vue';

    onMounted(async () => {
        nextTick(() => {
            document.title = 'Aggiungi metodo di pagamento';
        });
    });
</script>

<template>
    <AppLayout>
        <div class="placeholder-page">
            <div class="placeholder-container">
                <div class="ds-card">
                    <div class="ds-card-body">
                        <div class="ds-empty">
                            <div class="ds-empty-icon"><i class="bi bi-credit-card"></i></div>
                            <p class="ds-empty-title">Metodo di pagamento</p>
                            <p class="ds-empty-description">Questa funzionalità sarà disponibile prossimamente.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.placeholder-page {
  padding: var(--space-10) 0 var(--space-16);
}
.placeholder-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 var(--space-6);
}
</style>
