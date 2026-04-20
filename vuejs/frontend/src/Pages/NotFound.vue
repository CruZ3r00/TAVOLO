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
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--bg);
    padding: var(--s-6);
    font-family: var(--f-sans, 'Geist', sans-serif);
    overflow: hidden;
}
.not-found-page::before {
    content: '';
    position: absolute; inset: 0;
    pointer-events: none;
    background:
        radial-gradient(600px 400px at 20% 20%, color-mix(in oklab, var(--ac) 10%, transparent), transparent 60%),
        radial-gradient(700px 500px at 80% 80%, color-mix(in oklab, var(--ac) 6%, transparent), transparent 60%);
}

.not-found-content {
    position: relative;
    text-align: center;
    max-width: 480px;
    padding: var(--s-7) var(--s-6);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-xl);
    box-shadow: 0 10px 40px -12px color-mix(in oklab, var(--ink) 16%, transparent);
}

.not-found-code {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: clamp(80px, 16vw, 128px);
    font-weight: 800;
    color: var(--ink);
    background: linear-gradient(135deg, var(--ink) 30%, var(--ac) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.05em;
    line-height: 1;
    margin-bottom: var(--s-4);
}

.not-found-title {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: clamp(24px, 3vw, 32px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-3) 0;
    letter-spacing: -0.02em;
}

.not-found-description {
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 15px;
    color: var(--ink-3);
    margin: 0 0 var(--s-6) 0;
    line-height: 1.55;
}

.not-found-content :deep(.ds-btn) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 600;
    color: var(--paper);
    background: var(--ink);
    border: 1px solid var(--ink);
    border-radius: var(--r-md);
    text-decoration: none;
    transition: transform 120ms, background 120ms;
}
.not-found-content :deep(.ds-btn:hover) {
    background: color-mix(in oklab, var(--ink) 90%, var(--ac));
    transform: translateY(-1px);
}
</style>
