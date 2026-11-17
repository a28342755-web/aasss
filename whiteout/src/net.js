// Presence netcode. Each open game publishes one presence object ~30 times a second:
//   { v, n:name, j:joinTime, on:deployed, away, t:clock, s:[x,y,z,yaw,pitch,flags], e:[[seq,type,...]], h:hostSnapshot|null }
// The earliest-joined visible peer is the host: it simulates bots, validates hits and owns scores.
// Presence is the only channel, so viewers who cannot send room events can still play.
export const PROTO = 4, SEND_MS = 33, INTERP = 120;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

export async function connect() {
  if (window.claude && typeof window.claude.use === 'function') {
    try {
      const room = await window.claude.use('room');
      if (room) {
        let r = room;
        try { r = await room.join('whiteout-alley'); } catch { /* the lobby works too */ }
        return {
          kind: 'room',
          me: () => { for (const p of r.peers()) if (p.sameTab) return p.peer; return null; },
          peers: () => r.peers(),
          set: (o) => { r.presence(o).catch(() => {}); },
          connected: () => r.connected(),
        };
      }
    } catch { /* fall through to solo */ }
    return solo();
  }
  if (location.protocol.startsWith('http')) { const t = await relay(); if (t) return t; }
  return solo();
}

function solo() {
  let mine = {};
  return { kind: 'solo', me: () => 'solo', peers: () => [{ peer: 'solo', sameTab: true, presence: mine }], set(o) { mine = o; }, connected: () => true };
}

// WebSocket stand-in for the room, served by server.js.
function relay() {
  return new Promise((resolve) => {
    let ws;
    try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); } catch { resolve(null); return; }
    const map = new Map();
    let me = null, list = [], open = false;
    const rebuild = () => { list = [...map].map(([peer, presence]) => ({ peer, presence, sameTab: peer === me })); };
    const api = {
      kind: 'relay', me: () => me, peers: () => list, connected: () => open,
      set(o) { if (!me) return; map.set(me, o); rebuild(); if (open) ws.send(JSON.stringify({ p: o })); },
    };
    // Give up only if the socket never opened: a busy main thread can delay the hello message itself.
    const timer = setTimeout(() => { if (ws.readyState !== 1) { try { ws.close(); } catch { /* ignore */ } resolve(null); } }, 20000);
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.hello) { me = m.hello; open = true; for (const [k, v] of m.peers || []) map.set(k, v); map.set(me, {}); rebuild(); clearTimeout(timer); resolve(api); }
      else if (m.left) { map.delete(m.left); rebuild(); }
      else if (m.peer && m.peer !== me) { map.set(m.peer, m.p); rebuild(); }
    };
    ws.onclose = ws.onerror = () => { open = false; clearTimeout(timer); resolve(null); };
  });
}

export const cleanName = (n) => (typeof n === 'string' ? n.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16) : '');
const validState = (s) => Array.isArray(s) && s.length >= 6 && s.slice(0, 6).every(num) && Math.abs(s[0]) < 300 && Math.abs(s[2]) < 300 && s[1] > -5 && s[1] < 60;

// Calls fn for events newer than `last`. First sight (last === null) only records the newest seq.
function ring(arr, last, fn) {
  if (!Array.isArray(arr)) return last;
  let max = last === null ? -1 : last;
  for (const ev of arr) {
    if (!Array.isArray(ev) || !num(ev[0]) || typeof ev[1] !== 'string') continue;
    if (last !== null && ev[0] > last) fn(ev);
    if (ev[0] > max) max = ev[0];
  }
  return max;
}

export class Net {
  constructor(t) {
    this.t = t; this.recs = new Map(); this.hostPeer = null; this.joinAt = performance.now();
    this.botBufs = new Map(); this.sc = []; this.match = [0, 0, 1, 0, 0]; this.idOf = new Map(); this.peerOf = new Map();
    this.lastH = null; this.seqE = null; this.seqF = null; this.zones = []; this.teamOf = new Map();
  }
  get me() { return this.t.me(); }
  get isHost() { return this.hostPeer !== null && this.hostPeer === this.t.me(); }
  get hostRec() { return this.recs.get(this.hostPeer) || null; }

