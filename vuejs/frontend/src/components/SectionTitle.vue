<template>
    <div class="section-title-wrapper">
        <div class="section-title-content">
            <h3 class="section-title">
                <slot name="title" />
            </h3>
            <p class="section-description">
                <slot name="description" />
            </p>
        </div>
        <div class="section-aside">
            <slot name="aside" />
        </div>
    </div>
</template>

<style scoped>
.section-title-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
}
.section-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}
.section-description {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: var(--space-1) 0 0 0;
  line-height: var(--leading-relaxed);
}
</style>
