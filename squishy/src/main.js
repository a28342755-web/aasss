import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildSimMesh, finishMesh, TIERS, MESH_VERSION } from './physics/mesher.js';
import { DEFAULT_PARAMS } from './physics/softbody.js';
import { PRESETS, SLIDERS, sliderValue, applySlider } from './physics/params.js';
import { PhysicsClient } from './physics/client.js';
import { Mochi, FLAVORS, damp } from './mochi.js';
import { Sfx } from './sound.js';
import { Fx } from './fx.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debug = new URLSearchParams(location.search).has('debug');

// Per-browser conveniences only (counter, flavour, settings, mesh cache).
// Storage can be blocked, so every access is guarded and the page works without it.
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`chapssal:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`chapssal:${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable or full */
    }
  },
};

const canvas = $('#stage');
const topbar = $('#topbar');
const tray = $('#tray');
const countEl = $('#count');
const counterEl = $('#counter');
const hintEl = $('#hint');
const hintText = $('#hint-text');
const flavorLabel = $('#flavor-label');
const soundBtn = $('#sound');
const panel = $('#panel');
const panelBtn = $('#tune');
const ringLayer = $('#rings');
const fx = new Fx($('#fx'), $('#toast'));
const sfx = new Sfx();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required');
} catch (err) {
  $('#nogl').hidden = false;
  throw err;
}
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---- quality --------------------------------------------------------------------
const coarse = window.matchMedia('(pointer: coarse)').matches;
function detectTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    /* no renderer info */
  }
  const weak = /SwiftShader|llvmpipe|Mali-[GT]?[0-7]\d|Adreno \(TM\) [3-5]\d\d|PowerVR|Intel\(R\) HD Graphics [2-5]\d\d/i.test(gpu);
  if (weak || (coarse && (mem <= 3 || cores <= 4))) return 'low';
  if (coarse || cores < 8) return 'medium';
  return 'high';
}
let qualityPref = store.get('quality', 'auto');
let tier = qualityPref !== 'auto' && TIERS[qualityPref] ? qualityPref : detectTier();
const maxPixelRatio = () => Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : tier === 'medium' ? 1.75 : 1.5);
let pixelRatio = maxPixelRatio();
renderer.setPixelRatio(pixelRatio);

// ---- scene ----------------------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
const hemi = new THREE.HemisphereLight(0xfff4f0, 0xe2c6cd, 0.7);
const sun = new THREE.DirectionalLight(0xfffaf4, 3.0);
sun.position.set(2.6, 6.5, 4.2);
sun.castShadow = true;
sun.shadow.camera.left = -2.7;
sun.shadow.camera.right = 2.7;
sun.shadow.camera.top = 2.7;
sun.shadow.camera.bottom = -2.7;
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 16;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 4;
scene.add(hemi, sun, sun.target);
sun.target.position.set(0, 0.6, 0);
const LIGHT_DIR = sun.position.clone().sub(sun.target.position).normalize();
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();
}

const stage = buildPlate();
scene.add(stage.group);

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildPlate() {
  const group = new THREE.Group();
  const profile = [
    [0, -0.1], [1.45, -0.1], [1.68, -0.075], [1.83, 0.015], [1.91, 0.095],
    [1.88, 0.125], [1.8, 0.115], [1.64, 0.04], [1.42, 0], [0, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, side: THREE.DoubleSide });
  const plate = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), plateMat);
  plate.receiveShadow = true;
  group.add(plate);
  const tex = radialTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, color: 0x84485a, transparent: true, opacity: 0.26, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.105;
  ground.scale.set(4.9, 4.9, 1);
  group.add(ground);
  return { group, plate, plateMat, ground };
}

