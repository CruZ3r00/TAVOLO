<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';

const props = defineProps({
  features: { type: Array, required: true },
});
const emit = defineEmits(['scene-error']);

const root = ref(null);
const host = ref(null);
const frontFeatureIndex = ref(0);
const backFeatureIndex = ref(1);
const flipAmount = ref(0);

let renderer = null;
let scene = null;
let camera = null;
let sheet = null;
let resizeObserver = null;
let removeResizeListener = null;
let removeScrollListener = null;
let removeVisibilityListener = null;
let themeObserver = null;
let frameId = 0;
let running = false;
let targetProgress = 0;
let smoothProgress = 0;
let viewportWidth = 1;
let viewportHeight = 1;

const disposables = [];
const materials = [];
const accents = ['red', 'green', 'blue', 'amber', 'red', 'green', 'blue'];
const pauseRatio = 0.24;
const totalSteps = computed(() => Math.max(1, props.features.length - 1));
const deckStyle = computed(() => {
  const count = Math.max(4, props.features.length);
  return {
    '--feature-depth': `${count * 92}vh`,
    '--feature-depth-tablet': `${count * 98}vh`,
    '--feature-depth-mobile': `${count * 108}vh`,
  };
});
const flipStyle = computed(() => ({
  '--flip-angle': `${flipAmount.value * -180}deg`,
  '--flip-shadow-y': `${18 + Math.sin(flipAmount.value * Math.PI) * 10}px`,
}));
const frontFeature = computed(() => props.features[frontFeatureIndex.value] || props.features[0] || {});
const backFeature = computed(() => props.features[backFeatureIndex.value] || frontFeature.value);
const visibleFeatureIndex = computed(() => (
  flipAmount.value < 0.5 ? frontFeatureIndex.value : backFeatureIndex.value
));

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (t) => t * t * (3 - 2 * t);

const track = (item) => {
  disposables.push(item);
  return item;
};

const getPalette = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark
    ? {
        paper: 0x2b3039,
        paperBack: 0x222730,
        edge: 0x505865,
        red: 0xe86b56,
        green: 0x38b983,
        amber: 0xf1b950,
        blue: 0x6aa9ff,
      }
    : {
        paper: 0xffffff,
        paperBack: 0xf4eee5,
        edge: 0xd9cec2,
        red: 0xdc5f49,
        green: 0x2f9d73,
        amber: 0xf0b44c,
        blue: 0x4f86d9,
      };
};

const registerMaterial = (material, key = null, emissiveKey = null) => {
  material.userData.paletteKey = key;
  material.userData.emissiveKey = emissiveKey;
  materials.push(material);
  return material;
};

const makeMat = (key, options = {}) => {
  const palette = getPalette();
  const material = track(new THREE.MeshStandardMaterial({
    color: palette[key],
    roughness: 0.82,
    metalness: 0.04,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissiveKey ? palette[options.emissiveKey] : 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  }));
  return registerMaterial(material, key, options.emissiveKey || null);
};

const syncPalette = () => {
  const palette = getPalette();
  materials.forEach((material) => {
    const key = material.userData.paletteKey;
    const emissiveKey = material.userData.emissiveKey;
    if (key && palette[key]) material.color.setHex(palette[key]);
    if (emissiveKey && palette[emissiveKey] && material.emissive) material.emissive.setHex(palette[emissiveKey]);
  });
};

const buildSheet = (width, height, accentKey) => {
  const group = new THREE.Group();
  const edge = makeMat('edge');
  const front = makeMat('paper');
  const back = makeMat('paperBack');
  const page = new THREE.Mesh(
    track(new THREE.BoxGeometry(width, height, 0.055, 12, 12, 1)),
    [edge, edge, edge, edge, front, back]
  );
  group.add(page);

  const accent = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.075, height * 0.92, 0.064)),
    makeMat(accentKey, { emissiveKey: accentKey, emissiveIntensity: 0.09 })
  );
  accent.position.set(-width * 0.47, 0, 0.018);
  group.add(accent);

  const backAccent = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.075, height * 0.92, 0.064)),
    makeMat(accentKey, { emissiveKey: accentKey, emissiveIntensity: 0.09 })
  );
  backAccent.position.set(width * 0.47, 0, -0.018);
  group.add(backAccent);

  group.userData.accent = accent;
  group.userData.backAccent = backAccent;
  return group;
};

const setSheetAccent = (key) => {
  const palette = getPalette();
  [sheet?.userData?.accent, sheet?.userData?.backAccent].forEach((mesh) => {
    if (!mesh?.material || !palette[key]) return;
    mesh.material.userData.paletteKey = key;
    mesh.material.userData.emissiveKey = key;
    mesh.material.color.setHex(palette[key]);
    mesh.material.emissive?.setHex(palette[key]);
  });
};

