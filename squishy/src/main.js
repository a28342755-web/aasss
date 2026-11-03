import * as THREE from 'three';
import { Mochi, FLAVORS, MODES, damp } from './mochi.js';
import { Sfx } from './sound.js';
import { Fx } from './fx.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Per-browser conveniences only (counter, last flavor). Storage can be blocked,
// so every access is guarded and the page works without it.
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
      /* storage unavailable */
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
const fx = new Fx($('#fx'), $('#toast'));
const sfx = new Sfx();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  $('#nogl').hidden = false;
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);

// ---- scene ----------------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
const hemi = new THREE.HemisphereLight(0xfff6f2, 0xeed8dc, 1.5);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2.6, 6.5, 4.2);
scene.add(hemi, sun);
const LIGHT_DIR = sun.position.clone().normalize();

const coarse = window.matchMedia('(pointer: coarse)').matches;
const mochi = new Mochi({ detail: coarse ? 26 : 30 });
scene.add(mochi.group);

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
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, side: THREE.DoubleSide });
  const plate = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), plateMat);
  group.add(plate);

  const tex = radialTexture();
  const shadowMat = (opacity) =>
    new THREE.MeshBasicMaterial({ map: tex, color: 0x84485a, transparent: true, opacity, depthWrite: false });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat(0.45));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.004;
  blob.renderOrder = 1;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat(0.28));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.105;
  ground.scale.set(4.9, 4.9, 1);
  group.add(blob, ground);
  return { group, plateMat, blob, ground };
}

