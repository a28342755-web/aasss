// 실행: node test.js
const assert = require('assert');
const g = require('./server');

const res = () => ({ out: [], writableLength: 0, write(s) { this.out.push(s); }, end() {}, on() {} });
const T = 'x'.repeat(16);
let now = 0;
const run = until => { for (let i = 0; i < 600 && !until(); i++) g.tick(now += 100, 0.1); assert(until()); };

// join, and the name is protected by the token
g.join('용사', T, res());
const p = g.players.get('용사');
assert(p);
const thief = res();
g.join('용사', 'y'.repeat(16), thief);
assert(thief.out[0].includes('err'));
assert.strictEqual(g.players.get('용사'), p);
assert(!g.act({ name: '용사', token: 'wrong', move: [0, 0] }, 0));

// walk to a level 1 mob, kill it, get xp
const m = g.mob(400, 0);
g.mobs.push(m);
assert(g.act({ name: '용사', token: T, attack: m.id }, 0));
run(() => m.dead);
assert.strictEqual(p.xp, 20);

// level up
p.xp = 90;
run(() => !m.dead);
g.act({ name: '용사', token: T, attack: m.id }, 0);
run(() => m.dead);
assert.deepStrictEqual([p.level, p.xp], [2, 10]);

// a mob far too strong kills the player, who respawns in town at full hp
const boss = g.mob(400, 3);
boss.level = 99;
g.mobs.push(boss);
g.act({ name: '용사', token: T, attack: boss.id }, 0);
run(() => p.target === null);
assert.deepStrictEqual([p.x, p.y, p.hp], [g.C.x, g.C.y, 120]);

console.log('ok');
