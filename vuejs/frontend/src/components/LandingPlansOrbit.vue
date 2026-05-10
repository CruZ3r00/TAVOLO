<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  plans: { type: Array, required: true },
});

defineEmits(['scene-error']);

const root = ref(null);
const progress = ref(0);
const isCompact = ref(false);
const compactSwapDistance = ref(620);

let resizeObserver = null;
let removeResizeListener = null;
let removeScrollListener = null;
let removeVisibilityListener = null;
let frameId = 0;
let running = false;
let targetProgress = 0;
let smoothProgress = 0;
let viewportWidth = 1;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (t) => t * t * (3 - 2 * t);

const highlightedCtaStyle = {
  background: 'var(--ac)',
  borderColor: 'var(--ac)',
  color: 'var(--paper)',
  boxShadow: 'var(--shadow-sm)',
};

const rootStyle = computed(() => ({
  '--plan-depth': isCompact.value ? '218vh' : '196vh',
}));

const exchangePhase = (value = progress.value) => {
  const phase = clamp(value);
  if (phase <= 0.5) return smoothstep(phase / 0.5);
  return 1 - smoothstep((phase - 0.5) / 0.5);
};

const compactCardState = (index, value = progress.value) => {
  const exchange = exchangePhase(value);
  const direction = index === 0 ? 1 : -1;
  const distance = compactSwapDistance.value;
  const visualCompensation = Math.max(64, Math.min(92, distance * 0.14)) * exchange;
  return {
    y: direction * distance * exchange + visualCompensation,
    tilt: direction * -0.55 * exchange,
    rotateX: direction * -1.8 * exchange,
    scale: 1,
    opacity: 1,
    zIndex: index === 1 && exchange > 0.34 ? 42 : 32 - index,
  };
};

const orbitCardState = (index, value = progress.value) => {
  const exchange = exchangePhase(value);
  const direction = index === 0 ? 1 : -1;
  const distance = Math.max(360, Math.min(590, viewportWidth * 0.505));
  const rotateY = direction * -18 * exchange;
  const rotateZ = direction * 1.15 * exchange;
  const lift = -18 * Math.sin(Math.PI * clamp(value));
  const z = 72 * exchange;

  return {
    x: direction * distance * exchange,
    y: lift,
    z,
    rotateY,
    rotateZ,
    scale: 1 - exchange * 0.014,
    opacity: 1,
    zIndex: index === 1 && exchange > 0.34 ? 42 : 32 - index,
  };
};

const planCards = computed(() => props.plans.map((plan, index) => {
  if (isCompact.value) {
    const state = compactCardState(index);
    return {
      plan,
      ctaStyle: plan.highlighted ? highlightedCtaStyle : null,
      style: {
        '--plan-mobile-y': `${state.y}px`,
        '--plan-mobile-tilt': `${state.tilt}deg`,
        '--plan-mobile-rotate-x': `${state.rotateX}deg`,
        '--plan-mobile-scale': state.scale.toFixed(3),
        opacity: state.opacity.toFixed(3),
        zIndex: state.zIndex,
      },
    };
  }

  const state = orbitCardState(index);
  return {
    plan,
    ctaStyle: plan.highlighted ? highlightedCtaStyle : null,
    style: {
      transform: `translate3d(${state.x}px, ${state.y}px, ${state.z}px) rotateY(${state.rotateY}deg) rotateZ(${state.rotateZ}deg) scale(${state.scale.toFixed(3)})`,
      opacity: state.opacity.toFixed(3),
      zIndex: state.zIndex,
    },
  };
}));

const getStickyTop = () => (window.innerWidth < 900 ? 72 : 84);

const updateScrollProgress = () => {
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const scrollable = Math.max(1, rect.height - window.innerHeight);
  targetProgress = clamp((getStickyTop() - rect.top) / scrollable);
};