function applyTheme() {
  const cs = getComputedStyle(document.documentElement);
  const plate = cs.getPropertyValue('--plate').trim();
  const shade = cs.getPropertyValue('--shade').trim();
  if (plate) stage.plateMat.color.set(plate);
  if (shade) stage.ground.material.color.set(shade);
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---- physics + body -----------------------------------------------------------------
function loadSimMesh(t) {
  const key = `simmesh:${MESH_VERSION}:${t}`;
  const cached = store.get(key, null);
  if (cached && cached.restPos && cached.tets) {
    try {
      return finishMesh(Float64Array.from(cached.restPos), Int32Array.from(cached.tets), t);
    } catch {
      /* rebuild below */
    }
  }
  const m = buildSimMesh(t, 7);
  store.set(key, { restPos: Array.from(m.restPos, (v) => Math.round(v * 1e6) / 1e6), tets: Array.from(m.tets) });
  return m;
}

let params = { ...DEFAULT_PARAMS, ...PRESETS.soft.params, ...(store.get('params', null) || {}) };
let modeKey = store.get('mode', 'soft');
let sim, mochi, physics;

async function buildWorld(drop) {
  physics?.stop();
  if (mochi) {
    scene.remove(mochi.group);
    mochi.mesh.geometry.dispose();
    mochi.material.dispose();
    mochi.depthMaterial.dispose();
    mochi.tex.dispose();
  }
  const T = TIERS[tier];
  sim = loadSimMesh(tier);
  mochi = new Mochi(sim, { detail: T.render });
  scene.add(mochi.group);
  sun.shadow.mapSize.set(T.shadow, T.shadow);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  physics = new PhysicsClient(sim, params, { substeps: T.substeps, minSubsteps: T.minSubsteps, budgetMs: 11, drop });
  mochi.setState(physics.affine);
  await physics.start();
  setFlavor(store.get('flavor', 'milk'), false);
  mochi.setSurface(sliderValue(SLIDERS.find((s) => s.key === 'surface'), params));
  renderPanelValues();
}

// ---- settings UI ----------------------------------------------------------------------
function radioGroup(container, items, onPick) {
  const buttons = items.map((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => {
      sfx.unlock();
      onPick(item, true);
    });
    container.appendChild(b);
    return b;
  });
  container.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = (Math.max(0, i) + step + buttons.length) % buttons.length;
    buttons[next].focus();
    onPick(items[next], true);
  });
  const mark = (picked) =>
    buttons.forEach((b, i) => {
      const on = items[i] === picked;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on || (picked == null && i === 0) ? 0 : -1;
    });
  return { buttons, mark };
}

const flavorGroup = radioGroup($('#flavors'), FLAVORS, (f, byUser) => setFlavor(f.id, byUser));
flavorGroup.buttons.forEach((b, i) => {
  const f = FLAVORS[i];
  b.id = `flavor-${f.id}`;
  b.className = 'swatch';
  b.setAttribute('aria-label', `${f.name}맛`);
  b.title = `${f.name}맛`;
  b.style.setProperty('--swatch', f.body);
});

const modeKeys = Object.keys(PRESETS);
const modeGroup = radioGroup($('#modes'), modeKeys, (k, byUser) => setMode(k, byUser));
modeGroup.buttons.forEach((b, i) => {
  b.id = `mode-${modeKeys[i]}`;
  b.textContent = PRESETS[modeKeys[i]].name;
});

function setFlavor(id, byUser) {
  const f = FLAVORS.find((x) => x.id === id) || FLAVORS[0];
  mochi?.setFlavor(f);
  flavorGroup.mark(f);
  flavorLabel.textContent = `${f.name}맛`;
  store.set('flavor', f.id);
  if (byUser) {
    physics?.send({ t: 'hop', power: 0.55 });
    lastInteract = performance.now();
  }
}

function setParams(next, { save = true } = {}) {
  params = { ...params, ...next };
  physics?.setParams(params);
  mochi?.setSurface(sliderValue(SLIDERS.find((s) => s.key === 'surface'), params));
  if (save) store.set('params', params);
  renderPanelValues();
}

function setMode(key, byUser) {
  if (key === 'custom' || !PRESETS[key]) {
    modeKey = 'custom';
    modeGroup.mark(null);
    store.set('mode', modeKey);
    renderPanelValues();
    return;
  }
  modeKey = key;
  modeGroup.mark(key);
  store.set('mode', key);
  setParams(PRESETS[key].params);
  if (byUser) {
    fx.toast(`${PRESETS[key].name} · ${PRESETS[key].desc}`);
    lastInteract = performance.now();
  }
}

function setSound(on) {
  sfx.enabled = on;
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.title = on ? '소리·진동 끄기' : '소리·진동 켜기';
  store.set('sound', on);
}

soundBtn.addEventListener('click', () => {
  sfx.unlock();
  setSound(!sfx.enabled);
  sfx.release(0.6);
});
$('#reset').addEventListener('click', () => {
  view.resetting = true;
});

// ---- physics panel: eight sliders, each bound to one physical parameter ---------------
const sliderEls = new Map();
{
  const list = $('#sliders');
  for (const s of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'slider';
    const id = `sl-${s.key}`;
    row.innerHTML = `
      <div class="slider-head">
        <label for="${id}">${s.label}</label>
        <output id="${id}-out" for="${id}"></output>
      </div>
      <input type="range" id="${id}" min="0" max="1000" step="1" aria-describedby="${id}-hint">
      <p class="slider-hint" id="${id}-hint">${s.hint}</p>`;
    list.appendChild(row);
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      setParams(applySlider(s, input.valueAsNumber / 1000, params));
      if (modeKey !== 'custom') setMode('custom');
    });
    sliderEls.set(s.key, { input, out: row.querySelector('output') });
  }
}

function renderPanelValues() {
  for (const s of SLIDERS) {
    const el = sliderEls.get(s.key);
    if (!el) continue;
    if (document.activeElement !== el.input) el.input.value = String(Math.round(sliderValue(s, params) * 1000));
    el.out.textContent = s.show(params);
    el.input.setAttribute('aria-valuetext', s.show(params));
  }
  $('#preset-note').textContent = modeKey === 'custom' ? '직접 조절한 질감이에요' : `${PRESETS[modeKey]?.name ?? ''} 질감에서 시작했어요`;
}

