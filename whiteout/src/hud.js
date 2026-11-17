// HUD: vitals, ammo, crosshair, hit markers, kill feed, scoreboard, and the blood-on-screen damage layer.
import { screenSplat } from './textures.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class HUD {
  constructor() {
    this.root = $('hud'); this.cv = $('blood'); this.g = this.cv.getContext('2d');
    this.imgs = [0, 1, 2, 3].map(() => screenSplat(384));
    this.splats = []; this.arcs = []; this.pulse = 0; this.lowHp = 0; this.dirty = true;
    this.hm = $('hitmark'); this.hmT = 0;
    this.centerT = 0; this.promptText = '';
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() { this.cv.width = Math.ceil(innerWidth / 2); this.cv.height = Math.ceil(innerHeight / 2); this.dirty = true; }
  show(v) { this.root.hidden = !v; }

  vitals(hp, mag, res, reloading) {
    const h = Math.max(0, Math.round(hp));
    if (h !== this.h) { this.h = h; $('hpnum').textContent = h; $('hpbar').style.width = h + '%'; $('vitals').classList.toggle('low', h <= 35); }
    const a = `${mag}|${res}|${reloading}`;
    if (a !== this.a) { this.a = a; $('mag').textContent = reloading ? '--' : mag; $('res').textContent = '/ ' + res; $('ammo').classList.toggle('low', mag <= 8 && !reloading); }
  }
  crosshair(gapPx, visible) {
    const x = $('xhair');
    x.style.setProperty('--gap', gapPx.toFixed(1) + 'px');
    x.style.opacity = visible ? 1 : 0;
  }
  hit(kind) {
    this.hm.className = ''; void this.hm.offsetWidth;
    this.hm.className = 'show ' + kind; this.hmT = kind === 'kill' ? 0.5 : 0.22;
  }
  center(text) { const c = $('center'); c.textContent = text; c.classList.add('show'); this.centerT = 1.8; }
  prompt(text) { if (text !== this.promptText) { this.promptText = text; $('prompt').textContent = text; $('prompt').hidden = !text; } }
  aimName(text) { if (text !== this.an) { this.an = text; $('aimname').textContent = text; } }
  net(text) { if (text !== this.nt) { this.nt = text; $('net').textContent = text; } }
  // zs: [{owner: 1 ours | 0 neutral | -1 theirs, rel: capture progress toward us (-1..1), contested}]
  objectives(zs, ours, theirs, seconds, limit) {
    const t = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const k = JSON.stringify(zs) + `|${ours}|${theirs}|${t}`;
    if (k === this.ok) return;
    this.ok = k;
    $('ours').textContent = ours; $('theirs').textContent = theirs; $('timer').textContent = `${t} · ${limit}`;
    zs.forEach((z, i) => {
      const o = $('obj' + i);
      o.className = 'obj ' + (z.owner === 1 ? 'us' : z.owner === -1 ? 'them' : 'free') + (z.contested ? ' hot' : '');
      o.style.setProperty('--p', Math.abs(z.rel).toFixed(3));
      o.style.setProperty('--c', z.rel >= 0 ? 'var(--team)' : 'var(--enemy)');
    });
  }
  markers(list) {
    const box = $('markers');
    while (box.children.length < list.length) { const m = el('div', 'mk'); m.append(el('b'), el('span')); box.append(m); }
    list.forEach((m, i) => {
      const d = box.children[i];
      d.hidden = !m.show;
      if (!m.show) return;
      d.className = 'mk ' + m.cls; d.style.transform = `translate(${m.x.toFixed(0)}px, ${m.y.toFixed(0)}px)`;
      d.style.opacity = Math.hypot(m.x - innerWidth / 2, m.y - innerHeight / 2) < 70 ? 0.3 : 1; // keep the crosshair clear
      d.firstChild.textContent = m.letter; d.lastChild.textContent = m.dist + ' m';
    });
  }
  capture(text, prog, side) {
    const c = $('capture');
    c.hidden = !text;
    if (!text) return;
    $('captxt').textContent = text; $('capbar').style.width = (prog * 100).toFixed(1) + '%'; c.className = side;
  }
  tags(list) {
    const box = $('tags');
    while (box.children.length < list.length) box.append(el('div', 'tag'));
    [...box.children].forEach((d, i) => {
      const t = list[i];
      d.hidden = !t;
      if (!t) return;
      if (d.textContent !== t.name) d.textContent = t.name;
      d.style.transform = `translate(${t.x.toFixed(0)}px, ${t.y.toFixed(0)}px) translate(-50%, -100%)`;
    });
  }
  feed(killer, victim, hs, mine, killerUs, victimUs) {
    const f = $('feed'), row = el('div', 'kill' + (mine ? ' mine' : ''));
    row.append(el('span', 'k ' + (killerUs ? 'us' : 'them'), killer), el('span', 'w', hs ? 'HS' : 'AR'), el('span', 'v ' + (victimUs ? 'us' : 'them'), victim));
    f.prepend(row);
    while (f.children.length > 5) f.lastChild.remove();
    setTimeout(() => row.remove(), 7000);
  }
  banner(title, sub) {
    const key = title + '|' + (sub || '');
    if (key === this.bannerKey) return;
    this.bannerKey = key; this.lastBanner = title;
    const b = $('banner');
    b.hidden = !title;
    if (title) b.replaceChildren(el('div', 'b1', title), el('div', 'b2', sub || ''));
  }
  // rows: {name, k, d, caps, bot, me, us}; our squad first
  board(rows, show, ours, theirs) {
    const b = $('board');
    b.hidden = !show;
    if (!show) return;
    const key = JSON.stringify(rows) + ours + '|' + theirs;
    if (key === this.bk) return;
    this.bk = key;
    const parts = [];
    for (const [us, label, score] of [[true, 'Your squad', ours], [false, 'Enemy squad', theirs]]) {
      const th = el('thead'), hr = el('tr', us ? 'us' : 'them');
      hr.append(el('th', '', label), el('th', 'num', String(score)), el('th', 'num', 'CAP'), el('th', 'num', 'K'), el('th', 'num', 'D'));
      th.append(hr);
      const tb = el('tbody');
      for (const r of rows.filter((x) => x.us === us)) {
        const tr = el('tr', r.me ? 'me' : '');
        tr.append(el('td', 'name', r.name), el('td', 'tag', r.bot ? 'BOT' : ''), el('td', 'num', String(r.caps)), el('td', 'num', String(r.k)), el('td', 'num', String(r.d)));
        tb.append(tr);
      }
      parts.push(th, tb);
    }
    $('boardtable').replaceChildren(...parts);
  }
  // amount: damage taken; ang: attacker direction relative to view, radians (0 = straight ahead)
  damage(amount, ang) {
    const w = this.cv.width, h = this.cv.height, n = amount > 25 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * 1.4, k = 0.42 + Math.random() * 0.12;
      const x = w * 0.5 + Math.sin(a) * w * k, y = h * 0.5 - Math.cos(a) * h * k;
      this.splats.push({ img: this.imgs[(Math.random() * 4) | 0], x, y, s: (0.3 + Math.random() * 0.3) * Math.min(w, h) / 384 * 1.6, r: (Math.random() - 0.5) * 0.6, a: Math.min(0.85, 0.35 + amount / 55), drip: 0 });
    }
    if (this.splats.length > 10) this.splats.splice(0, this.splats.length - 10);
    this.arcs.push({ ang, a: 1 });
    this.pulse = Math.min(1, this.pulse + 0.35 + amount / 60);
    this.dirty = true;
  }
  clearBlood() { this.splats = []; this.arcs = []; this.pulse = 0; this.dirty = true; }
  update(dt, hp, dead) {
    this.hmT -= dt; if (this.hmT <= 0 && this.hm.className) this.hm.className = '';
    this.centerT -= dt; if (this.centerT <= 0) $('center').classList.remove('show');
    const low = dead ? 1 : Math.max(0, Math.min(1, (60 - hp) / 60));
    const fade = hp > 70 ? 0.4 : 0.14;
    for (const s of this.splats) { s.a -= dt * fade; s.drip += dt * 7; }
    this.splats = this.splats.filter((s) => s.a > 0.01);
    for (const a of this.arcs) a.a -= dt * 0.8;
    this.arcs = this.arcs.filter((a) => a.a > 0);
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    if (!this.dirty && !this.splats.length && !this.arcs.length && Math.abs(low - this.lowHp) < 0.01 && this.pulse === 0) return;
    this.dirty = false; this.lowHp = low;
    const g = this.g, w = this.cv.width, h = this.cv.height;
    g.clearRect(0, 0, w, h);
    const vig = Math.min(0.7, low * 0.5 + this.pulse * 0.3);
    if (vig > 0.01) {
      const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      gr.addColorStop(0, 'rgba(90,0,0,0)'); gr.addColorStop(1, `rgba(110,0,4,${vig})`);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    for (const s of this.splats) {
      g.save(); g.globalAlpha = Math.min(1, s.a); g.translate(s.x, s.y + s.drip); g.rotate(s.r); g.scale(s.s, s.s * (1 + s.drip / 400));
      g.drawImage(s.img, -192, -192); g.restore();
    }
    for (const a of this.arcs) {
      const cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.17;
      g.strokeStyle = `rgba(220,20,24,${a.a * 0.85})`; g.lineWidth = Math.max(3, rad * 0.09); g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy, rad, a.ang - Math.PI / 2 - 0.32, a.ang - Math.PI / 2 + 0.32); g.stroke();
    }
  }
}