  // cb: { playerEvent(rec, ev), hostEvent(ev), hostChanged(host, old) }
  update(now, mine, cb) {
    const seen = new Set();
    for (const p of this.t.peers()) {
      const pr = p.presence;
      if (p.sameTab || !pr || pr.v !== PROTO) continue;
      seen.add(p.peer);
      let rec = this.recs.get(p.peer);
      if (!rec) { rec = { peer: p.peer, buf: [], lastT: null, off: null, seq: null, recvAt: now, name: '' }; this.recs.set(p.peer, rec); }
      rec.pr = pr; rec.name = cleanName(pr.n);
      if (!num(pr.t) || pr.t === rec.lastT) continue;
      if (rec.lastT !== null && pr.t < rec.lastT) { rec.buf.length = 0; rec.off = null; }
      rec.lastT = pr.t; rec.recvAt = now;
      // Clock offset = smallest observed (receive - send), creeping up slowly so latency changes are tracked.
      const o = now - pr.t;
      rec.off = rec.off === null || o < rec.off ? o : rec.off + (o - rec.off) * 0.003;
      if (validState(pr.s)) {
        rec.buf.push({ t: pr.t, s: pr.s.slice(0, 6) });
        while (rec.buf.length > 2 && pr.t - rec.buf[0].t > 1500) rec.buf.shift();
      }
      rec.seq = ring(pr.e, rec.seq, (ev) => cb.playerEvent(rec, ev));
      if (p.peer === this.hostPeer && pr.h && typeof pr.h === 'object') this.ingest(pr.t, pr.h, cb, false);
    }
    for (const k of [...this.recs.keys()]) if (!seen.has(k)) this.recs.delete(k);

    const cands = [];
    const me = this.t.me();
    if (me && mine && !mine.away && now - this.joinAt > 1500) cands.push([mine.j, me]);
    for (const rec of this.recs.values()) if (!rec.pr.away && num(rec.pr.j) && now - rec.recvAt < 3000) cands.push([rec.pr.j, rec.peer]);
    cands.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    const host = cands.length ? cands[0][1] : null;
    if (host !== this.hostPeer) {
      const old = this.hostPeer;
      this.hostPeer = host; this.botBufs.clear(); this.seqE = null; this.seqF = null;
      cb.hostChanged(host, old);
    }
  }

  // Host snapshot → bot interpolation buffers, scores and events. `local` = our own sim (no bot buffers needed).
  ingest(t, h, cb, local) {
    if (!local) {
      this.lastH = h;
      if (Array.isArray(h.b)) {
        const live = new Set();
        for (const row of h.b) {
          if (!Array.isArray(row) || row.length < 7 || !row.slice(0, 7).every(num)) continue;
          live.add(row[0]);
          let buf = this.botBufs.get(row[0]);
          if (!buf) this.botBufs.set(row[0], (buf = []));
          buf.push({ t, s: row.slice(1, 7) });
          while (buf.length > 2 && t - buf[0].t > 1500) buf.shift();
        }
        for (const id of [...this.botBufs.keys()]) if (!live.has(id)) this.botBufs.delete(id);
      }
    }
    if (Array.isArray(h.sc)) {
      this.sc = h.sc.filter((r) => Array.isArray(r) && r.length >= 6 && num(r[0]) && num(r[2]) && num(r[3]) && num(r[4]));
      this.idOf.clear(); this.peerOf.clear(); this.teamOf.clear();
      for (const r of this.sc) { if (typeof r[1] === 'string') { this.idOf.set(r[1], r[0]); this.peerOf.set(r[0], r[1]); } if (r[6] === 0 || r[6] === 1) this.teamOf.set(r[0], r[6]); }
    }
    if (Array.isArray(h.m) && h.m.length >= 5 && h.m.every(num)) this.match = h.m;
    if (Array.isArray(h.z)) this.zones = h.z.filter((z) => Array.isArray(z) && z.length >= 2 && num(z[0]) && num(z[1]));
    this.seqE = ring(h.e, this.seqE, cb.hostEvent);
    this.seqF = ring(h.f, this.seqF, cb.hostEvent);
  }

  // Remote players who pressed Deploy, for the host sim.
  deployed() {
    const out = [];
    for (const rec of this.recs.values()) if (rec.pr.on && rec.buf.length) out.push({ peer: rec.peer, s: rec.buf[rec.buf.length - 1].s, buf: rec.buf });
    return out;
  }
  renderTime(rec, now) { return rec && rec.off !== null ? now - rec.off - INTERP : 0; }
}
