<script setup>
// NavItem: voce di navigazione usata in AppSidebar (e MobileDrawer via riuso).
// router-link active-class fornisce lo stato attivo. La barra accent a sinistra
// è in CSS via ::before sull'.is-active.
//
// Usato anche per item non-route via prop `as="button"` + emit 'click'.

defineProps({
  // route target (router-link). Se omesso e `as=button`, è un button.
  to: { type: [String, Object], default: '' },
  // 'router-link' (default) | 'button'
  as: { type: String, default: 'router-link' },
  icon: { type: String, default: '' },
  label: { type: String, required: true },
  // contatore mostrato come pill mono. Stringa o numero. Falsy → niente badge.
  badge: { type: [Number, String], default: null },
  // colore custom del badge (default var(--ink)). Es. var(--ac) per evidenziare.
  badgeColor: { type: String, default: '' },
  // pill "PRO" se piano starter. Mostrata solo se non c'è badge.
  pro: { type: Boolean, default: false },
  // scorciatoia tastiera. Mostrata come kbd se non c'è né badge né pro.
  shortcut: { type: String, default: '' },
  // forza is-active anche per button (router-link la calcola da solo).
  active: { type: Boolean, default: false },
  // applica colore danger (es. logout)
  danger: { type: Boolean, default: false },
});

defineEmits(['click']);

const showBadge = (badge) => badge !== null && badge !== undefined && badge !== '' && badge !== 0;
</script>

<template>
  <router-link
    v-if="as === 'router-link' && to"
    :to="to"
    class="nav-item"
    :class="{ 'is-active': active, 'is-danger': danger }"
    active-class="is-active"
  >
    <i v-if="icon" :class="['bi', icon]" aria-hidden="true"></i>
    <span class="nav-item-label">{{ label }}</span>
    <span
      v-if="showBadge(badge)"
      class="nav-item-badge"
      :style="badgeColor ? { background: badgeColor } : null"
    >{{ badge }}</span>
    <span v-else-if="pro" class="nav-item-pro">PRO</span>
    <kbd v-else-if="shortcut" class="nav-item-kbd">{{ shortcut }}</kbd>
  </router-link>

  <button
    v-else
    type="button"
    class="nav-item"
    :class="{ 'is-active': active, 'is-danger': danger }"
    @click="$emit('click', $event)"
  >
    <i v-if="icon" :class="['bi', icon]" aria-hidden="true"></i>
    <span class="nav-item-label">{{ label }}</span>
    <span
      v-if="showBadge(badge)"
      class="nav-item-badge"
      :style="badgeColor ? { background: badgeColor } : null"
    >{{ badge }}</span>
    <span v-else-if="pro" class="nav-item-pro">PRO</span>
    <kbd v-else-if="shortcut" class="nav-item-kbd">{{ shortcut }}</kbd>
  </button>
</template>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-sans);
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none;
  text-align: left;
  cursor: pointer;
  position: relative;
  width: 100%;
  transition: background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast);
}

.nav-item:hover { background: var(--bg-hover); color: var(--ink); }

.nav-item.is-active {
  background: var(--paper);
  color: var(--ink);
  font-weight: 600;
  box-shadow: var(--shadow-xs);
}
.nav-item.is-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: var(--ac);
  border-radius: 0 3px 3px 0;
}

.nav-item.is-danger { color: var(--danger); }
.nav-item.is-danger i { color: var(--danger); }
.nav-item.is-danger:hover { background: color-mix(in oklab, var(--danger) 10%, transparent); color: var(--danger); }

.nav-item i {
  font-size: 14px;
  width: 18px;
  text-align: center;
  opacity: 0.75;
  flex-shrink: 0;
}
.nav-item.is-active i { opacity: 1; }
.nav-item-label { flex: 1; min-width: 0; }

.nav-item-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-family: var(--f-mono);
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
}

.nav-item-pro {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ac-soft);
  color: var(--ac-ink);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.nav-item-kbd {
  font-family: var(--f-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper);
  color: var(--ink-3);
  opacity: 0;
  transition: opacity var(--dur-fast);
  flex-shrink: 0;
}
.nav-item:hover .nav-item-kbd { opacity: 1; }
</style>
