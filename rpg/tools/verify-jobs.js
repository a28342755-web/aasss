#!/usr/bin/env node
/*
 * 직업 데이터 검증: node rpg/tools/verify-jobs.js
 * - 정확히 3,000개, 이름 중복 없음
 * - 기술 유형·능력치·속성 값이 모두 유효
 * - 등급·계열·수식어 분포 출력
 */
"use strict";
const path = require("path");

const dir = path.join(__dirname, "..", "js");
["data-jobs.js", "data-world.js", "jobs.js"].forEach((f) => require(path.join(dir, f)));

const F = globalThis.FATES;
const D = F.data;
const jobs = F.JOBS;
const errors = [];

if (jobs.length !== 3000) errors.push(`직업 수가 3000이 아님: ${jobs.length}`);

const names = new Map();
jobs.forEach((j) => {
  if (names.has(j.name)) errors.push(`이름 중복: ${j.name} (#${names.get(j.name)}, #${j.id})`);
  names.set(j.name, j.id);
  if (!D.ELEMENTS[j.el]) errors.push(`#${j.id} ${j.name}: 알 수 없는 속성 ${j.el}`);
  j.skills.concat([j.attack]).forEach((s) => {
    if (s.type && !D.SKILL_TYPES[s.type]) errors.push(`#${j.id} ${j.name}: 알 수 없는 기술 유형 ${s.type} (${s.name})`);
    if (!D.STATS.includes(s.stat)) errors.push(`#${j.id} ${j.name}: 알 수 없는 능력치 ${s.stat} (${s.name})`);
    if (!D.ELEMENTS[s.el]) errors.push(`#${j.id} ${j.name}: 알 수 없는 속성 ${s.el} (${s.name})`);
  });
  Object.keys(j.passive).forEach((k) => {
    if (!D.PASSIVES[k]) errors.push(`#${j.id} ${j.name}: 알 수 없는 특성 ${k}`);
  });
  D.STATS.forEach((k) => {
    if (!(j.stats[k] >= 1)) errors.push(`#${j.id} ${j.name}: 능력치 ${k} 이상 (${j.stats[k]})`);
  });
});

const rarity = D.RARITIES.map(() => 0);
jobs.forEach((j) => rarity[j.rarity]++);

console.log(`직업 ${jobs.length}개 · 계열 ${F.FAMILY_LIST.length}개 · 기본 직업 ${F.BASE_COUNT}개 · 수식어 ${F.MOD_COUNT}개`);
console.log("등급:", D.RARITIES.map((r, i) => `${r.name} ${rarity[i]}`).join(", "));
const combat = jobs.filter((j) => F.FAMILY_LIST[j.fam].combat).length;
console.log(`전투 계열 ${combat}개 · 생활 계열 ${jobs.length - combat}개`);
console.log("계열별:", F.FAMILY_LIST.map((f) => `${f.name} ${f.count}`).join(", "));

const modUse = new Map();
jobs.forEach((j) => j.mod && modUse.set(j.mod, (modUse.get(j.mod) || 0) + 1));
const uses = [...modUse.values()];
console.log(`수식어 사용 횟수: 최소 ${Math.min(...uses)} · 최대 ${Math.max(...uses)}`);

if (process.argv.includes("--sample")) {
  const step = Math.floor(jobs.length / 40);
  for (let i = 0; i < jobs.length; i += step) {
    const j = jobs[i];
    console.log(`  No.${String(j.id).padStart(4, "0")} [${D.RARITIES[j.rarity].name}] ${j.name} (${F.FAMILY_LIST[j.fam].name})`);
  }
}

if (errors.length) {
  console.error(`\n오류 ${errors.length}건`);
  errors.slice(0, 50).forEach((e) => console.error(" - " + e));
  process.exit(1);
}
console.log("\n검증 통과");