const qualitySel = $('#quality');
qualitySel.value = qualityPref;
qualitySel.addEventListener('change', async () => {
  qualityPref = qualitySel.value;
  store.set('quality', qualityPref);
  tier = qualityPref !== 'auto' && TIERS[qualityPref] ? qualityPref : detectTier();
  pixelRatio = maxPixelRatio();
  renderer.setPixelRatio(pixelRatio);
  layout();
  await buildWorld(0.9);
  fx.toast(`품질: ${{ low: '낮음', medium: '보통', high: '높음' }[tier]}`);
});

$('#preset-reset').addEventListener('click', () => {
  setMode(modeKey === 'custom' ? 'soft' : modeKey, true);
});

function openPanel(open) {
  panel.hidden = !open;
  panelBtn.setAttribute('aria-expanded', String(open));
  if (open) renderPanelValues();
}
panelBtn.addEventListener('click', () => openPanel(panel.hidden));
$('#panel-close').addEventListener('click', () => {
  openPanel(false);
  panelBtn.focus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) {
    openPanel(false);
    panelBtn.focus();
  }
});

// ---- counter, milestones, hints ----------------------------------------------------------
const MILESTONES = {
  10: '찹쌀이가 손길이 마음에 든대요',
  50: '말랑 지수가 쑥쑥 오르는 중',
  100: '100번 말랑! 이제 단짝이에요',
  300: '말랑 장인으로 임명합니다',
  1000: '전설의 말랑러 등극',
};
let count = Math.max(0, Number(store.get('count', 0)) || 0);
let countSave = 0;
function renderCount() {
  countEl.textContent = count.toLocaleString('ko-KR');
  counterEl.setAttribute('aria-label', `만진 횟수 ${count}번`);
}
function addCount() {
  count += 1;
  renderCount();
  counterEl.classList.remove('bump');
  void counterEl.offsetWidth;
  counterEl.classList.add('bump');
  clearTimeout(countSave);
  countSave = setTimeout(() => store.set('count', count), 400);
  if (MILESTONES[count]) fx.toast(MILESTONES[count]);
}

const HINTS = [
  '찹쌀이를 꾹 눌러보세요',
  '귀를 잡고 쭉 당겨보세요',
  '톡톡 두 번 누르면 점프해요',
  '접시를 잡고 흔들어보세요',
  '빈 곳을 끌면 빙글 돌아가요',
];
let hintDone = Number(store.get('hints2', 0)) || 0;
let hintShown = -1;
let hintTimer = 0;
function showHint() {
  hintShown = HINTS.findIndex((_, i) => !(hintDone & (1 << i)));
  if (hintShown < 0) {
    hintEl.hidden = true;
    return;
  }
  hintText.textContent = HINTS[hintShown];
  hintEl.hidden = false;
  requestAnimationFrame(() => hintEl.classList.remove('is-out'));
}
function markHint(i) {
  if (hintDone & (1 << i)) return;
  hintDone |= 1 << i;
  store.set('hints2', hintDone);
  if (hintShown === i || hintShown < 0) {
    hintEl.classList.add('is-out');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(showHint, 2600);
  }
}

// ---- camera ------------------------------------------------------------------------------
const TARGET = new THREE.Vector3(0, 1.0, 0);
const HOME = { yaw: 0, pitch: 0.36, zoom: 1 };
const view = { yaw: HOME.yaw, pitch: HOME.pitch, zoom: HOME.zoom, vyaw: 0, vpitch: 0, resetting: false };
let baseDist = 12;
let rect = canvas.getBoundingClientRect();

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  rect = canvas.getBoundingClientRect();
  const top = Math.min(topbar.getBoundingClientRect().bottom, h * 0.3);
  const bottom = Math.min(h - tray.getBoundingClientRect().top, h * 0.45);
  const avail = Math.max(160, h - top - bottom);
  const shift = (bottom - top) / 2;
  const fullH = h + 2 * Math.abs(shift);
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const needH = 3.7;
  const needW = 3.25;
  baseDist = Math.max((needH * fullH) / (2 * tanH * avail), (needW * fullH) / (2 * tanH * w));
  camera.aspect = w / fullH;
  camera.setViewOffset(w, fullH, 0, shift > 0 ? 2 * shift : 0, w, h);
  camera.updateProjectionMatrix();
  // the settings panel hangs just below the top bar, however tall it wraps
  panel.style.top = `${Math.round(topbar.getBoundingClientRect().bottom + 10)}px`;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function updateCamera(dt) {
  const orbiting = [...pointers.values()].some((p) => p.kind === 'orbit');
  if (!orbiting) {
    view.yaw += view.vyaw * dt;
    view.pitch = clamp(view.pitch + view.vpitch * dt, -0.05, 1.15);
    const decay = Math.exp(-dt * 6);
    view.vyaw *= decay;
    view.vpitch *= decay;
  }
  if (view.resetting) {
    view.yaw = damp(wrapAngle(view.yaw), HOME.yaw, 7, dt);
    view.pitch = damp(view.pitch, HOME.pitch, 7, dt);
    view.zoom = damp(view.zoom, HOME.zoom, 7, dt);
    view.vyaw = view.vpitch = 0;
    if (Math.abs(view.yaw) + Math.abs(view.pitch - HOME.pitch) + Math.abs(view.zoom - 1) < 0.002) view.resetting = false;
  }
  const d = baseDist * view.zoom;
  const cp = Math.cos(view.pitch);
  camera.position.set(
    TARGET.x + Math.sin(view.yaw) * cp * d,
    TARGET.y + Math.sin(view.pitch) * d,
    TARGET.z + Math.cos(view.yaw) * cp * d,
  );
  camera.lookAt(TARGET);
  camera.updateMatrixWorld();
}

