'use strict';
// Vehicles and driving physics: rigid body (rotation matrix + world angular velocity), four spring-damper
// wheels on the height map, slip-angle tyres with a friction circle, engine torque curve + gearbox, fuel, damage.
// Body frame: X right, Y up, Z forward. Positive yaw rate (about +Y) turns right.
const CARS = [
  { name: 'KESTREL 1.6', desc: 'light FWD hatchback', m: 1050, L: 2.45, T: 1.46, len: 3.85, wid: 1.66, hgt: 1.44, cg: 0.52, front: 0.62, drive: 'F', tq: 150, rpmPk: 4000, red: 6500, gears: [3.45, 1.95, 1.28, 0.95, 0.76], rev: 3.3, fd: 4.2, wr: 0.29, k: 24000, c: 2500, travel: 0.17, clear: 0.16, cda: 0.66, tank: 42, burn: 26, steer: 0.58, cab: [-0.48, 0.12] },
  { name: 'LYNX RS', desc: 'turbo AWD rally car', m: 1290, L: 2.55, T: 1.52, len: 4.2, wid: 1.78, hgt: 1.4, cg: 0.48, front: 0.57, drive: 'A', tq: 340, rpmPk: 4200, red: 7200, gears: [3.3, 2.1, 1.5, 1.12, 0.88, 0.7], rev: 3.2, fd: 4.1, wr: 0.32, k: 34000, c: 4200, travel: 0.24, clear: 0.19, cda: 0.7, tank: 55, burn: 60, steer: 0.6, cab: [-0.4, 0.12] },
  { name: 'IBEX 4X4', desc: 'heavy AWD off-roader', m: 1900, L: 2.7, T: 1.6, len: 4.4, wid: 1.86, hgt: 1.85, cg: 0.68, front: 0.52, drive: 'A', tq: 420, rpmPk: 2600, red: 4800, gears: [4.3, 2.5, 1.55, 1.05, 0.8], rev: 4, fd: 4.6, wr: 0.4, k: 38000, c: 5200, travel: 0.34, clear: 0.27, cda: 1.05, tank: 80, burn: 55, steer: 0.55, cab: [-0.48, 0.16] },
  { name: 'MULE PICKUP', desc: 'RWD truck, light tail', m: 1750, L: 3.1, T: 1.62, len: 5.1, wid: 1.84, hgt: 1.75, cg: 0.64, front: 0.58, drive: 'R', tq: 480, rpmPk: 2800, red: 5200, gears: [3.9, 2.3, 1.45, 1, 0.75], rev: 3.7, fd: 3.9, wr: 0.37, k: 36000, c: 4600, travel: 0.27, clear: 0.23, cda: 1, tank: 90, burn: 58, steer: 0.55, cab: [-0.08, 0.2] },
  { name: 'VESPER GT', desc: 'classic RWD coupe', m: 1120, L: 2.4, T: 1.44, len: 4.1, wid: 1.68, hgt: 1.26, cg: 0.44, front: 0.52, drive: 'R', tq: 300, rpmPk: 4800, red: 7400, gears: [3.2, 2, 1.4, 1.05, 0.82], rev: 3.1, fd: 3.9, wr: 0.31, k: 30000, c: 3400, travel: 0.13, clear: 0.12, cda: 0.6, tank: 50, burn: 46, steer: 0.6, cab: [-0.3, 0.08] }
];
// grip multiplier per surface class: paved, loose, snow/ice
const TIRES = [{ name: 'ROAD', g: [1.08, 0.78, 0.6] }, { name: 'ALL-TERRAIN', g: [0.97, 1, 0.9] }, { name: 'MUD', g: [0.88, 1.15, 1] }, { name: 'WINTER', g: [0.92, 0.92, 1.75] }];
const SPRINGS = [{ name: 'SOFT', k: 0.72 }, { name: 'STANDARD', k: 1 }, { name: 'STIFF', k: 1.45 }];
const RIDE = [{ name: 'LOW', d: -0.04 }, { name: 'STANDARD', d: 0 }, { name: 'HIGH', d: 0.07 }];
const PAINT = [['RED', 205, 45, 40], ['YELLOW', 230, 195, 45], ['BLUE', 45, 115, 220], ['WHITE', 228, 228, 232], ['GREEN', 45, 150, 90], ['ORANGE', 240, 130, 35], ['GRAPHITE', 85, 88, 98], ['VIOLET', 150, 70, 185]];
// per material (index = M.*): friction, surface class, rolling resistance, roughness
const SURF = [[0.4, 1, 0.25, 0], [0.13, 2, 0.012, 0], [0.6, 1, 0.11, 0.3], [0.62, 1, 0.055, 0.5], [0.58, 1, 0.075, 0.7], [0.8, 1, 0.045, 1], [0.3, 2, 0.085, 0.3],
  [1, 0, 0.013, 0], [0.72, 1, 0.03, 0.4], [0.5, 1, 0.12, 0.6], [0.45, 1, 0.12, 1], [0.65, 1, 0.05, 0.7], [0.36, 2, 0.03, 0.1]];
