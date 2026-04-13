<script setup>
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { onMounted, nextTick } from 'vue';

    onMounted(() => {
        nextTick(() => {
            document.title = 'Chi siamo';
        });
    });
</script>

<template>
    <AppLayout>
        <div class="about-page">
            <div class="about-container">
                <p class="text-overline">Chi siamo</p>
                <h1 class="about-title">Il team dietro MenuCMS</h1>
                <p class="about-subtitle">Siamo un team dedicato a rendere semplice la gestione dei menu digitali per i ristoratori.</p>

                <div class="ds-card about-card">
                    <div class="ds-card-body">
                        <div class="ds-empty">
                            <div class="ds-empty-icon"><i class="bi bi-people"></i></div>
                            <p class="ds-empty-title">Contenuto in arrivo</p>
                            <p class="ds-empty-description">Questa pagina verrà completata con le informazioni sul nostro team.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.about-page {
    padding: var(--space-10) 0 var(--space-16);
}

.about-container {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 var(--space-6);
}

.about-title {
    font-size: var(--text-3xl);
    font-weight: 800;
    color: var(--color-text);
    margin: var(--space-2) 0;
    letter-spacing: var(--tracking-tight);
}

.about-subtitle {
    font-size: var(--text-md);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-8) 0;
    line-height: var(--leading-relaxed);
}
</style>
