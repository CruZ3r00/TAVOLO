<script setup>
import AppLayout from '@/Layouts/AppLayout.vue';
import { onMounted, nextTick } from 'vue';

onMounted(async () => {
    nextTick(() => {
        document.title = 'Privacy e policy';
    });
});
</script>

<template>
    <AppLayout>
        <div class="legal-page">
            <div class="legal-container">
                <p class="text-overline">Legale</p>
                <h1 class="legal-title">Privacy Policy</h1>
                <div class="ds-card legal-card">
                    <div class="ds-card-body" v-html="policy" />
                </div>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.legal-page {
    padding: var(--space-10) 0 var(--space-16);
}

.legal-container {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 var(--space-6);
}

.legal-title {
    font-size: var(--text-3xl);
    font-weight: 800;
    color: var(--color-text);
    margin: var(--space-2) 0 var(--space-8);
    letter-spacing: var(--tracking-tight);
}

.legal-card {
    line-height: var(--leading-relaxed);
    color: var(--color-text-secondary);
}
</style>
