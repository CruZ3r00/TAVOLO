<template>
    <div class="auth-page">
        <div class="auth-bg-fx" aria-hidden="true"></div>
        <router-link to="/" class="auth-back" aria-label="Torna alla home">
            <i class="bi bi-arrow-left" aria-hidden="true"></i>
            <span>Torna alla home</span>
        </router-link>
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
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--s-6);
    background: var(--bg);
    overflow: hidden;
}

.auth-bg-fx {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background:
        radial-gradient(600px 400px at 15% 20%, color-mix(in oklab, var(--ac) 10%, transparent), transparent 60%),
        radial-gradient(700px 500px at 85% 80%, color-mix(in oklab, var(--ac) 6%, transparent), transparent 60%);
}

.auth-back {
    position: absolute;
    top: var(--s-5);
    left: var(--s-6);
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    text-decoration: none;
    box-shadow: var(--shadow-xs);
    transition: color 120ms, background 120ms, border-color 120ms, transform 120ms;
}

.auth-back:hover {
    color: var(--ink);
    background: var(--bg-hover);
    border-color: var(--line-strong);
    transform: translateX(-2px);
}

.auth-back i {
    font-size: 14px;
}

@media (max-width: 520px) {
    .auth-back {
        top: var(--s-3);
        left: var(--s-3);
        padding: 7px 10px;
        font-size: 12px;
    }
    .auth-back span { display: none; }
}

.auth-logo {
    position: relative;
    z-index: 1;
    margin-bottom: var(--s-7);
}

.auth-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 440px;
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-xl);
    box-shadow:
        0 1px 2px rgb(0 0 0 / 0.04),
        0 10px 40px -12px color-mix(in oklab, var(--ink) 16%, transparent);
    padding: var(--s-7) var(--s-7) var(--s-6);
}

@media (max-width: 520px) {
    .auth-card { padding: var(--s-6) var(--s-5); max-width: 100%; }
    .auth-page { padding: var(--s-4); }
}
</style>