// ---- helpers -------------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function setNDC(x, y) {
  ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  return [[o.x, o.y, o.z], [d.x, d.y, d.z]];
}

function toScreen(v) {
  _p.copy(v).project(camera);
  return { x: rect.left + ((_p.x + 1) / 2) * rect.width, y: rect.top + ((1 - _p.y) / 2) * rect.height };
}

const headScreen = () => toScreen(mochi.worldPoint(0, 1.98, 0, _w));

let touched = false;
function buzz(pattern) {
  if (!sfx.enabled || !touched) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

function gazeAt(x, y) {
  const face = toScreen(mochi.worldPoint(0, 0.88, 1.05, _w));
  const s = Math.min(rect.width, rect.height) * 0.45;
  let dx = (x - face.x) / s;
  let dy = (y - face.y) / s;
  const l = Math.hypot(dx, dy);
  if (l > 1) {
    dx /= l;
    dy /= l;
  }
  mochi.setGaze(dx, -dy);
  gazeIdle = 0;
}

// Contact pressure. Pens and some touch screens report real pressure; most touch
// screens only report the contact size, which grows with a firmer press; a mouse
// presses at 1 (Shift for a firm press, the wheel to adjust while holding).
function pressureOf(e) {
  let p = 1;
  if (e.pointerType === 'pen' && e.pressure > 0) p = 0.35 + e.pressure * 1.1;
  else if (e.pointerType === 'touch') {
    if (e.pressure > 0 && e.pressure !== 0.5 && e.pressure !== 1) p = 0.45 + e.pressure * 1.0;
    else if (e.width > 2 || e.height > 2) p = clamp(0.7 + (Math.max(e.width, e.height) - 20) / 34, 0.6, 1.45);
  }
  if (e.shiftKey) p *= 1.45;
  return p;
}

// ---- touching --------------------------------------------------------------------------------
const pointers = new Map();
const pokeTimes = [];
let lastTap = null;
let lastBgTap = null;
let lastPout = -1e9;
let pinch = null;
let lastInteract = performance.now();
let gazeIdle = 0;
let shake = null;

const orbitPointers = () => [...pointers.values()].filter((p) => p.kind === 'orbit');

function touchBody(id, ray, pressure, x, y) {
  const hit = mochi.raycast(ray[0], ray[1], physics.pos);
  if (!hit) return null;
  const N = hit.normal, d = ray[1];
  let nx = -0.65 * N[0] + 0.35 * d[0], ny = -0.65 * N[1] + 0.35 * d[1], nz = -0.65 * N[2] + 0.35 * d[2];
  const l = Math.hypot(nx, ny, nz) || 1;
  physics.send({
    t: 'down',
    id,
    anchor: hit.point,
    normal: [nx / l, ny / l, nz / l],
    planeN: [-d[0], -d[1], -d[2]],
    ray,
    pressure,
  });
  return { kind: 'body', id, part: hit.part, x0: x, y0: y, x, y, t0: performance.now(), moved: 0, pressure, gain: 1, squeaked: false, ring: makeRing() };
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!mochi) return;
  sfx.unlock();
  touched = true;
  lastInteract = performance.now();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* capture is best effort */
  }
  const ray = setNDC(e.clientX, e.clientY);
  gazeAt(e.clientX, e.clientY);
  wakeIfAsleep();

  if (mochi.hitSprout(raycaster)) {
    mochi.flickSprout();
    sfx.sprout();
    buzz(8);
    fx.burst(e.clientX, e.clientY, 'spark', 2);
    pointers.set(e.pointerId, { kind: 'none' });
    return;
  }

  const pressure = pressureOf(e);
  const p = touchBody(e.pointerId, ray, pressure, e.clientX, e.clientY);
  if (p) {
    pointers.set(e.pointerId, p);
    canvas.classList.add('is-holding');
    if (p.part === 'ear') markHint(1);
    onPoke();
    return;
  }

  // the plate: grab it to slide and shake 찹쌀이
  stage.plate.updateMatrixWorld();
  if (raycaster.intersectObject(stage.plate, false).length) {
    const g = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
    if (g) {
      pointers.set(e.pointerId, { kind: 'plate', g0: g.clone(), p0: physics.plate.slice() });
      canvas.classList.add('is-holding');
      return;
    }
  }

  view.resetting = false;
  pointers.set(e.pointerId, { kind: 'orbit', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), t0: performance.now() });
  const ops = orbitPointers();
  if (ops.length === 2) pinch = { d0: Math.hypot(ops[0].x - ops[1].x, ops[0].y - ops[1].y), z0: view.zoom };
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse' && mochi) {
      gazeAt(e.clientX, e.clientY);
      lastInteract = performance.now();
    }
    return;
  }
  lastInteract = performance.now();

  if (p.kind === 'body') {
    p.x = e.clientX;
    p.y = e.clientY;
    p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
    if (e.pointerType !== 'mouse' || e.pressure > 0) p.pressure = pressureOf(e);
    gazeAt(e.clientX, e.clientY);
    const ray = setNDC(e.clientX, e.clientY);
    queueMove(p.id, ray, p.pressure * p.gain);
    if (p.moved > 30 && p.part !== 'ear') markHint(1);
    return;
  }

  if (p.kind === 'plate') {
    setNDC(e.clientX, e.clientY);
    const g = raycaster.ray.intersectPlane(groundPlane, _w);
    if (g) {
      physics.send({ t: 'plate', x: p.p0[0] + g.x - p.g0.x, z: p.p0[1] + g.z - p.g0.z, held: true });
      if (Math.hypot(g.x - p.g0.x, g.z - p.g0.z) > 0.3) markHint(3);
    }
    return;
  }

  if (p.kind === 'orbit') {
    const now = performance.now();
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const dt = Math.max(8, now - p.t) / 1000;
    p.x = e.clientX;
    p.y = e.clientY;
    p.t = now;
    const ops = orbitPointers();
    if (ops.length >= 2 && pinch) {
      const d = Math.hypot(ops[0].x - ops[1].x, ops[0].y - ops[1].y);
      view.zoom = clamp((pinch.z0 * pinch.d0) / Math.max(d, 1), 0.7, 1.5);
      return;
    }
    view.yaw -= dx * 0.0068;
    view.pitch = clamp(view.pitch + dy * 0.005, -0.05, 1.15);
    view.vyaw = damp(view.vyaw, (-dx * 0.0068) / dt, 0.6, 1);
    view.vpitch = damp(view.vpitch, (dy * 0.005) / dt, 0.6, 1);
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 40) markHint(4);
  }
});

