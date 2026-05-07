<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';

const host = ref(null);
const emit = defineEmits(['scene-error']);

let renderer = null;
let scene = null;
let camera = null;
let world = null;
let serviceLayer = null;
let routeLayer = null;
let takeawayLayer = null;
let moduleLayer = null;
let atmosphereLayer = null;
let resizeObserver = null;
let removeResizeListener = null;
let removeScrollListener = null;
let removeVisibilityListener = null;
let themeObserver = null;
let frameId = 0;
let running = false;
let startedAt = 0;
let targetScroll = 0;
let smoothScroll = 0;
let viewportWidth = 1;
let viewportHeight = 1;

const disposables = [];
const materials = [];
const tickets = [];
const moduleTiles = [];
const accentPulses = [];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const segment = (start, end, value) => smoothstep(clamp((value - start) / (end - start)));

const track = (item) => {
  disposables.push(item);
  return item;
};

const getPalette = () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return isDark
    ? {
        floor: 0x20242c,
        floorSoft: 0x171a20,
        paper: 0x2b3039,
        paperSoft: 0x222730,
        line: 0x4a505b,
        ink: 0xf7f2eb,
        muted: 0xa7adb8,
        red: 0xe86b56,
        green: 0x38b983,
        amber: 0xf1b950,
        blue: 0x6aa9ff,
      }
    : {
        floor: 0xf6f1e9,
        floorSoft: 0xeee6da,
        paper: 0xffffff,
        paperSoft: 0xf7f2ec,
        line: 0xd8cec2,
        ink: 0x2d2824,
        muted: 0x8c8378,
        red: 0xdc5f49,
        green: 0x2f9d73,
        amber: 0xf0b44c,
        blue: 0x4f86d9,
      };
};

const registerMaterial = (material, key, emissiveKey = null) => {
  material.userData.paletteKey = key;
  material.userData.emissiveKey = emissiveKey;
  materials.push(material);
  return material;
};

const makeMat = (key, options = {}) => {
  const palette = getPalette();
  const { emissiveKey, emissiveIntensity, ...materialOptions } = options;
  const material = track(new THREE.MeshStandardMaterial({
    color: palette[key],
    roughness: 0.78,
    metalness: 0.05,
    transparent: materialOptions.opacity !== undefined && materialOptions.opacity < 1,
    opacity: materialOptions.opacity ?? 1,
    emissive: emissiveKey ? palette[emissiveKey] : 0x000000,
    emissiveIntensity: emissiveIntensity ?? 0,
    ...materialOptions,
  }));

  return registerMaterial(material, key, emissiveKey || null);
};

const makeLineMat = (key, options = {}) => {
  const palette = getPalette();
  const material = track(new THREE.LineBasicMaterial({
    color: palette[key],
    transparent: true,
    opacity: options.opacity ?? 0.64,
  }));

  return registerMaterial(material, key);
};

const syncPalette = () => {
  const palette = getPalette();
  materials.forEach((material) => {
    const key = material.userData.paletteKey;
    const emissiveKey = material.userData.emissiveKey;
    if (key && palette[key]) material.color.setHex(palette[key]);
    if (emissiveKey && palette[emissiveKey] && material.emissive) {
      material.emissive.setHex(palette[emissiveKey]);
    }
  });
};

const makeBox = (width, height, depth, material) => new THREE.Mesh(
  track(new THREE.BoxGeometry(width, height, depth)),
  material
);

const makeRoutePoint = (route, t, lift = 0.44) => {
  const eased = smoothstep(t);
  return new THREE.Vector3(
    lerp(route.from.x, route.to.x, eased),
    0.1 + Math.sin(eased * Math.PI) * lift,
    lerp(route.from.z, route.to.z, eased)
  );
};

const buildRoute = (route, colorKey) => {
  const points = [];
  for (let i = 0; i <= 34; i += 1) points.push(makeRoutePoint(route, i / 34, 0.34));
  const geometry = track(new THREE.BufferGeometry().setFromPoints(points));
  const line = new THREE.Line(geometry, makeLineMat(colorKey, { opacity: 0.58 }));
  routeLayer.add(line);
};

const buildTicket = (colorKey, index) => {
  const group = new THREE.Group();
  const base = makeBox(0.58, 0.045, 0.36, makeMat(colorKey, {
    emissiveKey: colorKey,
    emissiveIntensity: 0.11,
  }));
  base.position.y = 0.08;
  group.add(base);

  const lineMat = makeMat('paper', { opacity: 0.86 });
  for (let i = 0; i < 3; i += 1) {
    const line = makeBox(0.36 - i * 0.052, 0.012, 0.018, lineMat);
    line.position.set(-0.05, 0.111, -0.09 + i * 0.072);
    group.add(line);
  }

  group.userData.floatOffset = index * 0.73;
  return group;
};

