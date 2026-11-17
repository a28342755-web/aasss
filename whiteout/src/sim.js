// Host-authoritative match simulation: team Domination with bots, damage, lag-compensated hit validation.
// DOM-free so the soak test can run it in Node.
import { moveBody, findVault, pathAt, rayHitbox, sampleAt, angDiff, yawTo, dirFrom, eyeH, ZONE_DMG, F, R, H_STAND, H_CROUCH } from './core.js';
import { SPAWNS, NAV_NODES, NAV_EDGES, MAT, ZONES } from './map.js';

export const SCORE_LIMIT = 150, MATCH_TIME = 600, INTERMISSION = 10, RESPAWN_MS = 3500, BOT_DMG = 0.42, TEAM_SIZE = 4;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Rewind the target to the shooter's render time and re-trace the shot. Returns the zone hit, or -1.
export function validateClaim(world, hist, c, shooterPos) {
  const st = sampleAt(hist, c.rt);
  if (!st || (st[5] & F.DEAD)) return -1;
  if (Math.hypot(c.o[0] - shooterPos[0], c.o[2] - shooterPos[2]) > 3.5 || Math.abs(c.o[1] - shooterPos[1] - 1.3) > 2.5) return -1;
  const [ox, oy, oz] = c.o, [dx, dy, dz] = c.d;
  const hit = rayHitbox(ox, oy, oz, dx, dy, dz, 300, st, 0.14);
  if (!hit) return -1;
  let zone = hit.zone, t = hit.t;
  if (c.zone !== zone && c.zone >= 0 && c.zone <= 4) {
    const z = rayHitbox(ox, oy, oz, dx, dy, dz, 300, st, c.zone === 0 ? 0.08 : 0.14, c.zone);
    if (z) { zone = c.zone; t = z.t; }
  }
  const w = world.raycast(ox, oy, oz, dx, dy, dz, t);
  return w && w.t < t - 0.05 ? -1 : zone;
}

