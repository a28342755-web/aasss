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
    const [name, tier, el, weak, resist, traits, hp, atk, def, boss] = line.trim().split("|");
    return {
      name, tier: Number(tier), el, weak: weak || null, resist: resist || null,
      traits: traits === "none" ? [] : traits.split(","),
      hp: Number(hp), atk: Number(atk), def: Number(def), boss: boss === "B"
    };
  });

  /* ── 능력치 ── */
  function statsAt(job, level) {
    const s = {};
    D.STATS.forEach((k) => { s[k] = Math.round(job.stats[k] + job.growth[k] * (level - 1)); });
    return s;
  }

  function derive(p) {
    const pa = p.job.passive;
    const L = p.level;
    const s = statsAt(p.job, L);
    return {
      s,
      maxHp: Math.round((60 + L * 13 + s.vit * 3 + s.str) * (1 + 0.04 * p.armorLv) * (1 + (pa.hp || 0))),
      maxMp: Math.round((30 + s.wis * 3 + s.int * 2.5 + L * 3) * (1 + (pa.mp || 0))),
      def: (s.vit * 0.4 + s.str * 0.15 + L + p.armorLv * 3) * (1 + (pa.def || 0)),
      crit: Math.min(0.6, 0.05 + s.luk * 0.007 + s.dex * 0.002 + (pa.crit || 0)),
      eva: Math.min(0.35, 0.03 + s.dex * 0.003 + s.luk * 0.002 + (pa.eva || 0))
    };
  }

  function power(p, d, stat) {
    return (d.s[stat] * 2.2 + p.level * 1.6 + 6) * (1 + 0.06 * p.weaponLv) + p.weaponLv * 3;
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

  /* 한 층에서 치르는 전투: 일반 몬스터 셋, 10층마다 그 뒤에 보스 */
  const FIGHTS_PER_FLOOR = 3;
  function floorFights(floor) {
    return FIGHTS_PER_FLOOR + (floor % 10 === 0 ? 1 : 0);
  }
  function isBossFight(floor, idx) {
    return floor % 10 === 0 && idx >= FIGHTS_PER_FLOOR;
  }

  function pickMonster(floor, boss) {
    const tier = floorTier(floor);
    const pool = MONSTERS.filter((m) => m.tier === tier && m.boss === !!boss);
    return pool[Math.floor(R() * pool.length)];
  }

  function monsterByName(name) {
    return MONSTERS.find((m) => m.name === name) || null;
  }

  /* 일반 몬스터는 한 층에 여럿이라 보상을 줄이고, 보스는 크게 준다 */
  function makeEnemy(floor, mon) {
    const m = mon || pickMonster(floor, floor % 10 === 0);
    const boss = m.boss;
    const lv = floor;
    const prefix = floor > 100 ? "심연의 " : floor > 50 ? "광폭한 " : "";
    const maxHp = Math.round((40 + lv * 16 + lv * lv * 0.35) * m.hp * (boss ? 3.1 : 1));
    return {
      name: prefix + m.name, lv, boss, maxHp, hp: maxHp,
      atk: Math.round((7 + lv * 2.6 + lv * lv * 0.03) * m.atk * (boss ? 1.32 : 1)),
      def: Math.round((2 + lv * 1.4) * m.def),
      el: m.el, weak: m.weak, resist: m.resist, traits: m.traits.slice(),
      exp: Math.round((10 + lv * 5) * (boss ? 4 : 0.3)),
      gold: Math.round((6 + lv * 3.5) * (boss ? 3 : 0.22)),
      base: m.name, st: {}, enraged: false
    };
  }

  /* ── 전투 ── */
  /* 로그와 연출 이벤트에는 차례 단계(ph)를 붙여 화면이 한 단계씩 보여 줄 수 있게 한다 */
  function log(b, kind, text) {
    b.log.push({ kind, text, ph: b.phase || 0 });
    b.logCount = (b.logCount || 0) + 1;
    if (b.log.length > 80) b.log.shift();
  }

  function fx(b, target, kind, amount, extra) {
    b.fx.push(Object.assign({ target, kind, amount, ph: b.phase || 0 }, extra));
  }

  function enterFloor(p, floor) {
    p.floor = floor;
    p.best = Math.max(p.best, floor);
  }

  function startBattle(p, opts) {
    const o = opts || {};
    const floor = o.floor || p.floor;
    const d = derive(p);
    const e = makeEnemy(floor, o.monster);
    const b = {
      floor, enemy: e, turn: 1, log: [], logCount: 0, fx: [], phase: 0, result: null, reward: null,
      cds: p.job.skills.map(() => 0),
      ps: { guard: false, barrier: 0 },
      weakKnown: !!p.job.passive.weak
    };
    if (p.job.passive.barrier) b.ps.barrier = Math.round(d.maxHp * p.job.passive.barrier);
    log(b, "sys", `${J(e.name, "이/가")} 나타났다!${e.boss ? " 보스다!" : ""}`);
    if (b.ps.barrier) log(b, "buff", `보호막이 몸을 감싼다. (+${b.ps.barrier})`);
    return b;
  }

  function damageEnemy(p, b, d, opt) {
    const e = b.enemy;
    const ps = b.ps;
    const pa = p.job.passive;
    const hits = opt.hits || 1;
    let total = 0;
    let crits = 0;
    let weakHit = false;
    let resisted = false;
    for (let h = 0; h < hits && e.hp > 0; h++) {
      let dmg = power(p, d, opt.stat) * opt.mult * (0.9 + R() * 0.2);
      dmg *= 1 + (pa.dmg || 0);
      if (ps.atkUp) dmg *= 1 + ps.atkUp.v;
      if (ps.rage) dmg *= 1 + ps.rage.v;
      if (ps.weaken) dmg *= 0.75;
      if (b.turn === 1 && pa.first) dmg *= 1 + pa.first;
      if (e.boss && pa.boss) dmg *= 1 + pa.boss;
      if (e.st.curse) dmg *= 1.25;
      if (opt.el && opt.el === e.weak) { dmg *= 1.5 + (pa.weak || 0); weakHit = true; }
      else if (opt.el && opt.el === e.resist) { dmg *= 0.6; resisted = true; }
      if (R() < d.crit + (opt.critBonus || 0)) { dmg *= 1.75; crits++; }
      const pen = Math.min(0.9, (pa.pen || 0) + (opt.pen || 0));
      const def = e.def * (e.st.debuff ? 0.7 : 1) * (1 - pen);
      dmg = Math.max(1, Math.round((dmg * 100) / (100 + def * 1.2)));
      e.hp -= dmg;
      total += dmg;
    }
    if (weakHit) b.weakKnown = true;
    if (total > 0) fx(b, "enemy", crits ? "crit" : "hit", total, { el: opt.el, src: opt.src || "player", hits, weak: weakHit });
    let note = "";
    if (crits) note += hits > 1 ? ` 치명타 ${crits}회!` : " 치명타!";
    if (weakHit) note += " 약점을 찔렀다!";
    if (resisted) note += " 저항당했다…";
    if (pa.steal && total > 0) {
      const heal = Math.max(1, Math.round(total * pa.steal));
      p.hp = Math.min(d.maxHp, p.hp + heal);
    }
    return { total, note };
  }

  function healPlayer(p, b, d, amount, label) {
    const before = p.hp;
    p.hp = Math.min(d.maxHp, p.hp + Math.round(amount));
    const gained = p.hp - before;
    if (gained > 0) {
      fx(b, "player", "heal", gained, { src: "player" });
      log(b, "heal", `${label} HP ${gained} 회복.`);
    } else {
      log(b, "heal", `${label} 하지만 HP가 이미 가득하다.`);
    }
    return gained;
  }

  function applyDot(b, kind, dmg, turns) {
    const cur = b.enemy.st[kind];
    b.enemy.st[kind] = { t: Math.max(turns, cur ? cur.t : 0), dmg: Math.max(Math.round(dmg), cur ? cur.dmg : 0) };
  }

  const DOT_NAMES = { burn: "화상", poison: "중독", bleed: "출혈", curse: "저주" };

  function useSkill(p, b, d, idx) {
    const skill = p.job.skills[idx];
    const spec = skillSpec(p, skill);
    const t = spec.t;
    const e = b.enemy;
    const ps = b.ps;
    const pa = p.job.passive;
    const name = p.name;

    if (skill.type === "sacrifice") {
      const cost = Math.round(d.maxHp * t.hpCost);
      p.hp = Math.max(1, p.hp - cost);
      log(b, "warn", `${J(name, "이/가")} 생명력을 ${cost}만큼 바쳤다.`);
    } else {
      p.mp -= spec.cost;
    }
    b.cds[idx] = spec.cd + 1;
    fx(b, "player", "act", 0, { action: "skill", type: skill.type, el: skill.el, tag: skill.tag, name: skill.name });
    const head = `${name}의 ${skill.name}!`;
    const atkOpt = { stat: skill.stat, el: skill.el, mult: spec.mult };
    const pw = power(p, d, skill.stat);

    switch (skill.type) {
      case "heal":
        healPlayer(p, b, d, (d.maxHp * t.heal * skill.pow + d.s.wis * 1.5) * (1 + (pa.heal || 0)), head);
        return true;
      case "regen":
        ps.regen = { t: spec.dur, v: Math.round(d.maxHp * t.regen * skill.pow * (1 + (pa.heal || 0))) };
        fx(b, "player", "buff", 0, { el: "nature" });
        log(b, "buff", `${head} ${spec.dur}턴 동안 매 턴 HP ${ps.regen.v} 회복.`);
        return true;
      case "buff":
        ps.atkUp = { t: spec.dur, v: t.up * skill.pow };
        fx(b, "player", "buff", 0, { el: skill.el });
        log(b, "buff", `${head} 공격력 +${Math.round(ps.atkUp.v * 100)}% (${spec.dur}턴)`);
        return true;
      case "rage":
        ps.rage = { t: spec.dur, v: t.up * skill.pow };
        fx(b, "player", "buff", 0, { el: "fire" });
        log(b, "buff", `${head} 공격력 +${Math.round(ps.rage.v * 100)}%, 방어력 -30% (${spec.dur}턴)`);
        return true;
      case "shield": {
        const amount = Math.round(d.maxHp * t.shield * skill.pow + d.s[skill.stat] * 2);
        ps.barrier = (ps.barrier || 0) + amount;
        fx(b, "player", "shield", amount, { src: "player" });
        log(b, "buff", `${head} 보호막 ${amount}.`);
        return true;
      }
      case "counter":
        ps.counter = spec.dur;
        fx(b, "player", "buff", 0, { el: "phys" });
        log(b, "buff", `${head} 반격 태세 (${spec.dur}턴)`);
        return true;
      case "summon": {
        const dmg = Math.round(pw * t.pow * skill.pow * (1 + (pa.summon || 0)));
        ps.summon = { t: spec.dur, dmg, name: skill.name };
        fx(b, "player", "buff", 0, { el: skill.el, summon: true });
        log(b, "buff", `${head} 소환수가 ${spec.dur}턴 동안 함께 싸운다.`);
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
    const res = damageEnemy(p, b, d, opt);
    let tail = `${J(e.name, "에게")} ${res.total} 피해.${res.note}`;
    if (skill.type === "gamble") tail = `주사위 눈 ${Math.round(opt.mult * 100)}%! ` + tail;
    if (skill.type === "execute" && opt.mult > spec.mult) tail = "처형! " + tail;
    log(b, "skill", `${head} ${tail}`);
    if (e.hp <= 0) return true;

    const dotMul = 1 + (pa.dot || 0);
    switch (skill.type) {
      case "burn": case "poison": case "bleed":
        applyDot(b, t.dot, pw * t.dotPow * skill.pow * dotMul, spec.dur);
        fx(b, "enemy", "status", 0, { st: t.dot });
        log(b, "status", `${J(e.name, "이/가")} ${DOT_NAMES[t.dot]} 상태가 되었다.`);
        break;
      case "curse":
        applyDot(b, "curse", pw * t.dotPow * skill.pow * dotMul, spec.dur);
        fx(b, "enemy", "status", 0, { st: "curse" });
        log(b, "status", `${J(e.name, "이/가")} 저주에 걸렸다. 받는 피해 +25%.`);
        break;
      case "stun": case "freeze": {
        const chance = t.chance * (e.boss ? 0.5 : 1);
        if (R() < chance) {
          e.st.stun = Math.max(e.st.stun || 0, 1);
          e.st.stunLabel = skill.type === "freeze" ? "얼어붙어" : "기절해";
          fx(b, "enemy", "status", 0, { st: skill.type === "freeze" ? "freeze" : "stun" });
          log(b, "status", `${J(e.name, "이/가")} ${skill.type === "freeze" ? "얼어붙었다" : "기절했다"}!`);
        }
        break;
      }
      case "charm": {
        const chance = e.boss ? 0.5 : 0.9;
        if (R() < chance) {
          e.st.charm = spec.dur;
          fx(b, "enemy", "status", 0, { st: "charm" });
          log(b, "status", `${J(e.name, "이/가")} 혼란에 빠졌다!`);
        }
        break;
      }
      case "debuff":
        e.st.debuff = spec.dur;
        fx(b, "enemy", "status", 0, { st: "debuff" });
        log(b, "status", `${J(e.name, "이/가")} 약해졌다. 공격·방어 -30% (${spec.dur}턴)`);
        break;
      case "drain":
        healPlayer(p, b, d, res.total * t.drain * (1 + (pa.heal || 0) * 0.5), "흡수로");
        break;
      case "evade":
        ps.evade = spec.dur;
        fx(b, "player", "buff", 0, { el: "wind" });
        log(b, "buff", `몸놀림이 빨라졌다. 회피율 대폭 상승 (${spec.dur}턴)`);
        break;
      case "gold": {
        const stolen = Math.round((4 + b.floor * 2.5) * skill.pow * (1 + (pa.gold || 0)));
        p.gold += stolen;
        fx(b, "player", "gold", stolen);
        log(b, "gold", `${stolen}G를 빼앗았다.`);
        break;
      }
      case "mana": {
        const before = p.mp;
        p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * t.mana * skill.pow));
        fx(b, "player", "mana", p.mp - before);
        log(b, "heal", `MP ${p.mp - before} 회복.`);
        break;
      }
      default:
        break;
    }
    extraHit(p, b, d, skill.stat, skill.el);
    return true;
  }

  function extraHit(p, b, d, stat, el) {
    const pa = p.job.passive;
    if (!pa.double || b.enemy.hp <= 0 || R() >= pa.double) return;
    const res = damageEnemy(p, b, d, { stat, el, mult: 0.5 });
    log(b, "hit", `추가 공격! ${res.total} 피해.${res.note}`);
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

  function playerPhase(p, b, d, action) {
    const e = b.enemy;
    const ps = b.ps;
    switch (action.kind) {
      case "attack": {
        const a = p.job.attack;
        fx(b, "player", "act", 0, { action: "attack", el: a.el, name: a.name });
        const res = damageEnemy(p, b, d, { stat: a.stat, el: a.el, mult: 1 });
        p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.04));
        log(b, "hit", `${p.name}의 ${a.name}! ${J(e.name, "에게")} ${res.total} 피해.${res.note}`);
        extraHit(p, b, d, a.stat, a.el);
        return;
      }
      case "guard": {
        ps.guard = true;
        fx(b, "player", "buff", 0, { el: "phys" });
        const before = p.mp;
        p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.12));
        log(b, "buff", `${J(p.name, "은/는")} 방어 자세를 취했다. MP ${p.mp - before} 회복.`);
        return;
      }
      case "skill":
        if (!skillAvailable(p, b, action.idx).ok) {
          log(b, "warn", "지금은 그 기술을 쓸 수 없다.");
          return;
        }
        useSkill(p, b, d, action.idx);
        return;
      case "potion": {
        const pot = 1 + (p.job.passive.pot || 0);
        if (action.item === "mp") {
          if (p.potions.mp <= 0) { log(b, "warn", "마나 물약이 없다."); return; }
          p.potions.mp--;
          fx(b, "player", "act", 0, { action: "item" });
          const before = p.mp;
          p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.5 * pot));
          fx(b, "player", "mana", p.mp - before);
          log(b, "heal", `마나 물약을 마셨다. MP ${p.mp - before} 회복.`);
        } else {
          if (p.potions.hp <= 0) { log(b, "warn", "회복 물약이 없다."); return; }
          p.potions.hp--;
          fx(b, "player", "act", 0, { action: "item" });
          delete ps.burn;
          delete ps.poison;
          healPlayer(p, b, d, d.maxHp * 0.4 * pot, "회복 물약을 마셨다.");
        }
        return;
      }
      case "flee": {
        if (e.boss) { log(b, "warn", "보스에게서는 도망칠 수 없다!"); return; }
        if (R() < fleeChance(p, b)) {
          b.result = "fled";
          log(b, "sys", `${J(p.name, "은/는")} 무사히 도망쳤다.`);
        } else {
          log(b, "warn", "도망치지 못했다!");
        }
        return;
      }
      default:
        return;
    }
  }

  function hurtPlayer(p, b, d, raw, label) {
    const ps = b.ps;
    const pa = p.job.passive;
    const evaChance = Math.min(0.85, d.eva + (ps.evade ? 0.5 : 0));
    if (R() < evaChance) {
      fx(b, "player", "miss", 0, { src: "enemy" });
      log(b, "miss", `${label} 하지만 ${J(p.name, "은/는")} 재빨리 피했다!`);
      return 0;
    }
    const def = d.def * (ps.rage ? 0.7 : 1);
    let dmg = (raw * 100) / (100 + def * 1.3);
    dmg *= 1 - Math.min(0.6, pa.resist || 0);
    if (ps.guard) dmg *= 0.5;
    const reflect = Math.max(1, Math.round(dmg * 0.8));
    if (ps.counter) dmg *= 0.5;
    dmg = Math.max(1, Math.round(dmg));
    let absorbed = 0;
    if (ps.barrier > 0) {
      absorbed = Math.min(ps.barrier, dmg);
      ps.barrier -= absorbed;
      dmg -= absorbed;
    }
    p.hp -= dmg;
    fx(b, "player", "hit", dmg, { src: "enemy", absorbed });
    log(b, "enemy", `${label} ${dmg} 피해${absorbed ? ` (보호막이 ${absorbed} 흡수)` : ""}.`);
    if (ps.counter && b.enemy.hp > 0) {
      b.enemy.hp -= reflect;
      fx(b, "enemy", "hit", reflect, { src: "counter" });
      log(b, "hit", `반격! ${J(b.enemy.name, "에게")} ${reflect} 피해.`);
    }
    return dmg;
  }

  function enemyAct(p, b, d) {
    const e = b.enemy;
    const ps = b.ps;
    if (e.st.stun > 0) {
      e.st.stun--;
      log(b, "status", `${J(e.name, "은/는")} ${e.st.stunLabel || "기절해"} 움직이지 못한다!`);
      return;
    }
    if (e.st.charm > 0 && R() < 0.6) {
      const self = Math.max(1, Math.round(e.atk * 0.8));
      e.hp -= self;
      fx(b, "enemy", "hit", self, { src: "self" });
      log(b, "status", `${J(e.name, "은/는")} 혼란에 빠져 자신을 공격했다! ${self} 피해.`);
      return;
    }
    let atk = e.atk * (e.st.debuff ? 0.7 : 1);
    if (e.traits.includes("enrage") && !e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      fx(b, "enemy", "status", 0, { st: "enrage" });
      log(b, "warn", `${J(e.name, "이/가")} 분노했다! 공격력이 크게 오른다.`);
    }
    if (e.enraged) atk *= 1.4;
    if (e.traits.includes("heal") && e.hp < e.maxHp * 0.5 && R() < 0.3) {
      const amount = Math.round(e.maxHp * 0.15);
      e.hp = Math.min(e.maxHp, e.hp + amount);
      fx(b, "enemy", "heal", amount, {});
      log(b, "warn", `${J(e.name, "이/가")} 상처를 재생했다. HP ${amount} 회복.`);
      return;
    }
    const roll = e.traits.filter((t) => t !== "enrage" && t !== "heal");
    const trait = roll.length && R() < 0.38 ? roll[Math.floor(R() * roll.length)] : null;
    const label = `${J(e.name, "의")} 공격!`;
    fx(b, "enemy", "act", 0, { trait: trait || "attack", el: e.el });
    switch (trait) {
      case "heavy":
        hurtPlayer(p, b, d, atk * 1.7 * (0.9 + R() * 0.2), `${J(e.name, "이/가")} 힘을 모아 내리쳤다!`);
        return;
      case "multi":
        hurtPlayer(p, b, d, atk * 0.65, `${J(e.name, "의")} 연속 공격!`);
        if (p.hp > 0) hurtPlayer(p, b, d, atk * 0.65, "한 번 더!");
        return;
      case "poison": case "burn": {
        const dealt = hurtPlayer(p, b, d, atk * 0.8, label);
        if (dealt > 0) {
          ps[trait] = { t: 3, dmg: Math.max(1, Math.round(atk * 0.22)) };
          log(b, "status", `${J(p.name, "이/가")} ${trait === "poison" ? "중독" : "화상"} 상태가 되었다.`);
        }
        return;
      }
      case "drain": {
        const dealt = hurtPlayer(p, b, d, atk, `${J(e.name, "이/가")} 생명력을 빨아들인다!`);
        if (dealt > 0) {
          e.hp = Math.min(e.maxHp, e.hp + Math.round(dealt * 0.6));
        }
        return;
      }
      case "stun": {
        const dealt = hurtPlayer(p, b, d, atk * 0.8, label);
        if (dealt > 0 && R() < 0.45) {
          ps.stun = 1;
          log(b, "status", `${J(p.name, "은/는")} 정신이 아득해졌다! (다음 턴 행동 불가)`);
        }
        return;
      }
      case "steal": {
        hurtPlayer(p, b, d, atk * 0.8, label);
        const lost = Math.min(p.gold, 3 + b.floor * 2);
        if (lost > 0) {
          p.gold -= lost;
          log(b, "warn", `${J(e.name, "이/가")} ${lost}G를 훔쳤다!`);
        }
        return;
      }
      case "weaken": {
        hurtPlayer(p, b, d, atk * 0.8, label);
        ps.weaken = 3;
        log(b, "status", `${J(p.name, "이/가")} 쇠약해졌다. 공격력 -25% (3턴)`);
        return;
      }
      default:
        hurtPlayer(p, b, d, atk * (0.9 + R() * 0.2), label);
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
      e.hp -= dmg;
      fx(b, "enemy", "hit", dmg, { src: "summon", el: "arcane" });
      log(b, "hit", `소환수의 공격! ${dmg} 피해.`);
      tickDown(ps, "summon");
      if (e.hp <= 0) return;
    }
    ["burn", "poison", "bleed", "curse"].forEach((k) => {
      if (!e.st[k] || e.hp <= 0) return;
      e.hp -= e.st[k].dmg;
      fx(b, "enemy", "dot", e.st[k].dmg, { dot: k });
      log(b, "status", `${J(DOT_NAMES[k], "으로/로")} ${J(e.name, "이/가")} ${e.st[k].dmg} 피해를 입었다.`);
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
      log(b, "status", `${k === "burn" ? "화상" : "중독"}으로 ${ps[k].dmg} 피해.`);
      tickDown(ps, k);
    });
    if (p.hp <= 0) return;
    let regen = 0;
    if (pa.regen) regen += d.maxHp * pa.regen;
    if (ps.regen) { regen += ps.regen.v; tickDown(ps, "regen"); }
    if (regen > 0 && p.hp < d.maxHp) {
      const before = p.hp;
      p.hp = Math.min(d.maxHp, p.hp + Math.round(regen));
      if (p.hp > before) log(b, "heal", `재생으로 HP ${p.hp - before} 회복.`);
    }
    if (pa.mregen) p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * pa.mregen));
    ["atkUp", "rage", "counter", "evade", "weaken"].forEach((k) => tickDown(ps, k));
    ["charm", "debuff"].forEach((k) => tickDown(b.enemy.st, k));
    b.cds = b.cds.map((c) => Math.max(0, c - 1));
    b.turn++;
  }

  function checkDeath(p, b, d) {
    if (p.hp > 0) return false;
    if (p.job.passive.revive && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = Math.round(d.maxHp * 0.3);
      fx(b, "player", "heal", p.hp, { src: "revive" });
      log(b, "heal", `불사조의 불꽃이 타오른다! ${J(p.name, "이/가")} HP ${p.hp}로 되살아났다.`);
      return false;
    }
    p.hp = 0;
    b.result = "lose";
    b.phase++;
    log(b, "lose", `${J(p.name, "은/는")} ${b.floor}층에서 쓰러졌다…`);
    return true;
  }

  function win(p, b) {
    const e = b.enemy;
    const pa = p.job.passive;
    const fam = F.FAMILY_LIST[p.job.fam];
    e.hp = 0;
    b.result = "win";
    b.phase++;
    const exp = Math.round(e.exp * (1 + (pa.exp || 0)));
    const gold = Math.round(e.gold * (1 + (pa.gold || 0)) * (0.85 + R() * 0.3));
    p.exp += exp;
    p.gold += gold;
    p.kills++;
    const rw = { exp, gold, levels: [], unlocked: [], drops: [], post: 0 };
    log(b, "win", `${J(e.name, "을/를")} 쓰러뜨렸다! 경험치 ${exp}, ${gold}G 획득.`);

    if (R() < 0.15 + (pa.drop || 0) || e.boss) {
      p.potions.hp++;
      rw.drops.push(fam.loot ? `${fam.loot} → 회복 물약 +1` : "회복 물약 +1");
    }
    if (e.boss) {
      p.potions.mp++;
      rw.drops.push("마나 물약 +1");
    }
    while (p.exp >= expNeed(p.level)) {
      p.exp -= expNeed(p.level);
      p.level++;
      rw.levels.push(p.level);
      p.job.skills.forEach((s) => { if (s.lv === p.level) rw.unlocked.push(s.name); });
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
      if (rounds > 0) log(b, "status", `${J(p.name, "은/는")} 몸이 움직이지 않는다!`);
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
    const pot = 1 + (p.job.passive.pot || 0);
    if (item === "mp") {
      if (p.potions.mp <= 0) return { ok: false, msg: "마나 물약이 없다." };
      p.potions.mp--;
      const before = p.mp;
      p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * 0.5 * pot));
      return { ok: true, msg: `마나 물약을 마셨다. MP ${p.mp - before} 회복.` };
    }
    if (p.potions.hp <= 0) return { ok: false, msg: "회복 물약이 없다." };
    p.potions.hp--;
    const before = p.hp;
    p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * 0.4 * pot));
    return { ok: true, msg: `회복 물약을 마셨다. HP ${p.hp - before} 회복.` };
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
    josa, J, statsAt, derive, power, expNeed, newPlayer, skillSpec, describeSkill, passiveLines,
    floorTier, floorFights, isBossFight, makeEnemy, pickMonster, monsterByName, enterFloor, startBattle, act, skillAvailable, prices, buy, rest, drink, fleeChance, changeJob, randomJob, MONSTERS
  };
})(typeof window !== "undefined" ? window : globalThis);
