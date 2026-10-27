/*
 * 삼천의 운명 — 전투·성장 엔진 (DOM 없이 동작)
 * 게임 화면과 밸런스 시뮬레이션(tools/simulate.js)이 같은 코드를 쓴다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const D = F.data;
  const T = D.SKILL_TYPES;
  if (!F.rng) F.rng = Math.random;
  const R = () => F.rng();

  /* ── 한국어 조사 ── */
  function josa(word, pair) {
    if (!pair.includes("/")) return pair;
    const [withFinal, withoutFinal] = pair.split("/");
    const code = word.charCodeAt(word.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return withoutFinal;
    const jong = (code - 0xac00) % 28;
    if (pair === "으로/로") return jong === 0 || jong === 8 ? "로" : "으로";
    return jong ? withFinal : withoutFinal;
  }
  const J = (word, pair) => word + josa(word, pair);

  /* ── 몬스터 표 ── */
  const MONSTERS = D.MONSTERS.trim().split("\n").map((line) => {
    const [name, tier, el, weak, resist, traits, hp, atk, def, boss, only] = line.trim().split("|");
    return {
      name, tier: Number(tier), el, weak: weak || null, resist: resist || null,
      traits: traits === "none" ? [] : traits.split(","),
      hp: Number(hp), atk: Number(atk), def: Number(def), boss: boss === "B", mid: boss === "M", only: only || ""
    };
  });

  /* ── 난이도 ──
     몬스터 세기와 보상을 곱하고, 어려움에서는 5층마다 중간 보스가 더 나온다.
     key는 몬스터 표의 '나오는 난이도' 글자(E 쉬움 · N 보통 · H 어려움)와 맞춘다 */
  const DIFFS = {
    easy: { name: "쉬움", key: "E", hp: 0.85, atk: 0.8, def: 0.95, exp: 1, gold: 1, mid: false, desc: "몬스터가 약하고(HP·공격↓) 순한 몬스터가 섞인다" },
    normal: { name: "보통", key: "N", hp: 1, atk: 1, def: 1, exp: 1, gold: 1, mid: false, desc: "기본 세기의 몬스터와 10층마다 보스" },
    hard: { name: "어려움", key: "H", hp: 1.45, atk: 1.5, def: 1.2, exp: 1.25, gold: 1.3, mid: true, desc: "몬스터가 훨씬 세고(HP·공격↑) 정예가 섞이며 5층마다 중간 보스. 경험치·골드↑" }
  };
  const DIFF_KEYS = ["easy", "normal", "hard"];
  function diffOf(k) {
    return DIFFS[k] || DIFFS.normal;
  }
  function allowedIn(m, diff) {
    return !m.only || m.only.includes(diffOf(diff).key);
  }

  /* ── 직업 고유 특성 (data-traits.js) ──
     기본 직업 이름 → 정해 둔 특성, 이름 낱말 규칙, 대표 기술 유형 순으로 고른다. 등급이 높을수록 수치가 크다 */
  function pickTrait(job) {
    if (D.TRAIT_EXACT[job.base]) return D.TRAIT_EXACT[job.base];
    for (const [id, re] of D.TRAIT_RULES) if (re.test(job.base)) return id;
    const sig = job.skills.find((s) => s.tag === "sig") || job.skills[1];
    let t = D.TRAIT_BY_TYPE[sig.type] || "momentum";
    if (sig.type === "stun" && job.el === "ice") t = "chill";
    if (sig.type === "stun" && job.el === "bolt") t = "shock";
    if (typeof t === "object") t = t[job.atkStat] || t.any || "momentum";
    return t;
  }

  function allyName(job) {
    const hit = D.ALLY_NAMES.find(([re]) => re.test(job.base));
    return hit ? hit[1] : "동료";
  }

  const pct0 = (x) => String(Math.round(x * 100));

  function traitOf(job) {
    if (job._trait) return job._trait;
    const id = pickTrait(job);
    const t = D.TRAITS[id];
    const k = 1 + job.rarity * 0.1;
    const v = (t.v || 0) * k;
    const c = Math.min(0.75, (t.c || 0) * k);
    const v2 = v * (t.v2 || 0);
    const ally = id === "ally" ? allyName(job) : null;
    const desc = t.desc.replace("{v}", pct0(v)).replace("{c}", pct0(c)).replace("{v2}", pct0(v2)).replace("{ally}", ally ? J(ally, "이/가") : "");
    job._trait = { id, name: t.name, v, c, v2, ally, desc };
    return job._trait;
  }

  /* ── 무기별 기본 공격 ──
     무기는 직업 그림이 정한다(heroes.js). 그림 쪽이 아직 없으면(도구) 검으로 친다 */
  function weaponOf(job) {
    if (job._wstyle) return job._wstyle;
    const H = F.heroes;
    const key = H ? H.weaponOf(job).key : "sword";
    const w = Object.assign({ key, name: H ? H.WEAPONS[key].name : "검", mult: 1, hits: 1, mp: 0.04 }, D.WEAPON_STYLES[key]);
    if (H) job._wstyle = w;
    return w;
  }

  /* 기본 공격(이름·능력치·속성): 이름은 쥔 무기에 맞춘다 */
  function attackOf(job) {
    if (job._atk) return job._atk;
    const H = F.heroes;
    if (!H) return job.attack;
    const w = weaponOf(job);
    const fits = (D.ATTACK_FITS[F.FAMILY_LIST[job.fam].id] || "").split(",").includes(w.key);
    const name = fits ? job.attack.name : (w.key === "throw" && D.THROW_ATTACK[H.styleOf(job).shot]) || D.WEAPON_ATTACK[w.key] || job.attack.name;
    job._atk = Object.assign({}, job.attack, { name });
    return job._atk;
  }

  function describeAttack(job) {
    const w = weaponOf(job);
    const parts = [w.hits > 1 ? `위력 ${pct0(w.mult)}%로 ${w.hits}회 공격` : `위력 ${pct0(w.mult)}% 공격`];
    if (w.pen) parts.push(`방어 ${pct0(w.pen)}% 무시`);
    if (w.crit) parts.push(`치명타 +${pct0(w.crit)}%p`);
    if (w.stun) parts.push(`${pct0(w.stun)}% 확률로 기절`);
    if (w.bleed) parts.push("3턴 출혈");
    if (w.drain) parts.push(`준 피해의 ${pct0(w.drain)}% 흡수`);
    if (w.heal) parts.push(`HP ${pct0(w.heal)}% 회복`);
    if (w.debuff) parts.push(`${pct0(w.debuff)}% 확률로 적 약화`);
    if (w.curse) parts.push(`${pct0(w.curse)}% 확률로 저주`);
    if (w.extra) parts.push(`${pct0(w.extra)}% 확률로 하나 더 던짐`);
    parts.push(w.mp ? `MP ${pct0(w.mp)}% 회복` : "MP 회복 없음");
    return parts.join(", ");
  }

  /* ── 능력치 ── */
  function statsAt(job, level) {
    const s = {};
    D.STATS.forEach((k) => { s[k] = Math.round(job.stats[k] + job.growth[k] * (level - 1)); });
    return s;
  }

  /* 장인 정신 특성은 강화 단계를 더 크게 쳐 준다 */
  function gearLv(p, lv) {
    const tr = traitOf(p.job);
    return tr.id === "craftsman" ? lv * (1 + tr.v) : lv;
  }

  function derive(p) {
    const pa = p.job.passive;
    const tr = traitOf(p.job);
    const L = p.level;
    const s = statsAt(p.job, L);
    const armor = gearLv(p, p.armorLv);
    const nimble = tr.id === "nimble" ? tr.v : 0;
    return {
      s,
      maxHp: Math.round((60 + L * 13 + s.vit * 3 + s.str) * (1 + 0.04 * armor) * (1 + (pa.hp || 0) + (tr.id === "sturdy" ? tr.v : 0))),
      maxMp: Math.round((30 + s.wis * 3 + s.int * 2.5 + L * 3) * (1 + (pa.mp || 0))),
      def: (s.vit * 0.4 + s.str * 0.15 + L + armor * 3) * (1 + (pa.def || 0)),
      crit: Math.min(0.6, 0.05 + s.luk * 0.007 + s.dex * 0.002 + (pa.crit || 0)),
      eva: Math.min(0.35 + nimble, 0.03 + s.dex * 0.003 + s.luk * 0.002 + (pa.eva || 0) + nimble)
    };
  }

  function power(p, d, stat) {
    const w = gearLv(p, p.weaponLv);
    return (d.s[stat] * 2.2 + p.level * 1.6 + 6) * (1 + 0.06 * w) + w * 3;
  }

  /* 물약 효과 배율: 계열 특성 + 요리 솜씨 */
  function potionPower(p) {
    const tr = traitOf(p.job);
    return 1 + (p.job.passive.pot || 0) + (tr.id === "cook" ? tr.v : 0);
  }

  function expNeed(level) {
    return Math.round(12 + 9 * Math.pow(level, 1.45));
  }

  function newPlayer(job, name) {
    const p = {
      v: 1, name, job, level: 1, exp: 0, gold: 60, floor: 1, best: 0, kills: 0,
      weaponLv: 0, armorLv: 0, potions: { hp: 3, mp: 1 }, reviveUsed: false,
      jobsHeld: [job.id], started: Date.now()
    };
    const d = derive(p);
    p.hp = d.maxHp;
    p.mp = d.maxMp;
    return p;
  }

  /* ── 기술 수치 ── */
  function skillSpec(p, skill) {
    const t = T[skill.type];
    const tagCost = skill.tag === "ult" ? 2 : skill.tag === "true" ? 1.3 : 1;
    return {
      t,
      cost: Math.round((t.cost || 0) * tagCost * (1 + (p.level - 1) * 0.04)),
      cd: (t.cd || 0) + (skill.tag === "ult" ? 2 : 0),
      mult: (t.mult || 0) * skill.pow,
      dur: (t.t || 0) + (p.job.passive.dur || 0)
    };
  }

  function pct(v) {
    return Math.round(v * 1000) / 10;
  }

  function describeSkill(skill, p) {
    const t = T[skill.type];
    const m = Math.round((t.mult || 0) * skill.pow * 100);
    const dur = (t.t || 0) + (p ? p.job.passive.dur || 0 : 0);
    switch (skill.type) {
      case "strike": return `위력 ${m}%의 강력한 일격`;
      case "multi": return `위력 ${m}%로 ${t.hits}회 연속 공격`;
      case "pierce": return `방어력을 70% 무시하는 위력 ${m}% 공격`;
      case "crit": return `치명타 확률이 크게 오른 위력 ${m}% 공격`;
      case "execute": return `위력 ${m}% 공격, 적 HP 35% 이하면 피해 2.2배`;
      case "burn": return `위력 ${m}% 공격 후 ${dur}턴 화상`;
      case "poison": return `위력 ${m}% 공격 후 ${dur}턴 중독`;
      case "bleed": return `위력 ${m}% 공격 후 ${dur}턴 출혈`;
      case "stun": return `위력 ${m}% 공격, ${Math.round(t.chance * 100)}% 확률로 기절`;
      case "freeze": return `위력 ${m}% 공격, ${Math.round(t.chance * 100)}% 확률로 빙결`;
      case "drain": return `위력 ${m}% 공격, 준 피해의 절반만큼 회복`;
      case "heal": return `최대 HP의 ${Math.round(t.heal * skill.pow * 100)}%와 정신 비례 회복`;
      case "regen": return `${dur}턴 동안 매 턴 최대 HP ${Math.round(t.regen * skill.pow * 100)}% 회복`;
      case "buff": return `${dur}턴 동안 공격력 +${Math.round(t.up * skill.pow * 100)}%`;
      case "rage": return `${dur}턴 동안 공격력 +${Math.round(t.up * skill.pow * 100)}%, 방어력 -30%`;
      case "shield": return `최대 HP ${Math.round(t.shield * skill.pow * 100)}%의 보호막`;
      case "counter": return `${dur}턴 동안 받는 피해 절반, 받은 피해의 80% 반사`;
      case "evade": return `위력 ${m}% 공격 후 ${dur}턴 동안 회피율 대폭 상승`;
      case "debuff": return `위력 ${m}% 공격, ${dur}턴 동안 적 공격·방어 -30%`;
      case "curse": return `위력 ${m}% 공격, ${dur}턴 동안 적이 받는 피해 +25%와 저주 피해`;
      case "gold": return `위력 ${m}% 공격 후 골드 강탈`;
      case "summon": return `${dur}턴 동안 매 턴 소환수가 위력 ${Math.round(t.pow * skill.pow * 100)}%로 공격`;
      case "gamble": return `위력 ${Math.round(10 * skill.pow)}%~${Math.round(320 * skill.pow)}% 사이 무작위 피해`;
      case "mana": return `위력 ${m}% 공격, 최대 MP ${Math.round(t.mana * skill.pow * 100)}% 회복`;
      case "nuke": return `MP를 크게 쓰는 위력 ${m}% 대기술`;
      case "sacrifice": return `HP ${Math.round(t.hpCost * 100)}%를 바쳐 위력 ${m}% 공격`;
      case "charm": return `위력 ${m}% 공격, ${dur}턴 동안 적이 혼란에 빠짐`;
      default: return "";
    }
  }

  function passiveLines(pa) {
    return Object.keys(pa).map((k) => (D.PASSIVES[k] || k).replace("{p}", pct(pa[k])).replace("{n}", pa[k]));
  }

  /* ── 적 생성 ── */
  function floorTier(floor) {
    return Math.min(4, Math.floor((floor - 1) / 10));
  }

  /* 한 층에서 치르는 전투: 일반 몬스터 셋, 10층마다 그 뒤에 보스(어려움은 5층마다 중간 보스도) */
  const FIGHTS_PER_FLOOR = 3;
  function floorBoss(floor, diff) {
    if (floor % 10 === 0) return "boss";
    if (diffOf(diff).mid && floor % 5 === 0) return "mid";
    return null;
  }
  function floorFights(floor, diff) {
    return FIGHTS_PER_FLOOR + (floorBoss(floor, diff) ? 1 : 0);
  }
  /* 그 층 idx번째 싸움의 상대: mob(일반) · mid(중간 보스) · boss(보스) */
  function fightKind(floor, idx, diff) {
    return (idx >= FIGHTS_PER_FLOOR && floorBoss(floor, diff)) || "mob";
  }
  function isBossFight(floor, idx, diff) {
    return fightKind(floor, idx, diff) !== "mob";
  }

  /* kind: mob · mid · boss (예전처럼 true면 보스) */
  function pickMonster(floor, kind, diff) {
    const tier = floorTier(floor);
    const want = kind === true ? "boss" : kind || "mob";
    const pool = MONSTERS.filter((m) => m.tier === tier && allowedIn(m, diff) && (want === "boss" ? m.boss : want === "mid" ? m.mid : !m.boss && !m.mid));
    return pool[Math.floor(R() * pool.length)];
  }

  function monsterByName(name) {
    return MONSTERS.find((m) => m.name === name) || null;
  }

  /* 직업마다 고유 특성과 무기 효과가 붙은 만큼 몬스터도 HP·공격이 6% 더 세다(시뮬레이션으로 맞춘 값) */
  const MON_EDGE = 1.06;

  /* 일반 몬스터는 한 층에 여럿이라 보상을 줄이고, 보스는 크게 준다. 중간 보스는 그 사이.
     boss는 보스·중간 보스 모두 참(도망 불가·물약 보상), mid는 중간 보스만 참 */
  function makeEnemy(floor, mon, diff) {
    const dv = diffOf(diff);
    const m = mon || pickMonster(floor, floor % 10 === 0 ? "boss" : "mob", diff);
    const k = m.boss ? { hp: 3.1, atk: 1.32, exp: 4, gold: 3 } : m.mid ? { hp: 2, atk: 1.18, exp: 1.6, gold: 1.2 } : { hp: 1, atk: 1, exp: 0.3, gold: 0.22 };
    const lv = floor;
    const prefix = floor > 100 ? "심연의 " : floor > 50 ? "광폭한 " : "";
    const maxHp = Math.round((40 + lv * 16 + lv * lv * 0.35) * m.hp * k.hp * dv.hp * MON_EDGE);
    return {
      name: prefix + m.name, lv, boss: m.boss || m.mid, mid: m.mid, maxHp, hp: maxHp,
      atk: Math.round((7 + lv * 2.6 + lv * lv * 0.03) * m.atk * k.atk * dv.atk * MON_EDGE),
      def: Math.round((2 + lv * 1.4) * m.def * dv.def),
      el: m.el, weak: m.weak, resist: m.resist, traits: m.traits.slice(),
      exp: Math.round((10 + lv * 5) * k.exp * dv.exp),
      gold: Math.round((6 + lv * 3.5) * k.gold * dv.gold),
      base: m.name, st: {}, enraged: false
    };
  }

  /* ── 전투 ── */
  /* 문장(log)과 연출(fx)에는 일어난 순서대로 번호(n)를 붙인다. 화면은 이 순서대로 포켓몬처럼
     한 줄씩 보여 주며 사이사이에 연출을 끼워 넣는다. 피해 숫자는 문장에 쓰지 않고 HP 바로 보여 준다 */
  function log(b, kind, text) {
    b.log.push({ kind, text, ph: b.phase || 0, n: ++b.seq });
    b.logCount = (b.logCount || 0) + 1;
    if (b.log.length > 80) b.log.shift();
  }

  function fx(b, target, kind, amount, extra) {
    b.fx.push(Object.assign({ target, kind, amount, ph: b.phase || 0, n: ++b.seq }, extra));
  }

  /* 숫자 뒤의 '으로/로': 끝자리를 읽는 소리로 고른다(0 영·3 삼·6 육은 받침이 있다) */
  function numRo(n) {
    return n + ([0, 3, 6].includes(Math.abs(n) % 10) ? "으로" : "로");
  }

  function enterFloor(p, floor) {
    p.floor = floor;
    p.best = Math.max(p.best, floor);
  }

  function startBattle(p, opts) {
    const o = opts || {};
    const floor = o.floor || p.floor;
    const d = derive(p);
    const e = makeEnemy(floor, o.monster, p.diff);
    const tr = traitOf(p.job);
    const b = {
      floor, enemy: e, turn: 1, log: [], logCount: 0, fx: [], seq: 0, phase: 0, result: null, reward: null,
      cds: p.job.skills.map(() => 0),
      ps: { guard: false, barrier: 0, momentum: 0 },
      weakKnown: !!p.job.passive.weak,
      tr, once: {}, struck: false
    };
    if (p.job.passive.barrier) b.ps.barrier = Math.round(d.maxHp * p.job.passive.barrier);
    log(b, "sys", e.mid ? `강적 ${J(e.name, "이/가")} 앞을 가로막았다!` : e.boss ? `보스 ${J(e.name, "이/가")} 앞을 가로막았다!` : `앗! 야생의 ${J(e.name, "이/가")} 튀어나왔다!`);
    if (b.ps.barrier) log(b, "buff", `${J(p.name, "은/는")} 보호막에 둘러싸였다!`);
    traitOpening(p, b, d);
    return b;
  }

  /* 특성이 드러나는 한마디: 주인공 머리 위에 특성 이름이 뜨고 문장이 나온다 */
  function traitLog(p, b, text) {
    fx(b, "player", "trait", 0, { name: b.tr.name });
    log(b, "trait", `${p.name}의 ${b.tr.name}! ${text}`);
  }

  /* 전투 시작 때 드러나는 특성 */
  function traitOpening(p, b, d) {
    const tr = b.tr;
    const e = b.enemy;
    const ps = b.ps;
    switch (tr.id) {
      case "blessing": {
        const amount = Math.round(d.maxHp * tr.v);
        ps.barrier += amount;
        traitLog(p, b, "빛의 보호막이 몸을 감쌌다!");
        fx(b, "player", "shield", amount, { src: "player" });
        break;
      }
      case "rally":
        ps.atkUp = { t: 3, v: tr.v };
        traitLog(p, b, "사기가 올라 공격이 올라갔다!");
        fx(b, "player", "buff", 0, { el: "fire" });
        break;
      case "intimidate":
        e.st.cow = { t: 3, v: tr.v };
        traitLog(p, b, `${e.name}의 공격이 떨어졌다!`);
        fx(b, "enemy", "status", 0, { st: "debuff" });
        break;
      case "ally":
        ps.summon = { t: 3, dmg: Math.round(power(p, d, p.job.atkStat) * tr.v * (1 + (p.job.passive.summon || 0))), name: tr.ally };
        traitLog(p, b, `${J(tr.ally, "이/가")} 함께 싸우러 왔다!`);
        fx(b, "player", "buff", 0, { el: "nature", summon: true });
        break;
      case "insight":
        b.weakKnown = true;
        traitLog(p, b, e.weak ? `${e.name}의 약점은 ${D.ELEMENTS[e.weak]} 속성이다!` : `${e.name}의 빈틈을 찾아냈다!`);
        break;
      case "giant":
        if (e.boss) traitLog(p, b, "큰 사냥감을 만나 힘이 끓어오른다!");
        break;
      default:
        break;
    }
  }

  /* opt.kind: attack(기본 공격) · skill(기술) · extra(추가타·받아치기 등) */
  function damageEnemy(p, b, d, opt) {
    const e = b.enemy;
    const ps = b.ps;
    const pa = p.job.passive;
    const tr = b.tr || traitOf(p.job);
    const hits = opt.hits || 1;
    let total = 0;
    let crits = 0;
    let landed = 0;
    let weakHit = false;
    let resisted = false;
    const res = { total: 0, crits: 0, hits, landed: 0, weakHit: false, resisted: false };
    for (let h = 0; h < hits && e.hp > 0; h++) {
      let roll = 0.9 + R() * 0.2;
      if (tr.id === "gamble") {
        if (R() < tr.c) { roll = 2.5; res.jackpot = true; } else roll = 0.7 + R() * 0.6;
      }
      let dmg = power(p, d, opt.stat) * opt.mult * roll;
      dmg *= 1 + (pa.dmg || 0);
      if (ps.atkUp) dmg *= 1 + ps.atkUp.v;
      if (ps.rage) dmg *= 1 + ps.rage.v;
      if (ps.weaken) dmg *= 0.75;
      if (b.turn === 1 && pa.first) dmg *= 1 + pa.first;
      if (e.boss && pa.boss) dmg *= 1 + pa.boss;
      if (e.st.curse) dmg *= 1.25;
      // 고유 특성
      if (tr.id === "frenzy" && p.hp < d.maxHp) { dmg *= 1 + tr.v * (1 - Math.max(0, p.hp) / d.maxHp); if (p.hp < d.maxHp * 0.5) res.frenzy = true; }
      if (tr.id === "executioner" && e.hp <= e.maxHp * 0.35) { dmg *= 1 + tr.v; res.exec = true; }
      if (tr.id === "giant") { if (e.boss) dmg *= 1 + tr.v2; else if (e.hp > p.hp) dmg *= 1 + tr.v; }
      if (tr.id === "charge" && b.turn === 1) dmg *= 1 + tr.v;
      if (tr.id === "momentum" && ps.momentum) dmg *= 1 + tr.v * ps.momentum;
      if (tr.id === "spellPower" && opt.kind === "skill") dmg *= 1 + tr.v;
      if (ps.ready && opt.kind !== "extra") dmg *= 1.3;
      let critNow = R() < d.crit + (opt.critBonus || 0) + (tr.id === "deadeye" ? tr.v : 0);
      if (tr.id === "ambush" && !b.struck) { dmg *= 1 + tr.v; critNow = true; res.ambush = true; }
      b.struck = true;
      if (opt.el && opt.el === e.weak) { dmg *= 1.5 + (pa.weak || 0); weakHit = true; }
      else if (opt.el && opt.el === e.resist) { dmg *= 0.6; resisted = true; }
      if (tr.id === "insight") dmg *= 1 + (opt.el && opt.el === e.weak ? tr.v2 : tr.v);
      if (critNow) { dmg *= tr.id === "deadeye" ? 2.1 : 1.75; crits++; }
      const pen = Math.min(0.9, (pa.pen || 0) + (opt.pen || 0) + (tr.id === "pierce" ? tr.v : 0));
      const def = e.def * (e.st.debuff ? 0.7 : 1) * (1 - (e.st.shred || 0)) * (1 - pen);
      dmg = Math.max(1, Math.round((dmg * 100) / (100 + def * 1.2)));
      e.hp -= dmg;
      total += dmg;
      landed++;
    }
    if (opt.kind !== "extra") ps.ready = false;
    if (weakHit) b.weakKnown = true;
    if (total > 0) fx(b, "enemy", crits ? "crit" : "hit", total, { el: opt.el, src: opt.src || "player", hits, weak: weakHit });
    if (pa.steal && total > 0) {
      const heal = Math.max(1, Math.round(total * pa.steal));
      p.hp = Math.min(d.maxHp, p.hp + heal);
    }
    return Object.assign(res, { total, crits, landed, weakHit, resisted });
  }

  /* 맞힌 뒤의 한마디: 급소·약점·저항, 그때 드러난 특성 */
  function hitNotes(p, b, res) {
    const tr = b.tr;
    if (res.ambush) traitLog(p, b, "빈틈을 찔러 급소에 꽂혔다!");
    else if (res.crits) log(b, "hit", tr.id === "deadeye" ? (res.crits > 1 ? `정확히 급소를 ${res.crits}번 꿰뚫었다!` : "정확히 급소를 꿰뚫었다!") : res.crits > 1 ? `급소에 ${res.crits}번 맞았다!` : "급소에 맞았다!");
    if (res.weakHit) log(b, "hit", "효과가 굉장했다!");
    else if (res.resisted) log(b, "hit", "효과가 별로인 듯하다…");
    if (res.jackpot) traitLog(p, b, "대박이 터졌다!");
    if (res.frenzy && !b.once.frenzy) { b.once.frenzy = 1; traitLog(p, b, "상처가 깊을수록 힘이 솟는다!"); }
    if (res.exec && !b.once.exec) { b.once.exec = 1; traitLog(p, b, "숨통을 끊으러 달려든다!"); }
  }

  /* 상태 이상을 거는 특성·무기가 쓰는 공통 처리 */
  function stunEnemy(b, chance, label, st) {
    const e = b.enemy;
    if (e.hp <= 0 || e.st.stun || R() >= chance * (e.boss ? 0.5 : 1)) return false;
    e.st.stun = 1;
    e.st.stunLabel = label;
    fx(b, "enemy", "status", 0, { st });
    return true;
  }

  function dotEnemy(p, b, d, kind, pw, turns) {
    const had = !!b.enemy.st[kind];
    applyDot(b, kind, pw * (1 + (p.job.passive.dot || 0)), turns);
    if (!had) fx(b, "enemy", "status", 0, { st: kind });
    return !had;
  }

  /* 피해를 준 뒤 발동하는 특성(기본 공격과 공격 기술) */
  function afterStrike(p, b, d, kind, res, stat, el) {
    const tr = b.tr;
    const e = b.enemy;
    const ps = b.ps;
    if (!res.total) return;
    const pw = power(p, d, stat);
    if (tr.id === "momentum" && ps.momentum < 5) {
      ps.momentum++;
      if (ps.momentum === 3) traitLog(p, b, "기세가 오른다!");
      if (ps.momentum === 5) traitLog(p, b, "기세가 절정에 달했다!");
    }
    if (tr.id === "leech") {
      const before = p.hp;
      p.hp = Math.min(d.maxHp, p.hp + Math.max(1, Math.round(res.total * tr.v)));
      if (p.hp > before) {
        fx(b, "player", "heal", p.hp - before, { src: "drain" });
        if (!b.once.leech) { b.once.leech = 1; traitLog(p, b, `${e.name}의 생명력을 빨아들였다!`); }
      }
    }
    if (tr.id === "plunder" && R() < tr.c) {
      const got = Math.round((1 + b.floor * 0.25) * (1 + (p.job.passive.gold || 0) * 0.5));
      p.gold += got;
      fx(b, "player", "gold", got);
      traitLog(p, b, `${got}G를 슬쩍했다!`);
    }
    if (e.hp <= 0) return;
    switch (tr.id) {
      case "charge":
        if (b.turn === 1 && !b.once.charge) {
          b.once.charge = 1;
          traitLog(p, b, "기세 좋게 몰아쳤다!");
          if (stunEnemy(b, tr.c, "움찔해", "stun")) log(b, "status", `${J(e.name, "은/는")} 움찔했다!`);
        }
        break;
      case "armorBreak": {
        const before = e.st.shred || 0;
        if (before >= 0.5) break;
        e.st.shred = Math.min(0.5, before + tr.v);
        fx(b, "enemy", "status", 0, { st: "debuff" });
        if (!before) traitLog(p, b, `${e.name}의 방어가 떨어졌다!`);
        else log(b, "status", `${e.name}의 방어가 더 떨어졌다!`);
        break;
      }
      case "bleedEdge":
        if (dotEnemy(p, b, d, "bleed", pw * tr.v, 3)) traitLog(p, b, `${J(e.name, "은/는")} 피를 흘리기 시작했다!`);
        break;
      case "venom":
        if (R() < tr.c && dotEnemy(p, b, d, "poison", pw * tr.v, 4)) traitLog(p, b, `${J(e.name, "은/는")} 독에 걸렸다!`);
        break;
      case "scorch":
        if (R() < tr.c && dotEnemy(p, b, d, "burn", pw * tr.v, 3)) traitLog(p, b, `${J(e.name, "은/는")} 화상을 입었다!`);
        break;
      case "hex":
        if (R() < tr.c && dotEnemy(p, b, d, "curse", pw * tr.v, 3)) traitLog(p, b, `${J(e.name, "은/는")} 저주에 걸렸다!`);
        break;
      case "chill":
        if (stunEnemy(b, tr.c, "얼어붙어", "freeze")) traitLog(p, b, `${J(e.name, "은/는")} 얼어붙었다!`);
        break;
      case "stagger":
        if (stunEnemy(b, tr.c, "기절해", "stun")) traitLog(p, b, `${J(e.name, "은/는")} 기절했다!`);
        break;
      case "charmer":
        if (!e.st.charm && R() < tr.c * (e.boss ? 0.5 : 1)) {
          e.st.charm = 2;
          fx(b, "enemy", "status", 0, { st: "charm" });
          traitLog(p, b, `${J(e.name, "은/는")} 혼란에 빠졌다!`);
        }
        break;
      case "shock":
        if (R() < tr.c) {
          traitLog(p, b, "번개가 한 번 더 내리쳤다!");
          fx(b, "enemy", "zap", 0);
          hitNotes(p, b, damageEnemy(p, b, d, { stat, el: "bolt", mult: tr.v, kind: "extra", src: "zap" }));
        }
        break;
      case "combo":
        if (kind === "attack" && R() < tr.c) {
          traitLog(p, b, "한 번 더 몰아친다!");
          fx(b, "player", "act", 0, { action: "extra", el });
          hitNotes(p, b, damageEnemy(p, b, d, { stat, el, mult: 0.7, kind: "extra" }));
        }
        break;
      default:
        break;
    }
  }

  /* 무기마다 다른 기본 공격의 덤: 기절·출혈·흡수·약화·저주·하나 더 */
  function weaponAfter(p, b, d, w, res, a) {
    const e = b.enemy;
    const pw = power(p, d, a.stat);
    if (w.drain && res.total) {
      const before = p.hp;
      p.hp = Math.min(d.maxHp, p.hp + Math.max(1, Math.round(res.total * w.drain)));
      if (p.hp > before) fx(b, "player", "heal", p.hp - before, { src: "drain" });
    }
    if (w.heal) {
      const before = p.hp;
      p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * w.heal));
      if (p.hp > before) fx(b, "player", "heal", p.hp - before, { src: "song" });
    }
    if (e.hp <= 0) return;
    if (w.stun && stunEnemy(b, w.stun, "기절해", "stun")) log(b, "status", `${J(e.name, "은/는")} 기절했다!`);
    if (w.bleed && dotEnemy(p, b, d, "bleed", pw * w.bleed, 3)) log(b, "status", `${J(e.name, "은/는")} 피를 흘리기 시작했다!`);
    if (w.debuff && !e.st.debuff && R() < w.debuff) {
      e.st.debuff = 2 + (p.job.passive.dur || 0);
      fx(b, "enemy", "status", 0, { st: "debuff" });
      log(b, "status", `${e.name}의 공격과 방어가 떨어졌다!`);
    }
    if (w.curse && !e.st.curse && R() < w.curse && dotEnemy(p, b, d, "curse", pw * 0.08, 3)) log(b, "status", `${J(e.name, "은/는")} 저주에 걸렸다!`);
    if (w.extra && R() < w.extra) {
      log(b, "hit", `${J(p.name, "은/는")} 하나 더 던졌다!`);
      fx(b, "player", "act", 0, { action: "extra", el: a.el });
      hitNotes(p, b, damageEnemy(p, b, d, { stat: a.stat, el: a.el, mult: 0.5, kind: "extra" }));
    }
  }

  function healPlayer(p, b, d, amount, okText) {
    const before = p.hp;
    p.hp = Math.min(d.maxHp, p.hp + Math.round(amount));
    const gained = p.hp - before;
    if (gained > 0) {
      fx(b, "player", "heal", gained, { src: "player" });
      log(b, "heal", okText || `${p.name}의 HP가 회복되었다!`);
    } else {
      log(b, "heal", `그러나 ${p.name}의 HP는 이미 가득하다!`);
    }
    return gained;
  }

  function applyDot(b, kind, dmg, turns) {
    const cur = b.enemy.st[kind];
    b.enemy.st[kind] = { t: Math.max(turns, cur ? cur.t : 0), dmg: Math.max(Math.round(dmg), cur ? cur.dmg : 0) };
  }

  const DOT_NAMES = { burn: "화상", poison: "중독", bleed: "출혈", curse: "저주" };
  const DOT_GOT = { burn: "화상을 입었다!", poison: "독에 걸렸다!", bleed: "피를 흘리기 시작했다!", curse: "저주에 걸렸다!" };
  const DOT_HURT = { burn: "화상 데미지를 입었다!", poison: "독의 데미지를 입었다!", bleed: "출혈 데미지를 입었다!", curse: "저주 데미지를 입었다!" };

  function useSkill(p, b, d, idx) {
    const skill = p.job.skills[idx];
    const spec = skillSpec(p, skill);
    const t = spec.t;
    const e = b.enemy;
    const ps = b.ps;
    const pa = p.job.passive;
    const name = p.name;

    let hpCost = 0;
    if (skill.type === "sacrifice") {
      hpCost = Math.round(d.maxHp * t.hpCost);
      p.hp = Math.max(1, p.hp - hpCost);
    } else {
      p.mp -= spec.cost;
    }
    b.cds[idx] = spec.cd + 1;
    log(b, "skill", `${name}의 ${skill.name}!`);
    if (hpCost) log(b, "warn", `${J(name, "은/는")} 생명력을 깎아 힘으로 바꿨다!`);
    fx(b, "player", "act", 0, { action: "skill", idx, type: skill.type, el: skill.el, tag: skill.tag, name: skill.name, mp: hpCost ? 0 : spec.cost, hp: hpCost });
    const atkOpt = { stat: skill.stat, el: skill.el, mult: spec.mult };
    const pw = power(p, d, skill.stat);

    switch (skill.type) {
      case "heal":
        healPlayer(p, b, d, (d.maxHp * t.heal * skill.pow + d.s.wis * 1.5) * (1 + (pa.heal || 0)));
        return true;
      case "regen":
        ps.regen = { t: spec.dur, v: Math.round(d.maxHp * t.regen * skill.pow * (1 + (pa.heal || 0))) };
        fx(b, "player", "buff", 0, { el: "nature" });
        log(b, "buff", `${J(name, "은/는")} 재생의 기운에 휩싸였다!`);
        return true;
      case "buff":
        ps.atkUp = { t: spec.dur, v: t.up * skill.pow };
        fx(b, "player", "buff", 0, { el: skill.el });
        log(b, "buff", `${name}의 공격이 ${ps.atkUp.v >= 0.4 ? "크게 " : ""}올라갔다!`);
        return true;
      case "rage":
        ps.rage = { t: spec.dur, v: t.up * skill.pow };
        fx(b, "player", "buff", 0, { el: "fire" });
        log(b, "buff", `${J(name, "은/는")} 광폭해졌다! 공격이 크게 올라갔다!`);
        log(b, "warn", `그 대신 ${name}의 방어가 떨어졌다!`);
        return true;
      case "shield": {
        const amount = Math.round(d.maxHp * t.shield * skill.pow + d.s[skill.stat] * 2);
        ps.barrier = (ps.barrier || 0) + amount;
        fx(b, "player", "shield", amount, { src: "player" });
        log(b, "buff", `${J(name, "은/는")} 보호막에 둘러싸였다!`);
        return true;
      }
      case "counter":
        ps.counter = spec.dur;
        fx(b, "player", "buff", 0, { el: "phys" });
        log(b, "buff", `${J(name, "은/는")} 반격 태세에 들어갔다!`);
        return true;
      case "summon": {
        const dmg = Math.round(pw * t.pow * skill.pow * (1 + (pa.summon || 0)));
        ps.summon = { t: spec.dur, dmg, name: skill.name };
        fx(b, "player", "buff", 0, { el: skill.el, summon: true });
        log(b, "buff", `소환수가 나타나 ${name}의 곁에서 함께 싸운다!`);
        return true;
      }
      default:
        break;
    }

    // 피해를 주는 기술
    const opt = Object.assign({}, atkOpt);
    if (skill.type === "multi") opt.hits = t.hits;
    if (skill.type === "pierce") opt.pen = t.pen;
    if (skill.type === "crit") opt.critBonus = t.critBonus;
    if (skill.type === "execute" && e.hp / e.maxHp <= 0.35) opt.mult *= 2.2;
    if (skill.type === "gamble") opt.mult = (0.1 + R() * 3.1) * skill.pow;
    opt.kind = "skill";
    const res = damageEnemy(p, b, d, opt);
    if (skill.type === "gamble") log(b, "skill", `주사위 눈은… 위력 ${Math.round(opt.mult * 100)}%!`);
    if (skill.type === "execute" && opt.mult > spec.mult) log(b, "skill", "처형의 일격이 꽂혔다!");
    if (opt.hits > 1 && res.total > 0) log(b, "hit", `${res.landed}번 맞혔다!`);
    hitNotes(p, b, res);
    if (e.hp <= 0) { afterStrike(p, b, d, "skill", res, skill.stat, skill.el); return true; }

    const dotMul = 1 + (pa.dot || 0);
    switch (skill.type) {
      case "burn": case "poison": case "bleed":
        applyDot(b, t.dot, pw * t.dotPow * skill.pow * dotMul, spec.dur);
        fx(b, "enemy", "status", 0, { st: t.dot });
        log(b, "status", `${J(e.name, "은/는")} ${DOT_GOT[t.dot]}`);
        break;
      case "curse":
        applyDot(b, "curse", pw * t.dotPow * skill.pow * dotMul, spec.dur);
        fx(b, "enemy", "status", 0, { st: "curse" });
        log(b, "status", `${J(e.name, "은/는")} 저주에 걸렸다! 받는 피해가 늘어난다!`);
        break;
      case "stun": case "freeze": {
        const chance = t.chance * (e.boss ? 0.5 : 1);
        if (R() < chance) {
          e.st.stun = Math.max(e.st.stun || 0, 1);
          e.st.stunLabel = skill.type === "freeze" ? "얼어붙어" : "기절해";
          fx(b, "enemy", "status", 0, { st: skill.type === "freeze" ? "freeze" : "stun" });
          log(b, "status", `${J(e.name, "은/는")} ${skill.type === "freeze" ? "얼어붙었다" : "기절했다"}!`);
        }
        break;
      }
      case "charm": {
        const chance = e.boss ? 0.5 : 0.9;
        if (R() < chance) {
          e.st.charm = spec.dur;
          fx(b, "enemy", "status", 0, { st: "charm" });
          log(b, "status", `${J(e.name, "은/는")} 혼란에 빠졌다!`);
        }
        break;
      }
      case "debuff":
        e.st.debuff = spec.dur;
        fx(b, "enemy", "status", 0, { st: "debuff" });
        log(b, "status", `${e.name}의 공격과 방어가 떨어졌다!`);
        break;
      case "drain":
        healPlayer(p, b, d, res.total * t.drain * (1 + (pa.heal || 0) * 0.5), `${J(e.name, "으로/로")}부터 HP를 흡수했다!`);
        break;
      case "evade":
        ps.evade = spec.dur;
        fx(b, "player", "buff", 0, { el: "wind" });
        log(b, "buff", `${name}의 회피율이 크게 올라갔다!`);
        break;
      case "gold": {
        const stolen = Math.round((4 + b.floor * 2.5) * skill.pow * (1 + (pa.gold || 0)));
        p.gold += stolen;
        fx(b, "player", "gold", stolen);
        log(b, "gold", `${stolen}G를 빼앗았다!`);
        break;
      }
      case "mana": {
        const before = p.mp;
        p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * t.mana * skill.pow));
        fx(b, "player", "mana", p.mp - before);
        log(b, "heal", `${name}의 MP가 회복되었다!`);
        break;
      }
      default:
        break;
    }
    afterStrike(p, b, d, "skill", res, skill.stat, skill.el);
    extraHit(p, b, d, skill.stat, skill.el);
    return true;
  }

  function extraHit(p, b, d, stat, el) {
    const pa = p.job.passive;
    if (!pa.double || b.enemy.hp <= 0 || R() >= pa.double) return;
    log(b, "hit", "추가 공격!");
    fx(b, "player", "act", 0, { action: "extra", el });
    hitNotes(p, b, damageEnemy(p, b, d, { stat, el, mult: 0.5, kind: "extra" }));
  }

  /* 기술을 쓴 뒤의 특성: 영감(MP가 들지 않음) */
  function afterSkill(p, b, d, idx, spent) {
    const tr = b.tr;
    if (tr.id === "inspire" && spent > 0 && R() < tr.c) {
      const before = p.mp;
      p.mp = Math.min(d.maxMp, p.mp + spent);
      if (p.mp > before) {
        fx(b, "player", "mana", p.mp - before);
        traitLog(p, b, "영감이 떠올라 MP를 쓰지 않았다!");
      }
    }
  }

  function skillAvailable(p, b, idx) {
    const skill = p.job.skills[idx];
    if (!skill || p.level < skill.lv) return { ok: false, why: `Lv.${skill.lv}` };
    if (b.cds[idx] > 0) return { ok: false, why: `${b.cds[idx]}턴` };
    const spec = skillSpec(p, skill);
    if (skill.type === "sacrifice") {
      const d = derive(p);
      if (p.hp <= Math.round(d.maxHp * spec.t.hpCost) + 1) return { ok: false, why: "HP 부족" };
      return { ok: true, cost: 0, hpCost: true };
    }
    if (p.mp < spec.cost) return { ok: false, why: "MP 부족", cost: spec.cost };
    return { ok: true, cost: spec.cost };
  }

  /* 공격하지 않는 행동(기술 중 비공격·방어·물약)은 '기세'를 끊는다 */
  const SELF_SKILLS = new Set(["heal", "regen", "buff", "rage", "shield", "counter", "summon"]);

  function playerPhase(p, b, d, action) {
    const e = b.enemy;
    const ps = b.ps;
    const tr = b.tr;
    if (action.kind !== "attack" && !(action.kind === "skill" && !SELF_SKILLS.has((p.job.skills[action.idx] || {}).type))) ps.momentum = 0;
    switch (action.kind) {
      case "attack": {
        const a = attackOf(p.job);
        const w = weaponOf(p.job);
        log(b, "hit", `${p.name}의 ${a.name}!`);
        fx(b, "player", "act", 0, { action: "attack", el: a.el, name: a.name, weapon: w.key });
        const res = damageEnemy(p, b, d, { stat: a.stat, el: a.el, mult: w.mult, hits: w.hits, pen: w.pen, critBonus: w.crit, kind: "attack" });
        const before = p.mp;
        p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * w.mp * (tr.id === "manaFlow" ? 2 : 1)));
        if (p.mp > before) fx(b, "player", "mana", p.mp - before, { quiet: true });
        if (w.hits > 1 && res.landed > 1) log(b, "hit", `${res.landed}번 맞혔다!`);
        hitNotes(p, b, res);
        weaponAfter(p, b, d, w, res, a);
        afterStrike(p, b, d, "attack", res, a.stat, a.el);
        extraHit(p, b, d, a.stat, a.el);
        return;
      }
      case "guard": {
        ps.guard = true;
        log(b, "buff", `${J(p.name, "은/는")} 방어 태세에 들어갔다!`);
        fx(b, "player", "act", 0, { action: "guard" });
        fx(b, "player", "buff", 0, { el: "phys", guard: true });
        const before = p.mp;
        p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * (tr.id === "meditate" || tr.id === "manaFlow" ? 0.24 : 0.12)));
        if (p.mp > before) fx(b, "player", "mana", p.mp - before);
        if (tr.id === "bulwark") {
          const amount = Math.round(d.maxHp * tr.v);
          ps.barrier = (ps.barrier || 0) + amount;
          traitLog(p, b, "단단한 보호막을 둘렀다!");
          fx(b, "player", "shield", amount, { src: "player" });
        }
        if (tr.id === "meditate") {
          const hpBefore = p.hp;
          p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * tr.v));
          traitLog(p, b, "마음을 가라앉혀 기운을 되찾았다!");
          if (p.hp > hpBefore) fx(b, "player", "heal", p.hp - hpBefore, { src: "player" });
        }
        return;
      }
      case "skill": {
        if (!skillAvailable(p, b, action.idx).ok) {
          log(b, "warn", "지금은 그 기술을 쓸 수 없다!");
          return;
        }
        const mp0 = p.mp;
        useSkill(p, b, d, action.idx);
        afterSkill(p, b, d, action.idx, Math.max(0, mp0 - p.mp));
        return;
      }
      case "potion": {
        const pot = potionPower(p);
        const cook = tr.id === "cook";
        if (action.item === "mp") {
          if (p.potions.mp <= 0) { log(b, "warn", "마나 물약이 없다!"); return; }
          p.potions.mp--;
          log(b, "sys", `${J(p.name, "은/는")} 마나 물약을 사용했다!`);
          fx(b, "player", "act", 0, { action: "item", item: "mp" });
          const before = p.mp;
          p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.5 * pot));
          fx(b, "player", "mana", p.mp - before);
          log(b, "heal", `${p.name}의 MP가 회복되었다!`);
          if (cook) {
            const hpBefore = p.hp;
            p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * 0.1 * pot));
            if (p.hp > hpBefore) { fx(b, "player", "heal", p.hp - hpBefore, { src: "player" }); traitLog(p, b, "HP도 함께 차올랐다!"); }
          }
        } else {
          if (p.potions.hp <= 0) { log(b, "warn", "회복 물약이 없다!"); return; }
          p.potions.hp--;
          log(b, "sys", `${J(p.name, "은/는")} 회복 물약을 사용했다!`);
          fx(b, "player", "act", 0, { action: "item", item: "hp" });
          delete ps.burn;
          delete ps.poison;
          healPlayer(p, b, d, d.maxHp * 0.4 * pot);
          if (cook) {
            const mpBefore = p.mp;
            p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.1 * pot));
            if (p.mp > mpBefore) { fx(b, "player", "mana", p.mp - mpBefore); traitLog(p, b, "MP도 함께 차올랐다!"); }
          }
        }
        return;
      }
      case "flee": {
        if (e.boss) { log(b, "warn", "안 돼! 보스와의 싸움에서는 도망칠 수 없다!"); return; }
        if (R() < fleeChance(p, b)) {
          b.result = "fled";
          log(b, "sys", "무사히 도망쳤다!");
        } else {
          log(b, "warn", "도망칠 수 없었다!");
        }
        return;
      }
      default:
        return;
    }
  }

  /* 몬스터가 맞히면 돌려주는 값: 실제 피해(빗나가면 0). 문장 머리는 부르는 쪽이 먼저 쓴다 */
  function hurtPlayer(p, b, d, raw) {
    const ps = b.ps;
    const pa = p.job.passive;
    const tr = b.tr;
    const e = b.enemy;
    if (tr.id === "trick" && R() < tr.c) {
      const self = Math.max(1, Math.round(raw * 0.3));
      e.hp -= self;
      fx(b, "enemy", "hit", self, { src: "self" });
      traitLog(p, b, `${J(e.name, "은/는")} 헛손질하고 제 몸을 쳤다!`);
      return 0;
    }
    const evaChance = Math.min(0.85, d.eva + (ps.evade ? 0.5 : 0));
    if (R() < evaChance) {
      fx(b, "player", "miss", 0, { src: "enemy" });
      if (tr.id === "nimble") {
        ps.ready = true;
        log(b, "miss", `그러나 ${J(p.name, "은/는")} 날렵하게 피했다!`);
      } else log(b, "miss", `그러나 ${p.name}에게는 맞지 않았다!`);
      return 0;
    }
    const def = d.def * (ps.rage ? 0.7 : 1);
    let dmg = (raw * 100) / (100 + def * 1.3);
    dmg *= 1 - Math.min(0.6, (pa.resist || 0) + (tr.id === "ironSkin" ? tr.v : tr.id === "bulwark" ? 0.08 : 0));
    if (ps.guard) dmg *= 0.5;
    const foresaw = tr.id === "foresight" && R() < tr.c;
    if (foresaw) dmg *= 0.5;
    const reflect = Math.max(1, Math.round(dmg * 0.8));
    if (ps.counter) dmg *= 0.5;
    dmg = Math.max(1, Math.round(dmg));
    let absorbed = 0;
    if (ps.barrier > 0) {
      absorbed = Math.min(ps.barrier, dmg);
      ps.barrier -= absorbed;
      dmg -= absorbed;
    }
    const stood = tr.id === "lastStand" && !ps.stood && p.hp > 1 && dmg >= p.hp;
    if (stood) { dmg = p.hp - 1; ps.stood = true; }
    p.hp -= dmg;
    fx(b, "player", "hit", dmg, { src: "enemy", absorbed });
    if (absorbed) log(b, "buff", dmg ? "보호막이 피해 일부를 막아냈다!" : "보호막이 피해를 모두 막아냈다!");
    if (foresaw) traitLog(p, b, "공격을 미리 읽어 피해를 줄였다!");
    if (stood) traitLog(p, b, "쓰러지지 않고 버텨냈다!");
    if (ps.counter && e.hp > 0 && p.hp > 0) {
      e.hp -= reflect;
      fx(b, "enemy", "hit", reflect, { src: "counter" });
      log(b, "hit", `반격! ${J(e.name, "에게")} 피해를 되돌려 주었다!`);
    }
    if (tr.id === "thorns" && e.hp > 0 && p.hp > 0 && dmg + absorbed > 0) {
      const back = Math.max(1, Math.round((dmg + absorbed) * tr.v));
      e.hp -= back;
      fx(b, "enemy", "hit", back, { src: "thorns" });
      if (!b.once.thorns) { b.once.thorns = 1; traitLog(p, b, `${J(e.name, "은/는")} 가시에 찔렸다!`); }
      else log(b, "hit", `${J(e.name, "은/는")} 가시에 찔렸다!`);
    }
    if (tr.id === "riposte" && e.hp > 0 && p.hp > 0 && R() < tr.c) {
      traitLog(p, b, "곧바로 받아쳤다!");
      fx(b, "player", "act", 0, { action: "extra", el: p.job.attack.el });
      hitNotes(p, b, damageEnemy(p, b, d, { stat: p.job.attack.stat, el: p.job.attack.el, mult: 0.6, kind: "extra" }));
    }
    if (tr.id === "firstAid" && !ps.aided && p.hp > 0 && p.hp < d.maxHp * 0.35) {
      ps.aided = true;
      const before = p.hp;
      p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * tr.v));
      fx(b, "player", "heal", p.hp - before, { src: "player" });
      traitLog(p, b, "재빨리 상처를 돌봤다!");
    }
    return dmg;
  }

  /* 정화 특성: 몬스터가 거는 해로운 상태를 막는다 */
  function purified(p, b) {
    if (b.tr.id !== "purify") return false;
    traitLog(p, b, "해로운 기운을 떨쳐냈다!");
    return true;
  }

  /* 몬스터의 기본 기술 이름: 특성이 없으면 속성으로 고른다 */
  const MON_MOVE = { phys: "몸통박치기", fire: "불꽃세례", ice: "얼음뭉치", bolt: "전기쇼크", earth: "진흙뿌리기", wind: "바람일으키기", light: "섬광", dark: "물기", nature: "덩굴채찍", arcane: "염동력" };
  const TRAIT_MOVE = { heavy: "힘껏 내려찍기", multi: "연속 공격", poison: "독 찌르기", burn: "불꽃 송곳니", drain: "흡혈", stun: "전격 충격", steal: "도둑질", weaken: "저주의 손길" };

  function enemyAct(p, b, d) {
    const e = b.enemy;
    const ps = b.ps;
    if (e.st.stun > 0) {
      e.st.stun--;
      log(b, "status", `${J(e.name, "은/는")} ${e.st.stunLabel || "기절해"}서 움직일 수 없다!`);
      return;
    }
    if (e.st.charm > 0) {
      log(b, "status", `${J(e.name, "은/는")} 혼란에 빠져 있다!`);
      if (R() < 0.6) {
        const self = Math.max(1, Math.round(e.atk * 0.8));
        e.hp -= self;
        fx(b, "enemy", "hit", self, { src: "self" });
        log(b, "status", "영문도 모른 채 자신을 공격했다!");
        return;
      }
    }
    let atk = e.atk * (e.st.debuff ? 0.7 : 1) * (e.st.cow ? 1 - e.st.cow.v : 1);
    if (e.traits.includes("enrage") && !e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      fx(b, "enemy", "status", 0, { st: "enrage" });
      log(b, "warn", `${J(e.name, "은/는")} 분노했다! 공격이 크게 올라갔다!`);
    }
    if (e.enraged) atk *= 1.4;
    if (e.traits.includes("heal") && e.hp < e.maxHp * 0.5 && R() < 0.3) {
      const amount = Math.round(e.maxHp * 0.15);
      const before = e.hp;
      e.hp = Math.min(e.maxHp, e.hp + amount);
      log(b, "warn", `${J(e.name, "은/는")} 몸을 웅크리고 상처를 재생했다!`);
      fx(b, "enemy", "heal", e.hp - before, {});
      return;
    }
    const roll = e.traits.filter((t) => t !== "enrage" && t !== "heal");
    const trait = roll.length && R() < 0.38 ? roll[Math.floor(R() * roll.length)] : null;
    log(b, "enemy", `${e.name}의 ${TRAIT_MOVE[trait] || MON_MOVE[e.el] || "몸통박치기"}!`);
    fx(b, "enemy", "act", 0, { trait: trait || "attack", el: e.el });
    switch (trait) {
      case "heavy":
        hurtPlayer(p, b, d, atk * 1.7 * (0.9 + R() * 0.2));
        return;
      case "multi": {
        let n = hurtPlayer(p, b, d, atk * 0.65) > 0 ? 1 : 0;
        if (p.hp > 0 && e.hp > 0) n += hurtPlayer(p, b, d, atk * 0.65) > 0 ? 1 : 0;
        if (n === 2) log(b, "enemy", "2번 맞았다!");
        return;
      }
      case "poison": case "burn": {
        const dealt = hurtPlayer(p, b, d, atk * 0.8);
        if (dealt > 0 && p.hp > 0 && !purified(p, b)) {
          ps[trait] = { t: 3, dmg: Math.max(1, Math.round(atk * 0.22)) };
          fx(b, "player", "status", 0, { st: trait });
          log(b, "status", `${J(p.name, "은/는")} ${trait === "poison" ? "독에 걸렸다!" : "화상을 입었다!"}`);
        }
        return;
      }
      case "drain": {
        const dealt = hurtPlayer(p, b, d, atk);
        if (dealt > 0) {
          const before = e.hp;
          e.hp = Math.min(e.maxHp, e.hp + Math.round(dealt * 0.6));
          if (e.hp > before) {
            fx(b, "enemy", "heal", e.hp - before, { src: "drain" });
            log(b, "warn", `${J(e.name, "은/는")} 체력을 빨아들였다!`);
          }
        }
        return;
      }
      case "stun": {
        const dealt = hurtPlayer(p, b, d, atk * 0.8);
        if (dealt > 0 && p.hp > 0 && R() < 0.45 && !purified(p, b)) {
          ps.stun = 1;
          fx(b, "player", "status", 0, { st: "stun" });
          log(b, "status", `${J(p.name, "은/는")} 몸이 저려 다음 차례에 움직일 수 없다!`);
        }
        return;
      }
      case "steal": {
        hurtPlayer(p, b, d, atk * 0.8);
        const lost = Math.min(p.gold, 3 + b.floor * 2);
        if (lost > 0) {
          p.gold -= lost;
          log(b, "warn", `${J(e.name, "은/는")} ${lost}G를 훔쳤다!`);
        }
        return;
      }
      case "weaken": {
        hurtPlayer(p, b, d, atk * 0.8);
        if (p.hp <= 0 || purified(p, b)) return;
        ps.weaken = 3;
        fx(b, "player", "status", 0, { st: "weaken" });
        log(b, "status", `${p.name}의 공격이 떨어졌다!`);
        return;
      }
      default:
        hurtPlayer(p, b, d, atk * (0.9 + R() * 0.2));
    }
  }

  function tickDown(obj, key) {
    if (!obj[key]) return;
    if (typeof obj[key] === "number") {
      obj[key]--;
      if (obj[key] <= 0) delete obj[key];
    } else {
      obj[key].t--;
      if (obj[key].t <= 0) delete obj[key];
    }
  }

  function enemyPhase(p, b, d) {
    const e = b.enemy;
    const ps = b.ps;
    b.phase++;
    if (ps.summon) {
      // 소환수 피해는 소환할 때 정해진 값에 적의 방어와 저주만 반영한다
      const def = e.def * (e.st.debuff ? 0.7 : 1);
      const dmg = Math.max(1, Math.round((ps.summon.dmg * (e.st.curse ? 1.25 : 1) * 100) / (100 + def * 1.2)));
      log(b, "hit", "소환수의 공격!");
      e.hp -= dmg;
      fx(b, "enemy", "hit", dmg, { src: "summon", el: "arcane" });
      tickDown(ps, "summon");
      if (e.hp <= 0) return;
    }
    ["burn", "poison", "bleed", "curse"].forEach((k) => {
      if (!e.st[k] || e.hp <= 0) return;
      e.hp -= e.st[k].dmg;
      fx(b, "enemy", "dot", e.st[k].dmg, { dot: k });
      log(b, "status", `${J(e.name, "은/는")} ${DOT_HURT[k]}`);
      tickDown(e.st, k);
    });
    if (e.hp <= 0) return;
    b.phase++;
    enemyAct(p, b, d);
  }

  function endRound(p, b, d) {
    const ps = b.ps;
    const pa = p.job.passive;
    b.phase++;
    ["burn", "poison"].forEach((k) => {
      if (!ps[k] || p.hp <= 0) return;
      p.hp -= ps[k].dmg;
      fx(b, "player", "dot", ps[k].dmg, { dot: k });
      log(b, "status", `${J(p.name, "은/는")} ${DOT_HURT[k]}`);
      tickDown(ps, k);
    });
    if (p.hp <= 0) return;
    let regen = 0;
    if (pa.regen) regen += d.maxHp * pa.regen;
    if (ps.regen) { regen += ps.regen.v; tickDown(ps, "regen"); }
    const vigor = b.tr.id === "vigor" ? d.maxHp * b.tr.v : 0;
    regen += vigor;
    if (regen > 0 && p.hp < d.maxHp) {
      const before = p.hp;
      p.hp = Math.min(d.maxHp, p.hp + Math.round(regen));
      if (p.hp > before) {
        fx(b, "player", "heal", p.hp - before, { src: "regen" });
        if (vigor && !b.once.vigor) { b.once.vigor = 1; traitLog(p, b, "몸에 활력이 돌아 HP를 회복했다!"); }
        else log(b, "heal", `${J(p.name, "은/는")} HP를 조금 회복했다!`);
      }
    }
    const mregen = (pa.mregen || 0) + (b.tr.id === "meditate" ? 0.02 : 0);
    if (mregen) p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * mregen));
    ["atkUp", "rage", "counter", "evade", "weaken"].forEach((k) => tickDown(ps, k));
    ["charm", "debuff", "cow"].forEach((k) => tickDown(b.enemy.st, k));
    b.cds = b.cds.map((c) => Math.max(0, c - 1));
    b.turn++;
  }

  function checkDeath(p, b, d) {
    if (p.hp > 0) return false;
    if (p.job.passive.revive && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = Math.round(d.maxHp * 0.3);
      log(b, "heal", "불사조의 불꽃이 타올랐다!");
      fx(b, "player", "heal", p.hp, { src: "revive" });
      log(b, "heal", `${J(p.name, "은/는")} 되살아났다!`);
      return false;
    }
    p.hp = 0;
    b.result = "lose";
    b.phase++;
    fx(b, "player", "faint", 0);
    log(b, "lose", `${J(p.name, "은/는")} 쓰러졌다…`);
    return true;
  }

  function win(p, b) {
    const e = b.enemy;
    const pa = p.job.passive;
    const fam = F.FAMILY_LIST[p.job.fam];
    const tr = b.tr || traitOf(p.job);
    e.hp = 0;
    b.result = "win";
    b.phase++;
    const exp = Math.round(e.exp * (1 + (pa.exp || 0)));
    const lucky = tr.id === "fortune";
    const gold = Math.round(e.gold * (1 + (pa.gold || 0) + (lucky ? tr.v : 0)) * (0.85 + R() * 0.3));
    const rw = { exp, gold, levels: [], unlocked: [], drops: [], post: 0, from: { level: p.level, exp: p.exp } };
    fx(b, "enemy", "faint", 0);
    log(b, "win", `${J(e.name, "은/는")} 쓰러졌다!`);
    p.exp += exp;
    p.gold += gold;
    p.kills++;
    log(b, "exp", `${J(p.name, "은/는")} ${exp} 경험치를 얻었다!`);
    log(b, "gold", lucky ? `행운이 따라 ${gold}G를 손에 넣었다!` : `${gold}G를 손에 넣었다!`);
    if (R() < 0.15 + (pa.drop || 0) + (lucky ? 0.04 : 0) || e.boss) {
      p.potions.hp++;
      rw.drops.push("회복 물약");
      log(b, "gold", fam.loot ? `${J(fam.loot, "을/를")} 회복 물약으로 바꿨다!` : "회복 물약을 손에 넣었다!");
    }
    if (e.boss) {
      p.potions.mp++;
      rw.drops.push("마나 물약");
      log(b, "gold", "마나 물약을 손에 넣었다!");
    }
    if (tr.id === "forage" && R() < tr.c) {
      const mp = p.potions.hp >= 5 && p.potions.mp < p.potions.hp;
      p.potions[mp ? "mp" : "hp"]++;
      rw.drops.push(mp ? "마나 물약" : "회복 물약");
      traitLog(p, b, mp ? "재료를 모아 마나 물약을 하나 만들었다!" : "재료를 모아 회복 물약을 하나 만들었다!");
    }
    while (p.exp >= expNeed(p.level)) {
      p.exp -= expNeed(p.level);
      p.level++;
      rw.levels.push(p.level);
      log(b, "lvup", `${p.name}의 레벨이 ${numRo(p.level)} 올랐다!`);
      p.job.skills.forEach((s) => {
        if (s.lv !== p.level) return;
        rw.unlocked.push(s.name);
        log(b, "learn", `${J(p.name, "은/는")} ${J(s.name, "을/를")} 배웠다!`);
      });
    }
    const d = derive(p);
    if (rw.levels.length) {
      p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * 0.5));
      p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.5));
    }
    if (pa.post) {
      const before = p.hp;
      p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * pa.post));
      rw.post = p.hp - before;
      if (rw.post) log(b, "heal", `${J(p.name, "은/는")} 숨을 고르며 HP를 회복했다!`);
    }
    if (tr.id === "harvest" && (p.hp < d.maxHp || p.mp < d.maxMp)) {
      const before = p.hp;
      p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * tr.v));
      p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * tr.v2));
      rw.post += p.hp - before;
      traitLog(p, b, "거둔 것으로 HP와 MP를 회복했다!");
    }
    b.reward = rw;
  }

  function act(p, b, action) {
    if (b.result) return b;
    b.fx = [];
    b.phase = 0;
    const d = derive(p);
    b.ps.guard = false;
    playerPhase(p, b, d, action);
    if (b.result) return b;
    if (b.enemy.hp <= 0) { win(p, b); return b; }

    let rounds = 0;
    do {
      if (rounds > 0) log(b, "status", `${J(p.name, "은/는")} 몸이 저려 움직일 수 없다!`);
      enemyPhase(p, b, d);
      if (b.enemy.hp <= 0) { win(p, b); return b; }
      if (checkDeath(p, b, d)) return b;
      endRound(p, b, d);
      if (checkDeath(p, b, d)) return b;
      rounds++;
      if (b.ps.stun > 0) b.ps.stun--;
      else break;
    } while (rounds < 4);
    return b;
  }

  /* ── 마을 ── */
  function prices(p) {
    const pa = p.job.passive;
    const disc = Math.min(0.5, pa.disc || 0);
    const f = (x) => Math.max(1, Math.round(x * (1 - disc)));
    return {
      hp: f(24 + p.level * 2),
      mp: f(24 + p.level * 2),
      weapon: f(40 * Math.pow(1.42, p.weaponLv)),
      armor: f(40 * Math.pow(1.42, p.armorLv)),
      scroll: f(400 + p.level * 60),
      inn: pa.inn ? 0 : f(8 + p.level * 4)
    };
  }

  function buy(p, item) {
    const price = prices(p)[item];
    if (p.gold < price) return { ok: false, msg: `골드가 부족하다. (${price}G 필요)` };
    p.gold -= price;
    const d0 = derive(p);
    switch (item) {
      case "hp": p.potions.hp++; return { ok: true, msg: `회복 물약을 샀다. (-${price}G)` };
      case "mp": p.potions.mp++; return { ok: true, msg: `마나 물약을 샀다. (-${price}G)` };
      case "weapon": p.weaponLv++; return { ok: true, msg: `무기를 강화했다. 이제 +${p.weaponLv}. (-${price}G)` };
      case "armor": {
        p.armorLv++;
        const d1 = derive(p);
        p.hp = Math.min(d1.maxHp, p.hp + (d1.maxHp - d0.maxHp));
        return { ok: true, msg: `방어구를 강화했다. 이제 +${p.armorLv}. (-${price}G)` };
      }
      case "scroll": {
        const job = randomJob();
        changeJob(p, job);
        return { ok: true, job, msg: `전직의 두루마리를 읽었다. ${J(job.name, "으로/로")} 전직했다! (-${price}G)` };
      }
      default: p.gold += price; return { ok: false, msg: "" };
    }
  }

  /* 전투 밖에서 물약 마시기 */
  function drink(p, item) {
    const d = derive(p);
    const pot = potionPower(p);
    const cook = traitOf(p.job).id === "cook";
    const hp0 = p.hp;
    const mp0 = p.mp;
    if (item === "mp") {
      if (p.potions.mp <= 0) return { ok: false, msg: "마나 물약이 없다." };
      p.potions.mp--;
      p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.5 * pot));
      if (cook) p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * 0.1 * pot));
      return { ok: true, msg: `마나 물약을 마셨다. MP ${p.mp - mp0}${p.hp > hp0 ? `·HP ${p.hp - hp0}` : ""} 회복.` };
    }
    if (p.potions.hp <= 0) return { ok: false, msg: "회복 물약이 없다." };
    p.potions.hp--;
    p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * 0.4 * pot));
    if (cook) p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.1 * pot));
    return { ok: true, msg: `회복 물약을 마셨다. HP ${p.hp - hp0}${p.mp > mp0 ? `·MP ${p.mp - mp0}` : ""} 회복.` };
  }

  function fleeChance(p, b) {
    if (b.enemy.boss) return 0;
    const d = derive(p);
    return Math.max(0.25, Math.min(0.9, 0.55 + (d.s.dex - b.enemy.lv * 1.2) * 0.01));
  }

  function rest(p) {
    const price = prices(p).inn;
    if (p.gold < price) return { ok: false, msg: `숙박비가 부족하다. (${price}G 필요)` };
    p.gold -= price;
    const d = derive(p);
    p.hp = d.maxHp;
    p.mp = d.maxMp;
    return { ok: true, msg: price ? `여관에서 푹 쉬었다. HP·MP 모두 회복. (-${price}G)` : "단골 여관에서 공짜로 쉬었다. HP·MP 모두 회복." };
  }

  /* 전직의 두루마리: 레벨·장비·골드는 그대로, 직업만 무작위로 바뀐다 */
  function changeJob(p, job) {
    const before = derive(p);
    const hpRate = p.hp / before.maxHp;
    const mpRate = p.mp / before.maxMp;
    p.job = job;
    if (!p.jobsHeld.includes(job.id)) p.jobsHeld.push(job.id);
    const d = derive(p);
    p.hp = Math.max(1, Math.round(d.maxHp * hpRate));
    p.mp = Math.round(d.maxMp * mpRate);
  }

  function randomJob() {
    return F.JOBS[Math.floor(R() * F.JOBS.length)];
  }

  F.engine = {
    josa, J, statsAt, derive, power, potionPower, expNeed, newPlayer, skillSpec, describeSkill, describeAttack, passiveLines, traitOf, weaponOf, attackOf,
    DIFFS, DIFF_KEYS, diffOf, floorTier, floorBoss, floorFights, fightKind, isBossFight, makeEnemy, pickMonster, monsterByName, enterFloor, startBattle, act, skillAvailable, prices, buy, rest, drink, fleeChance, changeJob, randomJob, MONSTERS
  };
})(typeof window !== "undefined" ? window : globalThis);
