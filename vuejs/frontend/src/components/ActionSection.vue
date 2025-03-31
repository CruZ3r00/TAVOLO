<script setup>
import SectionTitle from './SectionTitle.vue';
</script>

<template>
    <div class="text-left">
        <SectionTitle>
            <template #title>
                <slot name="title" />
            </template>
            <template #description>
                <slot name="description" />
            </template>
        </SectionTitle>

        <div class="text-left">
            <slot name="content" />
        </div>
    </div>
</template>
