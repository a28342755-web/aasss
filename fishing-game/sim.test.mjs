// 낚시 물리 모델 점검: node fishing-game/sim.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(html.match(/<script id="sim">([\s\S]*?)<\/script>/)[1], ctx);
const S = ctx.window.Sim;

function rng(seed) { // mulberry32: 매번 같은 결과
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = rng(42);
const D = 180 / Math.PI;

// 전장-무게: 월척(30.3cm) 붕어는 500~700g
const w = S.weight(S.SPECIES.crucian, 30.3);
assert.ok(w > 500 && w < 700, `월척 붕어 무게 ${w}`);

// 전장은 어종 범위 안
for (const [id, sp] of Object.entries(S.SPECIES)) for (const bait of Object.keys(S.BAITS)) for (let i = 0; i < 500; i++) {
  const L = S.sampleLength(sp, bait, rnd);
  assert.ok(L >= sp.len[0] && L <= sp.len[1], `${id} ${L}`);
}

// 태양: 11월 초 정오 고도 ≈ 36°, 자정은 지평선 아래, 일출 7시 무렵
assert.ok(Math.abs(S.sun(12.27).el * D - 36.1) < 1, 'noon elevation');
assert.ok(S.sun(0).el < 0, 'midnight');
assert.ok(S.SUNRISE > 6.9 && S.SUNRISE < 7.3 && S.SUNSET > 17.2 && S.SUNSET < 17.6, `sunrise ${S.SUNRISE} sunset ${S.SUNSET}`);

// 입질 각본: 시간순, 유효 구간이 최적 시각을 감싼다, 최적 시각에 채면 품질 1
for (const [id, sp] of Object.entries(S.SPECIES)) for (let i = 0; i < 200; i++) {
  const b = S.makeBite(sp, sp.mu, rnd);
  for (let k = 1; k < b.keys.length; k++) assert.ok(b.keys[k][0] >= b.keys[k - 1][0], `${id} keys order`);
  assert.ok(b.win[0] <= b.best && b.best <= b.win[1] && b.win[1] <= b.end + 0.5, `${id} window`);
  assert.equal(S.strike(b, b.best, sp, () => 0).q, 1);
  assert.equal(S.strike(b, b.win[0] - 0.01, sp, () => 0).hooked, false);
}

// 파이팅: 봇은 장력이 드랙의 85% 아래일 때만 릴을 감는다
function fightBot(id, len, dragKgf, leader, seconds = 240) {
  const r = rng(7), sp = S.SPECIES[id];
  const f = S.newFight(sp, len, 0, -28, 2.5, 0.8, r);
  const c = { tipX: 0, tipY: 2.1, tipZ: -3, drag: dragKgf * S.KGF, leaderN: S.LINE_KGF[leader] * 0.9 * S.KGF, mainN: S.LINE_KGF['3'] * S.KGF,
    side: 0, depthAt: (x, z) => (z < -1 ? 2.5 : 0), covers: [], minL: 1, reel: 0 };
  f.L = Math.hypot(f.x - c.tipX, f.y - c.tipY, f.z - c.tipZ) + 0.2;
  let maxT = 0;
  for (let t = 0; t < seconds; t += 1 / 240) {
    c.reel = f.T < c.drag * 0.85 ? 1 : 0;
    S.fightStep(f, c, 1 / 240, r);
    maxT = Math.max(maxT, f.T);
    if (f.result) return { result: f.result, t, maxT, c };
    if (Math.hypot(f.x, f.z + 1.5) < 3 && f.stamina < 0.3) return { result: 'landed', t, maxT, c };
  }
  return { result: 'timeout', maxT, c };
}
const small = fightBot('crucian', 25, 1.2, '1.5');
assert.equal(small.result, 'landed', `25cm 붕어: ${small.result}`);
assert.ok(small.maxT <= small.c.drag * 1.12 + 1e-6, 'tension stays under drag start-up');
const carp = fightBot('carp', 70, 1.8, '2');
assert.equal(carp.result, 'landed', `70cm 잉어 적정 드랙: ${carp.result}`);
assert.ok(carp.t > small.t * 2, `big fish fights longer (${carp.t.toFixed(0)}s vs ${small.t.toFixed(0)}s)`);
const tight = fightBot('carp', 75, 3.5, '1.5');
assert.equal(tight.result, 'broken', `드랙을 목줄보다 세게 조이면 터진다: ${tight.result}`);

// 낚싯대: 하중이 없으면 곧고, 무거울수록 끝이 더 처진다 (끝 각도는 줄 방향을 넘지 않는다)
const bend = (T) => S.rodBend(T, 1.3, 3.6, 28, 90);
const tipAngle = (T) => { const a = bend(T); return Math.atan2(a[57] - a[55], a[56] - a[54]) * D; };
assert.equal(bend(0)[57], 0);
assert.ok(bend(2)[57] < bend(10)[57] && bend(10)[57] < bend(25)[57], 'bend grows with load');
assert.ok(tipAngle(25) <= 1.3 * D + 1e-6, 'tip never passes the line');

// 게임처럼 매 프레임 이전 모양에서 이어 풀 때, 하중이 조금씩 변하면 끝도 조금씩만 움직인다 (화면 떨림 방지)
const warm = new Float32Array(58);
let lastY = null, jump = 0;
for (let i = 0; i < 400; i++) { S.rodBend(10 + 6 * Math.sin(i / 40), 1.2 + 0.1 * Math.sin(i / 23), 3.6, 28, 90, warm); if (i > 20) jump = Math.max(jump, Math.abs(warm[57] - lastY)); lastY = warm[57]; }
assert.ok(jump < 0.02, `rod tip jump per frame ${jump}`);

// 찌 부력: 바닥에 봉돌 → 3마디, 봉돌 매달림 → 찌톱 끝이 수면, 고기가 봉돌을 들면 솟고, 끌면 잠긴다
const settle = (P, sec = 6, wave = 0) => { const f = { y: 0.01, v: 0 }; for (let t = 0; t < sec; t += 1 / 60) S.floatStep(f, P, wave * Math.sin(2 * t), wave * 2 * Math.cos(2 * t), 1 / 60); return f.y - wave * Math.sin(2 * sec); };
assert.ok(Math.abs(settle(S.FLOAT.rest) - 0.054) < 0.002, `rest exposure ${settle(S.FLOAT.rest)}`);
assert.ok(Math.abs(settle(S.FLOAT.sinker)) < 0.003, 'sinker hanging → tip at surface');
assert.ok(Math.abs(settle(S.floatPull(3)) - 0.108) < 0.003, '3-segment rise');
assert.ok(settle(S.floatPull(-8), 1.5) < -0.05, 'pulled under');
assert.ok(Math.abs(settle(S.FLOAT.rest, 6, 0.004) - 0.054) < 0.012, 'rides small waves');

console.log(`ok · 25cm 붕어 ${small.t.toFixed(0)}s · 70cm 잉어 ${carp.t.toFixed(0)}s · 3.5kg 드랙 ${tight.result} ${tight.t.toFixed(0)}s · 끝 휨 1kg ${tipAngle(9.8).toFixed(0)}°`);
