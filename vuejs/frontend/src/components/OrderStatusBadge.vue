<script setup>
import { computed } from 'vue';

const props = defineProps({
    status: {
        type: String,
        required: true,
        validator: (v) => ['taken', 'preparing', 'ready', 'served', 'active', 'closed'].includes(v),
    },
});

const META = {
    taken:     { label: 'Preso',        cls: 'ds-badge-neutral',  icon: 'bi-receipt' },
    preparing: { label: 'In preparazione', cls: 'ds-badge-warning', icon: 'bi-fire' },
    ready:     { label: 'Pronto',       cls: 'ds-badge-accent',   icon: 'bi-check-circle' },
    served:    { label: 'Servito',      cls: 'ds-badge-primary',  icon: 'bi-cup-straw' },
    active:    { label: 'Attivo',       cls: 'ds-badge-primary',  icon: 'bi-circle-fill' },
    closed:    { label: 'Chiuso',       cls: 'ds-badge-neutral',  icon: 'bi-lock' },
};

const meta = computed(() => META[props.status] || META.taken);
</script>

<template>
    <span :class="['ds-badge', meta.cls, 'order-status-badge']">
        <i :class="['bi', meta.icon]" aria-hidden="true"></i>
        <span>{{ meta.label }}</span>
    </span>
</template>

<style scoped>
.order-status-badge {
    gap: var(--space-1);
    font-weight: 600;
}
.order-status-badge i {
    font-size: 0.75rem;
}
</style>
