// Whiteout Alley: game loop, local player, rendering, and the glue between netcode and the host sim.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { World, moveBody, findVault, pathAt, rayHitbox, sampleAt, angDiff, dirFrom, yawTo, F, R, H_STAND, H_CROUCH, EYE_STAND, EYE_CROUCH } from './core.js';
import { collisionBoxes, SPAWNS, MAT, botName, ZONES } from './map.js';
import { buildWorld, SUN } from './build.js';
import { Rifle } from './weapon.js';
import { Humanoid } from './humanoid.js';
import { loadSoldier, soldierReady, SkinnedSoldier } from './soldier.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { Sim, SCORE_LIMIT } from './sim.js';
import { Net, connect, PROTO, SEND_MS, cleanName } from './net.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import * as T from './textures.js';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;
const r2 = (v) => Math.round(v * 100) / 100, r4 = (v) => Math.round(v * 10000) / 10000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
const PATTERN = [0, 0.3, -0.2, 0.5, 0.8, 0.5, -0.2, -0.8, -1.1, -0.6, 0.2, 0.9, 1.2, 0.7, -0.3, -1.0, -1.2, -0.4, 0.5, 1.1];
const HIP_FOV = 78, ADS_FOV = 55, SCOPE_FOV = 64, VM_FOV = 56, VM_ADS_FOV = 42, MAG = 3.5;
const netReady = connect(); // start before the heavy scene build so the handshake overlaps it

