<script setup>
import SectionTitle from './SectionTitle.vue';
</script>

<template>
    <div class="action-section">
        <SectionTitle>
            <template #title>
                <slot name="title" />
            </template>
            <template #description>
                <slot name="description" />
            </template>
        </SectionTitle>

        <div class="action-section-content">
            <slot name="content" />
        </div>
    </div>
</template>

<style scoped>
.action-section {
  text-align: left;
}
.action-section-content {
  margin-top: var(--space-4);
}
</style>