// Only the newest pointer position per finger needs to reach the solver (the
// worker gets messages straight away; the fallback queue is compacted here).
function queueMove(id, ray, pressure) {
  if (physics.worker) {
    physics.send({ t: 'move', id, ray, pressure });
    return;
  }
  const q = physics.queue;
  for (let i = q.length - 1; i >= 0; i--) {
    if (q[i].t === 'move' && q[i].id === id) {
      q[i].ray = ray;
      q[i].pressure = pressure;
      return;
    }
    if (q[i].id === id) break;
  }
  physics.send({ t: 'move', id, ray, pressure });
}

function updateHolding() {
  const holding = [...pointers.values()].some((p) => p.kind === 'body' || p.kind === 'plate');
  canvas.classList.toggle('is-holding', holding);
}

const pendingRelease = new Map();

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  sfx.unlock();
  updateHolding();
  if (orbitPointers().length < 2) pinch = null;

  if (p.kind === 'body') {
    physics.send({ t: 'up', id: p.id });
    pendingRelease.set(p.id, p);
    p.ring?.remove();
    const now = performance.now();
    if (now - p.t0 < 280 && p.moved < 12) {
      if (lastTap && now - lastTap.t < 340 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 50) {
        physics.send({ t: 'hop', power: 1 });
        markHint(2);
        lastTap = null;
      } else {
        lastTap = { t: now, x: p.x, y: p.y };
      }
    }
  } else if (p.kind === 'plate') {
    physics.send({ t: 'plate', x: 0, z: 0, held: false });
  } else if (p.kind === 'orbit') {
    const now = performance.now();
    const quick = now - p.t0 < 250 && Math.hypot(p.x - p.x0, p.y - p.y0) < 10;
    if (quick) {
      if (lastBgTap && now - lastBgTap < 330) {
        view.resetting = true;
        lastBgTap = null;
      } else {
        lastBgTap = now;
      }
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !pointers.size && mochi) mochi.setGaze(0, 0);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Keyboard: Space/Enter presses the head, arrows turn the view, J hops, S shakes.
let keyPress = null;
canvas.addEventListener('keydown', (e) => {
  if (!mochi) return;
  lastInteract = performance.now();
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
    e.preventDefault();
    if (keyPress) return;
    sfx.unlock();
    touched = true;
    wakeIfAsleep();
    const h = toScreen(mochi.worldPoint(0, 1.62, 0.5, _w));
    const p = touchBody('key', setNDC(h.x, h.y), e.shiftKey ? 1.45 : 1, h.x, h.y);
    if (!p) return;
    p.t0 = -1e9;
    p.moved = 99;
    keyPress = p;
    onPoke();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    view.resetting = false;
    view.vyaw += e.key === 'ArrowLeft' ? 2.2 : -2.2;
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    view.resetting = false;
    view.vpitch += e.key === 'ArrowUp' ? 1.4 : -1.4;
  } else if (e.key === 'j' || e.key === 'J') {
    sfx.unlock();
    physics.send({ t: 'hop', power: 1 });
    markHint(2);
  } else if (e.key === 's' || e.key === 'S') {
    sfx.unlock();
    shake = { t: 0 };
    markHint(3);
  }
});
canvas.addEventListener('keyup', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && keyPress) {
    physics.send({ t: 'up', id: 'key' });
    pendingRelease.set('key', keyPress);
    keyPress.ring?.remove();
    keyPress = null;
  }
});
canvas.addEventListener('blur', () => {
  if (keyPress) {
    physics.send({ t: 'up', id: 'key' });
    keyPress.ring?.remove();
    keyPress = null;
  }
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const held = [...pointers.values()].filter((p) => p.kind === 'body');
    if (held.length) {
      // wheel while pressing = press harder or softer
      for (const p of held) {
        p.gain = clamp(p.gain * Math.exp(-e.deltaY * 0.0015), 0.35, 1.8);
        queueMove(p.id, setNDC(p.x, p.y), p.pressure * p.gain);
      }
      return;
    }
    view.resetting = false;
    view.zoom = clamp(view.zoom * Math.exp(e.deltaY * 0.0012), 0.7, 1.5);
  },
  { passive: false },
);

