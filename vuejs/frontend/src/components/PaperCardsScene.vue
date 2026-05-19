<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
/* global __MODERN__ */

const props = defineProps({
  variant: { type: String, default: 'team' },
  height: { type: Number, default: 320 },
});

const emit = defineEmits(['scene-error']);
const host = ref(null);

let renderer = null;
let rafId = null;
let running = false;
let resizeObserver = null;
let themeObserver = null;
const cardMeshes = [];
const cardMaterials = [];

const getPalette = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark
    ? { bg: 0x171a20, paper: 0x2b3039, line: 0x4a505b, ink: 0xf7f2eb, ac: 0xe86b56 }
    : { bg: 0xfbfaf8, paper: 0xffffff, line: 0xd8cec2, ink: 0x2d2824, ac: 0xc84f4b };
};

const syncTheme = () => {
  const p = getPalette();
  cardMaterials.forEach((m) => {
    if (m.userData.isAccent) m.color.setHex(p.ac);
    else if (m.userData.isPaper) m.color.setHex(p.paper);
    else if (m.userData.isLine) m.color.setHex(p.line);
    else if (m.userData.isBg) m.color.setHex(p.bg);
    else if (m.userData.isInk) m.color.setHex(p.ink);
  });
};

const trackMat = (mat, flags) => {
  Object.assign(mat.userData, flags);
  cardMaterials.push(mat);
  return mat;
};

const cleanup = () => {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  resizeObserver?.disconnect?.();
  themeObserver?.disconnect?.();
  if (renderer?.domElement?.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  renderer?.dispose?.();
  renderer = null;
  cardMeshes.length = 0;
  cardMaterials.length = 0;
};

const createScene = async () => {
  if (!__MODERN__) { emit('scene-error'); return; }
  const el = host.value;
  if (!el) return;

  try {
    const THREE = await import('three').catch(() => null);
    if (!THREE) { emit('scene-error'); return; }
    const palette = getPalette();
    const w = el.clientWidth || 600;
    const h = props.height;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(palette.bg, 18, 38);

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 6, 14);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 6);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(palette.ac, 0.25);
    fill.position.set(-4, 4, 4);
    scene.add(fill);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = trackMat(
      new THREE.MeshStandardMaterial({ color: palette.bg, roughness: 0.95, metalness: 0 }),
      { isBg: true }
    );
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2;
    scene.add(floor);

    // Card specs per variant
    const isTeam = props.variant === 'team';
    const specs = isTeam
      ? [
          { x: -3.6, y: 0.5, z: 0, rot: -0.15, scale: 1.1, accent: true },
          { x: 0, y: 1.2, z: -1.5, rot: 0.08, scale: 1.3, accent: false },
          { x: 3.6, y: 0.3, z: 0.4, rot: 0.18, scale: 1.05, accent: true },
          { x: -2.2, y: -0.8, z: 2.4, rot: -0.05, scale: 0.85, accent: false },
          { x: 2.0, y: -0.6, z: 2.6, rot: 0.1, scale: 0.85, accent: false },
        ]
      : [
          { x: -3.2, y: 0.8, z: 0, rot: -0.2, scale: 1.0, accent: false },
          { x: 0, y: 1.5, z: -1.0, rot: 0.05, scale: 1.4, accent: true },
          { x: 3.4, y: 0.4, z: 0.6, rot: 0.22, scale: 1.0, accent: false },
          { x: -1.8, y: -0.7, z: 2.6, rot: -0.08, scale: 0.8, accent: false },
          { x: 2.4, y: -0.9, z: 2.4, rot: 0.12, scale: 0.8, accent: false },
        ];

    const groups = [];
    specs.forEach((spec, i) => {
      const group = new THREE.Group();

      const cardGeo = new THREE.BoxGeometry(2.6, 0.08, 1.7);
      const cardMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: spec.accent ? palette.ac : palette.paper,
          roughness: 0.6, metalness: 0.05,
        }),
        spec.accent ? { isAccent: true } : { isPaper: true }
      );
      group.add(new THREE.Mesh(cardGeo, cardMat));

      // Edge highlight
      const edgeGeo = new THREE.EdgesGeometry(cardGeo);
      const edgeMat = trackMat(
        new THREE.LineBasicMaterial({
          color: spec.accent ? palette.ac : palette.line,
          transparent: true, opacity: 0.7,
        }),
        spec.accent ? { isAccent: true } : { isLine: true }
      );
      group.add(new THREE.LineSegments(edgeGeo, edgeMat));

      // Decoration lines
      const lineColor = spec.accent ? 0xffffff : palette.line;
      const lineFlagKey = spec.accent ? {} : { isLine: true };
      [[1.2, 0.2, -0.25], [0.84, 0.05, 0], [0.66, -0.05, 0.25]].forEach(([w2, ox, oz]) => {
        const lineMat = trackMat(
          new THREE.MeshBasicMaterial({ color: lineColor, transparent: true, opacity: 0.55 }),
          lineFlagKey
        );
        const lineMesh = new THREE.Mesh(new THREE.PlaneGeometry(w2, 0.06), lineMat);
        lineMesh.rotation.x = -Math.PI / 2;
        lineMesh.position.set(ox, 0.045, oz);
        group.add(lineMesh);
      });

      group.position.set(spec.x, spec.y, spec.z);
      group.rotation.x = -0.05;
      group.rotation.z = spec.rot;
      group.scale.setScalar(spec.scale);
      group.userData = { baseY: spec.y, baseRotZ: spec.rot, phase: i * 1.26 };
      scene.add(group);
      groups.push(group);
    });

    // Particles
    const pCount = 40;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 14;
      pPos[i * 3 + 1] = Math.random() * 5;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = trackMat(
      new THREE.PointsMaterial({ color: palette.ink, size: 0.04, transparent: true, opacity: 0.22 }),
      { isInk: true }
    );
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    let frame = 0;
    running = true;

    const animate = () => {
      if (!running || !renderer) return;
      frame++;
      const t = frame * 0.005;
      groups.forEach((g) => {
        g.position.y = g.userData.baseY + Math.sin(t * 1.2 + g.userData.phase) * 0.15;
        g.rotation.z = g.userData.baseRotZ + Math.sin(t * 0.8 + g.userData.phase) * 0.04;
        g.rotation.y = Math.sin(t * 0.4 + g.userData.phase * 0.5) * 0.08;
      });
      particles.rotation.y = t * 0.05;
      camera.position.x = Math.sin(t * 0.3) * 0.8;
      camera.lookAt(0, 0.4, 0);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!el || !renderer || !camera) return;
      const W = el.clientWidth || 1;
      const H = el.clientHeight || 1;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    };

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(el);
    } else {
      window.addEventListener('resize', onResize, { passive: true });
    }

    if ('MutationObserver' in window) {
      themeObserver = new MutationObserver(syncTheme);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  } catch (err) {
    console.warn('[PaperCardsScene] WebGL fallback:', err);
    cleanup();
    emit('scene-error');
  }
};

onMounted(createScene);
onBeforeUnmount(cleanup);
</script>

<template>
  <div
    ref="host"
    class="paper-cards-scene"
    :style="{ height: height + 'px' }"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.paper-cards-scene {
  width: 100%;
  position: relative;
  overflow: hidden;
  pointer-events: none;
}
.paper-cards-scene :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