const resize = () => {
  const el = root.value;
  viewportWidth = el?.clientWidth || window.innerWidth || 1;
  isCompact.value = window.innerWidth < 620;
  const cards = el?.querySelectorAll?.('.plan-orbit-grid > .public-plan') || [];
  if (cards.length >= 2) {
    const measuredDistance = cards[1].offsetTop - cards[0].offsetTop;
    if (measuredDistance > 0) {
      compactSwapDistance.value = Math.max(360, Math.min(760, measuredDistance));
    }
  }
  updateScrollProgress();
};

const animate = () => {
  if (!running) return;
  smoothProgress += (targetProgress - smoothProgress) * 0.12;
  progress.value = smoothProgress;
  frameId = window.requestAnimationFrame(animate);
};

const startLoop = () => {
  if (running) return;
  running = true;
  frameId = window.requestAnimationFrame(animate);
};

const stopLoop = () => {
  running = false;
  if (frameId) window.cancelAnimationFrame(frameId);
  frameId = 0;
};

const cleanup = () => {
  stopLoop();
  resizeObserver?.disconnect?.();
  removeResizeListener?.();
  removeScrollListener?.();
  removeVisibilityListener?.();
};

const setupMotion = () => {
  const el = root.value;
  if (!el) return;

  resize();

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(el);
  } else {
    window.addEventListener('resize', resize, { passive: true });
    removeResizeListener = () => window.removeEventListener('resize', resize);
  }

  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  removeScrollListener = () => window.removeEventListener('scroll', updateScrollProgress);

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') stopLoop();
    else startLoop();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  removeVisibilityListener = () => document.removeEventListener('visibilitychange', handleVisibility);

  startLoop();
};

onMounted(setupMotion);
onBeforeUnmount(cleanup);
</script>

<template>
  <section
    ref="root"
    class="plan-orbit"
    :class="{ 'is-compact': isCompact }"
    :style="rootStyle"
    aria-label="Piani di abbonamento"
  >
    <div class="plan-orbit-stage">
      <div class="plan-orbit-heading">
        <slot />
      </div>

      <div class="plan-orbit-grid">
        <article
          v-for="item in planCards"
          :key="item.plan.key"
          class="public-plan"
          :class="{ 'public-plan-highlight': item.plan.highlighted }"
          :style="item.style"
        >
          <div v-if="item.plan.highlighted" class="public-plan-tag">Consigliato</div>
          <div class="public-plan-label">{{ item.plan.label }}</div>
          <h3>{{ item.plan.name }}</h3>
          <div class="public-plan-price">
            <span>{{ item.plan.price }}</span>
            <small>{{ item.plan.period }}</small>
          </div>
          <p>{{ item.plan.body }}</p>
          <div class="public-plan-focus">{{ item.plan.focus }}</div>
          <ul>
            <li v-for="feature in item.plan.features" :key="feature">
              <i class="bi bi-check2" aria-hidden="true"></i>
              <span>{{ feature }}</span>
            </li>
          </ul>
          <div v-if="item.plan.note" class="public-plan-note">{{ item.plan.note }}</div>
          <router-link
            to="/register"
            class="btn btn-lg btn-pill"
            :class="{ 'btn-accent': item.plan.highlighted }"
            :style="item.ctaStyle"
          >
            Iscriviti ora
          </router-link>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.plan-orbit {
  --plan-sticky-top: 84px;
  --plan-heading-space: clamp(108px, 14vh, 132px);
  min-height: var(--plan-depth);
}

.plan-orbit-stage {
  position: sticky;
  top: var(--plan-sticky-top);
  min-height: calc(100vh - var(--plan-sticky-top) - 10px);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: clamp(6px, 1.4vh, 14px) 0 clamp(30px, 6vh, 64px);
  overflow: hidden;
}

.plan-orbit-heading {
  position: relative;
  z-index: 2;
  min-height: var(--plan-heading-space);
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.plan-orbit-heading :deep(.public-section-h) {
  width: 100%;
  margin: 0 auto;
}

.plan-orbit-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: stretch;
  perspective: 1500px;
  transform-style: preserve-3d;
  isolation: isolate;
}