function applyTheme() {
  const cs = getComputedStyle(document.documentElement);
  const plate = cs.getPropertyValue('--plate').trim();
  const shade = cs.getPropertyValue('--shade').trim();
  if (plate) stage.plateMat.color.set(plate);
  if (shade) {
    stage.blob.material.color.set(shade);
    stage.ground.material.color.set(shade);
  }
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---- settings UI ----------------------------------------------------------
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
    const next = (i + step + buttons.length) % buttons.length;
    buttons[next].focus();
    onPick(items[next], true);
  });
  const mark = (picked) =>
    buttons.forEach((b, i) => {
      const on = items[i] === picked;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
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

const modeKeys = Object.keys(MODES);
const modeGroup = radioGroup($('#modes'), modeKeys, (k, byUser) => setMode(k, byUser));
modeGroup.buttons.forEach((b, i) => {
  b.id = `mode-${modeKeys[i]}`;
  b.textContent = MODES[modeKeys[i]].name;
});

function setFlavor(id, byUser) {
  const f = FLAVORS.find((x) => x.id === id) || FLAVORS[0];
  mochi.setFlavor(f);
  flavorGroup.mark(f);
  flavorLabel.textContent = `${f.name}맛`;
  store.set('flavor', f.id);
  if (byUser) {
    mochi.hop(0.5);
    lastInteract = performance.now();
  }
}

function setMode(key, byUser) {
  const k = MODES[key] ? key : 'soft';
  mochi.setMode(k);
  modeGroup.mark(k);
  store.set('mode', k);
  if (byUser) {
    fx.toast(`${MODES[k].name} · ${MODES[k].desc}`);
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

// ---- counter, milestones, hints ---------------------------------------------
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
  '누른 채로 쭉 당겨보세요',
  '톡톡 두 번 누르면 점프해요',
  '빈 곳을 끌면 빙글 돌아가요',
];
let hintDone = Number(store.get('hints', 0)) || 0;
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
  store.set('hints', hintDone);
  if (hintShown === i || hintShown < 0) {
    hintEl.classList.add('is-out');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(showHint, 2600);
  }
}

// ---- camera ---------------------------------------------------------------------
const TARGET = new THREE.Vector3(0, 0.9, 0);
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
  const needH = 3.35;
  const needW = 3.15;
  baseDist = Math.max((needH * fullH) / (2 * tanH * avail), (needW * fullH) / (2 * tanH * w));
  camera.aspect = w / fullH;
  camera.setViewOffset(w, fullH, 0, shift > 0 ? 2 * shift : 0, w, h);
  camera.updateProjectionMatrix();
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

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

// ---- helpers ------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _w = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _p = new THREE.Vector3();

function setNDC(e) {
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function toScreen(v) {
  _p.copy(v).project(camera);
  return { x: rect.left + ((_p.x + 1) / 2) * rect.width, y: rect.top + ((1 - _p.y) / 2) * rect.height };
}

const headScreen = () => toScreen(mochi.worldPoint(0, 1.98, 0, _w));

// Vibration is only allowed after the visitor has touched the page.
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

// ---- touching ------------------------------------------------------------------
const pointers = new Map();
const pokeTimes = [];
let lastTap = null;
let lastBgTap = null;
let lastPout = -1e9;
let pinch = null;
let lastInteract = performance.now();
let gazeIdle = 0;

const orbitPointers = () => [...pointers.values()].filter((p) => p.kind === 'orbit');

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sfx.unlock();
  touched = true;
  lastInteract = performance.now();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* capture is best effort */
  }
  setNDC(e);
  gazeAt(e.clientX, e.clientY);

  if (mochi.hitSprout(raycaster)) {
    mochi.flickSprout();
    sfx.sprout();
    buzz(8);
    fx.burst(e.clientX, e.clientY, 'spark', 2);
    pointers.set(e.pointerId, { kind: 'none' });
    return;
  }

  const hit = mochi.hitBody(raycaster);
  if (hit) {
    const pressure = e.pointerType === 'pen' ? 0.6 + e.pressure * 0.8 : 1;
    const def = mochi.grab(hit, pressure);
    if (!def) {
      pointers.set(e.pointerId, { kind: 'none' });
      return;
    }
    const normal = camera.getWorldDirection(new THREE.Vector3());
    pointers.set(e.pointerId, {
      kind: 'body',
      def,
      anchor: hit.point.clone(),
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      t0: performance.now(),
      moved: 0,
    });
    canvas.classList.add('is-holding');
    onPoke();
    return;
  }

  view.resetting = false;
  pointers.set(e.pointerId, { kind: 'orbit', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), t0: performance.now() });
  const ops = orbitPointers();
  if (ops.length === 2) pinch = { d0: Math.hypot(ops[0].x - ops[1].x, ops[0].y - ops[1].y), z0: view.zoom };
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse') {
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
    gazeAt(e.clientX, e.clientY);
    setNDC(e);
    const at = raycaster.ray.intersectPlane(p.plane, _hit);
    if (!at) return;
    const res = mochi.pull(p.def, at.x - p.anchor.x, at.y - p.anchor.y, at.z - p.anchor.z);
    if (res === 'stretch') {
      sfx.stretch();
      buzz(6);
      markHint(1);
    } else if (res === 'slip') {
      sfx.slip();
      buzz([10, 40, 14]);
      fx.burst(e.clientX, e.clientY, 'spark', 5);
      fx.word(e.clientX, e.clientY - 20, '뾱!');
      p.kind = 'none';
      updateHolding();
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
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 40) markHint(3);
  }
});

function updateHolding() {
  const holding = [...pointers.values()].some((p) => p.kind === 'body');
  canvas.classList.toggle('is-holding', holding);
}

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  sfx.unlock();
  updateHolding();
  if (orbitPointers().length < 2) pinch = null;

  if (p.kind === 'body') {
    const info = mochi.release(p.def);
    if (info) onRelease(info, p);
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
  if (e.pointerType === 'mouse' && !pointers.size) mochi.setGaze(0, 0);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Keyboard: Space/Enter presses the head, arrows turn the view, J hops.
let keyPress = null;
canvas.addEventListener('keydown', (e) => {
  lastInteract = performance.now();
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
    e.preventDefault();
    if (keyPress) return;
    sfx.unlock();
    touched = true;
    const def = mochi.pressHead();
    if (!def) return;
    const h = headScreen();
    keyPress = { def, x: h.x, y: h.y + 40, t0: -1e9, moved: 99 };
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
    if (mochi.hop(1)) markHint(2);
  }
});
canvas.addEventListener('keyup', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && keyPress) {
    const info = mochi.release(keyPress.def);
    if (info) onRelease(info, keyPress);
    keyPress = null;
  }
});
canvas.addEventListener('blur', () => {
  if (keyPress) {
    mochi.release(keyPress.def);
    keyPress = null;
  }
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    view.resetting = false;
    view.zoom = clamp(view.zoom * Math.exp(e.deltaY * 0.0012), 0.7, 1.5);
  },
  { passive: false },
);

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
    sfx.pout();
    const h = headScreen();
    fx.word(h.x + 34, h.y + 30, '뿌우');
    fx.toast('찹쌀이가 삐졌어요. 살살 만져주세요');
  }
}