const buildTable = (x, z, accentKey, index) => {
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.34, 0.38, 0.09, 36)),
    makeMat('paper')
  );
  top.position.y = 0.08;
  group.add(top);

  const stem = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 18)),
    makeMat('line')
  );
  stem.position.y = -0.02;
  group.add(stem);

  const badge = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.085, 0.085, 0.018, 18)),
    makeMat(accentKey, { emissiveKey: accentKey, emissiveIntensity: 0.16 })
  );
  badge.position.set(0.18, 0.14, -0.16);
  group.add(badge);

  group.position.set(x, 0, z);
  group.userData.floatOffset = index * 0.5;
  serviceLayer.add(group);
};

const buildStation = ({ x, z, width, depth, accentKey }) => {
  const group = new THREE.Group();
  const base = makeBox(width, 0.18, depth, makeMat('ink'));
  base.position.y = 0.08;
  group.add(base);

  const glow = makeBox(width * 0.76, 0.022, 0.045, makeMat(accentKey, {
    emissiveKey: accentKey,
    emissiveIntensity: 0.28,
  }));
  glow.position.set(0, 0.19, -depth * 0.18);
  group.add(glow);

  const rail = makeBox(width * 0.48, 0.018, 0.035, makeMat('paper', { opacity: 0.78 }));
  rail.position.set(0, 0.21, depth * 0.16);
  group.add(rail);

  group.position.set(x, 0, z);
  serviceLayer.add(group);
};

const buildTakeawayFlow = () => {
  const nodes = [
    { x: -2.35, z: 1.62, key: 'blue' },
    { x: -1.16, z: 1.46, key: 'green' },
    { x: 0, z: 1.72, key: 'red', main: true },
    { x: 1.14, z: 1.44, key: 'amber' },
    { x: 2.32, z: 1.6, key: 'green' },
  ];

  nodes.forEach((node, index) => {
    const group = new THREE.Group();
    const card = makeBox(node.main ? 0.66 : 0.5, 0.07, node.main ? 0.46 : 0.34, makeMat(node.main ? 'ink' : 'paper'));
    card.position.y = node.main ? 0.16 : 0.1;
    group.add(card);

    const dot = new THREE.Mesh(
      track(new THREE.SphereGeometry(node.main ? 0.105 : 0.08, 18, 12)),
      makeMat(node.key, { emissiveKey: node.key, emissiveIntensity: 0.18 })
    );
    dot.position.y = node.main ? 0.25 : 0.17;
    group.add(dot);

    group.position.set(node.x, 0, node.z);
    group.userData.floatOffset = index * 0.44;
    takeawayLayer.add(group);
  });

  for (let i = 0; i < nodes.length - 1; i += 1) {
    buildRoute({ from: nodes[i], to: nodes[i + 1] }, i === 1 ? 'red' : 'line');
  }
};

const buildModules = () => {
  const positions = [
    [-1.45, 0.92], [-0.48, 0.9], [0.5, 0.92],
    [-1.02, 0.18], [0, 0.18], [1.02, 0.18],
    [0.02, -0.55],
  ];
  const accentKeys = ['red', 'green', 'amber', 'blue', 'red', 'green', 'amber'];

  positions.forEach(([x, z], index) => {
    const group = new THREE.Group();
    const tile = makeBox(0.68, 0.065, 0.46, makeMat('paper'));
    tile.position.y = 0.12;
    group.add(tile);

    const signal = makeBox(0.16, 0.034, 0.05, makeMat(accentKeys[index], {
      emissiveKey: accentKeys[index],
      emissiveIntensity: 0.16,
    }));
    signal.position.set(-0.18, 0.18, -0.13);
    group.add(signal);

    const row = makeBox(0.34, 0.018, 0.03, makeMat('line', { opacity: 0.9 }));
    row.position.set(0.08, 0.18, 0.08);
    group.add(row);

    group.position.set(x, -0.34, z);
    group.scale.setScalar(0.2);
    group.visible = false;
    group.userData.home = new THREE.Vector3(x, 0, z);
    group.userData.floatOffset = index * 0.31;
    moduleLayer.add(group);
    moduleTiles.push(group);
  });
};