.public-plan {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 24px;
  box-shadow: var(--shadow-xs);
  will-change: transform, opacity;
  transform-origin: center center;
  backface-visibility: hidden;
}

.public-plan-highlight {
  border-color: color-mix(in oklab, var(--ac) 45%, var(--line));
  box-shadow: var(--shadow-md);
}

.public-plan-tag {
  position: absolute;
  top: 18px;
  right: 18px;
  background: var(--ac);
  color: var(--paper);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.public-plan-label {
  color: var(--ink-3);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.public-plan h3 {
  margin: 0 0 9px;
  color: var(--ink);
  font-size: 26px;
  letter-spacing: 0;
  font-weight: 650;
}

.public-plan-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 10px;
}

.public-plan-price span {
  color: var(--ink);
  font-size: 31px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0;
}

.public-plan-price small {
  color: var(--ink-3);
  font-size: 14px;
}

.public-plan p {
  margin: 0 0 12px;
  color: var(--ink-2);
  font-size: 15px;
  line-height: 1.55;
}

.public-plan-focus,
.public-plan-note {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-sunk);
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.45;
  padding: 10px 12px;
}

.public-plan-focus {
  margin-bottom: 14px;
}

.public-plan-note {
  margin: 0 0 16px;
}

.public-plan ul {
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
  display: grid;
  gap: 7px;
}

.public-plan li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--ink-2);
  font-size: 14px;
}

.public-plan li i {
  color: var(--ok);
  margin-top: 2px;
}

.public-plan :deep(.btn) {
  margin-top: auto;
  align-self: flex-start;
}

.public-plan-highlight .btn,
.public-plan-highlight :deep(.btn) {
  background: var(--ac);
  border-color: var(--ac);
  color: var(--paper);
  box-shadow: var(--shadow-sm);
}

.public-plan-highlight .btn:hover,
.public-plan-highlight :deep(.btn:hover) {
  background: color-mix(in oklab, var(--ac) 88%, black 12%);
  border-color: color-mix(in oklab, var(--ac) 88%, black 12%);
  color: var(--paper);
}

.plan-orbit.is-compact {
  --plan-sticky-top: 72px;
  --plan-heading-space: clamp(136px, 20vh, 174px);
}

.plan-orbit.is-compact .plan-orbit-stage {
  min-height: calc(100vh - var(--plan-sticky-top));
  align-items: center;
  padding-top: 10px;
  overflow: visible;
}

.plan-orbit.is-compact .plan-orbit-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  width: min(560px, calc(100vw - 24px));
  min-height: 0;
  perspective: 1200px;
  overflow: visible;
}

.plan-orbit.is-compact .public-plan {
  position: relative;
  inset: auto;
  min-height: 0;
  transform:
    translate3d(0, var(--plan-mobile-y), 0)
    rotateX(var(--plan-mobile-rotate-x))
    rotateZ(var(--plan-mobile-tilt))
    scale(var(--plan-mobile-scale));
}

@media (max-width: 520px) {
  .public-plan {
    padding: 18px;
  }

  .public-plan h3 {
    font-size: 22px;
  }

  .public-plan-price span {
    font-size: 27px;
  }

  .public-plan p,
  .public-plan li {
    font-size: 13px;
  }

  .public-plan-focus,
  .public-plan-note {
    font-size: 12.5px;
    padding: 8px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .plan-orbit {
    min-height: 0;
  }

  .plan-orbit-stage {
    position: relative;
    top: auto;
    min-height: 0;
    display: block;
    overflow: visible;
    padding: 0;
  }

  .plan-orbit-heading {
    min-height: 0;
    margin-bottom: 24px;
  }

  .plan-orbit-grid,
  .plan-orbit.is-compact .plan-orbit-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-height: 0;
  }

  .public-plan,
  .plan-orbit.is-compact .public-plan {
    position: relative;
    opacity: 1 !important;
    transform: none !important;
  }
}

@media (prefers-reduced-motion: reduce) and (max-width: 820px) {
  .plan-orbit-grid,
  .plan-orbit.is-compact .plan-orbit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