function onRelease(info, p) {
  const now = performance.now();
  if (info.pull > 0.35) {
    sfx.boing(info.pull);
    buzz(14);
    fx.burst(p.x, p.y, 'spark', 3);
    fx.burst(p.x, p.y, 'heart', 1);
  } else {
    sfx.release(info.depth);
    const n = info.depth > 0.85 ? 3 : Math.random() < 0.6 ? 1 : 2;
    fx.burst(p.x, p.y, 'heart', n);
  }
  if (now - p.t0 < 280 && p.moved < 12) {
    if (lastTap && now - lastTap.t < 340 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 50) {
      if (mochi.hop(1)) markHint(2);
      lastTap = null;
    } else {
      lastTap = { t: now, x: p.x, y: p.y };
    }
  }
}

// ---- per-frame extras ------------------------------------------------------------
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

function afterStep() {
  for (const d of mochi.deformers) {
    if (d.held && !d.auto && !d.squeaked && d.depth > mochi.mode.maxDepth * 0.82) {
      d.squeaked = true;
      sfx.squeak();
      buzz(18);
    }
  }
  for (const ev of mochi.events) {
    if (ev.type === 'jump') sfx.jump();
    else if (ev.type === 'land') {
      sfx.land(ev.impact);
      if (ev.impact > 2.5) {
        buzz(12);
        const l = toScreen(mochi.worldPoint(-1.0, 0.05, 0.6, _w));
        const r = toScreen(mochi.worldPoint(1.0, 0.05, 0.6, _w));
        fx.burst(l.x, l.y, 'spark', 2);
        fx.burst(r.x, r.y, 'spark', 2);
      }
    } else if (ev.type === 'wake') {
      sfx.wake();
      const h = headScreen();
      fx.word(h.x, h.y, '앗!');
    }
  }
  mochi.events.length = 0;
}

function overlays(dt, now) {
  if (!mochi.asleep && !pointers.size && now - lastInteract > SLEEP_AFTER) mochi.sleep();
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
  const s = mochi.spread;
  const lift = mochi.jumpY;
  const k = 1 + lift * 0.35;
  stage.blob.scale.set(2.5 * s * k, 2.2 * s * k, 1);
  stage.blob.material.opacity = 0.45 * (1 - Math.min(0.75, lift * 1.3));
}

// ---- start ---------------------------------------------------------------------
setFlavor(store.get('flavor', 'milk'), false);
setMode(store.get('mode', 'soft'), false);
setSound(store.get('sound', true) !== false);
renderCount();
layout();
window.addEventListener('resize', layout);
document.fonts?.ready.then(layout);

// drop onto the plate
mochi.jumpY = 1.5;
mochi.airborne = true;
setTimeout(showHint, 1100);

if (new URLSearchParams(location.search).has('debug')) {
  window.__chapssal = { mochi, camera, view, screenOf: (x, y, z) => toScreen(mochi.worldPoint(x, y, z, _w)) };
}

const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 14) {
    mochi.step(STEP);
    acc -= STEP;
    n += 1;
  }
  if (n >= 14) acc = 0;
  updateCamera(dt);
  mochi.setView(camera, LIGHT_DIR);
  idleGaze(dt);
  mochi.update(dt);
  afterStep();
  overlays(dt, now);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
