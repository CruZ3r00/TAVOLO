<script setup>
import { computed } from 'vue';

const props = defineProps({
    status: {
        type: String,
        required: true,
        validator: (v) => ['pending', 'confirmed', 'at_restaurant', 'completed', 'cancelled'].includes(v),
    },
});

const META = {
    pending:       { label: 'Richiesta',   cls: 'ds-badge-warning', icon: 'bi-hourglass-split' },
    confirmed:     { label: 'Confermata',  cls: 'ds-badge-primary', icon: 'bi-check2-circle' },
    at_restaurant: { label: 'In sala',     cls: 'ds-badge-accent',  icon: 'bi-people-fill' },
    completed:     { label: 'Completata', cls: 'ds-badge-neutral', icon: 'bi-check2-all' },
    cancelled:     { label: 'Annullata',  cls: 'ds-badge-danger',  icon: 'bi-x-circle' },
};

const meta = computed(() => META[props.status] || META.pending);
</script>

<template>
    <span :class="['ds-badge', meta.cls, 'reservation-status-badge']">
        <i :class="['bi', meta.icon]" aria-hidden="true"></i>
        <span>{{ meta.label }}</span>
    </span>
</template>

<style scoped>
.reservation-status-badge {
    gap: var(--space-1);
    font-weight: 600;
}
.reservation-status-badge i {
    font-size: 0.75rem;
}
</style>