// ---------------------------------------------------------------- renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const LOW_END = matchMedia('(pointer: coarse)').matches; // phones/tablets: smaller shadow map, no AO
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // refreshed once per frame, even when the scope renders the scene a second time
let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xbcd0e8, 0.0024);
const camera = new THREE.PerspectiveCamera(HIP_FOV, 1, 0.03, 600); camera.rotation.order = 'YXZ';
const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(VM_FOV, 1, 0.01, 10);
scene.add(new THREE.HemisphereLight(0xc2d4ec, 0xd9d5cd, 1.2)); // bright sky plus bounce off the snow, like the reference
const sun = new THREE.DirectionalLight(0xfff4e6, 4.2);
sun.castShadow = true; sun.shadow.mapSize.setScalar(LOW_END ? 2048 : 4096); sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 160 });
scene.add(sun, sun.target);
const scopeRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
const scopeCam = new THREE.PerspectiveCamera(10, 1, 0.05, 600);
const muzzleLight = new THREE.PointLight(0xffa850, 0, 10, 2); scene.add(muzzleLight);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
// Contact shadows: ambient occlusion in corners, under props and along wall bases (world only, before the viewmodel).
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: 0.9, distanceFallOff: 1, thickness: 1.2, scale: 1.25, samples: 12 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
const gtaoSize = gtao.setSize.bind(gtao), gtaoHide = gtao.overrideVisibility.bind(gtao);
gtao.setSize = (w, h) => gtaoSize(Math.ceil(w / 2), Math.ceil(h / 2)); // half resolution keeps it affordable
gtao.overrideVisibility = () => { // see-through and depthless things must not cast AO
  gtaoHide();
  scene.traverse((o) => { const m = o.material; if (o.isSprite || (m && (m.transparent || m.alphaTest > 0 || m.depthWrite === false))) o.visible = false; });
};
gtao.enabled = !LOW_END;
composer.addPass(gtao);
const vmPass = new RenderPass(vmScene, vmCam); vmPass.clear = false; vmPass.clearDepth = true; composer.addPass(vmPass);
// Clamp HDR before bloom: one overflowing specular pixel would otherwise bloom into a black screen.
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; if (any(isnan(c))) c = vec3(0.0); gl_FragColor = vec4(clamp(c, 0.0, 48.0), 1.0); }',
}));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 4.0)); // only muzzle flashes, the sun and glints
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDmg: { value: 0 }, uLow: { value: 0 }, uDead: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uDmg, uLow, uDead; uniform vec2 uRes; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float ca = 0.0012 + uDmg * 0.007 + uDead * 0.004;
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ca).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), clamp(uLow * 0.7 + uDead * 0.55, 0.0, 0.9));
      col = mix(col, col * vec3(1.3, 0.55, 0.5), uDmg * 0.45 + uDead * 0.3);
      col *= mix(1.0, smoothstep(0.95, 0.2, length(c * vec2(1.0, 0.85))), 0.45 + uLow * 0.3);
      float g = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(g), col, 0.96);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.15);
      float n = fract(sin(dot(vUv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      gl_FragColor = vec4(col + (n - 0.5) * 0.028, 1.0);
    }`,
});
composer.addPass(grade);

// ---------------------------------------------------------------- world and systems
const world = new World(collisionBoxes());
const env = buildWorld(scene, renderer);
vmScene.environment = scene.environment; vmScene.environmentIntensity = 1.0;
const fx = new FX(scene, world), sound = new Sound(), hud = new HUD(), input = new Input(canvas);
const weapon = new Rifle(vmScene, scene, world);
weapon.pip.material.map = scopeRT.texture; weapon.pip.material.color.set(0xffffff); weapon.pip.material.needsUpdate = true;
// Capture-point rings on the snow, tinted by who holds them.
const zoneRings = ZONES.map((Z) => {
  const m = new THREE.Mesh(new THREE.RingGeometry(Z.r - 0.14, Z.r, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  m.position.set(Z.x, 0.03, Z.z); scene.add(m);
  return m;
});
weapon.onEvent = (name, p) => (name.startsWith('clink') ? sound.clink(p, name === 'clinkSoft') : sound.mech(name));
const flashTex = T.flashTex();
const flashes = Array.from({ length: 6 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(4, 3, 2), blending: THREE.AdditiveBlending, depthWrite: false }));
  s.visible = false; scene.add(s); return { s, t: 0 };
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = vmCam.aspect = w / h; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  grade.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  env.resize(h * pixelRatio, HIP_FOV);
  fx.setScale(h * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(HIP_FOV) / 2)));
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- local player & session state
const me = {
  x: 0, y: 0, z: 30, vx: 0, vy: 0, vz: 0, r: R, h: H_STAND, onGround: true, grounded: true, yaw: 0, pitch: 0, crouch: 0, crouchOn: false,
  state: 'menu', hp: 100, vault: null, pP: 0, pY: 0, pPV: 0, pYV: 0, shots: 0, lastShot: -1e9, bloom: 0, eyeOff: 0, stepAcc: 0, bob: 0,
  deadAt: 0, spawnAt: 0, waitAt: 0, killer: '', shake: 0, landDip: 0, landed: 0, beatT: 0, breathT: 3, sprinting: false, look: [0, 0], roundEnd: false,
};
let callsign = cleanName(store.get('wa-name') || '') || 'Operator-' + (100 + Math.floor(Math.random() * 900));
$('callsign').value = callsign;
let sens = parseFloat(store.get('wa-sens')) || 1;
$('sens').value = sens;
let deployed = false, myJ = Date.now(), away = false;
let net = null, sim = null, evRing = [], evSeq = 0, myHist = [], sendAcc = 0;
const ents = new Map(), corpses = [];
const cb = { playerEvent, hostEvent, hostChanged };

const myId = () => (net ? net.idOf.get(net.me) : undefined);
const teamOf = (id) => (net ? net.teamOf.get(id) : undefined);
const myTeam = () => teamOf(myId());
const TEAM_COL = [new THREE.Color(0x35d0c3), new THREE.Color(0xef4b4b), new THREE.Color(0xf0f0f0)];
function nameOf(id) {
  if (id !== undefined && id === myId()) return callsign;
  if (id >= 1 && id < 10) return botName(id);
  const peer = net && net.peerOf.get(id), rec = peer && net.recs.get(peer);
  return (rec && rec.name) || 'Operator';
}
const entById = (id) => { for (const e of ents.values()) if (e.id === id) return e; return null; };

function flags() {
  return (me.crouchOn ? F.CROUCH : 0) | (weapon.ads > 0.5 ? F.ADS : 0) | (me.sprinting ? F.SPRINT : 0) | (!me.onGround && !me.vault ? F.AIR : 0) |
    (me.state !== 'alive' ? F.DEAD : 0) | (weapon.reloading ? F.RELOAD : 0) | (me.vault ? F.VAULT : 0);
}
const myState = () => [r2(me.x), r2(me.y), r2(me.z), r4(me.yaw), r4(me.pitch), flags()];
function pushEv(...ev) { evRing.push([++evSeq, ...ev]); if (evRing.length > 12) evRing.shift(); }

function publish(now) {
  const t = Math.round(now), s = myState();
  myHist.push({ t, s });
  while (myHist.length > 2 && t - myHist[0].t > 1500) myHist.shift();
  let h = null;
  if (sim) { h = sim.snapshot(t); h = { ...h, e: h.e.slice(), f: h.f.slice() }; net.ingest(t, h, cb, true); }
  net.t.set({ v: PROTO, n: callsign, j: myJ, on: deployed ? 1 : 0, away: away ? 1 : 0, t, s, e: evRing.slice(), h });
}

// ---------------------------------------------------------------- network callbacks
function hostChanged(host, old) {
  if (host && host === net.me) {
    sim = new Sim(world);
    if (old && net.lastH) sim.load(net.lastH, performance.now());
    net.seqE = 0; net.seqF = 0; // our own fresh event rings: process everything
  } else sim = null;
  for (const [k, e] of ents) if (e.bot) removeEnt(k);
}
function hostEvent(ev) {
  const a = ev.slice(2);
  if (!a.length || !a.every(num)) return;
  switch (ev[1]) {
    case 'd': onHurt(...a); break;
    case 'k': onKill(...a); break;
    case 'r': if (a[0] === myId()) spawnAt(a[1], a[2], a[3], a[4]); break;
    case 'b': onShot(ents.get('b' + a[0]), a[1], a[2], a[3], a[4], 2); break;
    case 'm': onMatch(a[0], a[1]); break;
    case 'z': onZone(a[0], a[1]); break;
  }
}
function playerEvent(rec, ev) {
  const a = ev.slice(2);
  if (!a.every(num)) return;
  if (ev[1] === 'f' && a.length >= 4) {
    onShot(ents.get('p' + rec.peer), a[0], a[1], a[2], a[3], 1);
    if (sim) { const e = sim.byPeer(rec.peer); if (e) sim.alert(e); }
  } else if (ev[1] === 'h' && sim && a.length >= 9) {
    const [target, zone, rt, ox, oy, oz, dx, dy, dz] = a, l = Math.hypot(dx, dy, dz);
    if (l > 0.5 && l < 1.5) sim.claim(sim.byPeer(rec.peer), { target, zone, rt, o: [ox, oy, oz], d: [dx / l, dy / l, dz / l] }, false);
  }
}

const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
function flashAt(p) {
  const f = flashes.find((x) => x.t <= 0) || flashes[0];
  f.s.position.copy(p); f.s.scale.setScalar(0.35 + Math.random() * 0.25); f.s.material.rotation = Math.random() * 6; f.t = 0.05; f.s.visible = true;
  muzzleLight.position.copy(p); muzzleLight.intensity = 5;
}
// Another shooter's round: tracer, flash, report, impact, and the crack if it passes close to us.
function onShot(ent, hx, hy, hz, mat, kind) {
  if (!ent || !ent.st) return;
  const to = new THREE.Vector3(hx, hy, hz);
  const from = ent.alive ? ent.hum.muzzle(new THREE.Vector3()) : new THREE.Vector3(ent.st[0], ent.st[1] + 1.45, ent.st[2]);
  const dir = vA.subVectors(to, from), dist = dir.length();
  if (dist < 0.05) return;
  dir.divideScalar(dist);
  fx.tracer(from, to); flashAt(from); sound.shot(from, kind);
  const cam = camera.position, nearMe = to.distanceTo(cam) < 1.1;
  if (mat === MAT.FLESH) { if (!nearMe) fx.blood([hx, hy, hz], [dir.x, dir.y, dir.z], false); sound.impact(to, MAT.FLESH); }
  else if (mat) { const w = world.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, dist + 0.3); if (w) { fx.impact(w.p, w.n, w.mat); sound.impact(to, w.mat); } }
  if (me.state === 'alive' && !nearMe) {
    const t = Math.max(0, Math.min(dist, vB.subVectors(cam, from).dot(dir)));
    const close = vC.copy(from).addScaledVector(dir, t);
    if (t > 3 && close.distanceTo(cam) < 1.6) sound.snap(close);
  }
}
function onHurt(target, attacker, dmg, zone, hp) {
  if (target !== myId() || me.state !== 'alive') return;
  me.hp = hp;
  const src = entById(attacker);
  const ang = src ? -angDiff(me.yaw, yawTo(src.st[0] - me.x, src.st[2] - me.z)) : 0;
  hud.damage(dmg, ang); sound.ui('hurt');
  me.pPV += (0.5 + Math.random() * 0.5) * 0.8 * MOTION; me.pYV += (Math.random() - 0.5) * 1.1 * MOTION;
  me.shake = Math.min(1, me.shake + dmg / 30);
}
function onKill(victim, killer, hs, dx, dz) {
  const mine = myId(), mt = myTeam();
  hud.feed(nameOf(killer), nameOf(victim), hs === 1, killer === mine || victim === mine, teamOf(killer) === mt, teamOf(victim) === mt);
  if (victim === mine) { die(killer, dx, dz, hs); return; }
  const e = entById(victim);
  if (e) { if (!e.hum.rag) e.hum.kill([dx, dz], hs ? 0 : 1, e.vel); e.alive = false; e.killedAt = performance.now(); }
  if (killer === mine) { hud.hit('kill'); sound.ui('kill'); hud.center((hs ? 'HEADSHOT  ' : 'ELIMINATED  ') + nameOf(victim)); }
}
function onZone(i, team) {
  const Z = ZONES[i];
  if (!Z) return;
  const mt = myTeam();
  if (team === -1) { hud.center(`${Z.id}  NEUTRALIZED`); return; }
  hud.center(team === mt ? `${Z.id}  CAPTURED` : `${Z.id}  LOST`);
  sound.ui(team === mt ? 'cap' : 'lost');
}
function onMatch(state, winner) {
  if (state === 1) {
    me.roundEnd = true;
    const mt = myTeam(), s = net.match, ours = mt === 1 ? s[4] : s[3], theirs = mt === 1 ? s[3] : s[4];
    hud.banner(winner === -1 ? 'DRAW' : winner === mt ? 'VICTORY' : 'DEFEAT', `${ours} : ${theirs} · next round in 10 seconds`);
  }
  else { me.roundEnd = false; hud.banner(''); if (deployed && me.state === 'alive') { me.state = 'waiting'; me.waitAt = performance.now(); } }
}
function die(killer, dx = 0, dz = 0, hs = 0) {
  if (me.state === 'dead') return;
  me.state = 'dead'; me.deadAt = performance.now(); me.killer = killer ? nameOf(killer) : ''; me.hp = 0; me.vault = null;
  // third-person death cam on our own ragdoll
  me.body = makeHum('me', false, myTeam());
  me.body.pose(myState(), 0.016, [me.vx, me.vz]);
  me.body.kill([dx || -Math.sin(me.yaw) * -1, dz || -Math.cos(me.yaw) * -1], hs ? 0 : 1, [me.vx, me.vz]);
  me.camYaw = Math.atan2(dx, dz) + Math.PI;
  hud.banner('ELIMINATED', me.killer ? `by ${me.killer}` : ''); sound.setMuffle(450); sound.ui('ring');
  weapon.root.visible = false; input.fire = false;
}
function spawnAt(x, y, z, yaw) {
  Object.assign(me, { x, y, z, yaw, pitch: 0, vx: 0, vy: 0, vz: 0, hp: 100, vault: null, pP: 0, pY: 0, pPV: 0, pYV: 0, spawnAt: performance.now(), crouchOn: false, h: H_STAND, onGround: true });
  if (deployed) me.state = 'alive';
  weapon.reset(); weapon.root.visible = true;
  if (me.body) { corpses.push({ hum: me.body, t: 0 }); me.body = null; }
  if (!me.roundEnd) hud.banner(''); hud.clearBlood(); sound.setMuffle(20000);
}

// ---------------------------------------------------------------- remote entities
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function makeHum(key, bot, team) { return new (soldierReady() ? SkinnedSoldier : Humanoid)(scene, (team === 1 ? 2 : 0) + (hash(key) % 2)); }
// Swap in the skinned soldiers once the model arrives; the procedural body stays as the fallback if it never does.
loadSoldier('assets/soldier.json').then((ok) => { if (ok) for (const e of ents.values()) if (!e.hum.rag) { e.hum.dispose(); e.hum = makeHum(e.key, e.bot, e.team); } });
function removeEnt(key) {
  const e = ents.get(key);
  if (!e) return;
  if (e.hum.rag) corpses.push({ hum: e.hum, t: 0 }); else e.hum.dispose();
  ents.delete(key);
}
function touch(key, id, bot, st, rt, seen) {
  seen.add(key);
  let e = ents.get(key);
  const team = teamOf(id);
  if (!e) { e = { key, id, bot, st, rt, team, alive: !(st[5] & F.DEAD), vel: [0, 0], last: [st[0], st[2]], stepAcc: 0, breathT: Math.random() * 3, killedAt: -1e9, deadSeen: 0, hum: makeHum(key, bot, team) }; ents.set(key, e); }
  if (team !== e.team && !e.hum.rag) { e.hum.dispose(); e.hum = makeHum(key, bot, team); } // team became known
  e.id = id; e.st = st; e.rt = rt; e.team = team;
}
function updateEnts(dt, now) {
  const seen = new Set();
  if (sim) { for (const b of sim.ents.values()) if (b.bot) touch('b' + b.id, b.id, true, [b.x, b.y, b.z, b.yaw, b.pitch, b.alive ? b.flags : F.DEAD], now, seen); }
  else if (net && net.hostRec) {
    const rt = net.renderTime(net.hostRec, now);
    for (const [id, buf] of net.botBufs) { const st = sampleAt(buf, rt); if (st) touch('b' + id, id, true, st, rt, seen); }
  }
  if (net) for (const rec of net.recs.values()) {
    if (!rec.pr.on || !rec.buf.length) continue;
    const rt = net.renderTime(rec, now), st = sampleAt(rec.buf, rt);
    if (st) touch('p' + rec.peer, net.idOf.get(rec.peer), false, st, rt, seen);
  }
  for (const k of [...ents.keys()]) if (!seen.has(k)) removeEnt(k);
  for (const e of ents.values()) {
    const st = e.st, dead = !!(st[5] & F.DEAD);
    const dx = st[0] - e.last[0], dz = st[2] - e.last[1], tele = Math.hypot(dx, dz) > 2.5;
    e.last = [st[0], st[2]];
    const k = Math.min(1, dt * 10), idt = 1 / Math.max(dt, 1e-3);
    e.vel[0] += ((tele ? 0 : dx * idt) - e.vel[0]) * k; e.vel[1] += ((tele ? 0 : dz * idt) - e.vel[1]) * k;
    if (dead) {
      e.deadSeen += dt;
      if (!e.hum.rag && e.deadSeen > 0.3) { e.hum.kill([0, 0], 1, e.vel); e.killedAt = now; }
      e.alive = false;
    } else {
      e.deadSeen = 0;
      if (e.hum.rag) {
        if (now - e.killedAt < 1500) { e.hum.update(dt, world); continue; } // stale alive state still in the buffer
        corpses.push({ hum: e.hum, t: 0 }); e.hum = makeHum(e.key, e.bot, e.team);
      }
      e.alive = true;
      e.hum.pose(st, dt, e.vel);
      const sp = Math.hypot(e.vel[0], e.vel[1]);
      e.stepAcc += sp * dt;
      if (e.stepAcc > (sp > 4 ? 1.05 : 0.78) && !(st[5] & (F.AIR | F.VAULT))) {
        e.stepAcc = 0;
        sound.step(vA.set(st[0], st[1] + 0.05, st[2]), (st[5] & F.CROUCH) ? 0.22 : sp > 4 ? 0.9 : 0.55);
        if (sp > 4) fx.kick(st[0], st[2]);
      }
      e.breathT -= dt * (sp > 4 ? 1.8 : 1);
      if (e.breathT < 0) { e.breathT = 2.4 + Math.random() * 1.2; fx.breath(e.hum.headPos(vA), vB.set(-Math.sin(st[3]), 0, -Math.cos(st[3]))); }
    }
    e.hum.update(dt, world);
  }
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    c.t += dt;
    c.hum.update(dt, world);
    if (c.t > 14) c.hum.g.position.y = -(c.t - 14) * 0.4; // sink into the snow
    if (c.t > 15.5 || corpses.length > 7) { c.hum.dispose(); corpses.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- local player
function updatePlayer(dt, now) {
  const [lx, ly] = input.look();
  me.look = [lx, ly];
  const k = 0.0022 * sens * (camera.fov / HIP_FOV);
  if (me.state === 'alive') { me.yaw -= lx * k; me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - ly * k)); }
  me.pPV += (-110 * me.pP - 13 * me.pPV) * dt; me.pP += me.pPV * dt;
  me.pYV += (-110 * me.pY - 13 * me.pYV) * dt; me.pY += me.pYV * dt;
  me.shake = Math.max(0, me.shake - dt * 4);
  me.landDip = Math.max(0, me.landDip - dt * 0.5);
  if (now - me.lastShot > 260) me.shots = 0;
  me.bloom = Math.max(0, me.bloom - dt * 0.05);
  me.sprinting = false;
  if (me.state !== 'alive') return;
  if (input.tap('KeyR')) weapon.startReload();
  if (input.tap('KeyV')) { weapon.setOptic(weapon.optic === 'holo' ? 'scope' : 'holo'); sound.mech('magin'); }
  const [mf, ms] = input.move();
  const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  let wx = -sin * mf + cos * ms, wz = -cos * mf - sin * ms;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  if (input.crouch) { me.crouchOn = true; me.h = H_CROUCH; }
  else if (me.crouchOn && world.bodyFree(me.x, me.y, me.z, me.r, H_STAND)) { me.crouchOn = false; me.h = H_STAND; }
  me.crouch += ((me.crouchOn ? 1 : 0) - me.crouch) * Math.min(1, dt * 12);
  me.sprinting = input.sprint && mf > 0 && !input.ads && !input.fire && !me.crouchOn;
  if (me.vault) {
    const v = me.vault;
    v.t += dt / v.dur;
    const p = pathAt(v.path, Math.min(1, v.t));
    me.x = p[0]; me.y = p[1]; me.z = p[2];
    if (v.t >= 1) { me.vault = null; me.vx = v.dir[0] * 3.4; me.vz = v.dir[1] * 3.4; me.vy = 0; me.onGround = true; sound.step(null, 0.5, true); }
  } else {
    const ads = weapon.ads > 0.5, speed = me.sprinting ? 6.5 : me.crouchOn ? 2.1 : ads ? 2.7 : 4.4;
    const kk = Math.min(1, (me.onGround ? 11 : 2.2) * dt);
    me.vx += (wx * speed - me.vx) * kk; me.vz += (wz * speed - me.vz) * kk;
    const jumpTap = input.tap('Space');
    if (jumpTap || (input.down('Space') && !me.onGround && me.vy < 1.5 && mf > 0)) {
      const dir = wl > 0.1 ? [wx / Math.min(1, wl), wz / Math.min(1, wl)] : [-sin, -cos];
      const dl = Math.hypot(dir[0], dir[1]) || 1;
      const v = findVault(world, me, dir[0] / dl, dir[1] / dl);
      if (v) { me.vault = { ...v, t: 0, dir: [dir[0] / dl, dir[1] / dl] }; sound.mech('vault'); me.vx = me.vz = 0; }
      else if (jumpTap && me.onGround) { me.vy = 5.0; sound.step(null, 0.35); }
    }
    const wasGround = me.onGround, fallV = me.vy;
    me.stepped = 0;
    moveBody(world, me, dt);
    if (me.stepped) me.eyeOff -= me.stepped;
    if (!wasGround && me.onGround && fallV < -3.5) { sound.step(null, Math.min(1.2, -fallV / 7), true); me.landed = -fallV; me.landDip = Math.min(0.1, -fallV * 0.011) * MOTION; }
    const sp = Math.hypot(me.vx, me.vz);
    if (me.onGround && sp > 0.6) {
      me.stepAcc += sp * dt; me.bob += sp * dt * 4.2;
      if (me.stepAcc > (me.sprinting ? 1.05 : 0.8)) { me.stepAcc = 0; sound.step(null, me.crouchOn ? 0.1 : me.sprinting ? 0.4 : 0.26); }
    }
  }
  me.eyeOff *= Math.max(0, 1 - dt * 12);
  if (me.y < -3) spawnAt(...SPAWNS[0]);
  me.breathT -= dt * (me.sprinting ? 2 : 1);
  if (me.breathT < 0) { me.breathT = 3 + Math.random() * 1.5; fx.breath(vA.set(me.x, me.y + EYE_STAND - 0.1, me.z), vB.set(-sin, 0, -cos)); }
}

function updateCamera(dt, now) {
  const fov = HIP_FOV + ((weapon.optic === 'scope' ? SCOPE_FOV : ADS_FOV) - HIP_FOV) * weapon.ads + (me.sprinting ? 4 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 14);
  camera.updateProjectionMatrix();
  vmCam.fov = VM_FOV + (VM_ADS_FOV - VM_FOV) * weapon.ads; vmCam.updateProjectionMatrix(); // sights fill more of the view when aiming
  if (me.state === 'menu' || me.state === 'waiting') {
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 1.1, 2.1 + Math.sin(t * 0.13) * 0.12, 27 - ((t * 0.55) % 42));
    camera.rotation.set(0.05, Math.sin(t * 0.07) * 0.14, 0);
  } else if (me.state === 'dead' && me.body) {
    // orbit our own ragdoll from above, pulled in if a wall is in the way
    const tgt = me.body.j[2], k = Math.min(1, (now - me.deadAt) / 900), a = me.camYaw + (now - me.deadAt) / 1000 * 0.35;
    const dist = 1.2 + 2.4 * k, dir = vC.set(Math.sin(a), 0.55 + 0.25 * k, Math.cos(a)).normalize();
    const w = world.raycast(tgt.x, tgt.y + 0.3, tgt.z, dir.x, dir.y, dir.z, dist);
    const d = w ? Math.max(0.4, w.t - 0.25) : dist;
    camera.position.set(tgt.x + dir.x * d, tgt.y + 0.3 + dir.y * d, tgt.z + dir.z * d);
    camera.lookAt(tgt.x, tgt.y + 0.1, tgt.z);
  } else {
    const eye = EYE_STAND + (EYE_CROUCH - EYE_STAND) * me.crouch;
    const sp = Math.hypot(me.vx, me.vz) / 6.5, bobY = Math.sin(me.bob * 2) * 0.018 * sp * MOTION * (1 - weapon.ads * 0.7);
    camera.position.set(me.x, me.y + eye + me.eyeOff - me.landDip + bobY, me.z);
    const v = me.vault ? Math.sin(Math.PI * Math.min(1, me.vault.t)) : 0;
    const sh = me.shake * 0.006 * MOTION;
    const strafe = (Math.cos(me.yaw) * me.vx - Math.sin(me.yaw) * me.vz) / 6.5;
    camera.rotation.set(me.pitch + me.pP + (Math.random() - 0.5) * sh - v * 0.1, me.yaw + me.pY + (Math.random() - 0.5) * sh, -strafe * 0.012 + v * 0.07);
  }
  camera.updateMatrixWorld();
  sun.target.position.copy(camera.position);
  sun.position.copy(camera.position).addScaledVector(SUN, 70);
}

function spreadNow() {
  const ads = weapon.ads > 0.5, sp = Math.hypot(me.vx, me.vz);
  let s = ads ? 0.0012 : 0.016;
  s += sp / 6.5 * (ads ? 0.008 : 0.022) + (me.onGround || me.vault ? 0 : 0.05) + me.bloom * (ads ? 0.3 : 1);
  return me.crouchOn ? s * 0.7 : s;
}

function handleFire(now) {
  if (me.state !== 'alive' || me.vault || !input.fire) return;
  if (weapon.ammo === 0 && !weapon.reloading) { if (input.firePressed) sound.mech('dry'); weapon.startReload(); return; }
  while (input.fire && weapon.canFire()) fireShot(now);
}
function fireShot(now) {
  const adsK = weapon.ads;
  let spread = spreadNow();
  if (me.shots === 0 && Math.hypot(me.vx, me.vz) < 0.5) spread *= 0.25;
  weapon.fire(adsK);
  me.bloom = Math.min(0.03, me.bloom + 0.0035);
  const d = dirFrom(me.yaw + me.pY + gauss() * spread, me.pitch + me.pP + gauss() * spread);
  const o = [camera.position.x, camera.position.y, camera.position.z];
  const w = world.raycast(o[0], o[1], o[2], d[0], d[1], d[2], 300);
  let best = w ? w.t : 300, hit = null, zone = -1;
  const mt = myTeam();
  for (const e of ents.values()) { // rounds pass through teammates
    if (!e.alive || e.id === undefined || (mt !== undefined && e.team === mt)) continue;
    const h = rayHitbox(o[0], o[1], o[2], d[0], d[1], d[2], best, e.st);
    if (h) { best = h.t; hit = e; zone = h.zone; }
  }
  const hp = [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best];
  const muzzle = camera.localToWorld(weapon.toCamera(weapon.muzzle, new THREE.Vector3(), camera.fov, vmCam.fov));
  if (best > 2.5) fx.tracer(muzzle, vA.set(...hp));
  muzzleLight.position.copy(muzzle); muzzleLight.intensity = 7;
  if (me.shots % 3 === 2) fx.smoke(muzzle);
  const ej = camera.localToWorld(weapon.toCamera(weapon.port, new THREE.Vector3(), camera.fov, vmCam.fov));
  const ev = new THREE.Vector3(2.0 + Math.random() * 1.2, 1.3 + Math.random() * 0.9, 0.3 + Math.random() * 0.6).applyQuaternion(camera.quaternion);
  ev.x += me.vx; ev.z += me.vz;
  weapon.casings.spawn(ej, ev);
  sound.shot(null, 0);
  let mat = w ? w.mat : MAT.NONE;
  if (hit) {
    mat = MAT.FLESH;
    fx.blood(hp, d, zone === 0); sound.impact(vA.set(...hp), MAT.FLESH);
    hud.hit(zone === 0 ? 'head' : 'hit'); sound.ui(zone === 0 ? 'head' : 'hit');
    const claim = { target: hit.id, zone, rt: hit.rt, o, d };
    if (sim) sim.claim(sim.byPeer(net.me), claim, true);
    else pushEv('h', hit.id, zone, Math.round(hit.rt), r2(o[0]), r2(o[1]), r2(o[2]), r4(d[0]), r4(d[1]), r4(d[2]));
  } else if (w) { fx.impact(w.p, w.n, w.mat); sound.impact(vA.set(...w.p), w.mat); }
  pushEv('f', r2(hp[0]), r2(hp[1]), r2(hp[2]), mat);
  if (sim) { const self = sim.byPeer(net.me); if (self) sim.alert(self); }
  const n = me.shots++;
  me.lastShot = now;
  const climb = (adsK > 0.5 ? 0.0058 : 0.0074) * (1 + Math.min(n, 8) * 0.06);
  const side = PATTERN[n % PATTERN.length] * 0.0032 + (Math.random() - 0.5) * 0.002;
  me.pitch += climb * 0.6; me.yaw -= side * 0.6;            // part of the kick stays: pull down to control it
  me.pPV += climb * 0.4 * 28; me.pYV -= side * 0.4 * 28;     // the rest snaps back
  me.shake = Math.min(1, me.shake + 0.25);
}

// ---------------------------------------------------------------- HUD, menu, loop
let aimT = 0, promptT = 0, roomT = 0;
function updateHud(dt, now) {
  const alive = me.state === 'alive';
  hud.vitals(me.hp, weapon.ammo, weapon.reserve, weapon.reloading);
  const gap = 4 + spreadNow() * innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  hud.crosshair(Math.min(60, gap), alive && weapon.ads < 0.5 && weapon.sprint < 0.4);
  if (!net) return;
  const sc = net.sc, mine = sc.find((r) => r[0] === myId()), mt = myTeam() ?? 0;
  const ours = net.match[mt === 1 ? 4 : 3] | 0, theirs = net.match[mt === 1 ? 3 : 4] | 0;
  const zs = ZONES.map((Z, i) => {
    const z = net.zones[i] || [0, -1, 0], rel = mt === 1 ? -z[0] : z[0];
    return { owner: z[1] === -1 ? 0 : z[1] === mt ? 1 : -1, rel, contested: z[2] === 1 };
  });
  hud.objectives(zs, ours, theirs, net.match[1] | 0, SCORE_LIMIT);
  zs.forEach((z, i) => { zoneRings[i].material.color.copy(TEAM_COL[z.owner === 1 ? 0 : z.owner === -1 ? 1 : 2]); });
  // objective markers and teammate name tags, projected onto the screen
  const W = innerWidth, H = innerHeight, proj = (x, y, z) => { vA.set(x, y, z).project(camera); return vA.z < 1 && Math.abs(vA.x) < 1.2 && Math.abs(vA.y) < 1.2 ? [(vA.x + 1) / 2 * W, (1 - vA.y) / 2 * H] : null; };
  let inZone = -1;
  hud.markers(ZONES.map((Z, i) => {
    const d = Math.hypot(Z.x - me.x, Z.z - me.z);
    if (d < Z.r && alive) inZone = i;
    const p = deployed && d >= Z.r ? proj(Z.x, 2.8, Z.z) : null;
    return { show: !!p, x: p ? p[0] : 0, y: p ? p[1] : 0, letter: Z.id, cls: zs[i].owner === 1 ? 'us' : zs[i].owner === -1 ? 'them' : 'free', dist: Math.round(d) };
  }));
  if (inZone >= 0) {
    const z = zs[inZone], id = ZONES[inZone].id;
    hud.capture(z.contested ? `${id}  CONTESTED` : z.owner === 1 && z.rel > 0.99 ? `${id}  SECURED` : z.owner === -1 && z.rel < 0 ? `NEUTRALIZING ${id}` : `CAPTURING ${id}`, Math.abs(z.rel), z.rel >= 0 ? 'us' : 'them');
  } else hud.capture('');
  const tags = [];
  if (deployed) for (const e of ents.values()) {
    if (!e.alive || e.team === undefined || e.team !== mt) continue;
    const p = proj(e.st[0], e.st[1] + ((e.st[5] & F.CROUCH) ? 1.5 : 2.05), e.st[2]);
    if (p && Math.hypot(e.st[0] - me.x, e.st[2] - me.z) < 70) tags.push({ x: p[0], y: p[1], name: nameOf(e.id) });
  }
  hud.tags(tags);
  const rows = sc.map((r) => ({ name: nameOf(r[0]), k: r[2], d: r[3], caps: r[7] | 0, bot: r[0] < 10, me: r[0] === myId(), us: r[6] === mt }))
    .sort((a, b) => b.caps - a.caps || b.k - a.k || a.d - b.d);
  hud.board(rows, deployed && (input.down('Tab') || me.roundEnd), ours, theirs);
  const players = 1 + net.deployed().length;
  hud.net(net.t.kind === 'solo' ? 'SOLO · BOTS' : `${net.t.kind === 'room' ? 'ROOM' : 'RELAY'} · ${players} PLAYER${players === 1 ? '' : 'S'}${net.isHost ? ' · HOST' : ''}`);
  if ((aimT -= dt) < 0) {
    aimT = 0.1;
    let name = '';
    if (alive) {
      const d = dirFrom(me.yaw + me.pY, me.pitch + me.pP), o = camera.position;
      const w = world.raycast(o.x, o.y, o.z, d[0], d[1], d[2], 70);
      let best = w ? w.t : 70;
      for (const e of ents.values()) if (e.alive && e.id !== undefined && e.team !== mt) { const h = rayHitbox(o.x, o.y, o.z, d[0], d[1], d[2], best, e.st, 0.1); if (h) { best = h.t; name = nameOf(e.id); } }
    }
    hud.aimName(name);
  }
  if ((promptT -= dt) < 0) {
    promptT = 0.15;
    let p = '';
    if (alive && me.onGround && !me.vault) {
      const v = findVault(world, me, -Math.sin(me.yaw), -Math.cos(me.yaw));
      if (v) p = v.kind === 'vault' ? 'SPACE  VAULT' : 'SPACE  CLIMB';
    }
    if (alive && weapon.ammo <= 6 && !weapon.reloading && weapon.reserve > 0) p = p || 'R  RELOAD';
    hud.prompt(p);
  }
  if (me.state === 'dead') hud.banner('KILLED', `${me.killer ? `by ${me.killer} · ` : ''}redeploying`);
  if (me.state === 'waiting' && deployed && !me.roundEnd) hud.banner('DEPLOYING', net.hostPeer ? 'finding a spawn' : 'connecting to the room');
  hud.update(dt, me.hp, me.state === 'dead');
  // Recover from dropped events with the host's scoreboard as ground truth.
  if (mine && deployed) {
    if (alive && mine[5] === 1) me.hp = mine[4];
    if (mine[5] === 1 && ((me.state === 'dead' && now - me.deadAt > 5200) || (me.state === 'waiting' && now - me.waitAt > 2500))) spawnAt(...SPAWNS[(Math.random() * SPAWNS.length) | 0]);
    if (mine[5] === 0 && alive && now - me.spawnAt > 2500) die(0);
  }
  if ((roomT -= dt) < 0) { roomT = 1; roomLine(); }
}

function roomLine() {
  if (!net) return;
  const others = [...net.recs.values()], playing = others.filter((r) => r.pr.on).length;
  $('roomline').textContent = net.t.kind === 'solo'
    ? 'Offline: you against the bots.'
    : others.length ? `${others.length + 1} here now · ${playing} in the match · bots fill the gaps` : 'Live room: you are the first one here. Share this page to bring friends in.';
}

function openMenu() { $('menu').hidden = false; input.active = false; $('touch').hidden = true; }
$('deploy').addEventListener('click', () => {
  sound.init();
  callsign = cleanName($('callsign').value) || callsign;
  $('callsign').value = callsign; store.set('wa-name', callsign);
  if (!deployed) { deployed = true; me.state = 'waiting'; me.waitAt = performance.now(); }
  $('menu').hidden = true; hud.show(true); input.active = true; input.lock();
  if (input.touch) $('touch').hidden = false;
  $('deploy').textContent = 'Resume'; $('leave').hidden = false;
});
$('leave').addEventListener('click', () => {
  deployed = false; me.state = 'menu'; hud.show(false); hud.banner(''); weapon.root.visible = false;
  $('deploy').textContent = 'Deploy'; $('leave').hidden = true;
});
$('t-menu').addEventListener('click', openMenu);
$('sens').addEventListener('input', (e) => { sens = parseFloat(e.target.value) || 1; store.set('wa-sens', String(sens)); });
input.onUnlock = () => { if (deployed) openMenu(); };
document.addEventListener('visibilitychange', () => {
  if (!net || net.t.kind === 'solo') return;
  away = document.hidden;
  if (!away) myJ = Date.now(); // rejoin at the back of the host queue
  publish(performance.now());
});

netReady.then((t) => {
  net = new Net(t);
  if (t.kind === 'solo') net.joinAt = -1e9;
  $('deploy').disabled = false;
  roomLine();
});
weapon.root.visible = false;

let last = performance.now(), ftAvg = 16, prT = 0;
const fwd = new THREE.Vector3(), qInv = new THREE.Quaternion();
let vmSun = 2.6;
function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, Math.max(0, now - last)); last = now;
  const dt = dtMs / 1000;
  if (net) {
    net.update(now, { j: myJ, away }, cb);
    if (sim) {
      const list = net.deployed();
      if (deployed) list.push({ peer: net.me, s: myState(), buf: myHist });
      sim.syncPlayers(list);
      sim.update(dt, now);
    }
    sendAcc += dtMs;
    if (sendAcc >= SEND_MS) { sendAcc = Math.min(sendAcc - SEND_MS, SEND_MS); publish(now); }
  }
  updateEnts(dt, now);
  updatePlayer(dt, now);
  updateCamera(dt, now);
  handleFire(now);
  weapon.update(dt, { ads: input.ads && me.state === 'alive', sprint: me.sprinting, speed01: Math.min(1, Math.hypot(me.vx, me.vz) / 6.5) * (me.onGround ? 1 : 0.3), look: me.look, vault: me.vault ? 1 : 0, landed: me.landed }, camera.fov);
  me.landed = 0;
  weapon.casings.update(dt);
  fx.update(dt);
  env.update(now / 1000, camera);
  for (const f of flashes) { f.t -= dt; f.s.visible = f.t > 0; }
  muzzleLight.intensity *= Math.pow(0.0005, dt * 4);
  // the viewmodel is lit from the real sun direction, and dims when we stand in a building's shadow
  const cp = camera.position, inSun = !world.raycast(cp.x, cp.y, cp.z, SUN.x, SUN.y, SUN.z, 120);
  vmSun += ((inSun ? 2.6 : 0.35) - vmSun) * Math.min(1, dt * 6);
  weapon.sun.intensity = vmSun;
  weapon.sun.position.copy(SUN).applyQuaternion(qInv.copy(camera.quaternion).invert());
  camera.getWorldDirection(fwd);
  sound.listen(camera.position, fwd);
  if (me.state === 'alive' && me.hp < 35) { me.beatT -= dt; if (me.beatT <= 0) { me.beatT = 0.85; sound.ui('beat'); } }
  if (me.state === 'alive') sound.setMuffle(me.hp > 45 ? 20000 : 2200 + me.hp * 280);
  updateHud(dt, now);
  grade.uniforms.uTime.value = now / 1000;
  grade.uniforms.uDmg.value = hud.pulse;
  grade.uniforms.uLow.value = me.state === 'alive' ? Math.max(0, Math.min(1, (50 - me.hp) / 50)) : 0;
  grade.uniforms.uDead.value = me.state === 'dead' ? 1 : 0;
  input.endFrame();
  // Adaptive resolution, applied before rendering: resizing clears the canvas, so doing it after would flash black.
  ftAvg += (dtMs - ftAvg) * 0.05; prT += dtMs;
  if (prT > 2000) {
    prT = 0;
    const max = Math.min(devicePixelRatio || 1, 1.5);
    const next = ftAvg > 22 && pixelRatio > 0.55 ? pixelRatio - 0.15 : ftAvg < 14.5 && pixelRatio < max ? Math.min(max, pixelRatio + 0.1) : pixelRatio;
    if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(next); composer.setPixelRatio(next); resize(); gtao.enabled = !LOW_END && next > 0.7; }
  }
  renderer.shadowMap.needsUpdate = true;
  if (weapon.optic === 'scope' && weapon.ads > 0.15 && weapon.root.visible) {
    // magnified view for the scope's eyepiece: lens size as seen by the viewmodel camera, divided by the magnification
    weapon.pip.getWorldPosition(vB);
    const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(vmCam.fov) / 2);
    scopeCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(0.0195 / Math.max(0.05, -vB.z) * k / MAG));
    scopeCam.position.copy(camera.position); scopeCam.quaternion.copy(camera.quaternion);
    scopeCam.updateProjectionMatrix(); scopeCam.updateMatrixWorld();
    renderer.setRenderTarget(scopeRT); renderer.render(scene, scopeCam); renderer.setRenderTarget(null);
  }
  composer.render();
}
$('loading').hidden = true;
requestAnimationFrame(frame);

// Test hook (headless checks drive the game through this).
window.__wa = { me, ents, weapon, input, camera, muzzleLight, get sim() { return sim; }, get net() { return net; }, fireShot: () => fireShot(performance.now()), spawnAt };
