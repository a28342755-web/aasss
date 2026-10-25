#!/usr/bin/env node
/*
 * 밸런스 시뮬레이션: node rpg/tools/simulate.js [표본 수]
 * 단순한 AI가 무작위 직업으로 여관·상점·던전을 오가며 쓰러질 때까지 진행한다.
 * 계열·등급별로 도달 층수를 비교해 특정 직업군이 지나치게 강하거나 약한지 본다.
 */
"use strict";
const path = require("path");

const dir = path.join(__dirname, "..", "js");
["data-jobs.js", "data-world.js", "jobs.js", "engine.js"].forEach((f) => require(path.join(dir, f)));

const F = globalThis.FATES;
const D = F.data;
const E = F.engine;

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
F.rng = seeded(20261025);

const SAMPLES = Number(process.argv[2]) || 600;
const FLOOR_CAP = 120;
const BATTLE_CAP = 4000;

function chooseAction(p, b) {
  const d = E.derive(p);
  const hpRate = p.hp / d.maxHp;
  if (hpRate < 0.3 && p.potions.hp > 0) return { kind: "potion", item: "hp" };
  let best = -1;
  let bestScore = 1;
  p.job.skills.forEach((s, i) => {
    if (!E.skillAvailable(p, b, i).ok) return;
    const t = D.SKILL_TYPES[s.type];
    let score;
    switch (s.type) {
      case "heal": score = hpRate < 0.5 ? 3 : 0; break;
      case "regen": score = hpRate < 0.7 && !b.ps.regen ? 2 : 0; break;
      case "buff": case "rage": score = !b.ps.atkUp && !b.ps.rage && b.enemy.hp > b.enemy.maxHp * 0.4 ? 2.2 : 0; break;
      case "shield": score = hpRate < 0.75 && !b.ps.barrier ? 2 : 0; break;
      case "counter": score = b.ps.counter ? 0 : 1.8; break;
      case "summon": score = b.ps.summon ? 0 : 2.4; break;
      case "multi": score = t.mult * t.hits * s.pow; break;
      case "gamble": score = 1.65 * s.pow; break;
      default: score = (t.mult || 1) * s.pow + (t.dot ? t.dotPow * t.t * s.pow : 0);
    }
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best >= 0 ? { kind: "skill", idx: best } : { kind: "attack" };
}

function visitTown(p) {
  const d = E.derive(p);
  if (p.hp < d.maxHp * 0.85 || p.mp < d.maxMp * 0.5) E.rest(p);
  let guard = 0;
  while (guard++ < 40) {
    const pr = E.prices(p);
    if (p.potions.hp < 3 && p.gold >= pr.hp) { E.buy(p, "hp"); continue; }
    if (p.potions.mp < 1 && p.gold >= pr.mp) { E.buy(p, "mp"); continue; }
    const item = pr.weapon <= pr.armor ? "weapon" : "armor";
    if (p.gold >= pr[item] + pr.hp * 2) { E.buy(p, item); continue; }
    break;
  }
}

/* 한 층에 떠도는 몬스터 MONSTERS_PER_FLOOR마리를 잡고, 10층마다 보스를 잡은 뒤 계단으로 내려간다 */
const MONSTERS_PER_FLOOR = 3;

function fight(p, opts) {
  const b = E.startBattle(p, opts);
  let turns = 0;
  while (!b.result && turns++ < 200) E.act(p, b, chooseAction(p, b));
  return b.result === "win";
}

function runLife(job) {
  const p = E.newPlayer(job, "시뮬");
  let battles = 0;
  E.enterFloor(p, 1);
  while (battles < BATTLE_CAP && p.floor <= FLOOR_CAP) {
    visitTown(p);
    let cleared = 0;
    for (;;) {
      const boss = p.floor % 10 === 0;
      const opts = { floor: p.floor, monster: boss && cleared >= MONSTERS_PER_FLOOR ? E.pickMonster(p.floor, true) : E.pickMonster(p.floor, false) };
      battles++;
      if (!fight(p, opts)) return { p, battles, dead: true };
      cleared++;
      if (cleared > MONSTERS_PER_FLOOR - (boss ? 0 : 1)) {
        E.enterFloor(p, p.floor + 1);
        cleared = 0;
      }
      const d = E.derive(p);
      if (p.hp < d.maxHp * 0.5 || p.floor > FLOOR_CAP || battles >= BATTLE_CAP) break;
    }
  }
  return { p, battles, dead: false };
}

function quantile(list, q) {
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

const results = [];
for (let i = 0; i < SAMPLES; i++) {
  const job = F.JOBS[Math.floor(F.rng() * F.JOBS.length)];
  const r = runLife(job);
  results.push({ job, best: r.p.best, level: r.p.level, battles: r.battles, dead: r.dead });
}

function summary(label, rows) {
  if (!rows.length) return;
  const floors = rows.map((r) => r.best);
  const levels = rows.map((r) => r.level);
  console.log(
    `${label.padEnd(14)} n=${String(rows.length).padStart(4)}  도달층 p10 ${String(quantile(floors, 0.1)).padStart(3)} · 중앙 ${String(quantile(floors, 0.5)).padStart(3)} · p90 ${String(quantile(floors, 0.9)).padStart(3)}  레벨 중앙 ${quantile(levels, 0.5)}  생존 ${rows.filter((r) => !r.dead).length}`
  );
}

console.log(`표본 ${SAMPLES}명 (층 상한 ${FLOOR_CAP}, 전투 상한 ${BATTLE_CAP})\n`);
summary("전체", results);
summary("전투 계열", results.filter((r) => F.FAMILY_LIST[r.job.fam].combat));
summary("생활 계열", results.filter((r) => !F.FAMILY_LIST[r.job.fam].combat));
console.log("");
D.RARITIES.forEach((rar, i) => summary(rar.name, results.filter((r) => r.job.rarity === i)));
if (process.argv.includes("--families")) {
  console.log("");
  F.FAMILY_LIST.forEach((f) => summary(f.name, results.filter((r) => r.job.fam === f.idx)));
}
