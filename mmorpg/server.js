// 미니 MMORPG 서버 — 실행: node server.js (의존성 없음)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SAVE = path.join(__dirname, 'saves.json');
const W = 3000, TOWN = 150, VIEW = 1200; // world size, safe-zone radius, how far a client sees
const C = { x: W / 2, y: W / 2 };        // town center

// shortcut: one JSON file holds every character, move to a real DB past a few thousand characters
const saves = new Map(fs.existsSync(SAVE) ? Object.entries(JSON.parse(fs.readFileSync(SAVE, 'utf8'))) : []);
const players = new Map(); // name -> player
const mobs = [];
let nextId = 1;

// players have a name, mobs don't
const maxHp = e => (e.name ? 80 + 20 * e.level : 30 + 25 * e.level);
const dmg = e => (e.name ? 8 + 4 * e.level : 3 + 3 * e.level);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = v => Math.max(0, Math.min(W, Number(v) || 0));
const hash = s => crypto.createHash('sha256').update(s).digest('hex');

// shortcut: SSE down + POST up instead of WebSocket (no dependency), switch when input latency matters
const send = (res, o) => {
  // a stalled client drops frames instead of buffering forever
  if (res.writableLength < 1e5) res.write(`data: ${JSON.stringify(o)}\n\n`);
};
const say = chat => { for (const p of players.values()) send(p.res, { chat }); };

function save() {
  for (const p of players.values()) saves.set(p.name, { key: p.key, level: p.level, xp: p.xp });
  fs.writeFileSync(SAVE + '.tmp', JSON.stringify(Object.fromEntries(saves)));
  fs.renameSync(SAVE + '.tmp', SAVE); // rename is atomic: a crash mid-write can't corrupt the saves
}

// mobs live on a ring around the town; farther out = higher level
function mob(r = TOWN + 150 + Math.random() * (W / 2 - TOWN - 150), a = Math.random() * 2 * Math.PI) {
  return reset({ id: nextId++, hx: C.x + r * Math.cos(a), hy: C.y + r * Math.sin(a), level: 1 + Math.floor((r - TOWN - 150) / 120), cd: 0 });
}
function reset(m) {
  m.x = m.tx = m.hx; m.y = m.ty = m.hy;
  m.hp = maxHp(m); m.target = null; m.dead = 0;
  return m;
}