const buildAtmosphere = () => {
  const ringMat = makeLineMat('line', { opacity: 0.32 });
  [1.35, 2.28, 3.16].forEach((radius, index) => {
    const ring = new THREE.Line(
      track(new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 96 }, (_, i) => {
          const angle = (i / 95) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(angle) * radius, 0.012, Math.sin(angle) * radius);
        })
      )),
      ringMat
    );
    ring.rotation.y = index * 0.2;
    atmosphereLayer.add(ring);
  });

  const particleGeo = track(new THREE.SphereGeometry(0.025, 10, 8));
  const particleMat = makeMat('red', { opacity: 0.54, emissiveKey: 'red', emissiveIntensity: 0.18 });
  for (let i = 0; i < 28; i += 1) {
    const angle = i * 1.618;
    const radius = 1.3 + (i % 7) * 0.32;
    const particle = new THREE.Mesh(particleGeo, particleMat);
    const y = 0.24 + (i % 5) * 0.08;
    particle.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    particle.userData.floatOffset = i * 0.24;
    particle.userData.baseY = y;
    atmosphereLayer.add(particle);
    accentPulses.push(particle);
  }
};

const updateScroll = () => {
  const doc = document.documentElement;
  const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
  targetScroll = clamp(window.scrollY / maxScroll);
};

const resize = () => {
  const el = host.value;
  if (!el || !renderer || !camera) return;

  viewportWidth = el.clientWidth || 1;
  viewportHeight = el.clientHeight || 1;
  const dprLimit = viewportWidth < 720 ? 1.25 : 1.6;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprLimit));
  renderer.setSize(viewportWidth, viewportHeight, false);

  const aspect = viewportWidth / viewportHeight;
  const view = viewportWidth < 720 ? 3.35 : viewportWidth < 1080 ? 3.12 : 2.86;
  camera.left = -view * aspect;
  camera.right = view * aspect;
  camera.top = view;
  camera.bottom = -view;
  camera.updateProjectionMatrix();
};