export class Sim {
  constructor(world) {
    this.world = world; this.ents = new Map(); this.events = []; this.fire = []; this.seq = 0; this.now = 0;
    this.match = { state: 0, left: MATCH_TIME, round: 1, endAt: 0 };
    this.zones = ZONES.map(() => ({ p: 0, owner: -1 }));
    this.score = [0, 0]; this.tick = 0; this.nextPlayerId = 10;
    const n = NAV_NODES.length, d = [], nx = [];
    for (let i = 0; i < n; i++) { d.push(new Array(n).fill(Infinity)); nx.push(new Array(n).fill(-1)); d[i][i] = 0; nx[i][i] = i; }
    for (const [a, b] of NAV_EDGES) {
      const w = Math.hypot(NAV_NODES[a][0] - NAV_NODES[b][0], NAV_NODES[a][1] - NAV_NODES[b][1]);
      d[a][b] = d[b][a] = w; nx[a][b] = b; nx[b][a] = a;
    }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (d[i][k] + d[k][j] < d[i][j]) { d[i][j] = d[i][k] + d[k][j]; nx[i][j] = nx[i][k]; }
    }
    this.nx = nx;
    this.nodeY = NAV_NODES.map(([x, z]) => world.floorAt(x, z, R, 1.2));
  }

  emit(type, ...a) {
    const ring = type === 'b' ? this.fire : this.events;
    ring.push([++this.seq, type, ...a]);
    if (ring.length > (type === 'b' ? 12 : 16)) ring.shift();
  }

  makeEnt(id, bot, peer, team) {
    const e = {
      id, bot, peer: peer || 0, team, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: R, h: H_STAND, onGround: true, grounded: true,
      yaw: 0, pitch: 0, flags: F.DEAD, hp: 100, alive: false, diedAt: 0, respawnAt: this.now + 300 + Math.random() * 1200,
      kills: 0, deaths: 0, caps: 0, lastHit: -1e9, lastAttacker: 0, hist: [], buf: null, ai: bot ? this.freshAI() : null,
    };
    this.ents.set(id, e);
    return e;
  }
  freshAI() {
    return { target: 0, visible: false, seen: 0, lastPos: null, reaction: 0, focus: 0, errY: 0, errP: 0, aimHead: false, nextThink: 0, nextShot: 0,
      burst: 4, ammo: 30, reloadUntil: 0, strafe: 0, strafeUntil: 0, crouch: false, path: [], goal: null, run: false, cover: false,
      coverTried: -1e9, heard: null, stuckT: 0, stuckX: 0, stuckZ: 0, vault: null, vaultT: 0 };
  }
  byPeer(peer) { for (const e of this.ents.values()) if (e.peer === peer) return e; return null; }
  counts() {
    const humans = [0, 0], bots = [[], []];
    for (const e of this.ents.values()) if (e.bot) bots[e.team].push(e); else humans[e.team]++;
    return { humans, bots };
  }

  // Deployed players as the host sees them: [{peer, s:[x,y,z,yaw,pitch,flags], buf:[{t,s}]}]
  syncPlayers(list) {
    const live = new Set();
    for (const p of list) {
      let e = this.byPeer(p.peer);
      if (!e) {
        const { humans, bots } = this.counts();
        const team = humans[0] !== humans[1] ? (humans[0] < humans[1] ? 0 : 1) : (humans[0] + bots[0].length <= humans[1] + bots[1].length ? 0 : 1);
        e = this.makeEnt(this.nextPlayerId++, false, p.peer, team); e.respawnAt = this.now;
      }
      live.add(e.id);
      e.buf = p.buf;
      if (e.alive && p.s && !(p.s[5] & F.DEAD)) {
        [e.x, e.y, e.z, e.yaw, e.pitch] = p.s; e.flags = p.s[5];
        const b = p.buf, n = b ? b.length : 0;
        if (n > 1 && b[n - 1].t > b[n - 2].t) { const dt = (b[n - 1].t - b[n - 2].t) / 1000; e.vx = (b[n - 1].s[0] - b[n - 2].s[0]) / dt; e.vz = (b[n - 1].s[2] - b[n - 2].s[2]) / dt; }
      }
    }
    for (const e of [...this.ents.values()]) if (!e.bot && !live.has(e.id)) this.ents.delete(e.id);
  }

  update(dt, now) {
    this.now = now;
    const m = this.match;
    if (m.state === 0) {
      m.left -= dt;
      this.updateZones(dt);
      if (m.left <= 0) this.endRound(this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1);
    } else if (now >= m.endAt) this.newRound();
    this.balance();
    for (const e of this.ents.values()) {
      if (!e.alive) { if (m.state === 0 && now >= e.respawnAt) this.respawn(e); continue; }
      if (now - e.lastHit > 5000 && e.hp < 100) e.hp = Math.min(100, e.hp + 15 * dt);
      if (e.bot) this.bot(e, dt, now);
    }
  }

  // Capture: progress p runs from -1 (team 1) to +1 (team 0); an owned point must be neutralized before it flips.
  updateZones(dt) {
    ZONES.forEach((Z, i) => {
      const z = this.zones[i], n = [0, 0], inside = [];
      for (const e of this.ents.values()) if (e.alive && e.y < 3 && Math.hypot(e.x - Z.x, e.z - Z.z) < Z.r) { n[e.team]++; inside.push(e); }
      z.n = n;
      if (n[0] && n[1]) return;
      if (n[0] || n[1]) {
        const t = n[0] ? 0 : 1, dir = t === 0 ? 1 : -1;
        z.p = clamp(z.p + dir * 0.2 * (1 + 0.5 * (Math.min(3, n[t]) - 1)) * dt, -1, 1);
        if (z.owner !== -1 && z.owner !== t && (z.owner === 0 ? z.p <= 0 : z.p >= 0)) { z.owner = -1; this.emit('z', i, -1); }
        if (Math.abs(z.p) >= 1 && z.owner !== t) { z.owner = t; for (const e of inside) e.caps++; this.emit('z', i, t); }
      } else {
        const home = z.owner === -1 ? 0 : z.owner === 0 ? 1 : -1;
        z.p += Math.sign(home - z.p) * Math.min(Math.abs(home - z.p), 0.1 * dt);
      }
    });
    this.tick += dt;
    while (this.tick >= 2) { this.tick -= 2; for (const z of this.zones) if (z.owner >= 0) this.score[z.owner]++; }
    if (Math.max(this.score[0], this.score[1]) >= SCORE_LIMIT) this.endRound(this.score[0] > this.score[1] ? 0 : 1);
  }

  balance() {
    const { humans, bots } = this.counts();
    const size = Math.max(TEAM_SIZE, humans[0], humans[1]);
    for (const t of [0, 1]) {
      const want = size - humans[t];
      if (bots[t].length < want) { let id = 1; while (this.ents.has(id)) id++; if (id < 10) this.makeEnt(id, true, 0, t); return; }
      if (bots[t].length > want) { const b = bots[t].find((x) => !x.alive) || bots[t][bots[t].length - 1]; this.ents.delete(b.id); return; }
    }
  }

  bot(b, dt, now) {
    const ai = b.ai, W = this.world;
    if (ai.vault) {
      ai.vaultT += dt / ai.vault.dur;
      const p = pathAt(ai.vault.path, Math.min(1, ai.vaultT));
      b.x = p[0]; b.y = p[1]; b.z = p[2]; b.flags = F.VAULT;
      if (ai.vaultT >= 1) { ai.vault = null; b.vy = 0; }
      return;
    }
    if (now >= ai.nextThink) { ai.nextThink = now + 90 + Math.random() * 40; this.think(b, now); }
    const tgt = ai.target ? this.ents.get(ai.target) : null;
    let wx = 0, wz = 0, speed = 0;
    const goal = ai.path.length ? this.nodePos(ai.path[0]) : ai.goal;
    if (goal) {
      const dx = goal[0] - b.x, dz = goal[2] - b.z, d = Math.hypot(dx, dz);
      if (d < (ai.path.length > 1 ? 0.8 : 0.5)) { if (ai.path.length) ai.path.shift(); else ai.goal = null; }
      else { wx = dx / d; wz = dz / d; speed = ai.run ? 5.0 : 2.9; }
    }
    if (!goal && ai.visible && tgt && ai.strafe) {
      const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz) || 1;
      wx = -dz / d * ai.strafe; wz = dx / d * ai.strafe; speed = 2.4;
      if (d > 24) { wx += dx / d * 0.8; wz += dz / d * 0.8; } else if (d < 9) { wx -= dx / d * 0.8; wz -= dz / d * 0.8; }
      const l = Math.hypot(wx, wz) || 1; wx /= l; wz /= l;
    }
    const crouch = ai.crouch && speed < 3;
    if (crouch) speed = Math.min(speed, 1.6);
    const k = Math.min(1, 9 * dt);
    b.vx += (wx * speed - b.vx) * k; b.vz += (wz * speed - b.vz) * k;
    b.h = crouch ? H_CROUCH : H_STAND;
    moveBody(W, b, dt);
    ai.stuckT += dt;
    if (ai.stuckT > 0.8) {
      if (speed > 1 && Math.hypot(b.x - ai.stuckX, b.z - ai.stuckZ) < 0.35) {
        const v = findVault(W, b, wx, wz);
        if (v) { ai.vault = v; ai.vaultT = 0; }
        else { ai.strafe = -ai.strafe; this.goNode(b, (Math.random() * NAV_NODES.length) | 0, false); }
      }
      ai.stuckT = 0; ai.stuckX = b.x; ai.stuckZ = b.z;
    }
    let ty = b.yaw, tp = 0, rate = 2.6;
    if (tgt && tgt.alive && ai.visible) {
      const ey = b.y + eyeH(b.flags);
      const aimY = (tgt.flags & F.CROUCH) ? (ai.aimHead ? 1.17 : 0.92) : (ai.aimHead ? 1.62 : 1.3);
      const dx = tgt.x - b.x, dy = tgt.y + aimY - ey, dz = tgt.z - b.z;
      ty = yawTo(dx, dz) + ai.errY; tp = Math.atan2(dy, Math.hypot(dx, dz)) + ai.errP; rate = 5;
      ai.focus = Math.min(1, ai.focus + dt / 1.6);
    } else if (ai.target && ai.lastPos) ty = yawTo(ai.lastPos[0] - b.x, ai.lastPos[2] - b.z);
    else if (speed > 0.5) ty = yawTo(wx, wz);
    b.yaw += clamp(angDiff(b.yaw, ty), -rate * dt, rate * dt);
    b.pitch += clamp(tp - b.pitch, -rate * dt, rate * dt);
    b.flags = (crouch ? F.CROUCH : 0) | (speed > 4 ? F.SPRINT : 0) | (b.onGround ? 0 : F.AIR) | (now < ai.reloadUntil ? F.RELOAD : 0);
    if (this.match.state === 0 && tgt && tgt.alive && ai.visible && now >= ai.reaction && now >= ai.reloadUntil && now >= ai.nextShot &&
        Math.abs(angDiff(b.yaw, ty)) < 0.08) this.botShoot(b, tgt, now, speed);
  }

  botShoot(b, tgt, now, speed) {
    const ai = b.ai;
    ai.ammo--; ai.burst--; ai.nextShot = now + 100;
    if (ai.burst <= 0) { ai.burst = 3 + ((Math.random() * 4) | 0); ai.nextShot = now + 280 + Math.random() * 600; this.newError(b, tgt); }
    if (ai.ammo <= 0) { ai.ammo = 30; ai.reloadUntil = now + 2400; }
    const spread = 0.008 + (speed > 0.5 ? 0.014 : 0) - ((b.flags & F.CROUCH) ? 0.003 : 0);
    const d = dirFrom(b.yaw + gauss() * spread, b.pitch + gauss() * spread), o = [b.x, b.y + eyeH(b.flags) - 0.08, b.z];
    const hit = this.trace(o, d, b);
    if (hit.ent) this.damage(hit.ent, b, hit.zone, ZONE_DMG[hit.zone] * BOT_DMG, d);
    this.emit('b', b.id, r2(hit.p[0]), r2(hit.p[1]), r2(hit.p[2]), hit.mat);
    b.pitch += 0.006 + Math.random() * 0.004;
    this.alert(b);
  }
  newError(b, tgt) {
    const ai = b.ai, d = Math.hypot(tgt.x - b.x, tgt.z - b.z), tv = Math.hypot(tgt.vx || 0, tgt.vz || 0);
    const sigma = (0.012 + d * 0.0009) * (1 + tv * 0.25) * (1.9 - ai.focus * 0.9);
    ai.errY = gauss() * sigma; ai.errP = gauss() * sigma * 0.7; ai.aimHead = Math.random() < 0.2;
  }
  // Rounds pass through teammates (no friendly fire).
  trace(o, d, shooter) {
    const w = this.world.raycast(o[0], o[1], o[2], d[0], d[1], d[2], 150);
    let best = w ? w.t : 150, ent = null, zone = -1;
    for (const e of this.ents.values()) {
      if (e === shooter || !e.alive || e.team === shooter.team) continue;
      const h = rayHitbox(o[0], o[1], o[2], d[0], d[1], d[2], best, [e.x, e.y, e.z, e.yaw, e.pitch, e.flags]);
      if (h) { best = h.t; ent = e; zone = h.zone; }
    }
    return { ent, zone, p: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best], mat: ent ? MAT.FLESH : (w ? w.mat : MAT.NONE) };
  }
  los(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz);
    return d < 1e-6 || !this.world.raycast(a[0], a[1], a[2], dx / d, dy / d, dz / d, d);
  }

  think(b, now) {
    const ai = b.ai, eye = [b.x, b.y + eyeH(b.flags), b.z];
    let best = null, bs = Infinity;
    for (const e of this.ents.values()) {
      if (e === b || !e.alive || e.team === b.team) continue;
      const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
      if (d > 55) continue;
      const attacker = b.lastAttacker === e.id && now - b.lastHit < 4000;
      if (Math.abs(angDiff(b.yaw, yawTo(dx, dz))) > 1.3 && d > 6 && !attacker && ai.target !== e.id) continue;
      if (!this.los(eye, [e.x, e.y + ((e.flags & F.CROUCH) ? 0.95 : 1.35), e.z])) continue;
      const s = d - (attacker ? 20 : 0) - (ai.target === e.id ? 10 : 0) + (e.bot ? 5 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    if (best) {
      if (ai.target !== best.id || now - ai.seen > 1500) { ai.reaction = now + 320 + Math.random() * 380; ai.focus = 0; this.newError(b, best); }
      ai.target = best.id; ai.visible = true; ai.seen = now; ai.lastPos = [best.x, best.y, best.z];
    } else {
      ai.visible = false;
      const t = ai.target && this.ents.get(ai.target);
      if (ai.target && (now - ai.seen > 6000 || !t || !t.alive)) { ai.target = 0; ai.lastPos = null; }
    }
    if (best) {
      const d = Math.hypot(best.x - b.x, best.z - b.z);
      if (b.hp < 45 && !ai.cover && now - ai.coverTried > 5000) {
        ai.coverTried = now;
        const c = this.findCover(b, best);
        if (c >= 0) { this.goNode(b, c, true); ai.cover = true; ai.strafe = 0; ai.crouch = false; return; }
      }
      if (ai.cover && (ai.path.length || ai.goal)) return;
      if (d > 30) { if (!ai.path.length && !ai.goal) this.goPos(b, [best.x, best.y, best.z], true); ai.strafe = 0; return; }
      ai.path = []; ai.goal = null;
      if (now > ai.strafeUntil) {
        const r = Math.random();
        ai.strafe = r < 0.3 ? 0 : r < 0.65 ? -1 : 1;
        ai.crouch = ai.strafe === 0 && Math.random() < 0.6;
        ai.strafeUntil = now + 450 + Math.random() * 1100;
      }
      return;
    }
    ai.strafe = 0; ai.crouch = false;
    if (ai.cover && b.hp > 85) ai.cover = false;
    if (ai.path.length || ai.goal) return;
    if (ai.target && ai.lastPos) { this.goPos(b, ai.lastPos, true); ai.lastPos = null; return; }
    if (ai.heard && now - ai.heard[2] < 7000) { this.goPos(b, [ai.heard[0], 0, ai.heard[1]], false); ai.heard = null; return; }
    if (ai.cover) return;
    // Objective play: take points the team does not hold, sometimes hold one it does.
    let zi = -1, zs = Infinity;
    ZONES.forEach((Z, i) => {
      const owned = this.zones[i].owner === b.team, d = Math.hypot(Z.x - b.x, Z.z - b.z);
      const s = d + (owned ? 22 : 0) + Math.random() * 14;
      if (s < zs) { zs = s; zi = i; }
    });
    const Z = ZONES[zi], a = Math.random() * Math.PI * 2, r = Math.random() * Z.r * 0.6;
    const dist = Math.hypot(Z.x - b.x, Z.z - b.z);
    this.goPos(b, [Z.x + Math.cos(a) * r, 0, Z.z + Math.sin(a) * r], dist > 12 && this.zones[zi].owner !== b.team);
  }
  findCover(b, t) {
    const te = [t.x, t.y + 1.5, t.z];
    let best = -1, bd = Infinity;
    NAV_NODES.forEach(([x, z], i) => {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d > 18 || d < 2 || Math.hypot(x - t.x, z - t.z) < d) return;
      if (!this.los([x, this.nodeY[i] + 1.4, z], te) && d < bd) { bd = d; best = i; }
    });
    return best;
  }
  nodePos(i) { return [NAV_NODES[i][0], this.nodeY[i], NAV_NODES[i][1]]; }
  nearestNode(p) {
    let best = 0, bd = Infinity;
    NAV_NODES.forEach(([x, z], i) => {
      const d = Math.hypot(x - p[0], z - p[2]) + Math.abs(this.nodeY[i] - p[1]) * 4;
      if (d < bd && (d < 1.5 || this.los([p[0], p[1] + 0.5, p[2]], [x, this.nodeY[i] + 0.5, z]))) { bd = d; best = i; }
    });
    return best;
  }
  goNode(b, goal, run) {
    let i = this.nearestNode([b.x, b.y, b.z]);
    const path = [i];
    for (let g = 0; i !== goal && g < 64; g++) { i = this.nx[i][goal]; if (i < 0) break; path.push(i); }
    b.ai.path = path; b.ai.goal = null; b.ai.run = run;
  }
  goPos(b, p, run) { this.goNode(b, this.nearestNode(p), run); b.ai.goal = [p[0], p[1], p[2]]; }
  alert(src) {
    for (const e of this.ents.values()) {
      if (e.bot && e.alive && e !== src && e.team !== src.team && !e.ai.visible && Math.hypot(e.x - src.x, e.z - src.z) < 45) e.ai.heard = [src.x, src.z, this.now];
    }
  }

  damage(t, a, zone, dmg, dir) {
    if (!t.alive || this.match.state !== 0 || (t.team === a.team && t !== a)) return;
    t.hp -= dmg; t.lastHit = this.now; t.lastAttacker = a.id;
    this.emit('d', t.id, a.id, Math.round(dmg), zone, Math.max(0, Math.ceil(t.hp)));
    if (t.bot && !t.ai.visible) { t.ai.target = a.id; t.ai.lastPos = [a.x, a.y, a.z]; t.ai.seen = this.now; t.ai.reaction = Math.max(t.ai.reaction, this.now + 250); }
    if (t.hp > 0) return;
    t.alive = false; t.hp = 0; t.flags = F.DEAD; t.deaths++; t.diedAt = this.now; t.respawnAt = this.now + RESPAWN_MS;
    if (a !== t) a.kills++;
    this.emit('k', t.id, a.id, zone === 0 ? 1 : 0, r2(dir[0]), r2(dir[2]));
  }
  // A player's shot, already hit-tested on their screen. local = the host's own shot at its own live bots.
  claim(shooter, c, local) {
    if (this.match.state !== 0 || !shooter || (!shooter.alive && this.now - shooter.diedAt > 250)) return;
    const t = this.ents.get(c.target);
    if (!t || !t.alive || t === shooter || t.team === shooter.team) return;
    const live = local && t.bot;
    const hist = live ? [{ t: 0, s: [t.x, t.y, t.z, t.yaw, t.pitch, t.flags] }] : t.bot ? t.hist : t.buf;
    if (!hist) return;
    const zone = validateClaim(this.world, hist, live ? { ...c, rt: 0 } : c, [shooter.x, shooter.y, shooter.z]);
    if (zone >= 0) this.damage(t, shooter, zone, ZONE_DMG[zone], c.d);
  }

  respawn(e) {
    const s = this.pickSpawn(e);
    Object.assign(e, { x: s[0], y: s[1], z: s[2], yaw: s[3], pitch: 0, vx: 0, vy: 0, vz: 0, hp: 100, alive: true, flags: 0, lastHit: -1e9, h: H_STAND });
    if (e.bot) e.ai = this.freshAI();
    this.emit('r', e.id, s[0], s[1], s[2], r3(s[3]));
  }
  // Away from live enemies (more so in their sight), near teammates; at round start, on the team's own side.
  pickSpawn(e) {
    let enemies = 0;
    for (const o of this.ents.values()) if (o.alive && o.team !== e.team) enemies++;
    let best = SPAWNS[0], bs = -Infinity;
    for (const s of SPAWNS) {
      let sc;
      if (!enemies) sc = ((e.team === 0) === (s[2] > 0) ? 50 : 0) + Math.random() * 10;
      else {
        let md = 60, mate = 40;
        for (const o of this.ents.values()) {
          if (o === e || !o.alive) continue;
          const d = Math.hypot(o.x - s[0], o.z - s[2]);
          if (o.team === e.team) { mate = Math.min(mate, d); continue; }
          md = Math.min(md, d < 30 && this.los([s[0], s[1] + 1.6, s[2]], [o.x, o.y + 1.5, o.z]) ? d - 14 : d);
        }
        sc = md - mate * 0.15 + Math.random() * 6;
      }
      if (sc > bs) { bs = sc; best = s; }
    }
    return best;
  }
  endRound(winnerTeam) {
    if (this.match.state === 1) return;
    this.match.state = 1; this.match.endAt = this.now + INTERMISSION * 1000;
    this.emit('m', 1, winnerTeam);
  }
  newRound() {
    this.match = { state: 0, left: MATCH_TIME, round: this.match.round + 1, endAt: 0 };
    this.zones = ZONES.map(() => ({ p: 0, owner: -1 })); this.score = [0, 0]; this.tick = 0;
    for (const e of this.ents.values()) { e.kills = 0; e.deaths = 0; e.caps = 0; e.alive = false; e.flags = F.DEAD; e.respawnAt = this.now + Math.random() * 600; }
    this.emit('m', 0, -1);
  }

  // Published in the host's presence. Bot states are also kept as rewind history at the same timestamp.
  snapshot(now) {
    const b = [], sc = [];
    for (const e of this.ents.values()) {
      if (e.bot) {
        const s = [r2(e.x), r2(e.y), r2(e.z), r3(e.yaw), r3(e.pitch), e.alive ? e.flags : F.DEAD];
        b.push([e.id, ...s]);
        e.hist.push({ t: now, s });
        while (e.hist.length > 2 && now - e.hist[0].t > 1500) e.hist.shift();
      }
      sc.push([e.id, e.peer, e.kills, e.deaths, Math.ceil(e.hp), e.alive ? 1 : 0, e.team, e.caps]);
    }
    return {
      b, sc, z: this.zones.map((z) => [r2(z.p), z.owner, z.n && z.n[0] && z.n[1] ? 1 : 0]), e: this.events, f: this.fire,
      m: [this.match.state, Math.max(0, Math.ceil(this.match.left)), this.match.round, this.score[0], this.score[1]],
    };
  }
  // Host migration: continue from the last snapshot the previous host published (untrusted data).
  load(h, now) {
    this.now = now;
    if (!h || typeof h !== 'object') return;
    const teamOf = new Map();
    for (const row of Array.isArray(h.sc) ? h.sc : []) if (Array.isArray(row) && num(row[0]) && (row[6] === 0 || row[6] === 1)) teamOf.set(row[0], row[6]);
    for (const row of Array.isArray(h.b) ? h.b : []) {
      if (!Array.isArray(row) || !row.slice(0, 7).every(num) || row[0] < 1 || row[0] > 9 || !teamOf.has(row[0])) continue;
      const [id, x, y, z, yaw, pitch, flags] = row, e = this.makeEnt(id, true, 0, teamOf.get(id));
      Object.assign(e, { x, y: clamp(y, 0, 3), z, yaw, pitch, flags, alive: !(flags & F.DEAD) });
    }
    for (const row of Array.isArray(h.sc) ? h.sc : []) {
      if (!Array.isArray(row) || !num(row[0]) || !num(row[2]) || !num(row[3]) || !num(row[4]) || !teamOf.has(row[0])) continue;
      const [id, peer, k, d, hp, alive] = row;
      let e = this.ents.get(id);
      if (!e && typeof peer === 'string' && id >= 10 && id < 1000) { e = this.makeEnt(id, false, peer, teamOf.get(id)); this.nextPlayerId = Math.max(this.nextPlayerId, id + 1); }
      if (!e) continue;
      e.kills = k | 0; e.deaths = d | 0; e.caps = num(row[7]) ? row[7] | 0 : 0; e.hp = clamp(hp, 0, 100); e.alive = !!alive;
      if (!e.alive) { e.flags = F.DEAD; e.respawnAt = now + 1500; }
    }
    if (Array.isArray(h.z)) h.z.slice(0, ZONES.length).forEach((z, i) => { if (Array.isArray(z) && num(z[0]) && [-1, 0, 1].includes(z[1])) this.zones[i] = { p: clamp(z[0], -1, 1), owner: z[1] }; });
    if (Array.isArray(h.m) && h.m.length >= 5 && h.m.every(num)) {
      Object.assign(this.match, { state: h.m[0] ? 1 : 0, left: h.m[1], round: h.m[2] | 0, endAt: now + 5000 });
      this.score = [h.m[3] | 0, h.m[4] | 0];
    }
  }
}
