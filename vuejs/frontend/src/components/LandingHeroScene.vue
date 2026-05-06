<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';

const host = ref(null);

let renderer;
let scene;
let camera;
let frameId = 0;
let resizeObserver;
let startedAt = 0;
const disposables = [];

const track = (item) => {
  disposables.push(item);
  return item;
};

const makeMat = (color, options = {}) => track(new THREE.MeshStandardMaterial({
  color,
  roughness: 0.78,
  metalness: 0.08,
  ...options,
}));

const buildTicket = (label, color) => {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.54, 0.04, 0.34)),
    makeMat(color, { emissive: color, emissiveIntensity: 0.06 })
  );
  base.position.y = 0.08;
  group.add(base);

  const lineMat = makeMat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.12 });
  for (let i = 0; i < 3; i += 1) {
    const line = new THREE.Mesh(track(new THREE.BoxGeometry(0.34 - i * 0.05, 0.012, 0.018)), lineMat);
    line.position.set(-0.04, 0.108, -0.08 + i * 0.07);
    group.add(line);
  }

  group.userData = { label };
  return group;
};

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t * t * (3 - 2 * t);

const pointOnRoute = (route, t) => {
  const eased = easeInOut(t);
  const midLift = Math.sin(eased * Math.PI) * 0.42;
  return new THREE.Vector3(
    lerp(route.from.x, route.to.x, eased),
    0.1 + midLift,
    lerp(route.from.z, route.to.z, eased)
  );
};

const createScene = () => {
  const el = host.value;
  if (!el) return;

  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.OrthographicCamera(-4, 4, 2.6, -2.6, 0.1, 100);
  camera.position.set(4.8, 5.4, 6.2);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setClearColor(0x000000, 0);
  el.appendChild(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xffffff, 0xded6cc, 2.2);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 5, 4);
  scene.add(key);

  const floor = new THREE.Mesh(
    track(new THREE.CircleGeometry(3.55, 96)),
    makeMat(0xf6f2ec, { transparent: true, opacity: 0.72 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  scene.add(floor);

  const lineMat = track(new THREE.LineBasicMaterial({ color: 0xd8cfc4, transparent: true, opacity: 0.72 }));
  const makeRoute = (from, to) => {
    const points = [];
    for (let i = 0; i <= 24; i += 1) points.push(pointOnRoute({ from, to }, i / 24));
    const geometry = track(new THREE.BufferGeometry().setFromPoints(points));
    const line = new THREE.Line(geometry, lineMat);
    scene.add(line);
  };

  const tableMat = makeMat(0xffffff);
  const tableEdge = makeMat(0xded5ca);
  const tables = [
    [-1.9, -0.9, 'T4'],
    [-1.35, 0.78, 'T7'],
    [0.1, -1.24, 'T2'],
    [0.75, 0.62, 'T9'],
  ];
  tables.forEach(([x, z]) => {
    const group = new THREE.Group();
    const top = new THREE.Mesh(track(new THREE.CylinderGeometry(0.34, 0.38, 0.09, 36)), tableMat);
    top.position.y = 0.08;
    group.add(top);
    const foot = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 18)), tableEdge);
    foot.position.y = -0.02;
    group.add(foot);
    group.position.set(x, 0, z);
    scene.add(group);
  });

  const stationMat = makeMat(0x2f2925);
  const stations = [
    { x: 2.1, z: -0.8, w: 1.15, d: 0.58 },
    { x: 2.05, z: 0.72, w: 1.0, d: 0.52 },
  ];
  stations.forEach((station, index) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(station.w, 0.18, station.d)), stationMat);
    mesh.position.set(station.x, 0.08, station.z);
    scene.add(mesh);
    const glow = new THREE.Mesh(
      track(new THREE.BoxGeometry(station.w * 0.76, 0.02, 0.04)),
      makeMat(index === 0 ? 0xdc5f49 : 0x2f9d73, { emissive: index === 0 ? 0xdc5f49 : 0x2f9d73, emissiveIntensity: 0.25 })
    );
    glow.position.set(station.x, 0.19, station.z - station.d * 0.18);
    scene.add(glow);
  });

  const routes = [
    { from: { x: -1.9, z: -0.9 }, to: { x: 2.1, z: -0.8 }, delay: 0, color: 0xdc5f49 },
    { from: { x: -1.35, z: 0.78 }, to: { x: 2.05, z: 0.72 }, delay: 0.3, color: 0x2f9d73 },
    { from: { x: -0.1, z: -1.24 }, to: { x: 2.1, z: -0.8 }, delay: 0.62, color: 0xf0b44c },
  ];
  routes.forEach((route) => makeRoute(route.from, route.to));

  const tickets = routes.map((route, index) => {
    const ticket = buildTicket(index === 1 ? 'asporto' : 'ordine', route.color);
    scene.add(ticket);
    return { mesh: ticket, route };
  });

  const resize = () => {
    const width = el.clientWidth || 1;
    const height = el.clientHeight || 1;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const view = height < 420 ? 3.3 : 3.0;
    camera.left = -view * aspect;
    camera.right = view * aspect;
    camera.top = view;
    camera.bottom = -view;
    camera.updateProjectionMatrix();
  };

  const animate = (time) => {
    if (!startedAt) startedAt = time;
    const elapsed = (time - startedAt) / 1000;
    scene.rotation.y = Math.sin(elapsed * 0.22) * 0.08;
    scene.rotation.x = Math.sin(elapsed * 0.18) * 0.018;

    tickets.forEach(({ mesh, route }, index) => {
      const t = ((elapsed * 0.18 + route.delay) % 1);
      mesh.position.copy(pointOnRoute(route, t));
      mesh.rotation.y = -0.58 + Math.sin(elapsed + index) * 0.08;
      mesh.rotation.z = Math.sin(elapsed * 2 + index) * 0.05;
      mesh.scale.setScalar(0.92 + Math.sin(t * Math.PI) * 0.14);
    });

    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(animate);
  };

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(el);
  resize();
  frameId = window.requestAnimationFrame(animate);
};

onMounted(createScene);

onBeforeUnmount(() => {
  if (frameId) window.cancelAnimationFrame(frameId);
  if (resizeObserver) resizeObserver.disconnect();
  if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  disposables.forEach((item) => item?.dispose?.());
  renderer?.dispose?.();
});
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
