/*
 * 삼천의 운명 — 전투·성장 엔진 (DOM 없이 동작)
 * 게임 화면과 자동 플레이 봇(tools/autoplay.js)이 같은 코드를 쓴다.
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
      weaponLv: 0, armorLv: 0, potions: { hp: 5, mp: 3 }, reviveUsed: false,
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

  /* 기술 설명(실시간 기준). 사거리는 직업마다 달라 적지 않는다 */
  function describeSkill(skill, p) {
    const who = p || { level: 1, job: { passive: {} } };
    const t = T[skill.type];
    const pl = skillPlan(who, skill, false);
    const pctOf = (v) => Math.round(v * 100);
    const target = pl.area === "screen" ? "화면 안의 모든 적" : pl.area === "around" ? `주변의 적 최대 ${pl.targets}명` : pl.targets > 1 ? `앞의 적 최대 ${pl.targets}명` : "앞의 적 하나";
    const atk = `${target}에게 위력 ${pctOf(pl.mult)}% ${pl.hits > 1 ? `${pl.hits}회 ` : ""}공격`;
    const sec = (v) => `${Math.round(v * 10) / 10}초`;
    const tail = ` · 재사용 ${sec(pl.cd)}`;
    const DOT = { burn: "화상", poison: "중독", bleed: "출혈" };
    let text;
    switch (skill.type) {
      case "pierce": text = `${atk}, 방어력 ${pctOf(t.pen)}% 무시`; break;
      case "crit": text = `${atk}, 치명타 확률 +${pctOf(t.critBonus)}%p`; break;
      case "execute": text = `${atk}, HP 35% 이하인 적에게 피해 2.2배`; break;
      case "burn": case "poison": case "bleed": text = `${atk} 후 ${pl.dot.ticks}초 동안 ${DOT[skill.type]}`; break;
      case "curse": text = `${atk}, ${sec(pl.status.sec)} 동안 받는 피해 +25%와 저주 피해`; break;
      case "stun": case "freeze": text = `${atk}, ${pctOf(t.chance)}% 확률로 2.5초 ${skill.type === "freeze" ? "빙결" : "기절"}`; break;
      case "drain": text = `${atk}, 준 피해의 ${pctOf(t.drain)}% 회복`; break;
      case "evade": text = `앞으로 돌진하며 ${atk}, ${sec(pl.buff.sec)} 동안 회피율 +40%p`; break;
      case "debuff": text = `${atk}, ${sec(pl.status.sec)} 동안 적 공격·방어 -30%`; break;
      case "charm": text = `${atk}, ${sec(pl.status.sec)} 동안 적이 혼란에 빠져 공격하지 못함`; break;
      case "gold": text = `${atk}, 골드를 빼앗음`; break;
      case "gamble": text = `${target}에게 위력 ${Math.round(10 * skill.pow)}%~${Math.round(320 * skill.pow)}% 사이 무작위 공격`; break;
      case "mana": text = `${atk}, 최대 MP ${pctOf(t.mana * skill.pow)}% 회복`; break;
      case "sacrifice": text = `HP ${pctOf(t.hpCost)}%를 바쳐 ${atk}`; break;
      case "heal": text = `최대 HP의 ${pctOf(t.heal * skill.pow)}%와 정신 비례 회복`; break;
      case "regen": text = `${sec(pl.regen.sec)} 동안 최대 HP ${pctOf(pl.regen.v)}%를 서서히 회복`; break;
      case "buff": text = `${sec(pl.buff.sec)} 동안 공격력 +${pctOf(pl.buff.v)}%`; break;
      case "rage": text = `${sec(pl.buff.sec)} 동안 공격력 +${pctOf(pl.buff.v)}%, 방어력 -30%`; break;
      case "shield": text = `최대 HP ${pctOf(t.shield * skill.pow)}%의 보호막`; break;
      case "counter": text = `${sec(pl.buff.sec)} 동안 받는 피해 절반, 받은 피해의 80% 반사`; break;
      case "summon": text = `${sec(pl.summon.sec)} 동안 소환수가 곁에서 위력 ${pctOf(pl.summon.pow)}%로 공격`; break;
      default: text = atk;
    }
    if (pl.ult && pl.area === "screen" && !text.startsWith(target)) text = `${atk}. ${text}`;
    return text + tail;
  }

  /* 턴제 시절 값을 실시간 문구에 맞게 바꿔 보여 준다 */
  const PASSIVE_SCALE = { post: 0.25, dur: 8 };
  function passiveLines(pa) {
    return Object.keys(pa).map((k) => {
      const v = pa[k] * (PASSIVE_SCALE[k] || 1);
      return (D.PASSIVES[k] || k).replace("{p}", pct(v)).replace("{n}", Math.round(v));
    });
  }

  /* ── 실시간 전투 규칙 ──
     거리·속도는 '기본 단위'(주인공 키 ≈ 44)로, 시간은 초로 적는다. 화면 배율은 game.js가 곱한다.
     턴제 시절 수치(SKILL_TYPES)는 그대로 쓰고, '1턴' 지속은 TURN_SEC초로 바꿔 읽는다. */
  const TURN_SEC = 8;
  const SELF_TYPES = new Set(["heal", "regen", "buff", "rage", "shield", "counter", "summon"]);

  function floorTier(floor) {
    return Math.min(4, Math.floor((floor - 1) / 10));
  }

  function pickMonster(floor, boss) {
    const tier = floorTier(floor);
    const pool = MONSTERS.filter((m) => m.tier === tier && m.boss === !!boss);
    return pool[Math.floor(R() * pool.length)];
  }

  function monsterByName(name) {
    return MONSTERS.find((m) => m.name === name) || null;
  }

  /* 지하 n층의 몬스터는 Lv.n. 10층마다 보스 */
  function makeMonster(floor, mon) {
    const m = mon || pickMonster(floor, floor % 10 === 0);
    const boss = m.boss;
    const lv = floor;
    const prefix = floor > 100 ? "심연의 " : floor > 50 ? "광폭한 " : "";
    /* 처음 몇 층은 몸 풀기: 부딪힘 피해가 12층까지 서서히 오른다 */
    const ramp = 0.6 + 0.4 * Math.min(1, (lv - 1) / 11);
    const maxHp = Math.round((40 + lv * 16 + lv * lv * 0.5) * m.hp * (boss ? 34 : 1.8));
    return {
      name: prefix + m.name, base: m.name, lv, boss, maxHp, hp: maxHp,
      atk: Math.round((7 + lv * 2.6 + lv * lv * 0.07) * m.atk * 3 * ramp),
      def: Math.round((2 + lv * 1.4) * m.def),
      el: m.el, weak: m.weak, resist: m.resist, traits: m.traits.slice(),
      exp: Math.round((10 + lv * 5) * 0.3 * (boss ? 30 : 1)),
      gold: Math.round((5 + lv * 3) * 0.5 * (boss ? 18 : 1)),
      st: {}, enraged: false
    };
  }

  /* 주인공의 실시간 상태(강화·보호막 등). t는 남은 초 */
  function newPlayerState(p) {
    const d = derive(p);
    const ps = { barrier: 0, barrierT: 0 };
    if (p.job.passive.barrier) ps.barrier = Math.round(d.maxHp * p.job.passive.barrier);
    return ps;
  }

  /* 한 번 때릴 때의 피해. o: stat, el, mult, pen, critBonus, execute */
  function hitMonster(p, d, mon, o, ps) {
    const pa = p.job.passive;
    let dmg = power(p, d, o.stat) * o.mult * (0.9 + R() * 0.2);
    dmg *= 1 + (pa.dmg || 0);
    if (ps.atkUp) dmg *= 1 + ps.atkUp.v;
    if (ps.rage) dmg *= 1 + ps.rage.v;
    if (ps.weaken) dmg *= 0.75;
    if (pa.first && mon.hp >= mon.maxHp) dmg *= 1 + pa.first;
    if (mon.boss && pa.boss) dmg *= 1 + pa.boss;
    if (mon.st.curse) dmg *= 1.25;
    let weak = false;
    let resist = false;
    if (o.el && o.el === mon.weak) { dmg *= 1.5 + (pa.weak || 0); weak = true; }
    else if (o.el && o.el === mon.resist) { dmg *= 0.6; resist = true; }
    const crit = R() < d.crit + (o.critBonus || 0);
    if (crit) dmg *= 1.75;
    const pen = Math.min(0.9, (pa.pen || 0) + (o.pen || 0));
    const def = mon.def * (mon.st.debuff ? 0.7 : 1) * (1 - pen);
    dmg = (dmg * 100) / (100 + def * 1.2);
    if (o.execute && mon.hp / mon.maxHp <= 0.35) dmg *= 2.2;
    dmg = Math.max(1, Math.round(dmg));
    mon.hp -= dmg;
    if (pa.steal) {
      p.hp = Math.min(d.maxHp, p.hp + Math.max(1, Math.round(dmg * pa.steal * 0.5)));
    }
    return { dmg, crit, weak, resist };
  }

  /* 몬스터와 부딪히거나 맞았을 때. 돌려주는 값: dmg, miss, absorbed, reflect */
  function hurtPlayer(p, d, raw, ps) {
    const pa = p.job.passive;
    if (R() < Math.min(0.85, d.eva + (ps.evade ? 0.4 : 0))) return { dmg: 0, miss: true, absorbed: 0, reflect: 0 };
    let dmg = (raw * (0.9 + R() * 0.2) * 100) / (100 + d.def * (ps.rage ? 0.7 : 1) * 1.3);
    dmg *= 1 - Math.min(0.6, pa.resist || 0);
    const reflect = ps.counter ? Math.max(1, Math.round(dmg * 0.8)) : 0;
    if (ps.counter) dmg *= 0.5;
    dmg = Math.max(1, Math.round(dmg));
    let absorbed = 0;
    if (ps.barrier > 0) {
      absorbed = Math.min(ps.barrier, dmg);
      ps.barrier -= absorbed;
      dmg -= absorbed;
    }
    p.hp -= dmg;
    return { dmg, miss: false, absorbed, reflect };
  }

  /* 기술을 실시간으로 쓰는 방법: 쿨타임(초), 범위, 대상 수, 타수, 부가 효과.
     far: 활·총·지팡이처럼 멀리 닿는 직업 */
  function skillPlan(p, skill, far) {
    const t = T[skill.type];
    const spec = skillSpec(p, skill);
    const pa = p.job.passive;
    const ult = skill.tag === "ult";
    const self = SELF_TYPES.has(skill.type) && !ult;
    const sec = (turns) => (turns + (pa.dur || 0)) * TURN_SEC;
    const pl = {
      name: skill.name, type: skill.type, el: skill.el, stat: skill.stat, tag: skill.tag, ult, self,
      cost: skill.type === "sacrifice" ? 0 : spec.cost, hpCost: skill.type === "sacrifice" ? t.hpCost : 0,
      cd: ult ? 24 : 1.6 + spec.cd * 1.3,
      mult: spec.mult, hits: 1, targets: 3, range: far ? 190 : 84, area: "front"
    };
    switch (skill.type) {
      case "multi": pl.targets = 2; pl.hits = t.hits; break;
      case "pierce": pl.targets = 6; pl.range = far ? 250 : 160; pl.pen = t.pen; break;
      case "crit": pl.targets = 1; pl.hits = 2; pl.mult *= 0.62; pl.critBonus = t.critBonus; break;
      case "execute": pl.targets = 2; pl.execute = true; break;
      case "burn": case "poison": case "bleed":
        pl.targets = 4; pl.range += 20; pl.dot = { kind: t.dot, pow: t.dotPow * skill.pow * (1 + (pa.dot || 0)), ticks: t.t * 2 }; break;
      case "curse":
        pl.targets = 4; pl.range += 30; pl.dot = { kind: "curse", pow: t.dotPow * skill.pow * (1 + (pa.dot || 0)), ticks: t.t * 2 }; pl.status = { kind: "curse", sec: t.t * 4 }; break;
      case "stun": case "freeze": pl.targets = 4; pl.range += 20; pl.stun = { chance: t.chance, sec: 2.5, kind: skill.type }; break;
      case "drain": pl.targets = 2; pl.drain = t.drain; break;
      case "evade": pl.targets = 4; pl.dash = 64; pl.buff = { kind: "evade", sec: sec(t.t) }; break;
      case "debuff": pl.targets = 4; pl.range += 30; pl.status = { kind: "debuff", sec: t.t * 4 }; break;
      case "charm": pl.targets = 4; pl.range += 30; pl.status = { kind: "charm", sec: t.t * 4 }; break;
      case "gold": pl.targets = 1; pl.gold = skill.pow; break;
      case "gamble": pl.targets = 3; pl.gamble = skill.pow; break;
      case "mana": pl.targets = 2; pl.mana = t.mana * skill.pow; break;
      case "nuke": pl.targets = 8; pl.area = "around"; pl.range = 120; break;
      case "sacrifice": pl.targets = 6; pl.range += 40; break;
      case "heal": pl.heal = t.heal * skill.pow; break;
      case "regen": pl.regen = { v: t.regen * skill.pow * t.t, sec: sec(t.t) }; break;
      case "buff": pl.buff = { kind: "atkUp", v: t.up * skill.pow, sec: sec(t.t) }; break;
      case "rage": pl.buff = { kind: "rage", v: t.up * skill.pow, sec: sec(t.t) }; break;
      case "shield": pl.shield = t.shield * skill.pow; break;
      case "counter": pl.buff = { kind: "counter", sec: sec(t.t) }; break;
      case "summon": pl.summon = { pow: t.pow * skill.pow * (1 + (pa.summon || 0)), sec: sec(t.t) }; break;
      default: break;
    }
    if (self) {
      /* 회복·보호막은 자주, 오래가는 강화는 효과가 끝난 뒤 조금 지나야 다시 쓴다 */
      const last = pl.buff || pl.regen || pl.summon;
      pl.cd = skill.type === "heal" ? 4 + spec.cd * 2 : skill.type === "shield" ? 6 + spec.cd * 2 : Math.round(last.sec + 6);
    }
    if (ult) {
      /* 궁극기는 화면 전체를 세 번 내리친다 */
      pl.area = "screen";
      pl.range = 340;
      pl.targets = 15;
      pl.hits = 3;
      pl.mult = Math.max(pl.mult, 1.6) / 3 * 1.25;
    }
    return pl;
  }

  function skillReady(p, skill, plan, cdLeft) {
    if (!skill || p.level < skill.lv) return { ok: false, why: `Lv.${skill ? skill.lv : "?"}` };
    if (cdLeft > 0) return { ok: false, why: `${Math.ceil(cdLeft)}초` };
    if (plan.hpCost) {
      const d = derive(p);
      if (p.hp <= Math.round(d.maxHp * plan.hpCost) + 1) return { ok: false, why: "HP 부족" };
      return { ok: true };
    }
    if (p.mp < plan.cost) return { ok: false, why: "MP 부족" };
    return { ok: true };
  }

  /* 쓰러뜨린 몬스터의 보상. drops는 바닥에 떨어질 물건들 */
  function killReward(p, mon) {
    const pa = p.job.passive;
    const exp = Math.round(mon.exp * (1 + (pa.exp || 0)));
    const drops = [];
    const coins = mon.boss ? 8 : R() < 0.75 ? 1 : 0;
    for (let i = 0; i < coins; i++) {
      drops.push({ kind: "gold", amount: Math.max(1, Math.round((mon.gold / Math.max(1, coins)) * (1 + (pa.gold || 0)) * (0.8 + R() * 0.4))) });
    }
    const hpN = mon.boss ? 3 : R() < 0.07 + (pa.drop || 0) * 0.5 ? 1 : 0;
    const mpN = mon.boss ? 2 : R() < 0.04 + (pa.drop || 0) * 0.3 ? 1 : 0;
    for (let i = 0; i < hpN; i++) drops.push({ kind: "hp" });
    for (let i = 0; i < mpN; i++) drops.push({ kind: "mp" });
    return { exp, drops };
  }

  /* 경험치를 얻고, 오른 레벨과 새로 배운 기술을 돌려준다. 레벨이 오르면 HP·MP가 가득 찬다 */
  function gainExp(p, exp) {
    p.exp += exp;
    const res = { levels: [], unlocked: [] };
    while (p.exp >= expNeed(p.level)) {
      p.exp -= expNeed(p.level);
      p.level++;
      res.levels.push(p.level);
      p.job.skills.forEach((s) => { if (s.lv === p.level) res.unlocked.push(s.name); });
    }
    if (res.levels.length) {
      const d = derive(p);
      p.hp = d.maxHp;
      p.mp = d.maxMp;
    }
    return res;
  }

  function enterFloor(p, floor) {
    p.floor = floor;
    p.best = Math.max(p.best, floor);
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
    josa, J, statsAt, derive, power, expNeed, newPlayer, skillSpec, describeSkill, passiveLines, TURN_SEC,
    floorTier, pickMonster, monsterByName, makeMonster, newPlayerState, hitMonster, hurtPlayer, skillPlan, skillReady,
    killReward, gainExp, enterFloor, prices, buy, rest, drink, changeJob, randomJob, MONSTERS
  };
})(typeof window !== "undefined" ? window : globalThis);
