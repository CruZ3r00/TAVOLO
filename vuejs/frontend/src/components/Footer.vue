<template>
    <footer class="app-footer">
        <div class="footer-inner">
            <p class="footer-copy">&copy; 2025 MenuCMS</p>
            <nav class="footer-nav">
                <router-link to="/home" class="footer-link">Home</router-link>
                <router-link to="/who-are-us" class="footer-link">Chi siamo</router-link>
                <router-link to="/contact-us" class="footer-link">Contattaci</router-link>
            </nav>
        </div>
    </footer>
</template>

<style scoped>
.app-footer {
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-elevated);
    padding: var(--space-6) 0;
}

.footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--space-6);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.footer-copy {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
}

.footer-nav {
    display: flex;
    gap: var(--space-6);
}

.footer-link {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    transition: color var(--transition-fast);
}

.footer-link:hover {
    color: var(--color-text);
}

@media (max-width: 640px) {
    .footer-inner {
        flex-direction: column;
        gap: var(--space-3);
        text-align: center;
        padding: 0 var(--space-4);
    }
}
</style>