const progressParts = (progress) => {
  if (props.features.length <= 1) {
    return { baseIndex: 0, flip: 0 };
  }

  const total = totalSteps.value;
  const raw = progress * total;
  const baseIndex = Math.min(total - 1, Math.floor(raw));
  const phase = clamp(raw - baseIndex);
  const flip = smoothstep(clamp((phase - pauseRatio) / (1 - pauseRatio * 2)));
  return { baseIndex, flip };
};

const updateScrollProgress = () => {
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const scrollable = Math.max(1, rect.height - window.innerHeight);
  targetProgress = clamp((-rect.top + window.innerHeight * 0.08) / scrollable);
};

const resize = () => {
  const el = host.value;
  if (!el || !renderer || !camera) return;
  viewportWidth = el.clientWidth || 1;
  viewportHeight = el.clientHeight || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, viewportWidth < 720 ? 1.2 : 1.55));
  renderer.setSize(viewportWidth, viewportHeight, false);
  camera.aspect = viewportWidth / viewportHeight;
  camera.fov = viewportWidth < 720 ? 33 : 29;
  camera.position.z = viewportWidth < 720 ? 6.4 : 5.7;
  camera.updateProjectionMatrix();
  updateScrollProgress();
};

const animate = () => {
  if (!running || !renderer || !scene || !camera || !sheet) return;
  smoothProgress += (targetProgress - smoothProgress) * 0.1;
  const { baseIndex, flip } = progressParts(smoothProgress);
  const nextIndex = Math.min(props.features.length - 1, baseIndex + 1);
  frontFeatureIndex.value = baseIndex;
  backFeatureIndex.value = nextIndex;
  flipAmount.value = flip;

  setSheetAccent(accents[(flip < 0.5 ? baseIndex : nextIndex) % accents.length]);
  sheet.rotation.set(0, -flip * Math.PI, 0);
  sheet.position.set(0, 0, -0.1 + Math.sin(flip * Math.PI) * 0.04);

  renderer.render(scene, camera);
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
  themeObserver?.disconnect?.();
  if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  disposables.forEach((item) => item?.dispose?.());
  renderer?.dispose?.();
  renderer?.forceContextLoss?.();
  renderer = null;
  scene = null;
  camera = null;
};

const createScene = () => {
  const el = host.value;
  if (!el) return;

  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(29, 1, 0.1, 100);
    camera.position.set(0, 0, 5.7);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: (window.devicePixelRatio || 1) <= 1.75,
      powerPreference: 'default',
    });
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd4c6b8, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.8, 2.8, 4.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xdc5f49, 0.52);
    rim.position.set(-2.4, 1.4, 3.4);
    scene.add(rim);

    sheet = buildSheet(3.28, 2.18, accents[0]);
    scene.add(sheet);

    updateScrollProgress();
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

    if ('MutationObserver' in window) {
      themeObserver = new MutationObserver(syncPalette);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    startLoop();
  } catch (error) {
    console.warn('Landing feature flip fallback', error);
    cleanup();
    emit('scene-error');
  }
};

onMounted(createScene);
onBeforeUnmount(cleanup);
</script>

<template>
  <section
    ref="root"
    class="feature-flip"
    :style="deckStyle"
    aria-label="Funzionalità operative"
  >
    <ul class="feature-flip-readable">
      <li v-for="feature in features" :key="`read-${feature.title}`">
        <strong>{{ feature.title }}</strong>
        <span>{{ feature.body }}</span>
      </li>
    </ul>

    <div class="feature-flip-stage" aria-hidden="true">
      <div class="feature-flip-shell" :style="flipStyle">
        <div ref="host" class="feature-flip-canvas"></div>
        <div class="feature-flip-card-frame">
          <div class="feature-flip-card-rotor">
            <article class="feature-flip-face is-front" :key="`front-${frontFeatureIndex}`">
              <div class="feature-flip-card-inner">
                <div class="feature-flip-icon">
                  <i :class="['bi', frontFeature.icon]" aria-hidden="true"></i>
                </div>
                <div class="feature-flip-count">{{ frontFeatureIndex + 1 }} / {{ features.length }}</div>
                <h3>{{ frontFeature.title }}</h3>
                <p>{{ frontFeature.body }}</p>
              </div>
            </article>

            <article class="feature-flip-face is-back" :key="`back-${backFeatureIndex}`">
              <div class="feature-flip-card-inner">
                <div class="feature-flip-icon">
                  <i :class="['bi', backFeature.icon]" aria-hidden="true"></i>
                </div>
                <div class="feature-flip-count">{{ backFeatureIndex + 1 }} / {{ features.length }}</div>
                <h3>{{ backFeature.title }}</h3>
                <p>{{ backFeature.body }}</p>
              </div>
            </article>
          </div>
        </div>
        <div class="feature-flip-progress">
          <span
            v-for="(feature, index) in features"
            :key="`dot-${feature.title}`"
            :class="{ 'is-active': visibleFeatureIndex === index }"
          ></span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.feature-flip {
  min-height: var(--feature-depth);
  margin-top: 0;
}

