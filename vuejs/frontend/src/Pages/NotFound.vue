<script setup>
import { onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

onMounted(async () => {
    nextTick(() => {
        document.title = 'Pagina non trovata - 404';
    });
});
</script>

<template>
    <div class="not-found-page">
        <div class="not-found-content">
            <div class="not-found-code">404</div>
            <h1 class="not-found-title">Pagina non trovata</h1>
            <p class="not-found-description">La pagina che stai cercando non esiste o è stata spostata.</p>
            <button @click="router.push('/')" class="ds-btn ds-btn-primary ds-btn-lg">
                <i class="bi bi-arrow-left"></i>
                <span>Torna alla home</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.not-found-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--color-bg);
    padding: var(--space-6);
}

.not-found-content {
    text-align: center;
    max-width: 440px;
}

.not-found-code {
    font-size: 6rem;
    font-weight: 800;
    color: var(--color-bg-muted);
    letter-spacing: var(--tracking-tight);
    line-height: 1;
    margin-bottom: var(--space-4);
}

.not-found-title {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 var(--space-3) 0;
    letter-spacing: var(--tracking-tight);
}

.not-found-description {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-8) 0;
    line-height: var(--leading-relaxed);
}
</style>