function wakeIfAsleep() {
  if (mochi?.wake()) {
    physics.send({ t: 'sleep', on: false });
    physics.send({ t: 'hop', power: 0.6 });
    sfx.wake();
    const h = headScreen();
    fx.word(h.x, h.y, '앗!');
  }
}

function onPoke() {
  addCount();
  sfx.squish();
  buzz(10);
  markHint(0);
  const now = performance.now();
  pokeTimes.push(now);
  while (pokeTimes.length && now - pokeTimes[0] > 4000) pokeTimes.shift();
  if (pokeTimes.length >= 14 && now - lastPout > 9000) {
    lastPout = now;
    pokeTimes.length = 0;
    mochi.pout();
    physics.send({ t: 'puff' });
    sfx.pout();
    const h = headScreen();
    fx.word(h.x + 34, h.y + 30, '뿌우');
    fx.toast('찹쌀이가 삐졌어요. 살살 만져주세요');
  }
}

// ---- touch rings: where the fingertip is and how hard it presses ---------------------------
function makeRing() {
  const el = document.createElement('span');
  el.className = 'touch-ring';
  el.innerHTML = '<i></i><b></b>';
  ringLayer.appendChild(el);
  return el;
}

function updateRings() {
  const byId = new Map(physics.fingers.map((f) => [f.id, f]));
  const all = [...pointers.values()].filter((p) => p.kind === 'body');
  if (keyPress) all.push(keyPress);
  for (const p of all) {
    const f = byId.get(p.id);
    if (!f || !p.ring) continue;
    const c = toScreen(_w.set(f.xf[0], f.xf[1], f.xf[2]));
    const edge = toScreen(_w.set(f.xf[0] + f.radius, f.xf[1], f.xf[2]));
    const r = Math.max(14, Math.hypot(edge.x - c.x, edge.y - c.y));
    const fullF = params.fingerForce || DEFAULT_PARAMS.fingerForce;
    const k = clamp(Math.max(0, f.force) / (fullF * 1.3), 0, 1);
    p.ring.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
    p.ring.style.setProperty('--r', `${r.toFixed(1)}px`);
    p.ring.style.setProperty('--k', k.toFixed(3));
    p.ring.querySelector('b').textContent = f.stretch > 0.08 ? `${Math.round(f.stretch * 40)}mm` : `${Math.max(0, f.force).toFixed(1)}N`;
  }
}

