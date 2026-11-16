// Self-check for world generation and car physics: `node test.js`
const vm = require('vm'), fs = require('fs'), assert = require('assert');
for (const f of ['world', 'env', 'car']) vm.runInThisContext(fs.readFileSync(`${__dirname}/js/${f}.js`, 'utf8'), { filename: f + '.js' });

const idle = { thr: 0, brk: 0, steer: 0, hand: false }, run = (s, inp) => { for (let i = 0; i < s * 120; i++) Car.step(1 / 120, inp); };

W.reset(1); ENV.update(0.016);
const a = W.ground(123.4, -567.8, {}).h; W.reset(1);
assert.strictEqual(W.ground(123.4, -567.8, {}).h, a, 'terrain is deterministic per seed');
W.reset(2); assert.notStrictEqual(W.ground(123.4, -567.8, {}).h, a, 'seed changes terrain');

W.reset(1);
const road = W.findRoad(0, 0), g = W.ground(road.x, road.z, {});
assert.strictEqual(g.kind, 1, 'spawn is on a paved road');
assert.ok(g.h > 2, 'spawn is above water');

// real terrain: every car comes to rest on its springs at the spawn point
for (let c = 0; c < CARS.length; c++) {
  Car.cfg.car = c; Car.fuel = 999; Car.setup(); Car.place(road.x, road.z, road.yaw);
  run(3, { ...idle, hand: true });
  const h = Car.gnd(Car.p[0], Car.p[2]).h, name = CARS[c].name;
  assert.ok(Car.speed < 0.3, `${name} settles (speed ${Car.speed.toFixed(2)})`);
  assert.ok(Math.abs(Car.p[1] - h - Car.cgH) < 0.12, `${name} rides at its CG height (${(Car.p[1] - h).toFixed(2)} vs ${Car.cgH})`);
  assert.ok(Car.wheels.every(w => w.load > 500), `${name} has all wheels loaded`);
}

// flat asphalt plane: isolates the dynamics from the (curvy, steep) world
W.ground = (x, z, o) => Object.assign(o, { h: 10, gx: 0, gz: 0, kind: 1, rd: 0, veg: 0, c: null, i: 0 });
W.material = () => M.ASPHALT;
for (let c = 0; c < CARS.length; c++) {
  Car.cfg.car = c; Car.fuel = 999; Object.assign(Car.dmg, { body: 0, engine: 0, susp: 0, tire: 0 });
  Car.setup(); Car.place(0, 0, 0.3);
  const name = CARS[c].name;
  run(1, idle); run(6, { ...idle, thr: 1 });
  const v1 = Car.speed;
  assert.ok(v1 > 14 && v1 < 60, `${name} accelerates (${(v1 * 3.6).toFixed(0)} km/h in 6 s)`);
  assert.ok(Car.gear > 1, `${name} shifts up`);
  assert.ok(Car.rpm <= CARS[c].red + 200, `${name} respects the rev limit`);
  assert.ok(Car.fuel < 999, `${name} burns fuel`);

  const y0 = Car.yaw; run(0.5, { ...idle, steer: 1 });
  let dy = Car.yaw - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  assert.ok(dy > 0.02, `${name} turns right with positive steer (${dy.toFixed(3)})`);

  const t0 = Car.speed; let t = 0; while (Car.gear > 0 && t < 10) { run(0.1, { ...idle, brk: 1 }); t += 0.1; }
  assert.ok(t < 6, `${name} brakes to a stop (${t.toFixed(1)} s from ${(t0 * 3.6).toFixed(0)} km/h)`);
  run(2, { ...idle, brk: 1 });
  assert.ok(Car.gear === -1 && Car.speed > 1, `${name} reverses when the brake is held at a stop`);
  assert.ok(Car.p.every(isFinite) && Car.R.every(isFinite) && Car.R[4] > 0.9, `${name} stays finite and upright`);
  console.log(`ok  ${name.padEnd(12)} 0-6s ${(v1 * 3.6).toFixed(0)} km/h, stop in ${t.toFixed(1)} s`);
}

// handbrake at speed with steering must rotate the car (drift) without flipping it on flat ground
Car.cfg.car = 4; Car.setup(); Car.place(0, 0, 0); run(5, { ...idle, thr: 1 });
const yd = Car.yaw; run(1.2, { ...idle, steer: 1, hand: true });
assert.ok(Math.abs(Car.yaw - yd) > 0.5, 'handbrake turn rotates the car');

// a 20 m drop must damage the car and not blow up the solver
Car.cfg.car = 1; Car.setup(); Car.place(0, 0, 0); Car.p[1] += 20; Object.assign(Car.dmg, { body: 0, susp: 0 });
run(5, idle);
assert.ok(Car.dmg.susp + Car.dmg.body > 0, 'hard landing causes damage');
assert.ok(Car.p.every(isFinite) && Car.speed < 5, 'landing stays stable');
console.log('all checks passed');
