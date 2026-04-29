<script setup>
defineProps({
  filter: { type: String, default: 'all' },
  search: { type: String, default: '' },
  view: { type: String, default: 'grid' },
  counts: { type: Object, required: true },
});

const emit = defineEmits(['update:filter', 'update:search', 'update:view']);
</script>

<template>
  <div class="sl-filters">
    <div class="sl-tabs">
      <button
        type="button"
        class="sl-tab"
        :class="{ active: filter === 'all' }"
        @click="emit('update:filter', 'all')"
      >
        Tutti
        <span class="sl-tab-c">{{ counts.all || 0 }}</span>
      </button>
      <button
        type="button"
        class="sl-tab"
        :class="{ active: filter === 'free' }"
        @click="emit('update:filter', 'free')"
      >
        <span class="sl-tab-dot free"></span>
        Liberi
        <span class="sl-tab-c">{{ counts.free || 0 }}</span>
      </button>
      <button
        type="button"
        class="sl-tab"
        :class="{ active: filter === 'busy' }"
        @click="emit('update:filter', 'busy')"
      >
        <span class="sl-tab-dot busy"></span>
        Occupati
        <span class="sl-tab-c">{{ counts.busy || 0 }}</span>
      </button>
      <button
        type="button"
        class="sl-tab"
        :class="{ active: filter === 'ready' }"
        @click="emit('update:filter', 'ready')"
      >
        <span class="sl-tab-dot ready"></span>
        Da chiudere
        <span class="sl-tab-c">{{ counts.ready || 0 }}</span>
      </button>
      <button
        type="button"
        class="sl-tab"
        :class="{ active: filter === 'res' }"
        @click="emit('update:filter', 'res')"
      >
        <span class="sl-tab-dot res"></span>
        Prenotati
        <span class="sl-tab-c">{{ counts.res || 0 }}</span>
      </button>
    </div>
    <div class="sl-tools">
      <div class="sl-search">
        <i class="bi bi-search"></i>
        <input
          type="text"
          :value="search"
          placeholder="Cerca tavolo, area…"
          @input="emit('update:search', $event.target.value)"
        />
      </div>
    </div>
  </div>
</template>