// ---- physics events ---------------------------------------------------------------------------
function handleEvents() {
  for (const ev of physics.drainEvents()) {
    if (ev.type === 'release') {
      const p = pendingRelease.get(ev.id);
      pendingRelease.delete(ev.id);
      if (!p) continue;
      const pull = ev.stretch / 0.6;
      const depth = ev.depth / 0.45;
      if (pull > 0.35) {
        sfx.boing(Math.min(1, pull));
        buzz(14);
        fx.burst(p.x, p.y, 'spark', 3);
        fx.burst(p.x, p.y, 'heart', 1);
      } else {
        sfx.release(Math.min(1, depth));
        const n = depth > 0.85 ? 3 : Math.random() < 0.6 ? 1 : 2;
        fx.burst(p.x, p.y, 'heart', n);
      }
      mochi.timers.happy = pull > 0.5 ? 0.7 : 1.1;
    } else if (ev.type === 'slip') {
      const p = [...pointers.values()].find((q) => q.id === ev.id) || pendingRelease.get(ev.id);
      sfx.slip();
      buzz([10, 40, 14]);
      if (p) {
        fx.burst(p.x, p.y, 'spark', 5);
        fx.word(p.x, p.y - 20, '뾱!');
        if (p.kind === 'body') {
          p.kind = 'none';
          p.ring?.remove();
          updateHolding();
        }
      }
      pendingRelease.delete(ev.id);
    } else if (ev.type === 'slide') {
      if (Math.random() < 0.3) sfx.squish(0.4);
    } else if (ev.type === 'jump') {
      sfx.jump();
    } else if (ev.type === 'land') {
      sfx.land(ev.impact * 8);
      if (ev.impact > 0.35) {
        buzz(12);
        const l = toScreen(mochi.worldPoint(-1.0, 0.05, 0.6, _w));
        const r = toScreen(mochi.worldPoint(1.0, 0.05, 0.6, _w));
        fx.burst(l.x, l.y, 'spark', 2);
        fx.burst(r.x, r.y, 'spark', 2);
      }
    }
  }
}

// ---- per-frame extras -------------------------------------------------------------------------
let zTimer = 0;
let gazeWander = 2;
const SLEEP_AFTER = 30000;

function idleGaze(dt) {
  gazeIdle += dt;
  if (gazeIdle < 3.5 || mochi.asleep) return;
  gazeWander -= dt;
  if (gazeWander <= 0) {
    gazeWander = 1.4 + Math.random() * 2.4;
    if (Math.random() < 0.35) mochi.setGaze(0, 0);
    else mochi.setGaze((Math.random() - 0.5) * 1.2, (Math.random() - 0.4) * 0.8);
  }
}

function pressInfo() {
  let press = 0, held = false;
  const fullF = params.fingerForce || DEFAULT_PARAMS.fingerForce;
  for (const f of physics.fingers) {
    if (f.state !== 'down') continue;
    held = true;
    press = Math.max(press, f.depth / 0.45, (f.stretch / 0.7) * 1.1, f.force / (fullF * 1.4));
    const p = [...pointers.values()].find((q) => q.id === f.id) || (keyPress && keyPress.id === f.id ? keyPress : null);
    if (p && !p.squeaked && (f.depth > 0.4 || f.force > fullF * 1.15)) {
      p.squeaked = true;
      sfx.squeak();
      buzz(18);
    }
  }
  return { press, held };
}

function overlays(dt, now) {
  if (!mochi.asleep && !pointers.size && now - lastInteract > SLEEP_AFTER) {
    mochi.sleep();
    physics.send({ t: 'sleep', on: true });
  }
  if (mochi.asleep) {
    zTimer -= dt;
    if (zTimer <= 0) {
      zTimer = 1.3;
      const h = headScreen();
      fx.zzz(h.x + 30, h.y + 18);
    }
  }
  if (!hintEl.hidden) {
    const h = toScreen(mochi.worldPoint(0, 2.12, 0, _w));
    hintEl.style.transform = `translate(${h.x.toFixed(1)}px, ${(h.y - 8).toFixed(1)}px)`;
  }
}

// Left alone away from the middle of the plate (pulled by an ear, shaken),
// 찹쌀이 hops back toward the centre. Each hop is only a launch impulse with a
// horizontal part; the flight, landing and wobble are simulated.
const homing = { off: 0, cool: 0 };
function homeHop(dt) {
  homing.cool = Math.max(0, homing.cool - dt);
  const busy = [...pointers.values()].some((p) => p.kind === 'body' || p.kind === 'plate') || keyPress || shake || mochi.asleep;
  const cm = physics.frame.cm;
  const dx = cm[0] - physics.plate[0], dz = cm[2] - physics.plate[1];
  const d = Math.hypot(dx, dz);
  homing.off = !busy && d > 0.22 && physics.stats.ke < 2e-4 ? homing.off + dt : 0;
  if (homing.off > 0.9 && homing.cool <= 0) {
    physics.send({ t: 'hop', power: 0.5, dir: [-dx / d, -dz / d], speed: Math.min(5.5, 2 + d * 4) });
    homing.cool = 0.75;
    homing.off = 0;
  }
}

