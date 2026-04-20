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
    <span :class="['order-status-badge', `osb-${status}`]">
        <i :class="['bi', meta.icon]" aria-hidden="true"></i>
        <span>{{ meta.label }}</span>
    </span>
</template>

<style scoped>
.order-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--paper);
    color: var(--ink-2);
    white-space: nowrap;
}
.order-status-badge i { font-size: 10px; }

.osb-taken {
    background: color-mix(in oklab, var(--ink) 6%, var(--paper));
    color: var(--ink-2);
    border-color: color-mix(in oklab, var(--ink) 16%, transparent);
}
.osb-preparing {
    background: color-mix(in oklab, var(--warn) 12%, var(--paper));
    color: var(--warn);
    border-color: color-mix(in oklab, var(--warn) 28%, transparent);
}
.osb-ready {
    background: color-mix(in oklab, var(--ok) 12%, var(--paper));
    color: var(--ok);
    border-color: color-mix(in oklab, var(--ok) 28%, transparent);
}
.osb-served {
    background: color-mix(in oklab, var(--info) 12%, var(--paper));
    color: var(--info);
    border-color: color-mix(in oklab, var(--info) 28%, transparent);
}
.osb-active {
    background: color-mix(in oklab, var(--ac) 12%, var(--paper));
    color: var(--ac);
    border-color: color-mix(in oklab, var(--ac) 28%, transparent);
}
.osb-closed {
    background: color-mix(in oklab, var(--ink) 6%, var(--paper));
    color: var(--ink-3);
    border-color: var(--line);
}
</style>