function join(name, token, res) {
  name = String(name || '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12);
  token = String(token || '');
  const key = hash(token);
  let s = saves.get(name);
  const err = !name || token.length < 16 ? '이름은 글자·숫자 1~12자여야 합니다.'
    : s && s.key !== key ? '이미 다른 사람이 쓰는 이름입니다.' : null;
  if (err) { send(res, { err }); return res.end(); }
  if (!s) saves.set(name, s = { key, level: 1, xp: 0 }); // claim the name right away

  const old = players.get(name); // same character reconnecting or a second tab: newest stream wins
  if (old) old.res.end();
  const p = old || { id: nextId++, name, key, level: s.level, xp: s.xp, x: C.x, y: C.y, tx: C.x, ty: C.y, cd: 0, target: null, lastChat: 0 };
  if (!old) p.hp = maxHp(p);
  p.res = res;
  players.set(name, p);
  send(res, { world: { W, TOWN } });
  if (!old) say(`${name} 님이 접속했습니다.`);
  res.on('close', () => {
    if (p.res !== res) return; // replaced by a newer stream
    save();
    players.delete(name);
    say(`${name} 님이 나갔습니다.`);
  });
}

// clients only send intents; the server simulates everything
function act(m, now) {
  const p = players.get(m.name);
  if (!p || p.key !== hash(String(m.token))) return false;
  if (Array.isArray(m.move)) { p.tx = clamp(m.move[0]); p.ty = clamp(m.move[1]); p.target = null; }
  else if (m.attack) p.target = mobs.find(o => o.id === m.attack && !o.dead) || p.target;
  else if (typeof m.chat === 'string' && m.chat.trim() && now - p.lastChat > 500) {
    p.lastChat = now;
    say(`${p.name}: ${m.chat.trim().slice(0, 100)}`);
  }
  return true;
}

function step(e, tx, ty, speed, dt) {
  const d = Math.hypot(tx - e.x, ty - e.y), s = speed * dt;
  if (d <= s) { e.x = tx; e.y = ty; } else { e.x += (tx - e.x) / d * s; e.y += (ty - e.y) / d * s; }
}

function hit(a, b, now) {
  b.hp -= dmg(a);
  if (b.hp > 0) return;
  if (b.name) { // player died: back to town
    b.x = b.tx = C.x; b.y = b.ty = C.y; b.hp = maxHp(b); b.target = null;
    say(`${b.name} 님이 쓰러져 마을에서 부활했습니다.`);
  } else {
    b.dead = now + 8000; // respawn time
    a.xp += 20 * b.level;
    while (a.xp >= 100 * a.level) {
      a.xp -= 100 * a.level; a.level++; a.hp = maxHp(a);
      say(`${a.name} 님이 Lv ${a.level} 달성!`);
    }
  }
}

// a mob may fight t only while t is online, outside the town and near the mob's home (leash)
const ok = (m, t) => players.get(t.name) === t && dist(t, C) > TOWN && Math.hypot(t.x - m.hx, t.y - m.hy) < 450;

function tick(now, dt) {
  const ps = [...players.values()];
  for (const p of ps) {
    if (p.target && p.target.dead) { p.target = null; p.tx = p.x; p.ty = p.y; }
    const m = p.target;
    if (m) { p.tx = m.x; p.ty = m.y; }
    if (!m || dist(p, m) > 60) step(p, p.tx, p.ty, 200, dt);
    else if (now >= p.cd) { p.cd = now + 600; hit(p, m, now); }
    p.hp = Math.min(maxHp(p), p.hp + maxHp(p) * (dist(p, C) < TOWN ? 0.2 : 0.01) * dt);
  }
  for (const m of mobs) {
    if (m.dead) { if (now >= m.dead) reset(m); continue; }
    if (m.target && !ok(m, m.target)) { m.target = null; m.tx = m.hx; m.ty = m.hy; }
    if (!m.target) m.target = ps.find(p => ok(m, p) && dist(m, p) < 100) || null;
    const t = m.target;
    if (!t) {
      m.hp = maxHp(m); // out of combat = full heal, so the leash and the town give no free hits
      if (Math.random() < 0.01) { m.tx = m.hx + Math.random() * 120 - 60; m.ty = m.hy + Math.random() * 120 - 60; }
      step(m, m.tx, m.ty, 40, dt);
    } else if (dist(m, t) > 45) step(m, t.x, t.y, 110, dt);
    else if (now >= m.cd) { m.cd = now + 1000; hit(m, t, now); }
  }
  const all = [...ps, ...mobs].filter(e => !e.dead).map(e => ({
    id: e.id, n: e.name, x: Math.round(e.x), y: Math.round(e.y), hp: Math.ceil(e.hp), mhp: maxHp(e), lv: e.level,
  }));
  // each client only gets what is near it
  for (const p of ps) send(p.res, { you: p.id, xp: p.xp, nxp: 100 * p.level, e: all.filter(e => dist(e, p) < VIEW) });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return res.writeHead(400).end(); }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  } else if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    join(url.searchParams.get('name'), url.searchParams.get('token'), res);
  } else if (req.method === 'POST' && url.pathname === '/act') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1000) req.destroy(); });
    req.on('end', () => {
      let good = false;
      try { good = act(JSON.parse(body), Date.now()); } catch {}
      res.writeHead(good ? 204 : 400).end();
    });
  } else res.writeHead(404).end();
});

if (require.main === module) {
  for (let i = 0; i < 100; i++) mobs.push(mob());
  let last = Date.now();
  setInterval(() => { const now = Date.now(); tick(now, (now - last) / 1000); last = now; }, 100);
  setInterval(save, 30000);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(); });
  server.listen(PORT, () => console.log(`미니 MMORPG: http://localhost:${PORT}`));
} else module.exports = { join, act, tick, mob, players, mobs, C };