const animate = (time) => {
  if (!running || !renderer || !scene || !camera || !world) return;
  if (!startedAt) startedAt = time;
  const elapsed = (time - startedAt) / 1000;

  smoothScroll += (targetScroll - smoothScroll) * 0.075;
  const progress = smoothScroll;
  const takeaway = segment(0.18, 0.44, progress);
  const modules = segment(0.42, 0.68, progress);
  const flow = segment(0.62, 0.86, progress);
  const close = segment(0.82, 1, progress);
  const mobile = viewportWidth < 720;
  const tablet = viewportWidth >= 720 && viewportWidth < 1080;
  const baseX = mobile ? 0.16 : tablet ? 0.78 : 1.16;
  const baseScale = mobile ? 0.82 : tablet ? 0.94 : 1;

  world.position.set(
    lerp(baseX, mobile ? -0.02 : 0.42, progress),
    lerp(-0.08, -0.28, close),
    lerp(0, -0.18, flow)
  );
  world.scale.setScalar(baseScale * lerp(1, 0.94, close));
  world.rotation.y = -0.42 + progress * 1.14 + Math.sin(elapsed * 0.24) * 0.045;
  world.rotation.x = 0.2 - flow * 0.11 + Math.sin(elapsed * 0.18) * 0.016;
  world.rotation.z = (takeaway - flow) * 0.035;

  serviceLayer.position.x = lerp(0, -0.36, takeaway);
  serviceLayer.position.z = lerp(0, -0.18, modules);
  routeLayer.position.x = lerp(0, -0.28, takeaway);
  routeLayer.position.z = lerp(0, -0.14, modules);
  takeawayLayer.visible = takeaway > 0.02 || progress > 0.2;
  takeawayLayer.position.y = lerp(-0.32, 0.03, takeaway) + Math.sin(elapsed * 0.9) * 0.018;
  takeawayLayer.rotation.y = lerp(-0.2, 0.08, takeaway);
  takeawayLayer.scale.setScalar(lerp(0.84, 1.02, takeaway));
  moduleLayer.visible = modules > 0.02 || progress > 0.42;
  moduleLayer.position.z = lerp(0.28, -0.42, modules);
  moduleLayer.rotation.y = lerp(-0.36, 0.12, modules);

  tickets.forEach(({ mesh, route, delay, speed }, index) => {
    const t = (elapsed * speed + delay + progress * 0.82) % 1;
    mesh.position.copy(makeRoutePoint(route, t, 0.4 + flow * 0.12));
    mesh.rotation.y = -0.58 + Math.sin(elapsed + index) * 0.09 + progress * 0.25;
    mesh.rotation.z = Math.sin(elapsed * 1.8 + index) * 0.055;
    mesh.scale.setScalar(0.9 + Math.sin(t * Math.PI) * 0.16);
  });

  moduleTiles.forEach((tile, index) => {
    const reveal = segment(0.42 + index * 0.018, 0.61 + index * 0.018, progress);
    const home = tile.userData.home;
    tile.visible = reveal > 0.03 || modules > 0.02;
    tile.position.set(
      home.x,
      lerp(-0.34, home.y, reveal) + Math.sin(elapsed * 0.85 + tile.userData.floatOffset) * 0.018,
      home.z
    );
    tile.rotation.y = lerp(-0.7, 0, reveal) + Math.sin(elapsed * 0.38 + index) * 0.025;
    tile.rotation.z = lerp(0.12, -0.02, reveal);
    tile.scale.setScalar(lerp(0.24, 1, reveal));
  });

  accentPulses.forEach((particle) => {
    particle.position.y = particle.userData.baseY + Math.sin(elapsed * 0.9 + particle.userData.floatOffset) * 0.035;
  });
  atmosphereLayer.rotation.y = elapsed * 0.018 + progress * 0.58;
  routeLayer.rotation.y = Math.sin(elapsed * 0.16) * 0.025;

  camera.zoom = (mobile ? 0.83 : tablet ? 0.94 : 1) + progress * 0.075;
  camera.updateProjectionMatrix();
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
    camera = new THREE.OrthographicCamera(-4, 4, 2.8, -2.8, 0.1, 100);
    camera.position.set(4.9, 5.3, 6.4);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: (window.devicePixelRatio || 1) <= 1.75,
      powerPreference: 'default',
    });
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xffffff, 0xd5c9bb, 2.15);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.25);
    key.position.set(2.6, 5.2, 4.5);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xe86b56, 0.62);
    rim.position.set(-3.8, 3.6, -2.2);
    scene.add(rim);

    world = new THREE.Group();
    world.rotation.order = 'YXZ';
    scene.add(world);

    atmosphereLayer = new THREE.Group();
    serviceLayer = new THREE.Group();
    routeLayer = new THREE.Group();
    takeawayLayer = new THREE.Group();
    moduleLayer = new THREE.Group();
    world.add(atmosphereLayer, serviceLayer, routeLayer, takeawayLayer, moduleLayer);

    const floor = new THREE.Mesh(
      track(new THREE.CircleGeometry(3.6, 96)),
      makeMat('floor', { opacity: 0.78 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.035;
    serviceLayer.add(floor);

    const routes = [
      { from: { x: -1.9, z: -0.9 }, to: { x: 2.1, z: -0.8 }, delay: 0, speed: 0.11, color: 'red' },
      { from: { x: -1.35, z: 0.78 }, to: { x: 2.05, z: 0.72 }, delay: 0.28, speed: 0.1, color: 'green' },
      { from: { x: -0.1, z: -1.24 }, to: { x: 2.1, z: -0.8 }, delay: 0.58, speed: 0.115, color: 'amber' },
      { from: { x: -2.24, z: 1.52 }, to: { x: 2.12, z: 0.72 }, delay: 0.76, speed: 0.092, color: 'blue' },
    ];
    routes.forEach((route) => buildRoute(route, route.color));

    [
      [-1.9, -0.9, 'red'],
      [-1.35, 0.78, 'green'],
      [0.1, -1.24, 'amber'],
      [0.75, 0.62, 'blue'],
    ].forEach(([x, z, key], index) => buildTable(x, z, key, index));

    buildStation({ x: 2.1, z: -0.8, width: 1.16, depth: 0.58, accentKey: 'red' });
    buildStation({ x: 2.05, z: 0.72, width: 1.02, depth: 0.52, accentKey: 'green' });
    buildTakeawayFlow();
    buildModules();
    buildAtmosphere();

    routes.forEach((route, index) => {
      const ticket = buildTicket(route.color, index);
      routeLayer.add(ticket);
      tickets.push({ mesh: ticket, route, delay: route.delay, speed: route.speed });
    });

    updateScroll();
    resize();

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(el);
    } else {
      window.addEventListener('resize', resize, { passive: true });
      removeResizeListener = () => window.removeEventListener('resize', resize);
    }

    window.addEventListener('scroll', updateScroll, { passive: true });
    removeScrollListener = () => window.removeEventListener('scroll', updateScroll);

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
    console.warn('Landing Three scene fallback', error);
    cleanup();
    emit('scene-error');
  }
};

onMounted(createScene);
onBeforeUnmount(cleanup);
</script>

<template>
  <div ref="host" class="landing-hero-scene" aria-hidden="true"></div>
</template>

<style scoped>
.landing-hero-scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.landing-hero-scene :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
