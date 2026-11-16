'use strict';
// Game loop: input, camera, menus, save/load, and the glue between world, physics, renderer and audio.
(() => {
  const canvas = document.getElementById('c'), help = document.getElementById('help'), SAVE = 'ascii-mountain-driving-v1';
  const keys = {}, tmp = {}, snd = { valley: 0, water: 0 }, SPEEDS = [0, 60, 240, 1440];
  let started = false, paused = false, menu = null, sel = 0, camMode = 0, camYaw = 0, camY = 0, msg = '', msgT = 0;
  let last = 0, clock = 0, saveT = 20, sndT = 0, up = false, down = false, fps = 60;
  const say = (s, t) => { msg = s; msgT = t || 2.5; };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------- save / load (localStorage) ----------
  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify({ seed: W.seed, car: Car.save(), env: ENV.save(), cam: camMode })); return true; } catch (e) { return false; }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE));
      if (!s || !Array.isArray(s.car.p) || !s.car.p.every(Number.isFinite) || !CARS[s.car.cfg.car]) return false; // never trust stored data
      W.reset(s.seed); ENV.load(s.env); ENV.update(0); Car.load(s.car); camMode = s.cam % 3 || 0; camYaw = Car.yaw;
      return true;
    } catch (e) { return false; }
  }
  function newWorld(seed) {
    W.reset(seed); ENV.update(0);
    const r = W.findRoad(0, 0);
    Object.assign(Car.dmg, { body: 0, engine: 0, susp: 0, tire: 0 }); Car.fuel = 1e9; Car.odo = 0;
    Car.setup(); Car.place(r.x, r.z, r.yaw); Car.safe = [r.x, r.z, r.yaw]; camYaw = r.yaw;
  }

  // ---------- menus ----------
  const cyc = (o, k, n, d) => { o[k] = (o[k] + d + n) % n; };
  const refit = () => { Car.setup(); Car.place(Car.p[0], Car.p[2], Car.yaw); };
  const MENUS = {
    garage: ['GARAGE', () => [
      { label: 'CAR', value: Car.def.name + ' - ' + Car.def.desc, ch: d => { cyc(Car.cfg, 'car', CARS.length, d); refit(); } },
      { label: 'TYRES', value: TIRES[Car.cfg.tire].name, ch: d => cyc(Car.cfg, 'tire', TIRES.length, d) },
      { label: 'SPRINGS', value: SPRINGS[Car.cfg.spring].name, ch: d => { cyc(Car.cfg, 'spring', SPRINGS.length, d); refit(); } },
      { label: 'RIDE HEIGHT', value: RIDE[Car.cfg.ride].name, ch: d => { cyc(Car.cfg, 'ride', RIDE.length, d); refit(); } },
      { label: 'PAINT', value: PAINT[Car.cfg.paint][0], ch: d => cyc(Car.cfg, 'paint', PAINT.length, d) },
      { label: 'GEARBOX', value: Car.auto ? 'AUTOMATIC' : 'MANUAL (Q/E)', ch: () => { Car.auto = !Car.auto; } },
      { label: 'REFUEL FROM JERRY CANS', value: `${Car.fuel.toFixed(0)}/${Car.def.tank}L`, ch: () => { Car.fuel = Car.def.tank; } },
      { label: 'REPAIR', value: `${(100 - 25 * (Car.dmg.body + Car.dmg.engine + Car.dmg.susp + Car.dmg.tire)).toFixed(0)}%`, ch: () => { Object.assign(Car.dmg, { body: 0, engine: 0, susp: 0, tire: 0 }); Car.setup(); } }
    ]],
    world: ['WORLD', () => [
      { label: 'WEATHER', value: WEATHER[ENV.weather], ch: d => ENV.setWeather(ENV.weather + d) },
      { label: 'WEATHER CHANGES', value: ENV.auto ? 'AUTOMATIC' : 'LOCKED', ch: () => { ENV.auto = !ENV.auto; } },
      { label: 'SEASON', value: SEASONS[ENV.season], ch: d => ENV.setSeason(ENV.season + d) },
      { label: 'TIME OF DAY', value: `${Math.floor(ENV.time)}:00`, ch: d => { ENV.time = (Math.floor(ENV.time) + d + 24) % 24; } },
      { label: 'TIME SPEED', value: ENV.timeScale ? `x${ENV.timeScale}` : 'FROZEN', ch: d => { ENV.timeScale = SPEEDS[(SPEEDS.indexOf(ENV.timeScale) + d + 4) % 4]; } },
      { label: 'SOUND', value: AUDIO.on ? 'ON' : 'OFF', ch: () => { AUDIO.on = AUDIO.toggle(); } },
      { label: 'SAVE GAME (F5)', ch: () => say(save() ? 'GAME SAVED' : 'SAVE FAILED') },
      { label: 'LOAD GAME (F9)', ch: () => say(load() ? 'GAME LOADED' : 'NO SAVED GAME') },
      { label: 'NEW WORLD (RANDOM SEED)', value: `SEED ${W.seed}`, ch: () => newWorld(Math.random() * 1e9 | 0) }
    ]]
  };
  AUDIO.on = true;

  // ---------- input ----------
  addEventListener('keydown', e => {
    const k = e.code;
    if (/^(Arrow|Space|Tab|F1$|F5|F9)/.test(k)) e.preventDefault();
    if (!started) { if (!W.chunks[0].size) return; started = true; help.hidden = true; AUDIO.init(); return; }
    keys[k] = true;
    if (menu) {
      const items = MENUS[menu][1]();
      if (k === 'ArrowUp' || k === 'KeyW') sel = (sel + items.length - 1) % items.length;
      else if (k === 'ArrowDown' || k === 'KeyS') sel = (sel + 1) % items.length;
      else if (k === 'ArrowLeft' || k === 'KeyA') { items[sel].ch(-1); ENV.update(0); }
      else if (k === 'ArrowRight' || k === 'KeyD' || k === 'Enter' || k === 'Space') { items[sel].ch(1); ENV.update(0); }
      else if (k === 'Escape' || k === 'Tab' || k === 'KeyG') { menu = null; for (const q in keys) keys[q] = false; }
      return;
    }
    if (e.repeat) return;
    switch (k) {
      case 'KeyG': if (Car.speed < 1.5) { menu = 'garage'; sel = 0; } else say('STOP THE CAR TO OPEN THE GARAGE'); break;
      case 'Tab': case 'Escape': menu = 'world'; sel = 0; break;
      case 'KeyC': camMode = (camMode + 1) % 3; say(['CHASE CAMERA', 'FAR CAMERA', 'BONNET CAMERA'][camMode], 1.2); break;
      case 'KeyH': Car.lights = !Car.lights; break;
      case 'KeyM': Car.auto = !Car.auto; say(Car.auto ? 'AUTOMATIC GEARBOX' : 'MANUAL GEARBOX (Q/E)'); break;
      case 'KeyR': Car.recover(); say('RECOVERED TO THE LAST SAFE SPOT'); break;
      case 'KeyP': paused = !paused; break;
      case 'KeyE': up = true; break;
      case 'KeyQ': down = true; break;
      case 'KeyT': ENV.timeScale = SPEEDS[(SPEEDS.indexOf(ENV.timeScale) + 1) % 4]; say(ENV.timeScale ? `TIME SPEED x${ENV.timeScale}` : 'TIME FROZEN'); break;
      case 'BracketLeft': case 'BracketRight': ENV.setWeather(ENV.weather + (k === 'BracketLeft' ? -1 : 1)); say('WEATHER: ' + WEATHER[ENV.weather]); break;
      case 'KeyN': AUDIO.on = AUDIO.toggle(); say(AUDIO.on ? 'SOUND ON' : 'SOUND OFF'); break;
      case 'F1': help.hidden = !help.hidden; break;
      case 'F5': say(save() ? 'GAME SAVED' : 'SAVE FAILED'); break;
      case 'F9': say(load() ? 'GAME LOADED' : 'NO SAVED GAME'); break;
    }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const q in keys) keys[q] = false; });
  addEventListener('resize', () => RD.resize(canvas));
  addEventListener('pagehide', () => { if (started) save(); });
  ENV.onThunder = d => AUDIO.thunder(d);

  // ---------- simulation ----------
  function surroundings() { // how enclosed we are (echo) and how close running water is
    const x = Car.p[0], y = Car.p[1], z = Car.p[2]; let enc = 0, wat = 0;
    for (let a = 0; a < 8; a++) { const i = W.at(1, x + Math.sin(a * 0.785) * 400, z + Math.cos(a * 0.785) * 400); if (i >= 0) enc += Math.max(0, W.cur.h[i] - y); }
    if (!ENV.frozen) for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
      const k = W.at(0, x + i * 14, z + j * 14); if (k < 0) continue;
      const kd = W.cur.kind[k], w = kd === 4 ? 1 : kd === 3 ? 0.6 : W.cur.h[k] < 0 ? 0.35 : 0;
      if (w) wat = Math.max(wat, w * (1 - Math.hypot(i, j) * 14 / 80));
    }
    snd.valley = sat(enc / 8 / 220); snd.water = sat(wat);
  }
  function update(dt) {
    ENV.update(dt);
    const inp = { thr: keys.KeyW || keys.ArrowUp ? 1 : 0, brk: keys.KeyS || keys.ArrowDown ? 1 : 0, steer: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), hand: !!keys.Space, up, down };
    const n = Math.max(1, Math.round(dt * 120));
    for (let i = 0; i < n; i++) { Car.step(dt / n, inp); inp.up = inp.down = false; }
    up = down = false;
    Car.collide();
    if (Car.hit > 0) { AUDIO.crash(Car.hit); if (Car.hit > 5) say('IMPACT!', 1); Car.hit = 0; Car.setup(); }

    // wheel spray: dust, snow, water, tyre smoke
    const R9 = Car.R, p = Car.p, d = Car.def; let slip = 0, paved = 0, loose = 0;
    for (const w of Car.wheels) {
      if (!w.load) continue;
      const cls = SURF[w.mat][1], wetm = w.mat === M.WATER || w.mat === M.STREAM || w.mat === M.FALL;
      slip += w.slip / 4; if (cls === 0) paved += 0.25; else loose += 0.25;
      const rate = w.slip * 50 + (cls ? Car.speed * 0.9 : 0);
      if (Math.random() < rate * dt) {
        const by = w.y - d.wr, c = wetm ? [190, 215, 240] : cls === 2 ? [240, 242, 250] : cls === 0 ? [190, 190, 190] : w.mat === M.DIRT ? [160, 125, 85] : [130, 130, 95];
        RD.spawn(p[0] + R9[0] * w.x + R9[3] * by + R9[6] * w.z, p[1] + R9[1] * w.x + R9[4] * by + R9[7] * w.z + 0.1, p[2] + R9[2] * w.x + R9[5] * by + R9[8] * w.z,
          Car.v[0] * 0.25 + Math.random() * 2 - 1, 1 + Math.random() * 2, Car.v[2] * 0.25 + Math.random() * 2 - 1, 0.5 + Math.random() * 0.7, '.:*o'.charCodeAt(Math.random() * 4 | 0), c[0], c[1], c[2]);
      }
    }
    if (Car.dmg.engine > 0.4 && Math.random() < dt * 12 * Car.dmg.engine) RD.spawn(p[0] + R9[6] * d.len * 0.4, p[1] + 0.5, p[2] + R9[8] * d.len * 0.4, 0, 2.5, 0, 1.4, 111, 70, 70, 70);

    W.update(p[0], p[2], 5);
    if ((sndT -= dt) < 0) { sndT = 0.5; surroundings(); }
    const g = W.ground(p[0], p[2], tmp), forest = g.veg / 255, snow = ENV.snowing(p[1]);
    AUDIO.update(dt, {
      rpm: Car.rpm, red: d.red, thr: Car.thr, alive: Car.fuel > 0 && Car.dmg.engine < 1, slip, speed: Car.speed, paved, loose,
      wind: ENV.wind, rain: snow ? ENV.rain * 0.15 : ENV.rain, water: snd.water, forest, valley: snd.valley, alt: p[1],
      night: ENV.dayF < 0.3, birds: forest * (ENV.rain < 0.2 && ENV.wind < 12 && ENV.temp(p[1]) > 2 ? 1 : 0)
    });
    if ((saveT -= dt) < 0) { saveT = 20; save(); }
  }

  // ---------- camera + frame ----------
  function render(dt) {
    const R9 = Car.R, p = Car.p, v = Car.v, yaw = Car.yaw, vf = v[0] * R9[6] + v[2] * R9[8];
    const roll = -Math.asin(clamp(R9[1], -1, 1));
    if (camMode === 2 && started) {
      camYaw = yaw;
      RD.setCam(p[0] + R9[3] * 0.75 + R9[6] * 0.2, p[1] + R9[4] * 0.75 + R9[7] * 0.2, p[2] + R9[5] * 0.75 + R9[8] * 0.2, yaw, Math.asin(clamp(R9[7], -1, 1)), roll);
    } else {
      // chase: follow the direction of travel so a drift shows the side of the car
      const tgt = !started ? clock * 0.12 : vf > 3 ? yaw + clamp(wrap(Math.atan2(v[0], v[2]) - yaw), -0.6, 0.6) * 0.6 : yaw;
      camYaw = wrap(camYaw + wrap(tgt - camYaw) * Math.min(1, dt * 4));
      const far = camMode === 1 || !started, dist = (far ? 16 : 9) + Car.speed * 0.03, cx = p[0] - Math.sin(camYaw) * dist, cz = p[2] - Math.cos(camYaw) * dist;
      const want = Math.max(p[1] + (far ? 6.5 : 3), Math.max(0, W.ground(cx, cz, tmp).h) + 1);
      camY += (want - camY) * Math.min(1, dt * 6); if (Math.abs(want - camY) > 30) camY = want;
      RD.setCam(cx, camY, cz, camYaw, Math.atan2(p[1] + 0.7 - camY, dist), roll * 0.25);
    }
    const hl = Math.hypot(R9[6], R9[8]) || 1, L = RD.lamp;
    L.on = Car.lights; L.x = p[0] + R9[6] * 1.5; L.z = p[2] + R9[8] * 1.5; L.fx = R9[6] / hl; L.fz = R9[8] / hl;
    RD.frame(clock); RD.sprites();
    const hood = camMode === 2 && started; if (!hood) RD.car();
    RD.particles(dt); RD.bolt();
    const cam = RD.cam;
    if (ENV.rain > 0.02) RD.precip(dt, ENV.rain, ENV.snowing(p[1]), ((ENV.wx - v[0]) * cam.rtx + (ENV.wz - v[2]) * cam.rtz) * 0.02);
    if (hood) RD.hood();
    if (started) {
      RD.hud(msgT > 0 ? msg : paused ? 'PAUSED (P)' : '', camYaw);
      RD.text(RD.cols - 8, RD.rows - 1, `${fps.toFixed(0).padStart(3)} FPS`, RD.rgb(120, 130, 140));
      if (menu) { const m = MENUS[menu]; RD.menu(m[0], m[1](), sel, 'UP/DOWN SELECT   LEFT/RIGHT CHANGE   ESC CLOSE'); }
    }
    RD.blit();
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    clock += dt; msgT -= dt; fps += (1 / dt - fps) * 0.05;
    if (started && !paused && !menu) update(dt);
    render(dt);
  }

  RD.init(canvas);
  setTimeout(() => { // let the title paint before the first world build
    if (!load()) newWorld(7);
    W.update(Car.p[0], Car.p[2], 1e9);
    document.getElementById('status').textContent = '아무 키나 누르면 출발합니다';
    requestAnimationFrame(frame);
  }, 30);
})();