// Keyboard shake: the "hand" moves the plate back and forth; the body follows
// through friction and wobbles by its own inertia.
function updateShake(dt) {
  if (!shake) return;
  shake.t += dt;
  const t = shake.t;
  if (t > 1.3) {
    physics.send({ t: 'plate', x: 0, z: 0, held: false });
    shake = null;
    return;
  }
  const a = Math.min(1, t / 0.15) * (t > 1.1 ? (1.3 - t) / 0.2 : 1);
  physics.send({ t: 'plate', x: 0.55 * a * Math.sin(t * 2 * Math.PI * 3.2), z: 0.18 * a * Math.sin(t * 2 * Math.PI * 1.7), held: true });
}

// ---- adaptive render quality ---------------------------------------------------------------------
const perf = { ema: 1 / 60, slowFor: 0, fastFor: 0, lastPanel: 0 };
function adaptRender(dt, now) {
  perf.ema += (dt - perf.ema) * 0.05;
  if (perf.ema > 1 / 45) {
    perf.slowFor += dt;
    perf.fastFor = 0;
  } else if (perf.ema < 1 / 58) {
    perf.fastFor += dt;
    perf.slowFor = 0;
  } else {
    perf.slowFor = perf.fastFor = 0;
  }
  if (perf.slowFor > 2 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    layout();
    perf.slowFor = 0;
  } else if (perf.slowFor > 2 && renderer.shadowMap.type !== THREE.PCFShadowMap) {
    renderer.shadowMap.type = THREE.PCFShadowMap;
    perf.slowFor = 0;
  } else if (perf.fastFor > 6 && pixelRatio < maxPixelRatio()) {
    pixelRatio = Math.min(maxPixelRatio(), pixelRatio + 0.25);
    renderer.setPixelRatio(pixelRatio);
    layout();
    perf.fastFor = 0;
  }
  if (!panel.hidden && now - perf.lastPanel > 500) {
    perf.lastPanel = now;
    const s = physics.stats;
    $('#perf').textContent =
      `${{ low: '낮음', medium: '보통', high: '높음' }[tier]} · 입자 ${s.N} · 사면체 ${s.T} · 서브스텝 ${s.substeps} · ` +
      `물리 ${s.ms.toFixed(1)}ms (${s.mode === 'worker' ? '워커' : '메인'}) · ${Math.round(1 / perf.ema)}fps`;
  }
}

// ---- start ----------------------------------------------------------------------------------------
setSound(store.get('sound', true) !== false);
renderCount();
modeGroup.mark(PRESETS[modeKey] ? modeKey : null);
if (!PRESETS[modeKey]) modeKey = 'custom';
layout();
window.addEventListener('resize', layout);
document.fonts?.ready.then(layout);

await buildWorld(1.4); // drop onto the plate
setTimeout(showHint, 1100);

if (debug) {
  window.__chapssal = {
    get physics() { return physics; },
    get mochi() { return mochi; },
    get sim() { return sim; },
    camera,
    view,
    screenOf: (x, y, z) => toScreen(_w.set(x, y, z)),
    restScreenOf: (x, y, z) => toScreen(mochi.worldPoint(x, y, z, _w)),
    setParams,
    tier: () => tier,
    // stability diagnostics from the interpolated particle positions
    diag() {
      const x = physics.pos, T = sim.tets, X = sim.restPos;
      let inverted = 0, minJ = Infinity, maxJ = 0, nan = 0;
      for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) nan++;
      for (let t = 0; t < sim.nT; t++) {
        const v = [T[t * 4], T[t * 4 + 1], T[t * 4 + 2], T[t * 4 + 3]];
        const vol = (P) => {
          const a = v[0] * 3, b = v[1] * 3, c = v[2] * 3, d = v[3] * 3;
          const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
          const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
          const qx = P[d] - P[a], qy = P[d + 1] - P[a + 1], qz = P[d + 2] - P[a + 2];
          return ux * (wy * qz - wz * qy) - uy * (wx * qz - wz * qx) + uz * (wx * qy - wy * qx);
        };
        const J = vol(x) / vol(X);
        if (J <= 0) inverted++;
        minJ = Math.min(minJ, J);
        maxJ = Math.max(maxJ, J);
      }
      return { inverted, minJ, maxJ, nan, ke: physics.stats.ke, fingers: physics.fingers.length, stats: { ...physics.stats } };
    },
  };
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;
  updateShake(dt);
  homeHop(dt);
  physics.tick(dt);
  mochi.setState(physics.affine);
  mochi.setFingers(physics.fingers);
  stage.group.position.set(physics.plate[0], 0, physics.plate[1]);
  handleEvents();
  updateCamera(dt);
  mochi.setView(camera, LIGHT_DIR);
  idleGaze(dt);
  const { press, held } = pressInfo();
  mochi.update(dt, press, held);
  updateRings();
  overlays(dt, now);
  adaptRender(dt, now);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  physics?.pause(document.hidden);
});
