<template>
    <div class="auth-page">
        <div v-if="$slots.logo" class="auth-logo">
            <slot name="logo" />
        </div>
        <div class="auth-card">
            <slot />
        </div>
    </div>
</template>

<style scoped>
.auth-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-6);
    background: var(--color-bg);
}

.auth-logo {
    margin-bottom: var(--space-8);
}

.auth-card {
    width: 100%;
    max-width: 420px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    padding: var(--space-8);
}
</style>
