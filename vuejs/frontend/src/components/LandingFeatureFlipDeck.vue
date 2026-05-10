<script setup>
import { computed } from 'vue';

const props = defineProps({
  features: { type: Array, required: true },
});

defineEmits(['scene-error']);

const deckStyle = computed(() => {
  const count = Math.max(1, props.features.length);
  return {
    '--feature-depth': `${Math.max(1080, 320 + count * 168)}px`,
    '--feature-depth-tablet': `${Math.max(1040, 300 + count * 158)}px`,
    '--feature-depth-mobile': `${Math.max(1010, 280 + count * 148)}px`,
  };
});

const cardStyle = (index) => ({
  '--feature-index': index,
  '--feature-card-tilt': `${index % 2 ? 0.55 : -0.55}deg`,
  zIndex: 20 + index,
});
</script>

<template>
  <section
    class="feature-stack"
    :style="deckStyle"
    aria-label="Funzionalità operative"
  >
    <div class="feature-stack-heading">
      <slot />
    </div>

    <div class="feature-stack-shell">
      <article
        v-for="(feature, index) in features"
        :key="feature.title"
        class="feature-stack-card"
        :style="cardStyle(index)"
      >
        <div class="feature-stack-icon">
          <i :class="['bi', feature.icon]" aria-hidden="true"></i>
        </div>
        <h3>{{ feature.title }}</h3>
        <p>{{ feature.body }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.feature-stack {
  --feature-sticky-top: 84px;
  --feature-heading-space: clamp(150px, 20vh, 184px);
  min-height: var(--feature-depth);
  padding-bottom: clamp(54px, 10vh, 104px);
}

.feature-stack-heading {
  position: sticky;
  top: var(--feature-sticky-top);
  z-index: 35;
  min-height: var(--feature-heading-space);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  pointer-events: none;
}

.feature-stack-heading :deep(.public-section-h) {
  width: 100%;
  margin: 0 auto;
  pointer-events: auto;
}

.feature-stack-shell {
  max-width: 730px;
  margin: 0 auto;
  padding: 0 0 24px;
  perspective: 1200px;
}

.feature-stack-card {
  position: sticky;
  top: calc(var(--feature-sticky-top) + var(--feature-heading-space) + (var(--feature-index) * 10px));
  min-height: clamp(140px, 21vh, 178px);
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  margin-top: -8px;
  padding: 18px 24px 18px 26px;
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--line) 86%, transparent);
  border-radius: 14px;
  background:
    linear-gradient(135deg, color-mix(in oklab, var(--paper) 96%, white 4%), var(--paper)),
    var(--paper);
  box-shadow:
    0 22px 58px -32px rgb(0 0 0 / 0.34),
    var(--shadow-xs);
  transform:
    rotateX(2deg)
    rotateZ(var(--feature-card-tilt))
    translateY(calc(var(--feature-index) * 2px));
  transform-origin: center top;
  transition: transform var(--dur), box-shadow var(--dur), border-color var(--dur);
}

.feature-stack-card:first-child {
  margin-top: 0;
}

.feature-stack-card::before {
  content: '';
  position: absolute;
  inset: 16px auto 16px 0;
  width: 5px;
  border-radius: 0 999px 999px 0;
  background: var(--ac);
  opacity: 0.92;
}

.feature-stack-card:hover {
  border-color: color-mix(in oklab, var(--ac) 30%, var(--line));
  box-shadow:
    0 26px 64px -34px rgb(0 0 0 / 0.4),
    var(--shadow-sm);
  transform:
    rotateX(1.4deg)
    rotateZ(var(--feature-card-tilt))
    translateY(calc(var(--feature-index) * 2px - 2px));
}

.feature-stack-icon {
  grid-row: 1 / span 2;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--ac-soft);
  color: var(--ac);
  font-size: 21px;
  margin: 0;
}

.feature-stack-card h3 {
  grid-column: 2;
  margin: 0 0 7px;
  color: var(--ink);
  font-size: 20px;
  line-height: 1.18;
  letter-spacing: 0;
  font-weight: 650;
}

.feature-stack-card p {
  grid-column: 2;
  margin: 0;
  color: var(--ink-2);
  font-size: 14.5px;
  line-height: 1.55;
}

@media (max-width: 900px) {
  .feature-stack {
    --feature-sticky-top: 72px;
    --feature-heading-space: clamp(140px, 20vh, 174px);
    min-height: var(--feature-depth-tablet);
  }

  .feature-stack-shell {
    width: min(680px, calc(100vw - 32px));
  }

  .feature-stack-card {
    top: calc(var(--feature-sticky-top) + var(--feature-heading-space) + (var(--feature-index) * 10px));
    min-height: clamp(136px, 20vh, 168px);
    padding: 17px 22px;
  }
}

@media (max-width: 520px) {
  .feature-stack {
    --feature-heading-space: clamp(140px, 21vh, 176px);
    min-height: var(--feature-depth-mobile);
    margin-top: 8px;
  }

  .feature-stack-card {
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 13px;
    min-height: 142px;
    margin-top: -8px;
    padding: 16px 17px 16px 19px;
  }

  .feature-stack-icon {
    width: 40px;
    height: 40px;
    font-size: 19px;
  }

  .feature-stack-card h3 {
    font-size: 18px;
  }

  .feature-stack-card p {
    font-size: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feature-stack {
    min-height: 0;
    padding-bottom: 0;
  }

  .feature-stack-heading {
    position: relative;
    top: auto;
    min-height: 0;
    margin-bottom: 24px;
  }

  .feature-stack-shell {
    display: grid;
    gap: 12px;
  }

  .feature-stack-card {
    position: relative;
    top: auto;
    min-height: 0;
    margin-top: 0;
    transform: none;
  }

  .feature-stack-card:hover {
    transform: none;
  }
}
</style>
