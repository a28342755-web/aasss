/*
 * 삼천의 운명 — 직업 생성기
 *
 * 1. 계열별 기본 직업(약 730개)을 모두 넣는다.
 * 2. 남은 자리는 "수식어 + 기본 직업" 변종으로 채워 정확히 3,000개를 만든다.
 *    각 기본 직업이 받는 변종 수는 고르게, 수식어 사용 횟수도 고르게 배분한다.
 * 3. 점수(기본 직업 등급 + 수식어 티어 + 고정 난수)로 줄 세워 등급 정원을 채운다.
 * 결과는 고정 시드로 결정되므로 직업 번호와 내용은 매번 같다.
 */
(function (root) {
  "use strict";
  const FATES = root.FATES;
  const D = FATES.data;
  const TOTAL = 3000;
  const STATS = D.STATS;

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function parseKV(text) {
    const out = {};
    if (!text) return out;
    text.split(",").forEach((pair) => {
      const [k, v] = pair.split(":");
      if (k && v) out[k.trim()] = parseFloat(v);
    });
    return out;
  }

  function parseBias(text) {
    const out = {};
    text.trim().split(/\s+/).forEach((token) => {
      const m = token.match(/^([a-z]+)(\d+)$/);
      if (m) out[m[1]] = Number(m[2]);
    });
    return out;
  }

  function parseTweak(text) {
    const out = {};
    if (!text) return out;
    text.split(",").forEach((token) => {
      const m = token.trim().match(/^([a-z]+)([+-]\d+)$/);
      if (m) out[m[1]] = Number(m[2]);
    });
    return out;
  }

  function splitSkill(text) {
    const [name, type] = text.split("|");
    return { name, type };
  }

  /* ── 계열과 기본 직업 ── */
  const families = FATES.FAMILIES.map((f, idx) => {
    const fam = {
      idx, id: f.id, name: f.name, combat: f.combat, el: f.el, desc: f.desc, loot: f.loot || null,
      bias: parseBias(f.bias), main: f.bias.trim().split(/\s+/)[0].replace(/\d+/g, ""),
      passive: parseKV(f.passive), atk: f.atk,
      s1: splitSkill(f.s1), s2: splitSkill(f.s2), ult: splitSkill(f.ult), bases: []
    };
    fam.bases = f.jobs.trim().split("\n").map((line) => {
      const [name, desc, skill, type, stat, tier, el] = line.trim().split("|");
      return { name, desc, skill, type, stat, tier: Number(tier), el: el || null, family: fam };
    });
    return fam;
  });

  /* ── 수식어 ── */
  const mods = D.MODIFIERS.trim().split("\n").map((line) => {
    const [name, tier, el, tweak, passive, skill, type, desc, flag, exclude] = line.trim().split("|");
    return {
      name, tier: Number(tier), el: el || null, tweak: parseTweak(tweak), passive: parseKV(passive),
      skill, type, desc, flag: flag || "",
      exclude: exclude ? exclude.split(",").map((s) => s.trim()).filter(Boolean) : []
    };
  });

  const baseNames = new Set();
  families.forEach((f) => f.bases.forEach((b) => baseNames.add(b.name)));

  function allowed(mod, base) {
    const fam = base.family;
    if (baseNames.has(`${mod.name} ${base.name}`)) return false;
    if (mod.flag === "c" && !fam.combat) return false;
    if (mod.flag === "n" && fam.combat) return false;
    // 속성이 정해진 직업에 다른 속성 수식어는 붙이지 않는다 (예: 서리 화염술사 X)
    if (base.el && mod.el && mod.el !== "phys" && mod.el !== base.el) return false;
    // 이름이 겹치는 조합 제외 (예: 해적 해적선장, 그림자 그림자술사)
    if (base.name.includes(mod.name) || base.name.includes(mod.name.slice(0, 2))) return false;
    if (mod.exclude.some((word) => base.name.includes(word))) return false;
    return true;
  }

  const allBases = [];
  families.forEach((f) => f.bases.forEach((b) => allBases.push(b)));
  const variantCount = TOTAL - allBases.length;
  const perBase = Math.floor(variantCount / allBases.length);
  const extra = variantCount - perBase * allBases.length;
  const extraSet = new Set(shuffle(allBases.map((_, i) => i), seeded(3000)).slice(0, extra));

  // 수식어 사용량을 고르게 유지하되, 신화급(티어 3) 수식어는 덜 자주 쓰이게 가중치를 둔다
  const usage = new Map(mods.map((m) => [m.name, 0]));
  const weight = [1, 1, 1.3, 2.2];
  allBases.forEach((base, i) => {
    const want = perBase + (extraSet.has(i) ? 1 : 0);
    const candidates = shuffle(mods.filter((m) => allowed(m, base)), seeded(hash(base.name)));
    candidates.sort((a, b) => usage.get(a.name) * weight[a.tier] - usage.get(b.name) * weight[b.tier]);
    base.mods = candidates.slice(0, want);
    base.mods.forEach((m) => usage.set(m.name, usage.get(m.name) + 1));
  });

  /* ── 직업 조립 ── */
  function makeSkill(name, type, stat, el, pow, lv, tag) {
    return { name, type, stat, el, pow, lv, tag };
  }

  function draft(base, mod) {
    const fam = base.family;
    const name = mod ? `${mod.name} ${base.name}` : base.name;
    const jitter = seeded(hash(name))();
    const el = base.el || (mod && mod.el && mod.el !== "phys" ? mod.el : null) || fam.el;
    return {
      id: 0, name, fam: fam.idx, base: base.name, mod: mod ? mod.name : null,
      desc: base.desc, modDesc: mod ? mod.desc : null, el, rarity: 0,
      _score: base.tier + (mod ? mod.tier * 1.15 : 0.6) + jitter * 1.3,
      _base: base, _mod: mod
    };
  }

  function finalize(job) {
    const base = job._base;
    const mod = job._mod;
    const fam = base.family;
    // 공격 능력치는 하나로 모은다: 기본 직업의 주 능력치, 체력형이면 계열의 주 능력치
    const atkStat = base.stat !== "vit" ? base.stat : fam.main !== "vit" ? fam.main : "str";
    const w = {};
    STATS.forEach((k) => { w[k] = 1 + (fam.bias[k] || 0) + (k === atkStat ? 3 : 0); });
    if (base.stat === "vit") w.vit += 1.5;
    // 체력이 지나치게 낮은 직업이 초반 보스에서 몰살당하지 않도록 최소 비중을 보장한다
    w.vit = Math.max(w.vit, 2.5);
    const sum = STATS.reduce((acc, k) => acc + w[k], 0);
    const points = fam.combat ? 34 : 32;
    const growthPoints = fam.combat ? 9.5 : 9;
    const tweak = mod ? mod.tweak : {};
    // 수식어 없는 정통 직업은 능력치 5% 보너스
    const mul = D.RARITIES[job.rarity].mul * (mod ? 1 : 1.05);

    job.stats = {};
    job.growth = {};
    STATS.forEach((k) => {
      job.stats[k] = Math.max(1, Math.round((4 + (points * w[k]) / sum + (tweak[k] || 0)) * mul));
      job.growth[k] = Math.round(((growthPoints * w[k]) / sum + Math.max(0, tweak[k] || 0) * 0.15) * mul * 100) / 100;
    });

    job.passive = Object.assign({}, fam.passive);
    if (mod) {
      Object.keys(mod.passive).forEach((k) => { job.passive[k] = (job.passive[k] || 0) + mod.passive[k]; });
    }

    job.atkStat = atkStat;
    job.attack = { name: fam.atk, stat: atkStat, el: base.el || fam.el };
    job.skills = [
      makeSkill(fam.s1.name, fam.s1.type, atkStat, job.el, 1, 1, "family"),
      makeSkill(base.skill, base.type, atkStat, job.el, 1.15, 1, "sig"),
      makeSkill(fam.s2.name, fam.s2.type, atkStat, job.el, 1, 4, "family"),
      mod
        ? makeSkill(mod.skill, mod.type, atkStat, mod.el || job.el, 1.1, 7, "mod")
        : makeSkill(`진·${base.skill}`, base.type, atkStat, job.el, 1.5, 7, "true"),
      makeSkill(fam.ult.name, fam.ult.type, atkStat, job.el, 1.6 + job.rarity * 0.08, 10, "ult")
    ];
    delete job._base;
    delete job._mod;
    delete job._score;
    return job;
  }

  const jobs = [];
  families.forEach((fam) => {
    fam.start = jobs.length;
    fam.bases.forEach((base) => {
      jobs.push(draft(base, null));
      base.mods.forEach((mod) => jobs.push(draft(base, mod)));
    });
    fam.count = jobs.length - fam.start;
  });
  jobs.forEach((job, i) => { job.id = i + 1; });

  // 등급 배정: 점수 높은 순으로 신화 → 전설 → … → 일반 정원을 채운다
  const ranked = jobs.slice().sort((a, b) => b._score - a._score || a.id - b.id);
  let cursor = 0;
  for (let r = D.RARITIES.length - 1; r >= 0; r--) {
    for (let n = 0; n < D.RARITIES[r].count && cursor < ranked.length; n++) ranked[cursor++].rarity = r;
  }
  jobs.forEach(finalize);

  FATES.JOBS = jobs;
  FATES.FAMILY_LIST = families.map((f) => ({
    idx: f.idx, id: f.id, name: f.name, combat: f.combat, desc: f.desc, loot: f.loot,
    passive: f.passive, el: f.el, count: f.count, baseCount: f.bases.length
  }));
  FATES.MOD_COUNT = mods.length;
  FATES.BASE_COUNT = allBases.length;
  FATES.jobById = (id) => jobs[id - 1] || null;
})(typeof window !== "undefined" ? window : globalThis);