.feature-flip-readable {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.feature-flip-stage {
  position: sticky;
  top: 68px;
  min-height: calc(100vh - 78px);
  display: grid;
  justify-items: center;
  align-items: start;
  padding-top: clamp(8px, 2.4vh, 18px);
}

.feature-flip-shell {
  position: relative;
  width: min(590px, calc(100vw - 48px));
  height: clamp(310px, 43vh, 370px);
  display: grid;
  place-items: center;
  perspective: 1450px;
}

.feature-flip-canvas {
  position: absolute;
  inset: -18px;
  z-index: 0;
  opacity: 0.58;
}

.feature-flip-canvas :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}

.feature-flip-card-frame {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  perspective: 1450px;
}

.feature-flip-card-rotor {
  position: relative;
  width: 100%;
  height: 100%;
  transform: rotateY(var(--flip-angle));
  transform-style: preserve-3d;
  will-change: transform;
}

.feature-flip-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  transform-style: preserve-3d;
  -webkit-backface-visibility: hidden;
}

.feature-flip-face.is-front {
  transform: translateZ(1px);
}

.feature-flip-face.is-back {
  transform: rotateY(180deg) translateZ(1px);
}

.feature-flip-card-inner {
  position: relative;
  height: 100%;
  padding: 22px;
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--line) 82%, transparent);
  border-radius: 14px;
  background: var(--paper);
  box-shadow:
    0 var(--flip-shadow-y) 48px -30px rgb(0 0 0 / 0.34),
    var(--shadow-xs);
  display: flex;
  flex-direction: column;
  justify-content: center;
  transform: translateZ(0);
  text-rendering: geometricPrecision;
}

.feature-flip-card-inner::before {
  content: '';
  position: absolute;
  inset: 18px auto 18px 0;
  width: 5px;
  border-radius: 0 999px 999px 0;
  background: var(--ac);
  opacity: 0.92;
}

.feature-flip-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--ac-soft);
  color: var(--ac);
  font-size: 20px;
  margin-bottom: 14px;
}

.feature-flip-count {
  position: absolute;
  top: 22px;
  right: 22px;
  font-family: var(--f-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-3);
}

.feature-flip-face h3 {
  margin: 0 0 8px;
  color: var(--ink);
  font-size: 22px;
  line-height: 1.18;
  letter-spacing: 0;
  font-weight: 650;
}

.feature-flip-face p {
  margin: 0;
  color: var(--ink-2);
  font-size: 15px;
  line-height: 1.55;
}

.feature-flip-progress {
  position: absolute;
  left: 50%;
  bottom: -26px;
  z-index: 2;
  display: flex;
  gap: 7px;
  transform: translateX(-50%);
}

.feature-flip-progress span {
  width: 18px;
  height: 6px;
  display: grid;
  place-items: center;
}

.feature-flip-progress span::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ink) 18%, transparent);
  transition: width 140ms ease, background-color 140ms ease;
}

.feature-flip-progress span.is-active::before {
  width: 18px;
  background: var(--ac);
}

@media (max-width: 900px) {
  .feature-flip {
    min-height: var(--feature-depth-tablet);
  }

  .feature-flip-stage {
    top: 56px;
    min-height: calc(100vh - 64px);
    padding-top: clamp(6px, 2vh, 14px);
  }

  .feature-flip-shell {
    width: min(560px, calc(100vw - 32px));
    height: clamp(292px, 42vh, 342px);
  }

  .feature-flip-card-inner {
    padding: 20px;
  }
}

@media (max-width: 520px) {
  .feature-flip {
    min-height: var(--feature-depth-mobile);
    margin-top: 8px;
  }

  .feature-flip-shell {
    height: 302px;
  }

  .feature-flip-canvas {
    inset: -14px;
  }

  .feature-flip-card-inner {
    padding: 18px;
  }

  .feature-flip-count {
    top: 18px;
    right: 18px;
  }

  .feature-flip-face h3 {
    font-size: 19px;
  }

  .feature-flip-face p {
    font-size: 14px;
  }
}
</style>
