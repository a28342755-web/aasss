'use strict';
// Environment: clock, seasons, weather, wind, sun/moon, light and sky colours.
const WEATHER = ['CLEAR', 'CLOUDY', 'FOG', 'RAIN', 'STORM', 'SNOW'];
const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];
const ENV = (() => {
  // per weather: cloud, fog, precipitation, storm, wind (m/s)
  const TARGET = [[0.15, 0, 0, 0, 2.5], [0.7, 0.04, 0, 0, 5], [0.5, 1, 0, 0, 1], [0.9, 0.2, 0.7, 0, 7], [1, 0.25, 1, 1, 17], [0.9, 0.3, 0.7, 0, 6]];
  // per season: chance of each weather
  const ODDS = [[35, 25, 10, 22, 8, 0], [50, 20, 5, 13, 12, 0], [30, 25, 20, 20, 5, 0], [30, 25, 10, 0, 0, 35]];
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const E = {
    DAYS: 2,                       // game days per season
    time: 8.5, day: 2, timeScale: 60, weather: 0, auto: true, wTimer: 200, clock: 0,
    cloud: 0.15, fog: 0, rain: 0, storm: 0, wet: 0, snowCover: 0,
    wind: 3, windDir: 1, wx: 0, wz: 0, cloudX: 0, cloudZ: 0,
    flash: 0, boltAz: 0, boltSeed: 0, nextBolt: 6, onThunder: null,
    season: 1, seasonF: 0, snowline: 800, frozen: false,
    sun: [0, 1, 0], moon: [0, -1, 0], ldir: [0, 1, 0], light: [1, 1, 1], amb: [0.4, 0.4, 0.5], sunI: 1, dayF: 1,
    skyZ: [40, 100, 190], skyH: [150, 195, 235], fogC: [150, 190, 230], vis: 3200,

    // seasonal parameter, blended over the last 40% of each season
    sp(a) { return lerp(a[E.season], a[(E.season + 1) % 4], sstep(0.6, 1, E.seasonF)); },
    temp(alt) { return E.sp([9, 20, 8, -6]) + 5 * Math.sin((E.time - 9) / 24 * 6.2832) - alt * 0.0065 - E.cloud * 2; },
    snowing(alt) { return E.weather === 5 || E.temp(alt) < 0.5; },   // precipitation falls as snow
    setWeather(i) { E.weather = (i + 6) % 6; E.wTimer = 150 + Math.random() * 240; },
    setSeason(i) { E.day = ((i + 4) % 4) * E.DAYS; },

    update(dt) {
      E.clock += dt;
      E.time += dt * E.timeScale / 3600;
      if (E.time >= 24) { E.time -= 24; E.day = (E.day + 1) % (4 * E.DAYS); }
      const pos = (E.day + E.time / 24) / E.DAYS;
      E.season = Math.floor(pos) % 4; E.seasonF = pos - Math.floor(pos);

      // weather: random walk weighted by season, values ease toward the target
      if (E.auto && (E.wTimer -= dt) < 0) {
        const o = ODDS[E.season]; let r = Math.random() * 100, i = 0;
        while (i < 5 && (r -= o[i]) > 0) i++;
        E.setWeather(i);
      }
      const t = TARGET[E.weather], k = Math.min(1, dt * 0.12);
      E.cloud += (t[0] - E.cloud) * k; E.fog += (t[1] - E.fog) * k; E.rain += (t[2] - E.rain) * k; E.storm += (t[3] - E.storm) * k;
      E.wind += (t[4] * (1 + 0.5 * W.noise(E.clock * 0.2, 0, 900)) - E.wind) * Math.min(1, dt * 0.5);
      E.windDir += W.noise(E.clock * 0.02, 5, 901) * dt * 0.3;
      E.wx = Math.sin(E.windDir) * E.wind; E.wz = Math.cos(E.windDir) * E.wind;
      E.cloudX += E.wx * dt * 6; E.cloudZ += E.wz * dt * 6;

      // ground state: wetness, snow cover (lowers the snow line), frozen lakes in winter
      const snow = E.snowing(300);
      E.wet = sat(E.wet + (snow ? 0 : E.rain) * dt * 0.05 - dt * 0.006 * (1 + E.sunI));
      E.snowCover = sat(E.snowCover + (snow ? E.rain * dt * 0.012 : -dt * 0.003 * Math.max(0, E.temp(300))));
      E.snowline = E.sp([620, 820, 650, 140]) - E.snowCover * 350;
      E.frozen = E.sp([0, 0, 0, 1]) > 0.5;

      // lightning
      E.flash *= Math.exp(-dt * 6);
      if (E.storm > 0.5 && (E.nextBolt -= dt) < 0) {
        E.flash = 1; E.boltAz = Math.random() * 6.2832; E.boltSeed = Math.random() * 1e6 | 0; E.nextBolt = 3 + Math.random() * 12;
        if (E.onThunder) E.onThunder(0.3 + Math.random() * 5);
      }

      // sun and moon
      const a = (E.time - 12) / 12 * Math.PI;
      E.sun = norm([-Math.sin(a), Math.cos(a) * 0.85 + E.sp([0, 0.18, 0, -0.22]), -0.45]);
      E.moon = norm([Math.sin(a), -Math.cos(a) * 0.7 + 0.15, 0.4]);
      const sy = E.sun[1], dayF = E.dayF = sstep(-0.12, 0.2, sy), dusk = sstep(-0.25, 0.02, sy) * (1 - sstep(0.02, 0.35, sy));
      const dim = 1 - E.cloud * 0.7;
      E.sunI = sstep(-0.02, 0.2, sy) * dim;
      if (E.sunI > 0.02) {
        E.ldir = E.sun;
        const c = mix3([1, 0.47, 0.2], [1, 0.97, 0.88], sstep(0, 0.35, sy));
        E.light = [c[0] * E.sunI, c[1] * E.sunI, c[2] * E.sunI];
      } else {
        const mI = Math.max(0, E.moon[1]) * dim * 0.5;
        E.ldir = E.moon[1] > 0 ? E.moon : [0, 1, 0];
        E.light = [0.25 * mI, 0.3 * mI, 0.45 * mI];
      }
      const f = E.flash * 0.9;
      E.amb = mix3([0.08, 0.1, 0.17], [0.42, 0.46, 0.55], dayF).map((v, i) => v * (1 - E.storm * 0.3) + f + (i === 0 ? dusk * 0.08 : 0));

      // sky, fog, visibility
      let z = mix3([4, 6, 16], [40, 100, 190], dayF), h = mix3([10, 14, 30], [150, 195, 235], dayF);
      z = mix3(z, [70, 50, 110], dusk * 0.5); h = mix3(h, [255, 130, 60], dusk * 0.8);
      const g = (0.12 + 0.88 * dayF) * (1 - E.storm * 0.5), gray = [125 * g, 130 * g, 138 * g], ov = Math.max(E.cloud * 0.8, E.fog);
      E.skyZ = mix3(z, gray, ov).map(v => v + f * 120); E.skyH = mix3(h, gray, ov * 0.9).map(v => v + f * 120);
      E.fogC = mix3(E.skyH, gray, E.fog * 0.7);
      E.vis = 3200 / (1 + E.fog * E.fog * 40 + E.rain * 2.5);
    },
    save() { const o = {}; for (const k of ['time', 'day', 'timeScale', 'weather', 'auto', 'cloud', 'fog', 'rain', 'storm', 'wet', 'snowCover', 'windDir']) o[k] = E[k]; return o; },
    load(o) { Object.assign(E, o); }
  };
  return E;
})();