const G = 9.81, FUEL_SCALE = 3;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const Car = {
  cfg: { car: 1, tire: 1, spring: 1, ride: 1, paint: 0 },
  def: CARS[1], p: [0, 0, 0], v: [0, 0, 0], w: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], // R = right, up, forward
  wheels: [0, 1, 2, 3].map(() => ({ x: 0, z: 0, c: 0, y: 0, vl: 0, load: 0, slip: 0, mat: 7, ang: 0 })),
  gear: 1, auto: true, rpm: 850, spin: 0, shiftT: 0, steerA: 0, thr: 0, brk: 0, hand: false, lights: false,
  fuel: 40, dmg: { body: 0, engine: 0, susp: 0, tire: 0 }, odo: 0, speed: 0, air: 0, hit: 0, sub: 0, safe: [0, 0, 0], safeT: 0,
  g: {},

  setup() { // derived parameters from the chosen car + tuning
    const d = this.def = CARS[this.cfg.car], s = SPRINGS[this.cfg.spring];
    this.cgH = d.cg + RIDE[this.cfg.ride].d;
    this.k = d.k * s.k; this.cd = d.c * Math.sqrt(s.k) * (1 - 0.6 * this.dmg.susp);
    const a = d.L * (1 - d.front), b = d.L * d.front;
    this.wheels.forEach((w, i) => { w.x = (i & 1 ? 1 : -1) * d.T / 2; w.z = i < 2 ? a : -b; });
    this.ya = 0.3 + d.wr - this.cgH;                       // suspension mount height in body coords
    const ceq = [d.m * G * d.front / 2 / this.k, d.m * G * (1 - d.front) / 2 / this.k];
    this.Lr = ceq.map(c => 0.3 + c);                        // spring free length per axle
    this.cmax = ceq.map(c => c + d.travel * 0.55);          // bump stop
    this.I = [d.m * (d.len * d.len + d.hgt * d.hgt) / 12, d.m * (d.len * d.len + d.wid * d.wid) / 12, d.m * (d.wid * d.wid + d.hgt * d.hgt) / 12];
    this.fuel = Math.min(this.fuel, d.tank);
  },
  place(x, z, yaw) {
    W.ground(x, z, this.g);
    this.p = [x, Math.max(this.g.h, ENV.frozen ? 0 : -1e9) + this.cgH + 0.15, z];
    this.v = [0, 0, 0]; this.w = [0, 0, 0];
    this.R = [Math.cos(yaw), 0, -Math.sin(yaw), 0, 1, 0, Math.sin(yaw), 0, Math.cos(yaw)];
    this.gear = 1; this.spin = 0; this.sub = 0;
    this.wheels.forEach(w => { w.c = 0; w.vl = 0; w.load = 0; w.slip = 0; });
  },
  recover() { this.place(this.safe[0], this.safe[1], this.safe[2]); },
  get yaw() { return Math.atan2(this.R[6], this.R[8]); },
  gnd(x, z) { // ground query; frozen lakes are a flat ice sheet at y = 0
    const g = W.ground(x, z, this.g);
    if (g.h < 0 && ENV.frozen) { g.h = 0; g.gx = g.gz = 0; }
    return g;
  },
  hurt(part, amt) { this.dmg[part] = sat(this.dmg[part] + amt); },

  step(dt, inp) {
    const d = this.def, m = d.m, R = this.R, p = this.p, v = this.v, w = this.w, env = ENV, tire = TIRES[this.cfg.tire];
    const rx = R[0], ry = R[1], rz = R[2], ux = R[3], uy = R[4], uz = R[5], fx = R[6], fy = R[7], fz = R[8];
    const vf = v[0] * fx + v[1] * fy + v[2] * fz;

    // --- controls ---
    let thr = inp.thr, brk = inp.brk;
    if (this.auto) { // automatic: brake pedal doubles as reverse once stopped
      if (this.gear >= 0 && brk > 0.1 && thr < 0.1 && vf < 0.7) this.gear = -1;
      if (this.gear < 0) { if (thr > 0.1 && vf > -0.7) this.gear = 1; else { const t = thr; thr = brk; brk = t; } }
    } else if (this.shiftT <= 0 && (inp.up || inp.down)) {
      this.gear = clamp(this.gear + (inp.up ? 1 : -1), -1, d.gears.length); this.shiftT = 0.4;
    }
    this.thr = thr; this.brk = brk; this.hand = inp.hand;
    const maxSt = d.steer / (1 + (vf / 24) * (vf / 24));
    this.steerA += clamp(inp.steer * maxSt + this.dmg.susp * 0.05 - this.steerA, -3 * dt, 3 * dt);

    // --- engine and driveline ---
    const ratio = this.gear > 0 ? d.gears[this.gear - 1] : this.gear < 0 ? -d.rev : 0, total = ratio * d.fd;
    const dw = d.drive === 'F' ? [0, 1] : d.drive === 'R' ? [2, 3] : [0, 1, 2, 3];
    let ds = 0; for (const i of dw) ds += this.wheels[i].vl; ds /= dw.length;
    const rpmW = Math.abs(ds / d.wr * total) * 9.549, alive = this.fuel > 0 && this.dmg.engine < 1;
    let rpm = total === 0 ? 850 + thr * (d.red - 850) : Math.max(rpmW * (1 + this.spin), 850 + thr * 1900); // clutch slips below launch rpm
    if (!alive) rpm = rpmW;
    let Te = 0;
    if (alive && this.shiftT < 0.25) { const x = rpm / d.rpmPk; Te = d.tq * Math.max(0.3, 1 - 0.55 * (x - 1) * (x - 1)) * thr * sat((d.red - rpm) / (0.04 * d.red)); } // soft rev limiter
    if (thr < 0.05) Te -= d.tq * 0.15 * Math.max(0, rpmW - 950) / d.red;       // engine braking
    const driveF = Te * total * 0.88 * (1 - 0.7 * this.dmg.engine) / dw.length / d.wr;
    this.rpm += (Math.min(rpm, d.red + 150) - this.rpm) * Math.min(1, dt * 9);
    if (alive) this.fuel = Math.max(0, this.fuel - (1.2 + thr * rpm / d.red * d.burn) * FUEL_SCALE / 3600 * dt);

    // --- forces ---
    let Fx = 0, Fy = -m * G, Fz = 0, Tx = 0, Ty = 0, Tz = 0;
    const ax = v[0] - env.wx, az = v[2] - env.wz, as = Math.hypot(ax, v[1], az) * 0.6 * d.cda;
    Fx -= as * ax; Fy -= as * v[1]; Fz -= as * az;
    let spinT = 0, contacts = 0;
    for (let i = 0; i < 4; i++) {
      const wh = this.wheels[i], front = i < 2, ax2 = i >> 1;
      const px = p[0] + rx * wh.x + ux * this.ya + fx * wh.z, py = p[1] + ry * wh.x + uy * this.ya + fy * wh.z, pz = p[2] + rz * wh.x + uz * this.ya + fz * wh.z;
      const g = this.gnd(px, pz), mat = W.material(g.c, g.i, env.snowline, env.frozen), sf = SURF[mat];
      const hg = g.h + sf[3] * 0.035 * W.noise(px * 0.9, pz * 0.9, 77);
      const c = this.Lr[ax2] + d.wr - (py - hg), cv = (c - wh.c) / dt;
      wh.c = c; wh.mat = mat; wh.y = this.ya - this.Lr[ax2] + clamp(c, 0, this.cmax[ax2] + 0.03);
      if (c <= 0 || uy < 0.25) { wh.load = 0; wh.slip = 0; wh.ang += wh.vl / d.wr * dt; continue; }
      contacts++;
      let N = this.k * c + this.cd * cv;
      const over = c - this.cmax[ax2];
      if (over > 0) { N += this.k * 8 * over; if (cv > 2.2) this.hurt('susp', (cv - 2.2) * 0.02); }
      if (N < 0) N = 0;
      const nl = 1 / Math.sqrt(g.gx * g.gx + 1 + g.gz * g.gz), nx = -g.gx * nl, ny = nl, nz = -g.gz * nl;
      // wheel heading projected on the ground plane, side = n x heading
      const cs = front ? Math.cos(this.steerA) : 1, sn = front ? Math.sin(this.steerA) : 0;
      let hx = fx * cs + rx * sn, hy = fy * cs + ry * sn, hz = fz * cs + rz * sn;
      const dn = hx * nx + hy * ny + hz * nz; hx -= nx * dn; hy -= ny * dn; hz -= nz * dn;
      const hl = 1 / Math.hypot(hx, hy, hz); hx *= hl; hy *= hl; hz *= hl;
      const sx = ny * hz - nz * hy, sy = nz * hx - nx * hz, sz = nx * hy - ny * hx;
      const qx = px - p[0], qy = hg - p[1], qz = pz - p[2];              // contact point relative to CG
      const cvx = v[0] + w[1] * qz - w[2] * qy, cvy = v[1] + w[2] * qx - w[0] * qz, cvz = v[2] + w[0] * qy - w[1] * qx;
      const vl = cvx * hx + cvy * hy + cvz * hz, vs = cvx * sx + cvy * sy + cvz * sz, sp = Math.hypot(vl, vs);
      const mu = sf[0] * tire.g[sf[1]] * (1 - 0.3 * this.dmg.tire) * (sf[1] === 0 ? 1 - 0.3 * env.wet : sf[1] === 1 ? 1 - 0.2 * env.wet : 1);
      const lim = mu * N + 1e-6, driven = dw.includes(i);
      let Fl, Fs;
      if (this.hand && !front) { // locked wheel: plain sliding friction
        const q = lim * 0.9 / Math.max(sp, 0.6); Fl = -vl * q; Fs = -vs * q; wh.slip = sat(sp / 5);
      } else {
        const al = Math.atan2(vs, Math.abs(vl) + 0.01);
        const hi = -lim * Math.sin(1.5 * Math.atan((sf[1] === 0 ? 10 : 6) * al)); // peak then fall-off: lets the car drift
        Fs = lerp(-clamp(vs * m * 0.05 / dt, -lim, lim), hi, sat((sp - 1) / 3));
        const drv = driven ? driveF : 0, bmax = brk * m * G * (front ? 0.3 : 0.17);
        let req = drv - clamp(vl * m * 0.2 / dt, -bmax, bmax) - sf[2] * N * clamp(vl * 2, -1, 1);
        if (driven) spinT = Math.max(spinT, Math.abs(drv) / lim - 1);
        const over2 = Math.abs(req) > lim;
        if (over2) req = Math.sign(req) * lim;
        Fs *= Math.sqrt(Math.max(0.1, 1 - 0.95 * (req / lim) * (req / lim))); // friction circle
        Fl = req;
        wh.slip = sat(Math.max(Math.abs(al) * 2.2 * sat(sp / 4) - 0.15, over2 && sp > 1 ? 0.8 : 0));
        wh.ang += vl / d.wr * dt * (1 + (driven ? this.spin : 0));
      }
      wh.vl = vl; wh.load = N;
      const fX = nx * N + hx * Fl + sx * Fs, fY = ny * N + hy * Fl + sy * Fs, fZ = nz * N + hz * Fl + sz * Fs;
      Fx += fX; Fy += fY; Fz += fZ;
      Tx += qy * fZ - qz * fY; Ty += qz * fX - qx * fZ; Tz += qx * fY - qy * fX;
    }
    this.spin += (clamp(spinT, 0, 1.2) - this.spin) * Math.min(1, dt * 6);
    this.air = contacts ? 0 : this.air + dt;

    // body shell vs ground: 8 corners with a penalty spring (rollovers, cliffs, bottoming out)
    const yb = d.clear - d.cg, yt = d.hgt - d.cg, ms = m / 1200;
    for (let i = 0; i < 8; i++) {
      const bx = (i & 1 ? 0.5 : -0.5) * d.wid, by = i & 2 ? yt : yb, bz = (i & 4 ? 0.5 : -0.5) * d.len;
      const qx = rx * bx + ux * by + fx * bz, qy = ry * bx + uy * by + fy * bz, qz = rz * bx + uz * by + fz * bz;
      const g = this.gnd(p[0] + qx, p[2] + qz), dep = g.h - (p[1] + qy);
      if (dep <= 0) continue;
      const nl = 1 / Math.sqrt(g.gx * g.gx + 1 + g.gz * g.gz), nx = -g.gx * nl, ny = nl, nz = -g.gz * nl;
      const cvx = v[0] + w[1] * qz - w[2] * qy, cvy = v[1] + w[2] * qx - w[0] * qz, cvz = v[2] + w[0] * qy - w[1] * qx;
      const vn = cvx * nx + cvy * ny + cvz * nz;
      const N = clamp(90000 * ms * Math.min(dep, 0.5) - 9000 * ms * vn, 0, m * 120);
      const tx = cvx - nx * vn, ty = cvy - ny * vn, tz = cvz - nz * vn, fr = -Math.min(0.6 * N / (Math.hypot(tx, ty, tz) + 0.01), m * 0.06 / dt);
      const fX = nx * N + tx * fr, fY = ny * N + ty * fr, fZ = nz * N + tz * fr;
      Fx += fX; Fy += fY; Fz += fZ;
      Tx += qy * fZ - qz * fY; Ty += qz * fX - qx * fZ; Tz += qx * fY - qy * fX;
      if (vn < -2.5) { this.hurt('body', (-vn - 2.5) * dt * 0.6); this.hit = Math.max(this.hit, -vn); }
    }

    // open water: drag, some buoyancy, engine floods when deep
    const g0 = W.ground(p[0], p[2], this.g);
    this.sub = g0.h < 0 && !env.frozen ? sat((0.2 - (p[1] - d.cg)) / 0.8) : 0;
    if (this.sub > 0) {
      const k = m * 2.5 * this.sub; Fx -= v[0] * k; Fy += m * G * 0.6 * this.sub - v[1] * k; Fz -= v[2] * k;
      if (this.sub > 0.75) this.hurt('engine', dt * 0.08);
    }

    // --- integrate ---
    v[0] += Fx / m * dt; v[1] += Fy / m * dt; v[2] += Fz / m * dt;
    if ((brk > 0.5 || inp.hand) && contacts > 2 && Math.hypot(v[0], v[1], v[2]) < 0.25) { v[0] *= 0.5; v[2] *= 0.5; w[1] *= 0.5; } // parked
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    const I = this.I, bx = (Tx * rx + Ty * ry + Tz * rz) / I[0], by = (Tx * ux + Ty * uy + Tz * uz) / I[1], bz = (Tx * fx + Ty * fy + Tz * fz) / I[2];
    const dmp = 1 - 0.6 * dt;
    w[0] = (w[0] + (rx * bx + ux * by + fx * bz) * dt) * dmp; w[1] = (w[1] + (ry * bx + uy * by + fy * bz) * dt) * dmp; w[2] = (w[2] + (rz * bx + uz * by + fz * bz) * dt) * dmp;
    // rotate up and forward by w, then re-orthonormalise: f, r = u x f, u = f x r
    let Ux = ux + (w[1] * uz - w[2] * uy) * dt, Uy = uy + (w[2] * ux - w[0] * uz) * dt, Uz = uz + (w[0] * uy - w[1] * ux) * dt;
    let Fx2 = fx + (w[1] * fz - w[2] * fy) * dt, Fy2 = fy + (w[2] * fx - w[0] * fz) * dt, Fz2 = fz + (w[0] * fy - w[1] * fx) * dt;
    let l = 1 / Math.hypot(Fx2, Fy2, Fz2); Fx2 *= l; Fy2 *= l; Fz2 *= l;
    let Rx = Uy * Fz2 - Uz * Fy2, Ry = Uz * Fx2 - Ux * Fz2, Rz = Ux * Fy2 - Uy * Fx2;
    l = 1 / Math.hypot(Rx, Ry, Rz); Rx *= l; Ry *= l; Rz *= l;
    R[0] = Rx; R[1] = Ry; R[2] = Rz; R[6] = Fx2; R[7] = Fy2; R[8] = Fz2;
    R[3] = Fy2 * Rz - Fz2 * Ry; R[4] = Fz2 * Rx - Fx2 * Rz; R[5] = Fx2 * Ry - Fy2 * Rx;

    // --- bookkeeping ---
    this.speed = Math.hypot(v[0], v[1], v[2]); this.odo += this.speed * dt;
    let sl = 0; for (const wh of this.wheels) sl += wh.slip; this.hurt('tire', sl * this.speed * dt * 2e-6);
    if (this.shiftT > 0) this.shiftT -= dt;
    if (this.auto && this.gear > 0 && this.shiftT <= 0) {
      if (rpmW > d.red * 0.9 && this.gear < d.gears.length && this.spin < 0.3) { this.gear++; this.shiftT = 0.45; }
      else if (this.gear > 1 && rpmW < d.red * (thr > 0.85 ? 0.45 : 0.28)) { this.gear--; this.shiftT = 0.45; }
    }
    if ((this.safeT -= dt) < 0 && contacts === 4 && R[4] > 0.9 && g0.h > 0.5) { this.safeT = 2; this.safe = [p[0], p[2], this.yaw]; }
    if (!isFinite(p[0] + p[1] + p[2] + R[0] + w[0])) this.recover();
  },

  // trees and boulders: two circles (front/rear) against object circles, impulse + damage
  collide() {
    const d = this.def, R = this.R, p = this.p, v = this.v, w = this.w, rad = d.wid * 0.52;
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) {
      if (W.at(0, p[0] + cx * 96, p[2] + cz * 96) < 0) continue;
      for (const o of W.cur.objs) {
        if (!o.r || Math.abs(o.x - p[0]) > 6 || Math.abs(o.z - p[2]) > 6 || p[1] - d.cg > o.y + (o.t === 3 ? o.s : 30)) continue;
        for (let e = -1; e <= 1; e += 2) {
          const off = e * d.len * 0.27, qx = R[6] * off, qz = R[8] * off;
          let nx = p[0] + qx - o.x, nz = p[2] + qz - o.z; const dist = Math.hypot(nx, nz) + 1e-6, pen = rad + o.r - dist;
          if (pen <= 0) continue;
          nx /= dist; nz /= dist; p[0] += nx * pen; p[2] += nz * pen;
          const vn = (v[0] + w[1] * qz) * nx + (v[2] - w[1] * qx) * nz;
          if (vn >= 0) continue;
          const rn = qz * nx - qx * nz, j = -1.25 * vn / (1 / d.m + rn * rn / this.I[1]);
          v[0] += nx * j / d.m; v[2] += nz * j / d.m; w[1] += rn * j / this.I[1];
          if (vn < -1.5) { this.hurt('body', (-vn - 1.5) * 0.035); if (e > 0 && vn < -4) this.hurt('engine', (-vn - 4) * 0.03); this.hit = Math.max(this.hit, -vn); }
        }
      }
    }
  },
  save() { return { cfg: this.cfg, p: this.p, yaw: this.yaw, fuel: this.fuel, dmg: this.dmg, odo: this.odo, auto: this.auto, lights: this.lights }; },
  load(o) {
    Object.assign(this.cfg, o.cfg); Object.assign(this.dmg, o.dmg);
    const lim = { car: CARS, tire: TIRES, spring: SPRINGS, ride: RIDE, paint: PAINT };  // stored indices may be stale or edited
    for (const k in lim) this.cfg[k] = clamp(this.cfg[k] | 0, 0, lim[k].length - 1);
    for (const k in this.dmg) this.dmg[k] = sat(+this.dmg[k] || 0);
    this.fuel = Math.max(0, +o.fuel || 0); this.odo = +o.odo || 0; this.auto = o.auto; this.lights = o.lights;
    this.setup(); this.place(o.p[0], o.p[2], o.yaw); this.safe = [o.p[0], o.p[2], o.yaw];
  }
};
