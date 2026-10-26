/*
 * 삼천의 운명 — 게임 진행
 * 화면 하나(캔버스) 위에 장면(타이틀·운명 뽑기·횡스크롤 무대)을 그리고, 글자가 필요한 창은 DOM으로 띄운다.
 * 마을과 던전의 각 층은 옆에서 보는 무대이고, 전투는 그 자리에서 실시간으로 벌어진다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const D = F.data;
  const E = F.engine;
  const S = F.sprites;
  const Wd = F.world;
  const X = F.fx;
  const Sp = F.spells;
  const HA = F.heroArt;
  const C = S.C;
  const J = E.J;
  const doc = root.document;
  const $ = (id) => doc.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString("ko-KR");
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const rarName = (r) => D.RARITIES[r].name;
  const famOf = (job) => F.FAMILY_LIST[job.fam];
  const jobNo = (id) => "No." + String(id).padStart(4, "0");
  const reduceMotion = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ── 저장 ── */
  const PREFIX = "fates3000:";
  const store = {
    get(key, fallback) {
      try { const raw = root.localStorage.getItem(PREFIX + key); return raw ? JSON.parse(raw) : fallback; } catch (err) { return fallback; }
    },
    set(key, value) { try { root.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (err) { /* 저장 불가 */ } },
    del(key) { try { root.localStorage.removeItem(PREFIX + key); } catch (err) { /* 저장 불가 */ } }
  };

  const G = {
    scene: null, player: null, place: "town", tokens: 0, codex: new Set(), hall: [], roll: null,
    busy: 0, t: 0
  };

  /* 저장된 직업은 번호로만 기억하고, 불러올 때 현재 데이터로 다시 연결한다 */
  function packPlayer(p) {
    const o = Object.assign({}, p);
    o.jobId = p.job.id;
    delete o.job;
    return o;
  }
  function unpackPlayer(o) {
    if (!o) return null;
    const p = Object.assign({}, o);
    p.job = F.jobById(o.jobId || (o.job && o.job.id)) || F.JOBS[0];
    return p;
  }
  function save(extra) {
    if (!G.player || G.player.hp <= 0) return;
    store.set("save", Object.assign({ player: packPlayer(G.player), place: G.place }, extra || {}));
  }
  function discover(job) {
    if (G.codex.has(job.id)) return;
    G.codex.add(job.id);
    store.set("codex", Array.from(G.codex));
  }

  /* ── 화면 ──
     타이틀·운명 뽑기는 큰 도트(배율 2)로, 횡스크롤 무대(hires)는 화면 픽셀 그대로 그리고 캐릭터를 Z배로 그린다. */
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  let VW = 360;
  let VH = 480;
  let SCALE = 1;
  let Z = 2;
  const touch = !!(root.matchMedia && root.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in root;
  const PAD_H = 196;

  function resize() {
    const pad = $("pad");
    pad.hidden = !touch;
    $("keys-hint").hidden = touch;
    const reserve = touch ? PAD_H : 34;
    const aw = Math.min(root.innerWidth, 1200);
    const ah = Math.max(320, root.innerHeight - reserve);
    if (G.scene && G.scene.hires) {
      SCALE = 1;
      VW = Math.min(1040, aw);
      VH = Math.min(680, ah);
      Z = VW >= 700 && VH >= 460 ? 2 : 1.5;
    } else {
      SCALE = Math.max(1, Math.min(Math.floor(aw / 330), Math.floor(ah / 300)));
      VW = Math.min(560, Math.floor(aw / SCALE));
      VH = Math.min(680, Math.floor(ah / SCALE));
    }
    cv.width = VW;
    cv.height = VH;
    const screen = $("screen");
    screen.style.width = VW * SCALE + "px";
    screen.style.height = VH * SCALE + "px";
    screen.style.setProperty("--s", SCALE);
    screen.classList.toggle("hires", !!(G.scene && G.scene.hires));
    doc.documentElement.classList.toggle("touch", touch);
    ctx.imageSmoothingEnabled = false;
    Sp.setZoom(Z);
  }

  /* ── 입력 ──
     방향키 이동, Space/C 점프, Z/Ctrl 공격, A S D F G 기술, Q W 물약, Enter 대화·결정, Esc/X 메뉴·취소 */
  const held = { up: false, down: false, left: false, right: false, atk: false, jump: false, run: false };
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Space: "jump", KeyC: "jump", KeyZ: "atk", ControlLeft: "atk", ControlRight: "atk", ShiftLeft: "run", ShiftRight: "run",
    KeyA: "s0", KeyS: "s1", KeyD: "s2", KeyF: "s3", KeyG: "s4", KeyQ: "hp", KeyW: "mp",
    Enter: "a", NumpadEnter: "a", Escape: "b", KeyX: "b", Backspace: "b"
  };
  /* 창이 열려 있을 때는 공격·점프 키도 '결정'으로 읽는다 */
  const WIN_KEY = { atk: "a", jump: "a", a: "a", b: "b", up: "up", down: "down", left: "left", right: "right" };
  function press(k) {
    if (winTop()) { if (WIN_KEY[k]) winKey(WIN_KEY[k]); return; }
    if (G.scene && G.scene.key) G.scene.key(k);
  }
  doc.addEventListener("keydown", (ev) => {
    const tag = (ev.target && ev.target.tagName) || "";
    const typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    const k = KEYMAP[ev.code];
    if (!k) return;
    if (typing && k !== "b" && !(k === "a" && ev.code === "Enter")) return;
    if (typing && ev.code === "Backspace") return;
    ev.preventDefault();
    if (held[k] !== undefined) {
      if (!held[k]) { held[k] = true; press(k); }
      return;
    }
    if (!ev.repeat) press(k);
  });
  doc.addEventListener("keyup", (ev) => {
    const k = KEYMAP[ev.code];
    if (k && held[k] !== undefined) held[k] = false;
  });
  root.addEventListener("blur", () => { Object.keys(held).forEach((k) => { held[k] = false; }); });

  function bindPad() {
    doc.querySelectorAll("#pad [data-k]").forEach((btn) => {
      const k = btn.dataset.k;
      const down = (ev) => {
        ev.preventDefault();
        btn.classList.add("on");
        if (held[k] !== undefined) held[k] = true;
        press(k);
      };
      const up = (ev) => {
        ev.preventDefault();
        btn.classList.remove("on");
        if (held[k] !== undefined) held[k] = false;
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("pointerleave", up);
      btn.addEventListener("contextmenu", (ev) => ev.preventDefault());
    });
  }

  /* ── 창(DOM) ── */
  const wins = [];
  function winTop() { return wins[wins.length - 1] || null; }
  /* opts: cls, onBack, onPick(el), keep(창이 닫히지 않음) */
  function openWin(html, opts) {
    const o = opts || {};
    const el = doc.createElement("div");
    el.className = "win " + (o.cls || "win-center");
    el.innerHTML = html;
    $("ui").appendChild(el);
    const w = { el, o, idx: 0 };
    wins.push(w);
    if (o.focus) {
      const i = opts2(w).findIndex((b) => b.dataset.opt === o.focus);
      if (i >= 0) w.idx = i;
    }
    el.addEventListener("click", (ev) => {
      const opt = ev.target.closest("[data-opt]");
      if (!opt || opt.disabled || !el.contains(opt)) return;
      if (winTop() !== w) return;
      w.idx = opts2(w).indexOf(opt);
      focusOpt(w);
      if (o.onPick) o.onPick(opt.dataset.opt, opt, w);
    });
    el.addEventListener("pointermove", (ev) => {
      const opt = ev.target.closest("[data-opt]");
      if (opt && !opt.disabled) { const i = opts2(w).indexOf(opt); if (i >= 0 && i !== w.idx) { w.idx = i; focusOpt(w, true); } }
    });
    focusOpt(w, true);
    return w;
  }
  function opts2(w) {
    return Array.from(w.el.querySelectorAll("[data-opt]")).filter((b) => !b.disabled && b.offsetParent !== null);
  }
  function focusOpt(w, quiet) {
    const list = opts2(w);
    w.el.querySelectorAll(".cur").forEach((b) => b.classList.remove("cur"));
    if (!list.length) return;
    w.idx = Math.max(0, Math.min(list.length - 1, w.idx));
    const b = list[w.idx];
    b.classList.add("cur");
    if (!quiet) b.scrollIntoView({ block: "nearest" });
    if (w.o.onFocus) w.o.onFocus(b.dataset.opt, b, w);
  }
  function closeWin(w) {
    const target = w || winTop();
    if (!target) return;
    const i = wins.indexOf(target);
    if (i >= 0) wins.splice(i, 1);
    target.el.remove();
    if (target.o.onClose) target.o.onClose();
  }
  function closeAll() {
    while (wins.length) { const w = wins.pop(); w.el.remove(); }
  }
  function winKey(k) {
    const w = winTop();
    if (!w) return;
    const list = opts2(w);
    const cols = w.o.cols || 1;
    if (k === "up") { w.idx = Math.max(0, w.idx - cols); focusOpt(w); }
    else if (k === "down") { w.idx = Math.min(list.length - 1, w.idx + cols); focusOpt(w); }
    else if (k === "left" && cols > 1) { w.idx = Math.max(0, w.idx - 1); focusOpt(w); }
    else if (k === "right" && cols > 1) { w.idx = Math.min(list.length - 1, w.idx + 1); focusOpt(w); }
    else if (k === "a") {
      if (w.o.onA) { w.o.onA(w); return; }
      const b = list[w.idx];
      if (b) b.click();
    } else if (k === "b") {
      if (w.o.onBack) w.o.onBack(w);
      else if (!w.o.noBack) closeWin(w);
    }
  }

  /* 대화창: 줄들을 차례로 보여 주고 끝나면 then() */
  function say(lines, then, opts) {
    const list = Array.isArray(lines) ? lines : [lines];
    let i = 0;
    const w = openWin(`<div class="say"><p class="say-text"></p><span class="say-more">▼</span></div>`, {
      cls: "win-bottom" + (opts && opts.cls ? " " + opts.cls : ""), noBack: true,
      onA: () => next()
    });
    const text = w.el.querySelector(".say-text");
    const next = () => {
      if (i >= list.length) { closeWin(w); if (then) then(); return; }
      text.innerHTML = list[i++];
    };
    w.el.addEventListener("click", () => { if (winTop() === w) next(); });
    next();
    return w;
  }

  function ask(question, choices, then) {
    const html = `<p class="ask-q">${question}</p><div class="opts">${choices.map((c, i) => `<button type="button" class="opt" data-opt="${i}">${c}</button>`).join("")}</div>`;
    const w = openWin(html, {
      cls: "win-bottom", onPick: (v) => { closeWin(w); then(Number(v)); },
      onBack: () => { closeWin(w); then(choices.length - 1); }
    });
    return w;
  }

  /* ── 화면 전환 ── */
  function fade(mid) {
    const f = $("fade");
    G.busy++;
    f.classList.add("on");
    setTimeout(() => {
      try { mid(); } finally {
        setTimeout(() => { f.classList.remove("on"); G.busy = Math.max(0, G.busy - 1); }, 60);
      }
    }, reduceMotion ? 10 : 240);
  }
  function setScene(sc, arg) {
    if (G.scene && G.scene.leave) G.scene.leave();
    const wasHires = !!(G.scene && G.scene.hires);
    G.scene = sc;
    if (wasHires !== !!sc.hires) resize();
    X.clear();
    Sp.clear();
    X.setScale(sc.hires ? 2 : 1);
    $("hud").innerHTML = "";
    $("hud").className = "";
    if (sc.enter) sc.enter(arg);
  }

  /* ── 공통 그리기 ── */
  function drawSprite(img, x, y, alpha) {
    if (!img) return;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, Math.round(x), Math.round(y));
    ctx.globalAlpha = 1;
  }
  function shadow(x, y, rx, ry, a) {
    ctx.save();
    ctx.fillStyle = `rgba(8,4,20,${a === undefined ? 0.35 : a})`;
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function portraitURL(famId) {
    return (F.PORTRAITS && F.PORTRAITS[famId]) || `assets/portraits/${famId}.webp`;
  }
  /* 창에 넣는 주인공 그림(도감·명예의 전당·결과) */
  function thumb(job) {
    return HA.url(job);
  }

  /* 별이 빛나는 밤하늘(타이틀·운명 뽑기 배경) */
  const stars = [];
  for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random() * 0.75, p: Math.random() * 6.28, s: Math.random() < 0.15 ? 2 : 1 });
  function drawSky(t) {
    const bands = ["#0b0a1a", "#100e26", "#161334", "#1d1842", "#241d4e", "#2c2358"];
    const bh = Math.ceil(VH / bands.length);
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * bh, VW, bh + 1); });
    stars.forEach((s) => {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.0015 + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(Math.round(s.x * VW), Math.round(s.y * VH), s.s, s.s);
    });
  }
  function drawHills(baseY) {
    ctx.fillStyle = "#1a1636";
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= VW; x += 8) ctx.lineTo(x, baseY - 26 - Math.round(Math.sin(x * 0.02) * 14 + Math.sin(x * 0.05) * 6));
    ctx.lineTo(VW, VH); ctx.lineTo(0, VH); ctx.fill();
    ctx.fillStyle = "#13102a";
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= VW; x += 6) ctx.lineTo(x, baseY - 10 - Math.round(Math.sin(x * 0.035 + 2) * 8));
    ctx.lineTo(VW, VH); ctx.lineTo(0, VH); ctx.fill();
  }

  /* ─────────────────────── 타이틀 ─────────────────────── */
  /* 타이틀 화면의 풀밭 한 줄(마을 지형과 같은 붓으로 칠한다) */
  let titleMap = null;
  function titleStrip() {
    if (!titleMap) titleMap = { id: "title", theme: Wd.TOWN_THEME, W: 600, H: 80, groundY: 4, seed: 11, plats: [{ x1: 0, x2: 600, y: 4, ground: true }], ropes: [], deco: [] };
    return Wd.renderMap(titleMap, 2);
  }

  const Title = {
    hires: true,
    parade: [],
    enter() {
      this.parade = [];
      for (let i = 0; i < 7; i++) this.parade.push(this.walker(i * (VW / 6)));
      this.menu();
    },
    walker(x) {
      return { job: F.JOBS[Math.floor(Math.random() * F.JOBS.length)], x: x === undefined ? -60 : x, v: 0.04 + Math.random() * 0.02 };
    },
    menu() {
      closeAll();
      const saved = store.get("save", null);
      const life = F.FAMILY_LIST.filter((f) => !f.combat).reduce((a, f) => a + f.count, 0);
      const html = `
        <div class="title-logo"><span class="logo-sub">직업 3,000종 · 무작위 운명 RPG</span><h1>삼천의 운명</h1></div>
        <div class="opts title-opts">
          <button class="opt" type="button" data-opt="new">새로운 운명${store.get("roll", null) ? ' <small>뽑던 운명 이어서</small>' : G.tokens ? ` <small>재굴림 +${G.tokens}</small>` : ""}</button>
          ${saved ? `<button class="opt" type="button" data-opt="cont">이어하기 <small>${esc(saved.player.name)} · Lv.${saved.player.level}</small></button>` : ""}
          <button class="opt" type="button" data-opt="codex">직업 도감 <small>${fmt(G.codex.size)}/${fmt(F.JOBS.length)}</small></button>
          <button class="opt" type="button" data-opt="hall">명예의 전당 <small>${G.hall.length}명</small></button>
        </div>
        <p class="title-facts">계열 36 · 생활 직업 ${fmt(life)} · 신화 등급 45</p>`;
      openWin(html, {
        cls: "win-title", noBack: true,
        onPick: (v) => {
          if (v === "new") requestNewFate();
          if (v === "cont") continueGame();
          if (v === "codex") openCodex();
          if (v === "hall") openHall();
        }
      });
    },
    update(dt) {
      this.parade.forEach((w, i) => {
        w.x += w.v * dt;
        if (w.x > VW + 60) this.parade[i] = this.walker(-60);
      });
    },
    draw(t) {
      drawSky(t);
      const ground = Math.round(VH * 0.86);
      drawHills(ground);
      ctx.drawImage(titleStrip(), 0, ground - 4);
      ctx.fillStyle = "rgba(10,8,30,0.45)";
      ctx.fillRect(0, ground, VW, VH - ground);
      const hh = Math.round(Math.min(VH * 0.17, 110));
      this.parade.forEach((w) => {
        shadow(w.x, ground + 3, hh * 0.2, hh * 0.05);
        HA.draw(ctx, w.job, w.x, ground + 4, { dir: 1, anim: "walk", t: t / 1000 + w.x * 0.01, h: hh });
      });
    }
  };

  /* ─────────────────────── 운명 뽑기 ─────────────────────── */
  function requestNewFate() {
    const pending = store.get("roll", null);
    if (pending) { startRoll(pending); return; }
    const saved = store.get("save", null);
    if (saved && saved.player) {
      const p = unpackPlayer(saved.player);
      ask(`진행 중인 모험이 있습니다. <b>${esc(p.name)}</b>(${esc(p.job.name)}, Lv.${p.level})을 은퇴시키고 새 운명을 뽑을까요?`, ["은퇴하고 새로 뽑기", "그만두기"], (i) => {
        if (i !== 0) return;
        addHall(p, null);
        store.del("save");
        G.player = null;
        startRoll(null);
      });
      return;
    }
    startRoll(null);
  }

  function startRoll(pending) {
    closeAll();
    if (pending) G.roll = { job: F.jobById(pending.jobId) || E.randomJob(), left: pending.left, name: pending.name || randomName(), rolling: false, t: 0 };
    else {
      G.roll = { job: null, left: 3 + G.tokens, name: randomName(), rolling: false, t: 0 };
      G.tokens = 0;
      store.set("tokens", 0);
    }
    setScene(Roll, !pending);
  }
  const randomName = () => D.HERO_NAMES[Math.floor(Math.random() * D.HERO_NAMES.length)];

  const Roll = {
    hires: true,
    shown: null, flick: 0, reveal: 0, circle: null,
    enter(fresh) {
      this.reveal = 0;
      this.circle = null;
      this.demo = null;
      if (fresh || !G.roll.job) this.spin();
      else { this.shown = G.roll.job; this.reveal = 1; this.panel(); this.demo = { step: 0, t: 0, fired: false }; }
    },
    spin() {
      const r = G.roll;
      r.job = E.randomJob();
      r.rolling = true;
      discover(r.job);
      store.set("roll", { jobId: r.job.id, left: r.left, name: r.name });
      closeAll();
      $("hud").innerHTML = `<div class="roll-head"><span class="roll-rar">?</span><h2 class="roll-name">운명을 읽는 중…</h2><span class="roll-fam"></span></div>`;
      this.flick = 0;
      this.spinT = reduceMotion ? 0 : 1700;
    },
    finish() {
      const r = G.roll;
      r.rolling = false;
      this.shown = r.job;
      this.reveal = 1;
      const col = S.RARITY_COLOR[r.job.rarity];
      const gx = VW / 2;
      const gy = this.groundY();
      X.holyPillar(gx, gy, r.job.rarity >= 3);
      X.burst(gx, gy - 50, { n: 30 + r.job.rarity * 10, colors: [col, C.white, C.yellow], speed: 3.4, life: 800, up: 0.5 });
      X.ring(gx, gy, col, { r1: 60, life: 700 });
      if (r.job.rarity >= 4) X.flash(col, 300);
      this.panel();
      this.demo = { step: 0, t: -0.8, fired: false };
    },
    groundY() {
      return Math.round(Math.min(VH * 0.41, 300));
    },
    head() {
      const j = this.shown;
      const fam = famOf(j);
      $("hud").innerHTML = `<div class="roll-head rar-${j.rarity}"><span class="roll-rar">${rarName(j.rarity)}</span><h2 class="roll-name">${esc(j.name)}</h2>
        <span class="roll-fam">${jobNo(j.id)} · ${esc(fam.name)} 계열${fam.combat ? "" : "(생활)"} · ${D.ELEMENTS[j.el]}</span></div>`;
    },
    panel() {
      const r = G.roll;
      const j = r.job;
      this.head();
      closeAll();
      const html = `
        <div class="roll-panel">
          ${jobCard(j, 1, null)}
          <label class="name-row" for="hero-name"><span>이름</span><input id="hero-name" maxlength="10" value="${esc(r.name)}"><button type="button" class="opt mini" data-opt="dice">무작위</button></label>
          <div class="opts row2">
            <button class="opt primary" type="button" data-opt="ok">이 운명으로 시작</button>
            <button class="opt" type="button" data-opt="re"${r.left <= 0 ? " disabled" : ""}>다시 굴리기 <small>${r.left}회</small></button>
          </div>
        </div>`;
      openWin(html, {
        cls: "win-roll", noBack: false, focus: "ok",
        onBack: () => { store.set("roll", { jobId: r.job.id, left: r.left, name: $("hero-name").value }); closeAll(); setScene(Title); },
        onPick: (v) => {
          if (v === "dice") { $("hero-name").value = randomName(); return; }
          if (v === "re" && r.left > 0) { r.left--; r.name = $("hero-name").value; this.spin(); return; }
          if (v === "ok") this.accept();
        }
      });
    },
    accept() {
      const r = G.roll;
      const name = ($("hero-name").value || "").trim().slice(0, 10) || randomName();
      G.player = E.newPlayer(r.job, name);
      G.roll = null;
      store.del("roll");
      G.place = "town";
      save();
      closeAll();
      fade(() => {
        setScene(Stage, { floor: 0 });
        say([`<b>${esc(name)}</b>의 운명은 <b class="rar-t-${G.player.job.rarity}">${esc(G.player.job.name)}</b>.`,
          `마을 오른쪽 동굴 아래가 던전이다. 건물 문 앞에서 ${touch ? "▲" : "↑"}를 누르면 들어간다. 상점에서는 물약과 장비를, 여관에서는 휴식을, 길드에서는 직업 도감과 조작 안내를 볼 수 있다.`]);
      });
    },
    /* ── 캐릭터 시트: 뽑힌 직업이 대기·걷기·점프·착지·기본 공격·기술·궁극기를 차례로 보여 준다 ── */
    DEMO: [["idle", "대기", 1.2], ["walk", "걷기", 1.2], ["run", "달리기", 0.7], ["jump", "점프", 0.8], ["land", "착지", 0.4], ["attack", "기본 공격", 1.1], ["skill", "기술", 1.6], ["ult", "궁극기", 3.2]],
    heroH() {
      return Math.round(Math.min(VH * 0.27, 180, VW * 0.4));
    },
    demoSpot() {
      const reach = reachOf(this.shown);
      const gy = this.groundY();
      const dx = Math.round(VW * 0.7);
      const hh = this.heroH();
      const hx = reach.far ? Math.round(VW * 0.32) : Math.round(dx - hh * 0.8);
      return { reach, gy, dx, hx, start: hx - 96 * Z, mid: hx - 48 * Z };
    },
    /* 무대의 기술·궁극기 연출 코드를 가짜 무대(허수아비 하나)로 그대로 쓴다 */
    demoStage() {
      const sp = this.demoSpot();
      const job = this.shown;
      const dummy = { x: sp.dx / Z, y: sp.gy / Z, h: 30, w: 30, fly: false, dead: false, mon: { hp: 1 } };
      const fake = {
        hero: { x: sp.hx / Z, y: sp.gy / Z, dir: 1, casting: false, inv: 0, atk: null },
        reach: sp.reach, quake: 0, dim: 0, flash: null,
        pickTargets: () => [dummy],
        applySkill: () => { this.hitT = 0.2; },
        groundFx: Stage.groundFx
      };
      return { fake, dummy, job };
    },
    demoFire(step) {
      const { fake, dummy, job } = this.demoStage();
      const lvP = { level: 10, job, weaponLv: 0, armorLv: 0 };
      const sp = this.demoSpot();
      const hand = [sp.hx + 16 * Z, sp.gy - 24 * Z];
      const target = [sp.dx, sp.gy - 15 * Z];
      if (step === "land") Sp.dust(sp.hx, sp.gy, 0, 6);
      if (step === "attack") {
        const a = job.attack;
        if (!sp.reach.far) { Sp.slash(sp.hx + 22 * Z, sp.gy - 22 * Z, 1, a.el, false, false); X.sleep(120).then(() => { this.hitT = 0.15; }); }
        else Sp.shot(hand, target, a.el, sp.reach.shot).then(() => { this.hitT = 0.15; });
      }
      if (step === "skill") {
        const sk = this.demoSkill();
        const plan = E.skillPlan(lvP, sk, sp.reach.far);
        if (!plan.self) Stage.skillVisual.call(fake, sk, plan, [dummy]).then(() => { this.hitT = 0.2; });
        else {
          /* 공격 기술이 없는 직업은 자기 강화 연출을 보여 준다 */
          const el = sk.el === "phys" ? "light" : sk.el;
          if (plan.heal || plan.regen) Sp.heal(sp.hx, sp.gy);
          else if (plan.shield) Sp.shieldBubble(sp.hx, sp.gy - 22 * Z, 26 * Z);
          else Sp.aura(sp.hx, sp.gy, el);
        }
      }
      if (step === "ult") {
        const sk = job.skills[4];
        const plan = E.skillPlan(lvP, sk, sp.reach.far);
        this.demoFake = fake;
        Stage.castUlt.call(fake, sk, plan);
      }
    },
    /* 시트에 보여 줄 기술: 앞쪽 네 기술 가운데 첫 공격 기술(없으면 첫 기술) */
    demoSkill() {
      const job = this.shown;
      const lvP = { level: 10, job, weaponLv: 0, armorLv: 0 };
      return job.skills.slice(0, 4).find((sk) => !E.skillPlan(lvP, sk, false).self) || job.skills[0];
    },
    demoUpdate(dt) {
      const d = this.demo;
      if (!d || !this.shown || (G.roll && G.roll.rolling)) return;
      d.t += dt / 1000;
      if (d.t < 0) return;
      if (!d.fired) { d.fired = true; this.demoFire(this.DEMO[d.step][0]); }
      if (d.t >= this.DEMO[d.step][2]) { d.step = (d.step + 1) % this.DEMO.length; d.t = 0; d.fired = false; }
      this.hitT = Math.max(0, (this.hitT || 0) - dt / 1000);
      if (this.demoFake && this.demoFake.flash) this.demoFake.flash.t -= dt / 1000;
    },
    demoPose() {
      const d = this.demo;
      const sp = this.demoSpot();
      if (!d || d.t < 0) return { x: sp.hx, y: sp.gy, anim: "idle", t: 0, f: 0 };
      const k = d.t / this.DEMO[d.step][2];
      const caster = sp.reach.caster;
      switch (this.DEMO[d.step][0]) {
        case "idle": return { x: sp.start, y: sp.gy, anim: "idle", t: d.t, f: 0 };
        case "walk": return { x: sp.start + (sp.mid - sp.start) * k, y: sp.gy, anim: "walk", t: d.t, f: 0 };
        case "run": return { x: sp.mid + (sp.hx - sp.mid) * Math.min(1, k * 1.15), y: sp.gy, anim: k < 0.87 ? "run" : "idle", t: d.t, f: 0 };
        case "jump": return { x: sp.hx, y: sp.gy - Math.sin(Math.PI * k) * 60 * Z, anim: k < 0.5 ? "jump" : "fall", t: d.t, f: 0 };
        case "land": return { x: sp.hx, y: sp.gy, anim: k < 0.6 ? "land" : "idle", t: d.t, f: 0 };
        case "attack": case "skill": {
          const s = d.t;
          if (caster) return { x: sp.hx, y: sp.gy, anim: s < 0.6 ? "cast" : "idle", t: s, f: s < 0.16 ? 0 : 1 };
          return { x: sp.hx, y: sp.gy, anim: s < 0.13 ? "windup" : s < 0.26 ? "strike" : s < 0.45 ? "follow" : "idle", t: s, f: 0 };
        }
        default: return { x: sp.hx, y: sp.gy, anim: d.t < 2.2 ? "cast" : "idle", t: d.t, f: d.t < 0.6 ? 0 : 1 };
      }
    },
    update(dt) {
      const r = G.roll || {};
      this.demoUpdate(dt);
      if (r.rolling) {
        this.spinT -= dt;
        this.flick -= dt;
        if (this.flick <= 0) {
          const j = F.JOBS[Math.floor(Math.random() * F.JOBS.length)];
          this.shown = j;
          const el = doc.querySelector(".roll-name");
          if (el) el.textContent = j.name;
          const rar = doc.querySelector(".roll-head");
          if (rar) rar.className = `roll-head rar-${j.rarity} spinning`;
          this.flick = 40 + (1 - Math.max(0, this.spinT) / 1700) * 180;
        }
        if (this.spinT <= 0) this.finish();
      }
      if (!this.circle || this.circle.age > this.circle.life - 50) {
        const j = this.shown;
        this.circle = X.magicCircle(VW / 2, this.groundY(), j ? S.RARITY_COLOR[j.rarity] : C.lblue, 4000);
        this.circle.age = 800;
      }
      if (this.shown && !r.rolling && Math.random() < 0.08 * (1 + this.shown.rarity)) {
        X.add({ x: VW / 2 + (Math.random() - 0.5) * 50, y: this.groundY() - Math.random() * 10, vy: -0.4 - Math.random() * 0.6, life: 900, color: S.RARITY_COLOR[this.shown.rarity], size: 1, glow: 0.7, shape: Math.random() < 0.3 ? "star" : null });
      }
    },
    draw(t) {
      drawSky(t);
      const gy = this.groundY();
      ctx.fillStyle = "#120f28";
      ctx.fillRect(0, gy + 10, VW, VH - gy);
      const tab = Wd.fateTablet(Math.floor(t / 300) % 3, 4);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(tab, Math.round(VW / 2 - tab.width / 2), Math.round(gy - tab.height + 10));
      ctx.restore();
      if (this.shown) {
        const rolling = G.roll && G.roll.rolling;
        const hh = this.heroH();
        if (rolling || !this.demo) {
          shadow(VW / 2, gy + 2, hh * 0.22, hh * 0.05, 0.5);
          HA.draw(ctx, this.shown, VW / 2, gy + 4, { dir: 1, anim: "idle", t: t / 1000, h: hh, alpha: rolling ? 0.8 : 1 });
        } else {
          const sp = this.demoSpot();
          /* 허수아비 */
          const dum = S.monsterBig("슬라임", Z >= 2 ? 3 : 2);
          shadow(sp.dx, gy + 2, dum.width * 0.3, 4 * Z, 0.4);
          drawSprite(dum, sp.dx - dum.width / 2, gy + 4 - dum.height, 1);
          if (this.hitT > 0) drawSprite(S.silhouette(dum, "#ffffff"), sp.dx - dum.width / 2, gy + 4 - dum.height, Math.min(1, this.hitT * 6));
          const pose = this.demoPose();
          shadow(pose.x, gy + 2, hh * 0.2, hh * 0.05, 0.5);
          HA.draw(ctx, this.shown, pose.x, pose.y + 4, { dir: 1, anim: pose.anim, t: pose.t, f: pose.f, h: hh });
          Sp.draw(ctx);
          Sp.drawNumbers(ctx);
          const fk = this.demoFake;
          if (fk && fk.flash && fk.flash.t > 0) { ctx.globalAlpha = Math.min(0.22, fk.flash.t * 1.2); ctx.fillStyle = fk.flash.col; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
          /* 지금 보여 주는 동작 이름: 땅과 정보 창 사이 띠에 쓴다 */
          const d = this.demo;
          const job = this.shown;
          const key = this.DEMO[d.step][0];
          const label = key === "attack" ? `기본 공격 · ${job.attack.name}` : key === "skill" ? `기술 · ${this.demoSkill().name}` : key === "ult" ? `궁극기 · ${job.skills[4].name}` : this.DEMO[d.step][1];
          const winTop = VH * 0.46 - 6;
          const fs = Math.round(Math.max(12, Math.min(18, (winTop - gy) * 0.62)));
          ctx.save();
          ctx.font = `700 ${fs}px Galmuri11, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 4;
          ctx.strokeStyle = "#0b0918";
          const ly = Math.round((gy + 6 + winTop) / 2);
          ctx.strokeText(label, VW / 2, ly);
          ctx.fillStyle = key === "ult" ? "#ffd75e" : "#e8e4ff";
          ctx.fillText(label, VW / 2, ly);
          ctx.restore();
        }
      }
    }
  };

  /* 직업 카드(운명 뽑기·도감·상태창 공용) */
  function jobCard(job, level, player) {
    const fam = famOf(job);
    const s = E.statsAt(job, level);
    const max = Math.max.apply(null, D.STATS.map((k) => s[k]));
    const ctxP = player || { level, job };
    const stats = D.STATS.map((k) => `<div class="st${k === job.atkStat ? " top" : ""}"><span>${D.STAT_NAMES[k]}</span><i><b style="width:${Math.round((s[k] / max) * 100)}%"></b></i><em>${s[k]}</em></div>`).join("");
    const passives = E.passiveLines(job.passive).map((t) => `<li>${esc(t)}</li>`).join("");
    const TAG = { family: "계열", sig: "대표", mod: "기원", true: "각성", ult: "궁극기" };
    const NODMG = new Set(["heal", "regen", "buff", "rage", "shield", "counter", "summon"]);
    const skills = job.skills.map((sk) => {
      const spec = E.skillSpec(ctxP, sk);
      const cost = sk.type === "sacrifice" ? "HP" : `MP ${spec.cost}`;
      const locked = player && player.level < sk.lv;
      return `<li class="${locked ? "lock" : ""}"><b>${esc(sk.name)}</b><span class="sk-tag">${TAG[sk.tag]} · Lv.${sk.lv} · ${cost}${NODMG.has(sk.type) ? "" : " · " + D.ELEMENTS[sk.el]}</span><p>${E.describeSkill(sk, ctxP)}</p></li>`;
    }).join("");
    return `<div class="card">
      <div class="card-top">
        <div class="card-art"><img src="${portraitURL(fam.id)}" alt="${esc(fam.name)} 계열 초상화" onerror="this.style.visibility='hidden'"><img class="card-doll" src="${thumb(job)}" alt=""></div>
        <ul class="card-lines">
          <li><b>본업</b> ${esc(job.base)} · ${esc(job.desc)}</li>
          <li><b>기원</b> ${job.mod ? `${esc(job.mod)} · ${esc(job.modDesc)}` : "수식어 없는 정통 직업 (능력치 +5%)"}</li>
          <li><b>계열</b> ${esc(fam.name)} · ${esc(fam.desc)}</li>
        </ul>
      </div>
      <h3>능력치 Lv.${level}</h3><div class="stats">${stats}</div>
      <h3>특성</h3><ul class="passives">${passives}</ul>
      <h3>기술</h3><ul class="skills"><li><b>${esc(job.attack.name)}</b><span class="sk-tag">기본 공격 · ${D.ELEMENTS[job.attack.el]}</span><p>위력 100% 공격, MP 조금 회복</p></li>${skills}</ul>
    </div>`;
  }

  /* ─────────────────────── 마을 ─────────────────────── */
  function npcTalk(npc, hero) {
    const j = npc.job;
    discover(j);
    npc.dir = hero.x < npc.x ? -1 : 1;
    npc.moving = false;
    npc.walk = 2;
    const lines = [
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b> (${rarName(j.rarity)})<br>"나는 ${esc(j.desc)}(이)야. ${J(G.player.job.name, "이/가")} 됐다니, 너도 운명을 받았구나."`,
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b><br>"내 기술은 <b>${esc(j.skills[1].name)}</b>! ${E.describeSkill(j.skills[1], { level: 1, job: j })}."`,
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b><br>"던전은 10층마다 보스가 계단을 봉인하고 있대. 물약은 넉넉히 챙겨."`
    ];
    say(lines[Math.floor(Math.random() * lines.length)] + `<br><small>(직업 도감에 기록됨)</small>`);
  }

  function tabletTalk() {
    const p = G.player;
    say([`운명의 석판이 빛난다…<br>"<b>${esc(p.name)}</b>, 그대의 운명은 <b class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</b>."`, `지금까지 만난 직업 <b>${fmt(G.codex.size)}</b> / 3,000. 최고 기록 지하 <b>${p.best}</b>층.`]);
  }

  function innTalk(then) {
    const p = G.player;
    const price = E.prices(p).inn;
    ask(`<b>여관</b> "어서 오세요! ${price ? `하룻밤에 <b>${fmt(price)}G</b>입니다.` : "단골손님은 공짜예요!"}"`, ["묵는다", "그만둔다"], (i) => {
      if (i !== 0) return;
      const res = E.rest(p);
      if (!res.ok) { say(res.msg); return; }
      fade(() => { save(); if (then) then(); say(res.msg); });
    });
  }

  function guildMenu() {
    const w = openWin(`<h2 class="win-h">모험가 길드</h2><div class="opts">
      <button class="opt" type="button" data-opt="codex">직업 도감 <small>${fmt(G.codex.size)}/3,000</small></button>
      <button class="opt" type="button" data-opt="hall">명예의 전당</button>
      <button class="opt" type="button" data-opt="help">조작 안내</button>
      <button class="opt" type="button" data-opt="close">나가기</button></div>`, {
      onPick: (v) => { if (v === "close") closeWin(w); if (v === "codex") openCodex(); if (v === "hall") openHall(); if (v === "help") openHelp(); }
    });
  }

  function openHelp() {
    const rows = touch
      ? [["◀ ▶", "이동"], ["▲ ▼", "밧줄 오르내리기 · 문·계단 들어가기"], ["점프", "점프 (▼ 누른 채면 발판 아래로)"], ["공격", "기본 공격 (누르고 있으면 연속)"], ["기술 버튼", "기술 5개 (Lv.1·1·4·7·10에 배움)"], ["HP · MP", "물약"]]
      : [["← →", "이동"], ["↑ ↓", "밧줄 오르내리기 · 문·계단 들어가기"], ["Space · C", "점프 (↓와 함께 누르면 발판 아래로)"], ["Z · Ctrl", "기본 공격 (누르고 있으면 연속)"], ["A S D F G", "기술 5개 (Lv.1·1·4·7·10에 배움)"], ["Q · W", "회복 물약 · 마나 물약"], ["Esc · X", "메뉴"]];
    openWin(`<h2 class="win-h">조작 안내</h2><dl class="sheet help">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      <p class="win-msg">몬스터에 부딪히면 피해를 입는다. 10층마다 보스가 아래로 가는 계단을 봉인한다. 쓰러지면 그 운명은 끝난다.</p>
      <div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, { onPick: (v, b, w) => { if (v === "close") closeWin(w); } });
  }

  function banner(text) {
    const el = doc.createElement("div");
    el.className = "banner";
    el.textContent = text;
    $("screen").appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  /* ─────────────────────── 메뉴·상점·상태 ─────────────────────── */
  function openMenu() {
    const p = G.player;
    const inDungeon = G.place === "dungeon";
    const w = openWin(`<h2 class="win-h">메뉴</h2><div class="opts">
      <button class="opt" type="button" data-opt="status">상태</button>
      <button class="opt" type="button" data-opt="items">도구 <small>HP ${p.potions.hp} · MP ${p.potions.mp}</small></button>
      <button class="opt" type="button" data-opt="codex">직업 도감</button>
      ${inDungeon ? '<button class="opt" type="button" data-opt="town">마을로 귀환</button>' : ""}
      <button class="opt" type="button" data-opt="help">조작 안내</button>
      <button class="opt" type="button" data-opt="title">저장하고 타이틀로</button>
      <button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-menu",
      onPick: (v) => {
        if (v === "close") closeWin(w);
        if (v === "status") openStatus();
        if (v === "items") openItems();
        if (v === "codex") openCodex();
        if (v === "help") openHelp();
        if (v === "town") {
          ask("마을로 돌아갈까? 다음에는 지하 " + p.floor + "층부터 다시 시작한다.", ["돌아간다", "그만둔다"], (i) => {
            if (i !== 0) return;
            closeAll();
            fade(() => setScene(Stage, { floor: 0, x: 862, keep: true }));
          });
        }
        if (v === "title") { save(); closeAll(); fade(() => setScene(Title)); }
      }
    });
  }

  function openStatus() {
    const p = G.player;
    const d = E.derive(p);
    const cells = [["HP", `${fmt(p.hp)}/${fmt(d.maxHp)}`], ["MP", `${fmt(p.mp)}/${fmt(d.maxMp)}`], ["공격력", fmt(E.power(p, d, p.job.atkStat))], ["방어력", fmt(d.def)],
      ["치명타", `${Math.round(d.crit * 100)}%`], ["회피", `${Math.round(d.eva * 100)}%`], ["무기", `+${p.weaponLv}`], ["방어구", `+${p.armorLv}`],
      ["경험치", `${fmt(p.exp)}/${fmt(E.expNeed(p.level))}`], ["골드", fmt(p.gold)], ["최고 층", p.best], ["처치", fmt(p.kills)]];
    openWin(`<h2 class="win-h">${esc(p.name)} <small>Lv.${p.level} · <span class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</span></small></h2>
      <div class="scroll"><dl class="sheet">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>${jobCard(p.job, p.level, p)}</div>
      <div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full", onPick: (v, b, w) => { if (v === "close") closeWin(w); }
    });
  }

  function openItems() {
    const p = G.player;
    const pot = 1 + (p.job.passive.pot || 0);
    const w = openWin(`<h2 class="win-h">도구</h2><div class="opts">
      <button class="opt" type="button" data-opt="hp"${p.potions.hp ? "" : " disabled"}><img src="${S.icon("potion", 2)}" alt="">회복 물약 <small>${p.potions.hp}개 · HP ${Math.round(40 * pot)}%</small></button>
      <button class="opt" type="button" data-opt="mp"${p.potions.mp ? "" : " disabled"}><img src="${S.icon("ether", 2)}" alt="">마나 물약 <small>${p.potions.mp}개 · MP ${Math.round(50 * pot)}%</small></button>
      <button class="opt" type="button" data-opt="close">닫기</button></div><p class="win-msg" role="status"></p>`, {
      onPick: (v) => {
        if (v === "close") { closeWin(w); return; }
        const res = E.drink(p, v);
        if (G.scene === Stage) Stage.refresh();
        save();
        closeWin(w);
        openItems();
        winTop().el.querySelector(".win-msg").textContent = res.msg;
      }
    });
  }

  function openShop(onDone) {
    const p = G.player;
    const pr = E.prices(p);
    const pot = 1 + (p.job.passive.pot || 0);
    const row = (key, icon, name, note) => `<button class="opt shop-row" type="button" data-opt="${key}"${p.gold >= pr[key] ? "" : " disabled"}><img src="${S.icon(icon, 2)}" alt=""><span><b>${name}</b><small>${note}</small></span><em>${fmt(pr[key])}G</em></button>`;
    const w = openWin(`<h2 class="win-h">상점 <small>보유 ${fmt(p.gold)}G${p.job.passive.disc ? ` · 할인 ${Math.round(Math.min(0.5, p.job.passive.disc) * 100)}%` : ""}</small></h2>
      <div class="opts scroll">
        ${row("hp", "potion", "회복 물약", `HP ${Math.round(40 * pot)}% 회복 · 보유 ${p.potions.hp}`)}
        ${row("mp", "ether", "마나 물약", `MP ${Math.round(50 * pot)}% 회복 · 보유 ${p.potions.mp}`)}
        ${row("weapon", "sword", `무기 강화 +${p.weaponLv}→+${p.weaponLv + 1}`, "공격력 +6%, 추가 피해 +3")}
        ${row("armor", "shield", `방어구 강화 +${p.armorLv}→+${p.armorLv + 1}`, "최대 HP +4%, 방어력 +3")}
        ${row("scroll", "scroll", "전직의 두루마리", "레벨·장비는 그대로, 직업만 3,000개 중 무작위로")}
        <button class="opt" type="button" data-opt="close">나가기</button>
      </div><p class="win-msg" role="status"></p>`, {
      cls: "win-shop",
      onClose: onDone,
      onPick: (v) => {
        if (v === "close") { closeWin(w); return; }
        if (v === "scroll") {
          ask(`<b>${esc(p.job.name)}</b>의 운명을 버리고 새 직업을 무작위로 받을까? 되돌릴 수 없다.`, ["두루마리를 읽는다", "그만둔다"], (i) => {
            if (i !== 0) return;
            const res = E.buy(p, "scroll");
            if (!res.ok) { say(res.msg); return; }
            discover(res.job);
            save();
            if (G.scene === Stage) Stage.refresh();
            closeAll();
            if (G.scene === Stage) Stage.jobChanged();
            say([`두루마리가 빛나며 운명이 다시 쓰였다!`, `새 직업: <b class="rar-t-${res.job.rarity}">${rarName(res.job.rarity)} ${esc(res.job.name)}</b>`], () => { if (onDone) onDone(); });
          });
          return;
        }
        const res = E.buy(p, v);
        save();
        if (G.scene === Stage) Stage.refresh();
        const keep = w.idx;
        w.o.onClose = null;
        closeWin(w);
        openShop(onDone);
        const nw = winTop();
        nw.idx = keep;
        focusOpt(nw);
        const msg = nw.el.querySelector(".win-msg");
        msg.textContent = res.msg;
        msg.classList.toggle("bad", !res.ok);
      }
    });
  }

  /* ─────────────────────── 도감·명예의 전당 ─────────────────────── */
  function openCodex() {
    let limit = 60;
    const w = openWin(`<h2 class="win-h">직업 도감 <small>만난 직업 ${fmt(G.codex.size)} / 3,000</small></h2>
      <div class="cx-filters">
        <input id="cx-q" type="search" placeholder="직업·기술 이름" aria-label="직업 검색">
        <select id="cx-fam" aria-label="계열"><option value="all">모든 계열</option><option value="combat">전투 계열</option><option value="life">생활 계열</option>
          ${F.FAMILY_LIST.map((f) => `<option value="${f.idx}">${esc(f.name)} · ${f.count}</option>`).join("")}</select>
        <select id="cx-rar" aria-label="등급"><option value="all">모든 등급</option>${D.RARITIES.map((r, i) => `<option value="${i}">${r.name} · ${r.count}</option>`).join("")}</select>
        <label class="cx-found"><input type="checkbox" id="cx-found"> 만난 직업만</label>
      </div>
      <p class="cx-count" id="cx-count"></p>
      <div class="opts scroll cx-list" id="cx-list"></div>
      <div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full",
      onPick: (v, b) => {
        if (v === "close") { closeWin(w); return; }
        if (v === "more") { limit += 90; render(); return; }
        if (v.startsWith("job")) openJob(F.jobById(Number(v.slice(3))));
      }
    });
    const render = () => {
      const q = $("cx-q").value.trim();
      const fam = $("cx-fam").value;
      const rar = $("cx-rar").value;
      const found = $("cx-found").checked;
      const list = F.JOBS.filter((j) => {
        const f = famOf(j);
        if (fam === "combat" && !f.combat) return false;
        if (fam === "life" && f.combat) return false;
        if (!["all", "combat", "life"].includes(fam) && String(j.fam) !== fam) return false;
        if (rar !== "all" && String(j.rarity) !== rar) return false;
        if (found && !G.codex.has(j.id)) return false;
        if (q && !j.name.includes(q) && !j.skills.some((s) => s.name.includes(q))) return false;
        return true;
      });
      $("cx-count").textContent = `${fmt(list.length)}개 직업`;
      $("cx-list").innerHTML = list.slice(0, limit).map((j) => `<button class="opt cx-row${G.codex.has(j.id) ? "" : " unseen"}" type="button" data-opt="job${j.id}">
        <img src="${thumb(j)}" alt=""><span><b class="rar-t-${j.rarity}">${esc(j.name)}</b><small>${jobNo(j.id)} · ${esc(famOf(j).name)} · ${rarName(j.rarity)}</small></span>${G.codex.has(j.id) ? "<em>만남</em>" : ""}</button>`).join("")
        + (list.length > limit ? `<button class="opt" type="button" data-opt="more">더 보기 (${fmt(list.length - limit)}개 남음)</button>` : "");
      w.idx = 0;
    };
    let timer = null;
    $("cx-q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { limit = 60; render(); }, 160); });
    ["cx-fam", "cx-rar", "cx-found"].forEach((id) => $(id).addEventListener("change", () => { limit = 60; render(); }));
    render();
  }

  function openJob(job) {
    openWin(`<h2 class="win-h"><span class="rar-t-${job.rarity}">${esc(job.name)}</span> <small>${jobNo(job.id)} · ${rarName(job.rarity)}${G.codex.has(job.id) ? " · 만남" : ""}</small></h2>
      <div class="scroll">${jobCard(job, 1, null)}</div><div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full", onPick: (v, b, w) => { if (v === "close") closeWin(w); }
    });
  }

  function addHall(p, cause) {
    G.hall.push({ name: p.name, job: p.job.name, jobId: p.job.id, rarity: p.job.rarity, fam: p.job.fam, level: p.level, best: p.best, kills: p.kills, cause, date: Date.now() });
    G.hall.sort((a, b) => b.best - a.best || b.level - a.level || a.date - b.date);
    G.hall = G.hall.slice(0, 50);
    store.set("hall", G.hall);
  }

  function openHall() {
    const rows = G.hall.length ? G.hall.map((h, i) => {
      const job = F.jobById(h.jobId);
      return `<div class="hall-row"><span class="hall-rank">${i + 1}</span>${job ? `<img src="${thumb(job)}" alt="">` : ""}<span><b>${esc(h.name)}</b><small><span class="rar-t-${h.rarity}">${rarName(h.rarity)} ${esc(h.job)}</span> · Lv.${h.level} · ${h.cause ? esc(J(h.cause, "에게")) + " 쓰러짐" : "은퇴"}</small></span><em>${h.best}층</em></div>`;
    }).join("") : `<p class="empty">아직 기록이 없습니다. 첫 운명을 뽑아 던전에 들어가 보세요.</p>`;
    openWin(`<h2 class="win-h">명예의 전당</h2><div class="scroll hall">${rows}</div><div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full", onPick: (v, b, w) => { if (v === "close") closeWin(w); }
    });
  }

  /* ─────────────────────── 횡스크롤 무대(마을·던전 각 층) ─────────────────────── */
  /* 거리·속도는 기본 단위(주인공 키 ≈ 44), 화면에는 Z배로 그린다 */
  const GRAV = 900;
  const CLIMB = 58;
  const MAX_FALL = 430;
  /* 주인공의 움직임(참고: 마법사의 밤): 걷다가 방향키를 계속 누르거나 Shift를 누르면 달리고,
     점프는 몬스터보다 가벼운 중력으로 조금 더 오래 떠 있다 */
  const WALK = 64;
  const RUN = 104;
  const RUN_AFTER = 0.45;
  const HERO_GRAV = 520;
  const HERO_FALL = 360;
  const JUMP_V = 206;
  const HERO_HALF = 7;
  const HERO_H = 40;
  const ATK_TIME = 0.42;
  const ATK_HIT = 0.13;
  const FLYERS = new Set(["bat", "harpy", "dragon", "ghost", "wisp", "bird", "eye"]);
  const SHOOTERS = new Set(["witch", "wisp", "eye", "caped"]);
  const MON_SPEED = {
    slime: 26, goblin: 40, rat: 50, beast: 58, boar: 62, bat: 46, mushroom: 22, skeleton: 36, bandit: 40, brute: 32, spider: 44, zombie: 22,
    harpy: 44, lizard: 40, wisp: 34, ghost: 30, gargoyle: 34, dragon: 48, caped: 34, golem: 22, serpent: 30, knight: 34, witch: 30, eye: 28, bird: 50
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* 캐릭터 그림에 맞춘 싸움 방식: 근접은 베기, 활·총·던지기는 날아가는 것, 마법은 속성 주문 */
  function reachOf(job) {
    const style = F.heroes.styleOf(job);
    return { style, shot: style.shot || "orb", caster: style.reach === "magic", far: style.reach !== "melee" };
  }

  /* 스프라이트의 불투명한 범위(발 위치와 몸통 크기를 정하는 데 쓴다) */
  const boundsCache = new WeakMap();
  function bounds(img) {
    let b = boundsCache.get(img);
    if (b) return b;
    const d = img.getContext("2d").getImageData(0, 0, img.width, img.height).data;
    let x0 = img.width;
    let y0 = img.height;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      if (d[(y * img.width + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    b = { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    boundsCache.set(img, b);
    return b;
  }

  /* 기술 아이콘: 속성 색 바탕에 기술 종류 그림 */
  const ICON_GLYPH = {
    slash: ["000000000110", "000000001110", "000000011100", "000000111000", "000001110000", "010011100000", "011111000000", "001110000000", "011111000000", "111001100000", "110000000000", "000000000000"],
    multi: ["000000000000", "100100100000", "110110110000", "011011011000", "001101101100", "000110110110", "000011011011", "000001101101", "000000110110", "000000010010", "000000000000", "000000000000"],
    arrow: ["000000000000", "000000001111", "000000000111", "000000001011", "000000010001", "000000100000", "000001000000", "000010000000", "010100000000", "001000000000", "010100000000", "000000000000"],
    drop: ["000001000000", "000011100000", "000011100000", "000111110000", "000111110000", "001111111000", "001111011000", "011111011100", "011111011100", "001111111000", "000111110000", "000000000000"],
    star: ["000001100000", "000001100000", "000011110000", "111111111111", "011111111110", "001111111100", "000111111000", "001111111100", "001110011100", "011000000110", "010000000010", "000000000000"],
    cross: ["000011110000", "000011110000", "000011110000", "000011110000", "111111111111", "111111111111", "111111111111", "111111111111", "000011110000", "000011110000", "000011110000", "000011110000"],
    up: ["000001100000", "000011110000", "000111111000", "001111111100", "011111111110", "000011110000", "000011110000", "000011110000", "000011110000", "000011110000", "000011110000", "000000000000"],
    down: ["000011110000", "000011110000", "000011110000", "000011110000", "000011110000", "000011110000", "011111111110", "001111111100", "000111111000", "000011110000", "000001100000", "000000000000"],
    shield: ["011111111110", "111111111111", "111111111111", "111111111111", "111111111111", "111111111111", "011111111110", "011111111110", "001111111100", "000111111000", "000011110000", "000001100000"],
    heart: ["000000000000", "011100011100", "111110111110", "111111111111", "111111111111", "111111111111", "011111111110", "001111111100", "000111111000", "000011110000", "000001100000", "000000000000"],
    eye: ["000000000000", "000000000000", "000111111000", "001100001100", "011001100110", "110011110011", "110011110011", "011001100110", "001100001100", "000111111000", "000000000000", "000000000000"],
    burst: ["100001100001", "010001100010", "001001100100", "000101101000", "000011110000", "111111111111", "111111111111", "000011110000", "000101101000", "001001100100", "010001100010", "100001100001"]
  };
  const TYPE_ICON = {
    strike: "slash", crit: "slash", execute: "slash", gold: "slash", gamble: "star", sacrifice: "burst", multi: "multi", pierce: "arrow",
    burn: "drop", poison: "drop", bleed: "drop", curse: "eye", stun: "star", freeze: "star", drain: "heart", mana: "heart", evade: "multi",
    debuff: "down", charm: "eye", nuke: "burst", heal: "cross", regen: "cross", buff: "up", rage: "up", counter: "shield", shield: "shield", summon: "eye"
  };
  const iconCache = new Map();
  function skillIcon(sk) {
    const key = sk.type + sk.el + sk.tag;
    if (iconCache.has(key)) return iconCache.get(key);
    const c = Sp.PAL[sk.el] || Sp.PAL.arcane;
    const cvs = S.makeCanvas(32, 32);
    const g = cvs.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 0, 32);
    bg.addColorStop(0, c[2]);
    bg.addColorStop(1, c[3]);
    g.fillStyle = "#0b0918";
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = bg;
    g.fillRect(2, 2, 28, 28);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(2, 2, 28, 2);
    const glyph = ICON_GLYPH[sk.tag === "ult" ? "burst" : TYPE_ICON[sk.type] || "slash"];
    const paint = (ox, oy, col) => {
      g.fillStyle = col;
      glyph.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "1") g.fillRect(4 + ox + x * 2, 4 + oy + y * 2, 2, 2); });
    };
    paint(1, 1, "rgba(0,0,0,0.55)");
    paint(0, 0, c[0]);
    if (sk.tag === "ult") { g.strokeStyle = "#ffd75e"; g.lineWidth = 2; g.strokeRect(1, 1, 30, 30); }
    const url = cvs.toDataURL();
    iconCache.set(key, url);
    return url;
  }

  const Stage = {
    hires: true,
    map: null, hero: null, mons: [], npcs: [], drops: [], shots: [], summons: [], ambient: [],
    enter(arg) {
      const p = G.player;
      const a = arg || {};
      this.floor = a.floor || 0;
      this.map = this.floor ? Wd.makeFloor(this.floor) : Wd.makeTown();
      const prevBest = p.best;
      if (this.floor) {
        E.enterFloor(p, this.floor);
        G.place = "dungeon";
        if (p.best > prevBest && p.best > 1 && p.best % 10 === 1) {
          G.tokens = Math.min(5, G.tokens + 1);
          store.set("tokens", G.tokens);
          this.pendingNote = "보스를 넘어선 보답으로 다음 운명의 재굴림 기회 +1";
        }
      } else G.place = "town";
      this.reach = reachOf(p.job);
      if (!a.keep || !this.ps) this.ps = E.newPlayerState(p);
      if (!a.keep || !this.cds) this.cds = p.job.skills.map(() => 0);
      const sx = a.x !== undefined ? a.x : this.map.spawnX;
      this.hero = {
        x: sx, y: this.map.groundY, vx: 0, vy: 0, dir: 1, ground: this.map.plats[0], rope: null, atk: null, atkCd: 0, inv: 1, stun: 0, knock: 0,
        landT: 0, airT: 0, dropT: 0, dropPlat: null, walkT: 0, climbT: 0, idleT: 0, casting: false, runT: 0, wantDir: 0, running: false
      };
      this.mons = this.map.spawns.map((sp) => this.makeMon(sp));
      this.drops = [];
      this.shots = [];
      this.summons = [];
      this.ambient = [];
      this.npcs = [];
      if (this.map.kind === "town") for (let i = 0; i < 4; i++) this.npcs.push({ job: E.randomJob(), x: 120 + i * 200 + rnd(-40, 40), dir: Math.random() < 0.5 ? -1 : 1, walk: rnd(1, 3), t: 0 });
      this.dead = false;
      this.dim = 0;
      this.quake = 0;
      this.time = 0;
      this.cam = null;
      this.hudT = 0;
      this.regenT = 0;
      this.saveT = 0;
      this.buildHud();
      this.banner(this.map.name);
      if (this.pendingNote) { this.log(this.pendingNote, "good"); this.pendingNote = null; }
      save();
    },
    leave() {
      Object.keys(held).forEach((k) => { held[k] = false; });
    },
    /* 전직의 두루마리: 무기 사거리·기술 칸을 새 직업에 맞춘다 */
    jobChanged() {
      this.reach = reachOf(G.player.job);
      this.cds = G.player.job.skills.map(() => 0);
      this.summons = [];
      this.buildHud();
      Sp.pillar(px(this.hero.x), px(this.hero.y), "light", true);
    },
    viewW() { return VW / Z; },
    viewH() { return VH / Z; },

    makeMon(sp) {
      const mon = E.makeMonster(this.floor, sp.mon);
      const look = S.MON_LOOK[mon.base] || ["slime"];
      const tpl = look[0];
      const big = mon.boss ? (Z >= 2 ? 6 : 4) : (Z >= 2 ? 3 : 2);
      const img = S.monsterBig(mon.name, big);
      const bd = bounds(img);
      const pl = this.map.plats[sp.plat] || this.map.plats[0];
      const fly = FLYERS.has(tpl) && !mon.boss;
      const y = fly ? pl.y - rnd(30, 52) : pl.y;
      return {
        mon, tpl, img, bd, fly, shooter: SHOOTERS.has(tpl), heavy: mon.traits.includes("heavy"), sp,
        x: sp.x, y, baseY: y, plat: pl, dir: Math.random() < 0.5 ? -1 : 1, t: Math.random() * 3,
        state: "walk", stateT: rnd(1, 3), hitT: 99, flash: 0, hpBarT: 0, alpha: 1, dead: false, deadT: 0, stag: 0, kx: 0,
        castCd: rnd(1.5, 3), heavyCd: rnd(2, 4), wind: 0, lunge: 0, aggro: mon.boss ? 99 : 0, dots: {}, vy: 0, air: false,
        act: null, patT: 2.5, speed: (MON_SPEED[tpl] || 36) * (mon.boss ? 0.75 : 1) * rnd(0.9, 1.1),
        w: bd.w / Z, h: bd.h / Z
      };
    },

    /* ── HUD: 이 게임의 도트 창 모양을 그대로 쓴다 ── */
    buildHud() {
      const p = G.player;
      $("hud").className = "hud-stage";
      const slots = p.job.skills.map((sk, i) => `<div class="slot" data-slot="${i}"><img src="${skillIcon(sk)}" alt=""><i class="cd"></i><b class="key">${"ASDFG"[i]}</b><em class="lock">Lv.${sk.lv}</em></div>`).join("");
      $("hud").innerHTML = `
        <div class="hud-plate stage-plate">
          <div class="hud-l"><b>${esc(p.name)}</b><span class="rar-t-${p.job.rarity}">${esc(p.job.name)}</span><span id="h-lv"></span></div>
          <div class="hud-bars"><i class="hp"><b id="h-hp"></b><em id="h-hpt"></em></i><i class="mp"><b id="h-mp"></b><em id="h-mpt"></em></i><i class="xp"><b id="h-xp"></b><em id="h-xpt"></em></i></div>
          <div class="hud-r"><span class="where" id="h-where"></span><span class="gold" id="h-gold"></span></div>
        </div>
        <button class="hud-menu" type="button" aria-label="메뉴">☰</button>
        <div class="buffs" id="h-buffs"></div>
        <div class="foe-plate boss-plate" id="h-boss" hidden><b id="h-bossn"></b><span id="h-bosslv"></span><i class="hp"><b id="h-bosshp"></b></i></div>
        <div class="stage-log" id="h-log"></div>
        <div class="slots" id="h-slots">${slots}<div class="slot pot" data-pot="hp"><img src="${S.icon("potion", 2)}" alt=""><b class="key">Q</b><em class="n" id="h-php"></em></div><div class="slot pot" data-pot="mp"><img src="${S.icon("ether", 2)}" alt=""><b class="key">W</b><em class="n" id="h-pmp"></em></div></div>`;
      $("hud").querySelector(".hud-menu").addEventListener("click", () => { if (!winTop() && !G.busy && !this.dead) openMenu(); });
      $("hud").querySelectorAll(".slot").forEach((el) => {
        el.addEventListener("click", () => {
          if (winTop() || G.busy) return;
          if (el.dataset.pot) this.potion(el.dataset.pot);
          else this.useSkill(Number(el.dataset.slot));
        });
      });
      /* 터치 패드의 기술 버튼에도 같은 아이콘 */
      p.job.skills.forEach((sk, i) => {
        const b = doc.querySelector(`#pad [data-k="s${i}"]`);
        if (b) b.innerHTML = `<img src="${skillIcon(sk)}" alt="${esc(sk.name)}"><i class="cd"></i>`;
      });
      this.refresh(true);
    },
    refresh(force) {
      const p = G.player;
      const d = E.derive(p);
      const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
      const width = (id, r) => { const el = $(id); if (el) el.style.width = `${Math.max(0, Math.min(100, r * 100)).toFixed(1)}%`; };
      set("h-lv", `Lv.${p.level}`);
      width("h-hp", p.hp / d.maxHp);
      width("h-mp", p.mp / d.maxMp);
      width("h-xp", p.exp / E.expNeed(p.level));
      set("h-hpt", `${fmt(Math.max(0, p.hp))}/${fmt(d.maxHp)}`);
      set("h-mpt", `${fmt(p.mp)}/${fmt(d.maxMp)}`);
      set("h-xpt", `${((p.exp / E.expNeed(p.level)) * 100).toFixed(1)}%`);
      set("h-where", this.floor ? `지하 ${this.floor}층` : "마을");
      set("h-gold", `${fmt(p.gold)} G`);
      set("h-php", String(p.potions.hp));
      set("h-pmp", String(p.potions.mp));
      p.job.skills.forEach((sk, i) => {
        const plan = E.skillPlan(p, sk, this.reach.far);
        const left = this.cds[i];
        const locked = p.level < sk.lv;
        const short = !locked && (plan.hpCost ? p.hp <= d.maxHp * plan.hpCost + 1 : p.mp < plan.cost);
        [doc.querySelector(`#h-slots [data-slot="${i}"]`), doc.querySelector(`#pad [data-k="s${i}"]`)].forEach((el) => {
          if (!el) return;
          el.classList.toggle("locked", locked);
          el.classList.toggle("short", short);
          const cd = el.querySelector(".cd");
          if (cd) {
            cd.style.setProperty("--cd", left > 0 ? (left / plan.cd).toFixed(3) : "0");
            const txt = left > 0 ? String(Math.ceil(left)) : "";
            if (cd.textContent !== txt) cd.textContent = txt;
          }
        });
      });
      const ps = this.ps;
      const chips = [];
      if (ps.barrier > 0) chips.push(`보호막 ${fmt(ps.barrier)}`);
      [["atkUp", "공격↑"], ["rage", "광폭"], ["counter", "반격"], ["evade", "회피↑"], ["regen", "재생"], ["weaken", "쇠약"], ["poison", "중독"], ["burn", "화상"]].forEach(([k, label]) => {
        if (ps[k]) chips.push(`${label} ${Math.ceil(ps[k].t)}`);
      });
      if (this.summons.length) chips.push(`소환수 ${Math.ceil(this.summons[0].t)}`);
      const html = chips.map((c) => `<span class="chip">${c}</span>`).join("");
      const bf = $("h-buffs");
      if (bf && (force || bf.dataset.v !== html)) { bf.innerHTML = html; bf.dataset.v = html; }
      const boss = this.mons.find((m) => m.mon.boss && !m.dead);
      const bp = $("h-boss");
      if (bp) {
        bp.hidden = !boss;
        if (boss) { set("h-bossn", boss.mon.name); set("h-bosslv", `Lv.${boss.mon.lv} · 보스${boss.mon.enraged ? " · 분노" : ""}`); width("h-bosshp", boss.mon.hp / boss.mon.maxHp); }
      }
    },
    log(text, kind) {
      const box = $("h-log");
      if (!box) return;
      const el = doc.createElement("p");
      el.className = kind || "";
      el.innerHTML = text;
      box.appendChild(el);
      while (box.children.length > 4) box.firstChild.remove();
      setTimeout(() => el.classList.add("out"), 3600);
      setTimeout(() => el.remove(), 4400);
    },
    banner(text) { banner(text); },

    /* ── 입력 ── */
    key(k) {
      if (this.dead || G.busy) return;
      if (k === "b") { openMenu(); return; }
      if (k === "jump") { this.jump(); return; }
      if (k === "up" || k === "a") { if (this.interact()) return; }
      if (k === "atk") {
        if (this.map.kind === "town" && this.interact()) return;
        this.basicAttack();
        return;
      }
      if (k === "hp" || k === "mp") { this.potion(k); return; }
      if (k[0] === "s" && k.length === 2) this.useSkill(Number(k[1]));
    },
    jump() {
      const h = this.hero;
      if (this.dead || h.stun > 0 || h.knock > 0 || h.casting) return;
      if (h.rope) {
        if (!held.left && !held.right) return;
        h.dir = held.left ? -1 : 1;
        h.rope = null;
        h.vy = -JUMP_V * 0.62;
        h.vx = h.dir * WALK;
        h.ground = null;
        return;
      }
      if (!h.ground || h.atk) return;
      if (held.down && !h.ground.ground) {
        h.dropPlat = h.ground;
        h.dropT = 0.3;
        h.ground = null;
        h.vy = 30;
        return;
      }
      h.ground = null;
      h.vy = -JUMP_V;
      h.airT = 0;
      Sp.dust(px(h.x), px(h.y), 0, 4);
    },
    potion(kind) {
      const p = G.player;
      if (this.dead || (this.potT || 0) > 0) return;
      const before = kind === "mp" ? p.mp : p.hp;
      const res = E.drink(p, kind);
      if (!res.ok) { this.log(res.msg, "bad"); return; }
      this.potT = 0.4;
      const h = this.hero;
      const gain = (kind === "mp" ? p.mp : p.hp) - before;
      Sp.number(px(h.x), px(h.y - 46), "+" + gain, kind === "mp" ? "mp" : "heal", 0);
      if (kind === "hp") { delete this.ps.poison; delete this.ps.burn; Sp.heal(px(h.x), px(h.y)); }
      else Sp.aura(px(h.x), px(h.y), "ice");
      this.refresh();
    },
    interact() {
      const h = this.hero;
      const door = (this.map.doors || []).find((d) => Math.abs(d.x - h.x) < (d.kind === "cave" ? 40 : 26) && Math.abs(d.y - h.y) < 8 && h.ground);
      if (door) { this.useDoor(door); return true; }
      const npc = this.npcs.find((n) => Math.abs(n.x - h.x) < 22 && Math.abs(this.map.groundY - h.y) < 8);
      if (npc) { npcTalk(npc, h); return true; }
      return false;
    },
    useDoor(d) {
      const p = G.player;
      const h = this.hero;
      h.vx = 0;
      if (d.kind === "down") {
        if (d.locked) { this.log("붉은 봉인이 계단을 막고 있다. 보스를 쓰러뜨려야 열린다.", "bad"); return; }
        fade(() => setScene(Stage, { floor: this.floor + 1, keep: true }));
        return;
      }
      if (d.kind === "up") {
        ask(`위층 계단이다. 마을로 돌아갈까?<br><small>다음에는 지하 ${this.floor}층부터 다시 시작한다.</small>`, ["돌아간다", "그만둔다"], (i) => {
          if (i === 0) fade(() => setScene(Stage, { floor: 0, x: 862, keep: true }));
        });
        return;
      }
      if (d.kind === "cave") {
        ask(`던전 입구다. <b>지하 ${Math.max(1, p.floor)}층</b>부터 탐험할까?<br><small>최고 기록 ${p.best}층 · 10층마다 보스</small>`, ["들어간다", "그만둔다"], (i) => {
          if (i === 0) fade(() => setScene(Stage, { floor: Math.max(1, p.floor), keep: true }));
        });
        return;
      }
      if (d.kind === "tablet") { tabletTalk(); return; }
      if (d.kind === "inn") { innTalk(() => this.refresh()); return; }
      if (d.kind === "shop") { openShop(() => this.refresh()); return; }
      if (d.kind === "guild") guildMenu();
    },

    /* ── 주인공 ── */
    landing(x, y0, y1, skip) {
      let best = null;
      this.map.plats.forEach((pl) => {
        if (pl === skip) return;
        if (x < pl.x1 - 3 || x > pl.x2 + 3) return;
        if (y0 <= pl.y + 0.5 && y1 >= pl.y && (!best || pl.y < best.y)) best = pl;
      });
      return best;
    },
    ropeAt(h, up) {
      return this.map.ropes.find((r) => Math.abs(h.x - r.x) < 8 && (up ? h.y > r.top.y + 1 && h.y <= r.y2 + 1 : h.ground === r.top));
    },
    updateHero(dt) {
      const h = this.hero;
      const m = this.map;
      h.inv = Math.max(0, h.inv - dt);
      h.stun = Math.max(0, h.stun - dt);
      h.knock = Math.max(0, h.knock - dt);
      h.landT = Math.max(0, h.landT - dt);
      h.atkCd -= dt;
      h.dropT -= dt;
      this.potT = Math.max(0, (this.potT || 0) - dt);
      const ctl = h.stun <= 0 && h.knock <= 0 && !h.casting;
      if (h.atk) {
        h.atk.t += dt;
        if (!h.atk.fired && h.atk.t >= h.atk.hitAt) { h.atk.fired = true; h.atk.fire(); }
        if (h.atk.t >= h.atk.dur) h.atk = null;
      }
      if (held.atk && ctl && !h.atk && h.atkCd <= 0 && !h.rope && m.kind !== "town") this.basicAttack();
      if (held.jump && ctl && h.ground && !h.atk && !held.down) this.jump();
      /* 밧줄 */
      if (h.rope) {
        const r = h.rope;
        let v = 0;
        if (held.up && ctl) v -= 1;
        if (held.down && ctl) v += 1;
        h.y += v * CLIMB * dt;
        h.x = r.x;
        h.vx = 0;
        h.vy = 0;
        if (v) h.climbT += dt;
        if (h.y <= r.top.y) { h.y = r.top.y; h.rope = null; h.ground = r.top; }
        else if (h.y >= r.y2) {
          h.y = r.y2;
          h.rope = null;
          h.ground = this.landing(h.x, r.y2 - 1, r.y2 + 1, null);
        }
        return;
      }
      let want = 0;
      if (ctl && held.left) want -= 1;
      if (ctl && held.right) want += 1;
      /* 같은 방향을 계속 누르면 달린다 */
      if (want && want === h.wantDir) h.runT += dt;
      else h.runT = 0;
      h.wantDir = want;
      h.running = !!want && (held.run || h.runT > RUN_AFTER);
      if (h.knock <= 0) h.vx = h.atk && h.ground ? 0 : want * (h.running ? RUN : WALK);
      if (want && !h.atk && ctl) h.dir = want;
      if (ctl && !h.atk && (held.up || held.down)) {
        const r = this.ropeAt(h, held.up && !held.down);
        if (r) {
          h.rope = r;
          h.ground = null;
          h.x = r.x;
          h.y = held.up ? Math.min(h.y, r.y2) - 1 : r.top.y + 2;
          h.climbT = 0;
          return;
        }
      }
      if (!h.ground) { h.vy = Math.min(HERO_FALL, h.vy + HERO_GRAV * dt); h.airT += dt; }
      const py = h.y;
      h.x = clamp(h.x + h.vx * dt, 10, m.W - 10);
      h.y += h.vy * dt;
      if (h.ground) {
        if (h.x < h.ground.x1 - 3 || h.x > h.ground.x2 + 3) { h.ground = null; h.vy = 0; h.airT = 0; }
        else h.y = h.ground.y;
      } else if (h.vy >= 0) {
        const land = this.landing(h.x, py, h.y, h.dropT > 0 ? h.dropPlat : null);
        if (land) {
          h.y = land.y;
          if (h.airT > 0.3) { h.landT = 0.13; Sp.dust(px(h.x), px(h.y), 0, 6); }
          h.vy = 0;
          h.ground = land;
          h.airT = 0;
        }
      }
      if (h.ground && h.vx) {
        h.walkT += dt;
        if (Math.random() < dt * (h.running ? 9 : 3)) Sp.dust(px(h.x - h.dir * 6), px(h.y), -h.dir, h.running ? 2 : 1);
      } else h.walkT = 0;
      if (h.y > m.H + 40) { h.x = m.spawnX; h.y = m.groundY; h.vy = 0; h.ground = m.plats[0]; }
    },
    /* 지금 동작과 그 동작에 들어선 뒤의 시간 */
    heroPose() {
      const h = this.hero;
      let anim = "idle";
      let f = 0;
      let t = this.time;
      if (this.dead || h.knock > 0 || h.stun > 0) anim = "hurt";
      else if (h.atk) {
        const k = h.atk.t;
        if (h.atk.kind === "cast") { anim = "cast"; f = k < h.atk.hitAt ? 0 : 1; }
        else anim = k < h.atk.hitAt ? "windup" : k < h.atk.hitAt + 0.13 ? "strike" : "follow";
      } else if (h.rope) { anim = "climb"; t = h.climbT; }
      else if (!h.ground) anim = h.vy < 0 ? "jump" : "fall";
      else if (h.landT > 0) anim = "land";
      else if (h.vx) { anim = h.running ? "run" : "walk"; t = h.walkT; }
      return { anim, f, t };
    },

    /* ── 공격 ── */
    basicAttack() {
      const h = this.hero;
      if (this.dead || h.atk || h.atkCd > 0 || h.rope || h.casting || h.stun > 0 || h.knock > 0 || this.map.kind === "town") return;
      h.atk = { t: 0, dur: ATK_TIME, hitAt: ATK_HIT, kind: this.reach.caster ? "cast" : "melee", fired: false, fire: () => this.basicHit() };
      h.atkCd = ATK_TIME + 0.04;
    },
    basicHit() {
      const h = this.hero;
      const p = G.player;
      const a = p.job.attack;
      const opt = { stat: a.stat, el: a.el, mult: 1 };
      const R = this.reach;
      if (!R.far) {
        const t = this.frontTargets(64, 1)[0];
        this.swing = !this.swing;
        Sp.slash(px(h.x + h.dir * 20), px(h.y - 22), h.dir, a.el, false, this.swing);
        if (t) this.strike(t, opt, 1, true);
        return;
      }
      const range = R.caster ? 210 : 240;
      const t = this.frontTargets(range, 1)[0];
      const from = [px(h.x + h.dir * 16), px(h.y - 24)];
      const to = t ? [px(t.x), px(t.y - t.h * 0.5)] : [px(h.x + h.dir * range), from[1]];
      Sp.shot(from, to, a.el, R.shot).then(() => { if (t && !t.dead) this.strike(t, opt, 1, true); });
    },
    liveMons() {
      return this.mons.filter((m) => !m.dead);
    },
    frontTargets(range, n) {
      const h = this.hero;
      const cy = h.y - 20;
      return this.liveMons().filter((m) => {
        const dx = (m.x - h.x) * h.dir;
        return dx > -14 && dx < range + m.w / 2 && Math.abs(m.y - m.h / 2 - cy) < 30 + m.h / 2;
      }).sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x)).slice(0, n);
    },
    pickTargets(plan) {
      const h = this.hero;
      const cy = h.y - 20;
      if (plan.area === "screen") {
        const vw = this.viewW() / 2 + 10;
        const vh = this.viewH() * 0.6;
        return this.liveMons().filter((m) => Math.abs(m.x - h.x) < vw && Math.abs(m.y - m.h / 2 - cy) < vh)
          .sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x)).slice(0, plan.targets);
      }
      if (plan.area === "around") {
        return this.liveMons().filter((m) => Math.hypot(m.x - h.x, (m.y - m.h / 2 - cy) * 1.4) < plan.range + m.w / 2)
          .sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x)).slice(0, plan.targets);
      }
      return this.frontTargets(plan.range, plan.targets);
    },
    /* 몬스터 하나를 hits번 때린다. 숫자는 위로 쌓인다 */
    strike(m, opt, hits, basic) {
      if (m.dead) return 0;
      const p = G.player;
      const d = E.derive(p);
      let total = 0;
      let line = 0;
      for (let i = 0; i < hits && m.mon.hp > 0; i++) {
        const r = E.hitMonster(p, d, m.mon, opt, this.ps);
        total += r.dmg;
        Sp.number(px(m.x), px(m.y - m.h) - 4 * Z, r.dmg, r.crit ? "crit" : "hit", line++);
      }
      if (p.job.passive.double && m.mon.hp > 0 && Math.random() < p.job.passive.double) {
        const r = E.hitMonster(p, d, m.mon, Object.assign({}, opt, { mult: opt.mult * 0.5 }), this.ps);
        total += r.dmg;
        Sp.number(px(m.x), px(m.y - m.h) - 4 * Z, r.dmg, r.crit ? "crit" : "hit", line++);
      }
      m.flash = 0.09;
      m.hpBarT = 4;
      m.aggro = 8;
      m.hitT = 0;
      /* 맞은 몬스터는 잠깐 휘청이며 밀려나고, 그동안은 부딪혀도 피해가 없다. 근접 공격일수록 크게 민다 */
      if (!m.mon.boss && !m.fly) {
        const close = !this.reach.far;
        m.stag = close ? 0.42 : 0.26;
        m.kx = Math.sign(m.x - this.hero.x || 1) * (close ? 120 : 60);
      }
      if (basic) p.mp = Math.min(d.maxMp, p.mp + Math.max(1, Math.round(d.maxMp * 0.02)));
      Sp.impact(px(m.x), px(m.y - m.h * 0.5), opt.el, false);
      if (m.mon.hp <= 0) this.kill(m);
      return total;
    },

    useSkill(i) {
      const p = G.player;
      const sk = p.job.skills[i];
      const h = this.hero;
      if (!sk || this.dead || h.stun > 0 || h.knock > 0 || h.rope || h.atk || h.casting) return;
      if (this.map.kind === "town" && !(sk.type === "heal" || sk.type === "buff" || sk.type === "shield" || sk.type === "regen")) { this.log("마을에서는 공격 기술을 쓸 수 없다.", "bad"); return; }
      const plan = E.skillPlan(p, sk, this.reach.far);
      const ok = E.skillReady(p, sk, plan, this.cds[i]);
      if (!ok.ok) {
        if (ok.why === "MP 부족" || ok.why === "HP 부족") this.log(`${ok.why}: ${esc(sk.name)}`, "bad");
        else if (p.level < sk.lv) this.log(`${esc(sk.name)}은(는) Lv.${sk.lv}에 배운다.`, "bad");
        return;
      }
      const d = E.derive(p);
      if (plan.hpCost) p.hp = Math.max(1, p.hp - Math.round(d.maxHp * plan.hpCost));
      else p.mp -= plan.cost;
      this.cds[i] = plan.cd;
      this.skillName(sk);
      if (plan.ult) this.castUlt(sk, plan);
      else if (plan.self) this.castSelf(sk, plan);
      else {
        h.atk = { t: 0, dur: 0.5, hitAt: 0.16, kind: this.reach.caster ? "cast" : "melee", fired: false, fire: () => this.skillHit(sk, plan) };
      }
      this.refresh();
    },
    skillName(sk) {
      const h = this.hero;
      Sp.add({
        life: 900,
        draw(c, t) {
          c.save();
          c.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
          c.font = `${Math.round(11 * Z / 1.5 + 2)}px Galmuri11, sans-serif`;
          c.textAlign = "center";
          c.lineWidth = 3;
          c.strokeStyle = "#0b0918";
          const y = px(h.y - 52) - t * 8 * Z;
          c.strokeText(sk.name, px(h.x), y);
          c.fillStyle = sk.tag === "ult" ? "#ffd75e" : "#ffffff";
          c.fillText(sk.name, px(h.x), y);
          c.restore();
        }
      });
    },
    castSelf(sk, plan) {
      const h = this.hero;
      const p = G.player;
      h.atk = {
        t: 0, dur: 0.45, hitAt: 0.18, kind: "cast", fired: false,
        fire: () => {
          const d = E.derive(p);
          const pa = p.job.passive;
          const ps = this.ps;
          const hx = px(h.x);
          const hy = px(h.y);
          if (plan.heal) {
            const before = p.hp;
            p.hp = Math.min(d.maxHp, p.hp + Math.round((d.maxHp * plan.heal + d.s.wis * 1.5) * (1 + (pa.heal || 0))));
            Sp.heal(hx, hy);
            Sp.number(hx, hy - 46 * Z, "+" + (p.hp - before), "heal", 0);
          }
          if (plan.regen) { ps.regen = { t: plan.regen.sec, v: Math.round((d.maxHp * plan.regen.v * (1 + (pa.heal || 0))) / (plan.regen.sec / 2)), next: 2 }; Sp.heal(hx, hy); }
          if (plan.buff) { ps[plan.buff.kind] = { t: plan.buff.sec, v: plan.buff.v || 0 }; Sp.aura(hx, hy, sk.el === "phys" ? "light" : sk.el); }
          if (plan.shield) {
            const amount = Math.round(d.maxHp * plan.shield + d.s[sk.stat] * 2);
            ps.barrier = (ps.barrier || 0) + amount;
            Sp.shieldBubble(hx, hy - 22 * Z, 26 * Z);
            Sp.number(hx, hy - 46 * Z, "+" + amount, "mp", 0);
          }
          if (plan.summon) {
            const dmg = Math.round(E.power(p, d, sk.stat) * plan.summon.pow);
            this.summons = [{ x: h.x - h.dir * 20, y: h.y - 46, t: plan.summon.sec, el: sk.el === "phys" ? "arcane" : sk.el, dmg, cd: 1, bob: Math.random() * 6 }];
            Sp.aura(hx, hy, sk.el === "phys" ? "arcane" : sk.el);
          }
          this.refresh();
        }
      };
    },
    skillHit(sk, plan) {
      const h = this.hero;
      const p = G.player;
      let targets;
      if (plan.dash) {
        /* 돌진: 지나간 길 위의 적을 벤다 */
        const g = h.ground;
        const from = h.x;
        const lim = g ? [g.x1 + 4, g.x2 - 4] : [10, this.map.W - 10];
        h.x = clamp(h.x + h.dir * plan.dash, lim[0], lim[1]);
        const lo = Math.min(from, h.x) - 20;
        const hi = Math.max(from, h.x) + 20;
        targets = this.liveMons().filter((m) => m.x > lo && m.x < hi && Math.abs(m.y - m.h / 2 - (h.y - 20)) < 30 + m.h / 2).slice(0, plan.targets);
        Sp.slash(px((from + h.x) / 2), px(h.y - 22), h.dir, sk.el, true, false);
        for (let k = 0; k < 6; k++) Sp.dust(px(from + (h.x - from) * (k / 6)), px(h.y), -h.dir, 2);
        h.inv = Math.max(h.inv, 0.4);
      } else targets = this.pickTargets(plan);
      this.skillVisual(sk, plan, targets).then(() => this.applySkill(sk, plan, targets));
    },
    applySkill(sk, plan, targets) {
      const p = G.player;
      const d = E.derive(p);
      const pa = p.job.passive;
      const opt = { stat: sk.stat, el: sk.el, mult: plan.mult, pen: plan.pen, critBonus: plan.critBonus, execute: plan.execute };
      let dealt = 0;
      targets.forEach((m) => {
        if (m.dead) return;
        const o = Object.assign({}, opt);
        if (plan.gamble) o.mult = (0.1 + Math.random() * 3.1) * plan.gamble;
        dealt += this.strike(m, o, plan.hits, false);
        if (m.dead) return;
        const mon = m.mon;
        if (plan.dot) {
          const pw = E.power(p, d, sk.stat);
          m.dots[plan.dot.kind] = { dmg: Math.max(1, Math.round((pw * plan.dot.pow) / 2)), ticks: plan.dot.ticks, next: 1 };
        }
        if (plan.stun && Math.random() < plan.stun.chance * (mon.boss ? 0.5 : 1)) { mon.st.stun = mon.boss ? 1.2 : plan.stun.sec; mon.st.stunKind = plan.stun.kind; }
        if (plan.status) mon.st[plan.status.kind] = plan.status.sec;
      });
      if (plan.drain && dealt) {
        const before = p.hp;
        p.hp = Math.min(d.maxHp, p.hp + Math.round(dealt * plan.drain * (1 + (pa.heal || 0) * 0.5)));
        if (p.hp > before) Sp.number(px(this.hero.x), px(this.hero.y - 46), "+" + (p.hp - before), "heal", 0);
      }
      if (plan.mana) {
        const before = p.mp;
        p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * plan.mana));
        if (p.mp > before) Sp.number(px(this.hero.x), px(this.hero.y - 46), "+" + (p.mp - before), "mp", 0);
      }
      if (plan.gold && targets[0]) {
        const g = Math.round((4 + this.floor * 2.5) * plan.gold * (1 + (pa.gold || 0)));
        this.spawnDrop({ kind: "gold", amount: g }, targets[0].x, targets[0].y - targets[0].h / 2);
      }
      if (plan.buff) this.ps[plan.buff.kind] = { t: plan.buff.sec, v: plan.buff.v || 0 };
      this.refresh();
    },
    /* 기술 연출: 싸움 방식(베기·화살·총탄·던지기·주문)에 속성 효과를 얹는다.
       돌려주는 Promise가 끝나는 순간 피해가 들어간다 */
    skillVisual(sk, plan, targets) {
      const h = this.hero;
      const el = sk.el;
      const st = this.reach.style;
      const hand = [px(h.x + h.dir * 16), px(h.y - 24)];
      const first = targets[0];
      const center = (m) => [px(m.x), px(m.y - m.h / 2)];
      const aim = first ? center(first) : [px(h.x + h.dir * Math.min(plan.range, 200)), hand[1]];
      const list = targets.length ? targets.slice(0, 4) : [null];
      if (plan.area === "around") {
        Sp.impact(px(h.x), px(h.y - 20), el, true);
        [-1, 1].forEach((sg) => (el === "fire" ? Sp.flames : Sp.crystals)(px(h.x + sg * 50), px(h.y), el, 70 * Z, true));
        this.quake = 0.2;
        return X.sleep(140);
      }
      if (st.reach === "melee") {
        Sp.slash(px(h.x + h.dir * 26), px(h.y - 22), h.dir, el, true, false);
        if (plan.hits > 1) X.sleep(90).then(() => Sp.slash(px(h.x + h.dir * 30), px(h.y - 20), h.dir, el, true, true));
        if (plan.hits > 2) X.sleep(180).then(() => Sp.slash(px(h.x + h.dir * 34), px(h.y - 26), h.dir, el, true, false));
        if (el !== "phys") list.forEach((m) => this.groundFx(el, m, false));
        return X.sleep(80);
      }
      if (st.reach !== "magic") {
        /* 활·총·던지기: 대상마다 자기 물건을 날리고, 속성이 있으면 맞은 자리에 터진다 */
        return Promise.all(list.map((m, i) => X.sleep(i * 70).then(() => Sp.shot(hand, m ? center(m) : aim, el, this.reach.shot))))
          .then(() => { if (el !== "phys") list.forEach((m) => this.groundFx(el, m, false)); });
      }
      switch (el) {
        case "fire":
          return Sp.shot(hand, aim, "fire", "fireball").then(() => list.forEach((m) => this.groundFx("fire", m, false)));
        case "bolt": {
          let prev = hand;
          list.forEach((m) => { const to = m ? center(m) : aim; Sp.bolt(prev, to, "bolt"); prev = to; });
          return X.sleep(90);
        }
        case "dark": case "arcane": case "phys":
          return Sp.shot(hand, aim, el === "phys" ? "arcane" : el, "fireball");
        default:
          list.forEach((m) => this.groundFx(el, m, plan.targets > 3));
          return X.sleep(170);
      }
    },
    /* 대상 발밑에서 터지는 속성 효과 */
    groundFx(el, m, big) {
      const h = this.hero;
      const x = m ? px(m.x) : px(h.x + h.dir * 80);
      const y = m ? px(m.fly ? m.y + 10 : m.y) : px(h.y);
      switch (el) {
        case "fire": Sp.flames(x, y, "fire", 36 * Z, big); break;
        case "ice": case "earth": case "nature": Sp.crystals(x, y, el, 46 * Z, big); break;
        case "bolt": Sp.bolt([x + 16 * Z, y - 140 * Z], [x, y - 10 * Z], "bolt"); break;
        case "wind": Sp.tornado(x, y, "wind", big); break;
        case "light": Sp.pillar(x, y, "light", false); break;
        default: Sp.impact(x, y - 20 * Z, el, true);
      }
    },
    /* 궁극기 세 단계: 마법진과 떠오르는 결정 → 싸움 방식에 맞는 대폭발 → 빛기둥으로 마무리 */
    castUlt(sk, plan) {
      const h = this.hero;
      const el = sk.el === "phys" ? "light" : sk.el;
      const st = this.reach.style;
      h.casting = true;
      h.inv = Math.max(h.inv, 2);
      h.atk = { t: 0, dur: 1.5, hitAt: 0.6, kind: "cast", fired: true, fire() {} };
      Sp.circle(px(h.x), px(h.y), el, 1500);
      this.dim = 0.25;
      X.sleep(620).then(() => {
        const targets = this.pickTargets(plan);
        this.dim = 0.5;
        this.flash = { col: Sp.PAL[el][1], t: 0.22 };
        const xs = targets.slice(0, 5).map((m) => px(m.x));
        while (xs.length < 4) xs.push(px(h.x + h.dir * (60 + xs.length * 70)) + rnd(-10, 10) * Z);
        const gy = px(h.y);
        let burst;
        switch (st.ult) {
          case "blade":
            burst = Sp.bladeWave(px(h.x + h.dir * 20), px(h.y - 24), h.dir, sk.el, VW * 0.7);
            if (sk.el !== "phys") xs.forEach((x, i) => X.sleep(120 + i * 60).then(() => this.groundFx(sk.el, targets[i] || null, true)));
            break;
          case "arrows": burst = Sp.rain("arrow", xs, gy, sk.el); break;
          case "bombard": burst = Sp.meteors(xs, gy, "fire"); break;
          case "cards": burst = Sp.rain("card", xs, gy, el); break;
          case "notes": burst = Sp.rain("note", xs, gy, el); break;
          case "coins": burst = Sp.rain("coin", xs, gy, "light"); break;
          default:
            /* 마법 궁극기의 둘째 단계: 그린 운석 비를 화면 가득 깔고, 그 위에 속성 연출 */
            Sp.barrage((xs[0] + xs[xs.length - 1]) / 2, gy, el, Math.min(VW * 0.95, 520 * Z));
            if (el === "bolt") { xs.forEach((x, i) => X.sleep(i * 70).then(() => Sp.bolt([x + 20 * Z, gy - 300 * Z], [x, gy - 10 * Z], "bolt"))); burst = X.sleep(380); }
            else if (el === "wind") { xs.forEach((x) => Sp.tornado(x, gy, "wind", true)); burst = X.sleep(320); }
            else if (el === "light") { xs.forEach((x, i) => X.sleep(i * 80).then(() => Sp.pillar(x, gy, "light", false))); burst = X.sleep(400); }
            else if (el === "earth" || el === "nature" || el === "ice") { xs.forEach((x, i) => X.sleep(i * 60).then(() => Sp.crystals(x, gy, el, 80 * Z, true))); burst = X.sleep(360); }
            else burst = Sp.meteors(xs, gy, el);
        }
        this.quake = 0.5;
        return burst.then(() => {
          this.applySkill(sk, plan, targets.filter((m) => !m.dead));
          Sp.pillar(px(h.x), gy, el, true);
          this.quake = 0.3;
          return X.sleep(300);
        });
      }).then(() => { h.casting = false; this.dim = 0; });
    },

    /* ── 몬스터 ── */
    kill(m) {
      if (m.dead) return;
      m.dead = true;
      m.deadT = 0;
      m.mon.hp = 0;
      const p = G.player;
      const rw = E.killReward(p, m.mon);
      p.kills++;
      const lv = E.gainExp(p, rw.exp);
      this.log(`${esc(m.mon.name)} 처치 · 경험치 +${fmt(rw.exp)}`);
      rw.drops.forEach((dr) => this.spawnDrop(dr, m.x, m.y - m.h / 2));
      const pa = p.job.passive;
      if (pa.post) {
        const d = E.derive(p);
        p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * pa.post * 0.25));
      }
      if (lv.levels.length) {
        const h = this.hero;
        Sp.levelUp(px(h.x), px(h.y));
        this.log(`<b>레벨 업! Lv.${p.level}</b> HP·MP가 가득 찼다.`, "good");
        lv.unlocked.forEach((n) => this.log(`새 기술: <b>${esc(n)}</b>`, "good"));
        save();
      }
      if (m.mon.boss) {
        const door = this.map.doors.find((d) => d.kind === "down");
        if (door) { door.locked = false; Sp.pillar(px(door.x), px(door.y), "light", true); }
        this.mons.forEach((o) => { if (!o.dead && o.minion) this.kill(o); });
        this.banner("보스 처치! 계단의 봉인이 풀렸다");
        save();
      }
      this.refresh();
    },
    spawnDrop(dr, x, y) {
      this.drops.push(Object.assign({ x, y, vx: rnd(-50, 50), vy: -rnd(140, 200), ground: null, t: 0, spin: Math.random() * 6 }, dr));
    },
    hurtHero(src, mult) {
      const h = this.hero;
      const p = G.player;
      if (this.dead || h.inv > 0) return;
      const d = E.derive(p);
      const mon = src.mon;
      const raw = mon.atk * mult * (mon.st.debuff ? 0.7 : 1) * (mon.enraged ? 1.4 : 1);
      const res = E.hurtPlayer(p, d, raw, this.ps);
      h.inv = 1;
      if (res.miss) { Sp.number(px(h.x), px(h.y - 46), "MISS", "miss", 0); return; }
      Sp.number(px(h.x), px(h.y - 46), res.dmg, "taken", 0);
      if (res.absorbed) Sp.shieldBubble(px(h.x), px(h.y - 22), 24 * Z);
      h.knock = 0.28;
      h.vx = (h.x < src.x ? -1 : 1) * 120;
      h.vy = -150;
      h.ground = null;
      h.rope = null;
      if (!h.casting) h.atk = null;
      if (res.reflect && !src.dead) {
        mon.hp -= res.reflect;
        Sp.number(px(src.x), px(src.y - src.h), res.reflect, "hit", 0);
        if (mon.hp <= 0) this.kill(src);
      }
      mon.traits.forEach((tr) => {
        if (tr === "poison" || tr === "burn") this.ps[tr] = { t: 6, dmg: Math.max(1, Math.round(raw * 0.1)), next: 1 };
        if (tr === "drain") mon.hp = Math.min(mon.maxHp, mon.hp + Math.round(res.dmg * 0.6));
        if (tr === "steal" && Math.random() < 0.5) {
          const lost = Math.min(p.gold, 3 + this.floor * 2);
          if (lost) { p.gold -= lost; this.log(`${esc(mon.name)}에게 ${lost}G를 빼앗겼다!`, "bad"); }
        }
        if (tr === "stun" && Math.random() < 0.35) h.stun = 0.7;
        if (tr === "weaken" && Math.random() < 0.4) this.ps.weaken = { t: 8 };
      });
      this.refresh();
      if (p.hp <= 0) this.die(mon);
    },
    touching(m) {
      const h = this.hero;
      return Math.abs(h.x - m.x) < HERO_HALF + m.w * 0.36 && h.y - HERO_H < m.y - 2 && h.y > m.y - m.h * 0.85;
    },
    updateMons(dt) {
      const h = this.hero;
      this.mons.forEach((m) => {
        m.t += dt;
        if (m.dead) {
          m.deadT += dt;
          m.alpha = Math.max(0, 1 - m.deadT / 0.45);
          if (!m.mon.boss && !m.minion && m.deadT > 8 && Math.abs(m.sp.x - h.x) > this.viewW() / 2 + 40) Object.assign(m, this.makeMon(m.sp));
          return;
        }
        const st = m.mon.st;
        ["stun", "charm", "debuff", "curse"].forEach((k) => { if (st[k] > 0) { st[k] -= dt; if (st[k] <= 0) delete st[k]; } });
        Object.keys(m.dots).forEach((k) => {
          const o = m.dots[k];
          o.next -= dt;
          if (o.next > 0) return;
          o.next = 1;
          o.ticks--;
          m.mon.hp -= o.dmg;
          Sp.number(px(m.x), px(m.y - m.h), o.dmg, "dot", 0);
          if (o.ticks <= 0) delete m.dots[k];
        });
        if (m.mon.hp <= 0) { this.kill(m); return; }
        m.flash = Math.max(0, m.flash - dt);
        m.hpBarT -= dt;
        m.hitT += dt;
        m.castCd -= dt;
        m.heavyCd -= dt;
        if (!m.mon.boss) m.aggro -= dt;
        if (m.mon.traits.includes("enrage") && !m.mon.enraged && m.mon.hp < m.mon.maxHp * 0.5) { m.mon.enraged = true; this.log(`${esc(m.mon.name)}이(가) 분노했다!`, "bad"); }
        if (m.mon.traits.includes("heal") && m.hitT > 4 && m.mon.hp < m.mon.maxHp) m.mon.hp = Math.min(m.mon.maxHp, m.mon.hp + m.mon.maxHp * 0.03 * dt);
        if (m.stag > 0) {
          m.stag -= dt;
          m.x += m.kx * dt;
          m.kx *= 0.85;
          this.keepOnPlat(m);
          return;
        }
        if (st.stun > 0) return;
        if (!m.aggro || m.aggro < 0) m.aggro = 0;
        /* 3층부터는 같은 높이에서 가까이 다가가면 먼저 덤빈다 */
        if (m.mon.lv >= 3 && !m.aggro && !this.dead && Math.abs(h.y - m.y) < 26 && Math.abs(h.x - m.x) < 90) m.aggro = 5;
        if (m.mon.boss) this.bossAI(m, dt);
        else this.monAI(m, dt);
        /* 보스는 몸통 박치기보다 내려찍기·탄막이 위험하다 */
        if (!this.dead && !st.charm && h.inv <= 0 && this.touching(m)) this.hurtHero(m, m.mon.boss ? 0.55 : m.lunge > 0 ? 1.6 : 1);
      });
    },
    keepOnPlat(m) {
      if (m.fly) { m.x = clamp(m.x, 40, this.map.W - 40); return; }
      const lo = m.plat.x1 + 8;
      const hi = m.plat.x2 - 8;
      if (m.x < lo) { m.x = lo; m.dir = 1; }
      if (m.x > hi) { m.x = hi; m.dir = -1; }
    },
    monAI(m, dt) {
      const h = this.hero;
      const mon = m.mon;
      const spd = m.speed * (mon.enraged ? 1.4 : 1) * (mon.st.charm ? 0.6 : 1);
      const level = m.fly || Math.abs(h.y - m.y) < 26;
      const dx = h.x - m.x;
      if (m.wind > 0) {
        m.wind -= dt;
        if (m.wind <= 0) m.lunge = 0.3;
        return;
      }
      if (m.lunge > 0) {
        m.lunge -= dt;
        m.x += m.dir * 220 * dt;
        this.keepOnPlat(m);
        return;
      }
      if (m.castT > 0) { m.castT -= dt; return; }
      if (m.aggro > 0 && !mon.st.charm && level && !this.dead) {
        m.dir = dx < 0 ? -1 : 1;
        if (m.heavy && Math.abs(dx) < 90 && m.heavyCd <= 0) { m.wind = 0.5; m.heavyCd = rnd(3.5, 5); return; }
        if (m.shooter && Math.abs(dx) < 220 && m.castCd <= 0) { this.enemyShot(m, 1); m.castCd = rnd(2.4, 3.2); m.castT = 0.4; return; }
        if (!(m.shooter && Math.abs(dx) < 130) && Math.abs(dx) > 6) m.x += m.dir * spd * 1.35 * dt;
        if (m.fly) m.baseY += clamp(h.y - 24 - m.baseY, -40 * dt, 40 * dt);
      } else {
        m.stateT -= dt;
        if (m.stateT <= 0) {
          if (m.state === "walk") { m.state = "idle"; m.stateT = rnd(0.6, 1.8); }
          else { m.state = "walk"; m.stateT = rnd(1.5, 4); if (Math.random() < 0.5) m.dir = -m.dir; }
        }
        if (m.state === "walk") m.x += m.dir * spd * dt;
      }
      if (m.fly) m.y = m.baseY + Math.sin(m.t * 2.2) * 6;
      else m.y = m.plat.y;
      this.keepOnPlat(m);
    },
    /* 보스: 쫓아오다가 내려찍기·탄막·부하 부르기를 번갈아 */
    bossAI(m, dt) {
      const h = this.hero;
      const mon = m.mon;
      const dx = h.x - m.x;
      if (m.air) {
        m.vy += GRAV * 0.9 * dt;
        m.y += m.vy * dt;
        m.x += m.dir * 60 * dt;
        this.keepOnPlat(m);
        if (m.y >= m.plat.y) {
          m.y = m.plat.y;
          m.air = false;
          this.quake = 0.35;
          Sp.dust(px(m.x), px(m.y), 0, 14);
          [-1, 1].forEach((s) => Sp.crystals(px(m.x + s * 70), px(m.y), mon.el === "phys" ? "earth" : mon.el, 60 * Z, false));
          if (h.ground === this.map.plats[0] && Math.abs(dx) < 210 && h.inv <= 0) this.hurtHero(m, 1.3);
        }
        return;
      }
      if (m.act) {
        m.act.t -= dt;
        if (m.act.t > 0) return;
        const a = m.act.kind;
        m.act = null;
        if (a === "slam") { m.air = true; m.vy = -330; m.dir = dx < 0 ? -1 : 1; }
        if (a === "volley") for (let k = -2; k <= 2; k++) this.enemyShot(m, 1.1, k * 0.22);
        if (a === "summon") {
          const pool = this.map.pool && this.map.pool.length ? this.map.pool : E.MONSTERS.filter((x) => x.tier === E.floorTier(this.floor) && !x.boss);
          for (let k = 0; k < 2; k++) {
            const mm = this.makeMon({ x: clamp(m.x + (k ? 50 : -50), 40, this.map.W - 40), plat: 0, mon: pool[Math.floor(Math.random() * pool.length)] });
            mm.aggro = 99;
            mm.minion = true;
            this.mons.push(mm);
            Sp.circle(px(mm.x), px(mm.y), mon.el === "phys" ? "dark" : mon.el, 700);
          }
        }
        return;
      }
      m.dir = dx < 0 ? -1 : 1;
      if (Math.abs(dx) > 30) m.x += m.dir * m.speed * (mon.enraged ? 1.4 : 1) * dt;
      this.keepOnPlat(m);
      m.patT -= dt;
      if (m.patT <= 0) {
        const minions = this.mons.filter((o) => o.minion && !o.dead).length;
        const opts = ["slam", "volley", "volley"];
        if (mon.hp < mon.maxHp * 0.7 && minions < 3) opts.push("summon");
        const kind = opts[Math.floor(Math.random() * opts.length)];
        m.act = { kind, t: kind === "slam" ? 0.6 : 0.5 };
        m.flash = 0.15;
        m.patT = mon.enraged ? 2.4 : 3.4;
      }
    },
    enemyShot(m, mult, spread) {
      const h = this.hero;
      const sx = m.x + m.dir * m.w * 0.3;
      const sy = m.y - m.h * 0.55;
      let ang = Math.atan2(h.y - 22 - sy, h.x - sx) + (spread || 0);
      if (!m.mon.boss) ang = Math.atan2(clamp(h.y - 22 - sy, -40, 40), h.x - sx);
      const v = 130;
      this.shots.push({ x: sx, y: sy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, el: m.mon.el === "phys" ? "dark" : m.mon.el, src: m, mult, life: 3.2 });
    },
    updateShots(dt) {
      const h = this.hero;
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s = this.shots[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        const hit = !this.dead && h.inv <= 0 && Math.abs(s.x - h.x) < 10 && s.y > h.y - HERO_H && s.y < h.y;
        if (hit) { this.hurtHero(s.src, s.mult); Sp.impact(px(s.x), px(s.y), s.el, false); }
        if (hit || s.life <= 0) this.shots.splice(i, 1);
      }
    },
    updateSummons(dt) {
      const h = this.hero;
      for (let i = this.summons.length - 1; i >= 0; i--) {
        const s = this.summons[i];
        s.t -= dt;
        if (s.t <= 0) { this.summons.splice(i, 1); continue; }
        const tx = h.x - h.dir * 22;
        const ty = h.y - 50 + Math.sin(this.time * 3 + s.bob) * 4;
        s.x += (tx - s.x) * Math.min(1, dt * 4);
        s.y += (ty - s.y) * Math.min(1, dt * 4);
        s.cd -= dt;
        if (s.cd > 0) continue;
        const t = this.liveMons().filter((m) => Math.hypot(m.x - s.x, m.y - m.h / 2 - s.y) < 170).sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
        if (!t) continue;
        s.cd = 1.2;
        Sp.shot([px(s.x), px(s.y)], [px(t.x), px(t.y - t.h / 2)], s.el, "orb").then(() => {
          if (t.dead) return;
          const dmg = Math.max(1, Math.round((s.dmg * (t.mon.st.curse ? 1.25 : 1) * 100) / (100 + t.mon.def * 1.2)));
          t.mon.hp -= dmg;
          t.hpBarT = 4;
          t.aggro = 6;
          Sp.number(px(t.x), px(t.y - t.h), dmg, "hit", 0);
          if (t.mon.hp <= 0) this.kill(t);
        });
      }
    },
    updateDrops(dt) {
      const h = this.hero;
      const p = G.player;
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        d.t += dt;
        if (!d.ground) {
          const py = d.y;
          d.vy = Math.min(MAX_FALL, d.vy + GRAV * dt);
          d.x = clamp(d.x + d.vx * dt, 10, this.map.W - 10);
          d.y += d.vy * dt;
          if (d.vy > 0) { const land = this.landing(d.x, py, d.y, null); if (land) { d.y = land.y; d.ground = land; d.vx = 0; } }
        }
        if (d.t > 0.35 && !this.dead && Math.abs(d.x - h.x) < 14 && d.y > h.y - HERO_H - 4 && d.y < h.y + 6) {
          if (d.kind === "gold") { p.gold += d.amount; Sp.number(px(d.x), px(d.y - 10), "+" + d.amount + "G", "gold", 0); }
          else { p.potions[d.kind]++; this.log(d.kind === "hp" ? "회복 물약을 주웠다." : "마나 물약을 주웠다."); }
          this.drops.splice(i, 1);
          this.refresh();
          continue;
        }
        if (d.t > 60) this.drops.splice(i, 1);
      }
    },
    updateNpcs(dt) {
      this.npcs.forEach((n) => {
        n.t += dt;
        n.walk -= dt;
        if (n.walk <= 0) { n.moving = !n.moving; n.walk = n.moving ? rnd(1.5, 3.5) : rnd(1, 3); if (n.moving && Math.random() < 0.5) n.dir = -n.dir; }
        if (n.moving) {
          n.x += n.dir * 30 * dt;
          if (n.x < 80) { n.x = 80; n.dir = 1; }
          if (n.x > 780) { n.x = 780; n.dir = -1; }
        }
      });
    },
    /* 강화 효과·지속 피해·자연 회복 */
    updateBuffs(dt) {
      const p = G.player;
      const ps = this.ps;
      const d = E.derive(p);
      const pa = p.job.passive;
      this.cds = this.cds.map((c) => Math.max(0, c - dt));
      ["atkUp", "rage", "counter", "evade", "weaken"].forEach((k) => { if (ps[k]) { ps[k].t -= dt; if (ps[k].t <= 0) delete ps[k]; } });
      if (ps.regen) {
        ps.regen.t -= dt;
        ps.regen.next -= dt;
        if (ps.regen.next <= 0) { ps.regen.next = 2; p.hp = Math.min(d.maxHp, p.hp + ps.regen.v); }
        if (ps.regen.t <= 0) delete ps.regen;
      }
      ["poison", "burn"].forEach((k) => {
        const o = ps[k];
        if (!o || this.dead) return;
        o.t -= dt;
        o.next -= dt;
        if (o.next <= 0) {
          o.next = 1;
          p.hp -= o.dmg;
          Sp.number(px(this.hero.x), px(this.hero.y - 46), o.dmg, "dot", 0);
          if (p.hp <= 0) this.die(null);
        }
        if (o.t <= 0) delete ps[k];
      });
      this.regenT += dt;
      if (this.regenT >= 5) {
        this.regenT = 0;
        if (!this.dead) {
          p.hp = Math.min(d.maxHp, p.hp + Math.round(d.maxHp * (0.01 + (pa.regen || 0))));
          p.mp = Math.min(d.maxMp, p.mp + Math.round(d.maxMp * (0.03 + (pa.mregen || 0))));
        }
      }
      if (pa.barrier) {
        ps.barrierT = (ps.barrierT || 0) + dt;
        if (ps.barrierT >= 20) { ps.barrierT = 0; ps.barrier = Math.max(ps.barrier || 0, Math.round(d.maxHp * pa.barrier)); }
      }
    },
    /* 쓰러짐: 불사조 특성이 있으면 한 번 되살아나고, 아니면 이 운명은 여기서 끝난다 */
    die(cause) {
      const p = G.player;
      const h = this.hero;
      if (this.dead) return;
      if (p.job.passive.revive && !p.reviveUsed) {
        p.reviveUsed = true;
        const d = E.derive(p);
        p.hp = Math.round(d.maxHp * 0.3);
        h.inv = 2;
        Sp.pillar(px(h.x), px(h.y), "fire", true);
        this.log("불사조의 불꽃이 타올라 되살아났다!", "good");
        this.refresh();
        return;
      }
      p.hp = 0;
      this.dead = true;
      h.atk = null;
      h.rope = null;
      this.refresh();
      X.sleep(1300).then(() => gameOver(cause ? cause.name : "독"));
    },

    /* ── 갱신 ── */
    update(dtMs) {
      if (this.cam === null) this.snapCamera();
      if (winTop() || G.busy) return;
      const dt = Math.min(0.05, dtMs / 1000);
      this.time += dt;
      this.updateHero(dt);
      this.updateMons(dt);
      this.updateShots(dt);
      this.updateSummons(dt);
      this.updateDrops(dt);
      this.updateNpcs(dt);
      if (!this.dead) this.updateBuffs(dt);
      this.quake = Math.max(0, this.quake - dt);
      if (this.flash) this.flash.t -= dt;
      this.updateCamera(dt);
      this.updateAmbient(dt);
      this.hudT -= dt;
      if (this.hudT <= 0) { this.hudT = 0.1; this.refresh(); }
      this.saveT += dt;
      if (this.saveT > 12) { this.saveT = 0; save(); }
    },
    camTarget() {
      const h = this.hero;
      const m = this.map;
      const tx = clamp(px(h.x) - VW / 2, 0, Math.max(0, px(m.W) - VW));
      const ty = clamp(px(h.y) - VH * 0.62, Math.min(0, px(m.H) - VH), Math.max(0, px(m.H) - VH));
      return [tx, ty];
    },
    snapCamera() { this.cam = this.camTarget(); },
    updateCamera(dt) {
      const [tx, ty] = this.camTarget();
      const k = Math.min(1, dt * 7);
      this.cam[0] += (tx - this.cam[0]) * k;
      this.cam[1] += (ty - this.cam[1]) * k;
    },
    updateAmbient(dt) {
      const kind = this.map.theme.ambient;
      const A = this.ambient;
      if (A.length < 26 && Math.random() < dt * 8) {
        const a = { x: Math.random() * VW, y: Math.random() * VH, vx: 0, vy: 0, t: 0, life: rnd(3, 7), kind };
        if (kind === "snow") { a.y = -4; a.vx = rnd(-8, 8); a.vy = rnd(18, 34); }
        else if (kind === "ember") { a.y = VH + 4; a.vy = -rnd(14, 30); a.vx = rnd(-6, 6); }
        else if (kind === "dust") { a.vx = rnd(4, 12); a.vy = rnd(-2, 2); }
        else if (kind === "petal") { a.y = -4; a.vx = rnd(10, 24); a.vy = rnd(10, 20); }
        else { a.vx = rnd(-6, 6); a.vy = rnd(-6, 6); }
        A.push(a);
      }
      for (let i = A.length - 1; i >= 0; i--) {
        const a = A[i];
        a.t += dt;
        a.x += a.vx * Z * dt + (a.kind === "firefly" || a.kind === "wisp" ? Math.sin(a.t * 2 + i) * 6 * dt * Z : 0);
        a.y += a.vy * Z * dt;
        if (a.t > a.life || a.y > VH + 8 || a.y < -10) A.splice(i, 1);
      }
    },

    /* ── 그리기 ── */
    draw(t) {
      const m = this.map;
      if (!this.cam) this.snapCamera();
      const qx = this.quake ? Math.round(rnd(-3, 3) * Z) : 0;
      const qy = this.quake ? Math.round(rnd(-2, 2) * Z) : 0;
      const cx = Math.round(this.cam[0]) + qx;
      const cy = Math.round(this.cam[1]) + qy;
      Wd.drawBackground(ctx, m, Z, cx, cy, VW, VH, t);
      ctx.save();
      ctx.translate(-cx, -cy);
      ctx.drawImage(Wd.renderMap(m, Z), 0, 0);
      /* 빛 번짐과 불꽃 */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      (m.lights || []).forEach((L) => {
        const fl = L.flame ? 0.85 + 0.15 * Math.sin(t / 70 + L.seed) : 0.9 + 0.1 * Math.sin(t / 600 + L.seed);
        Sp.glow(ctx, px(L.x), px(L.y), L.r * Z * fl, L.col, 0.32);
      });
      ctx.restore();
      (m.lights || []).forEach((L) => { if (L.flame && L.r > 40) Wd.drawFlame(ctx, px(L.x), px(L.y) + 4 * Z, Z, t, L.seed); });
      (m.doors || []).forEach((d) => { if (d.locked) Wd.drawSeal(ctx, d.x, d.y, Z, t); });
      this.drawNpcs(t);
      this.drawDrops(t);
      this.mons.forEach((mm) => this.drawMon(mm, t));
      this.drawSummons(t);
      this.drawHero(t);
      this.shots.forEach((s) => Sp.orbAt(ctx, px(s.x), px(s.y), 5 * Z, s.el));
      Sp.draw(ctx);
      X.draw(ctx);
      Sp.drawNumbers(ctx);
      this.drawHints(t);
      ctx.restore();
      if (this.dim) { ctx.fillStyle = `rgba(4,2,14,${this.dim})`; ctx.fillRect(0, 0, VW, VH); }
      if (this.flash && this.flash.t > 0) {
        ctx.globalAlpha = Math.min(0.45, this.flash.t * 2);
        ctx.fillStyle = this.flash.col;
        ctx.fillRect(0, 0, VW, VH);
        ctx.globalAlpha = 1;
      }
      this.drawAmbient();
      if (this.dead) {
        ctx.fillStyle = "rgba(20,0,10,0.35)";
        ctx.fillRect(0, 0, VW, VH);
      }
    },
    drawHero(t) {
      const h = this.hero;
      const pose = this.heroPose();
      const blink = h.inv > 0 && !this.dead && !h.casting && Math.floor(t / 80) % 2;
      if (h.ground) {
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.ellipse(px(h.x), px(h.ground.y), 13 * Z, 3.2 * Z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      HA.draw(ctx, G.player.job, px(h.x), px(h.y) + Z, {
        dir: h.dir, anim: pose.anim, f: pose.f, t: pose.t, h: HERO_PX(),
        alpha: this.dead ? 0.6 : blink ? 0.45 : 1, tint: pose.anim === "hurt" && !this.dead ? "#ff4050" : null, tintA: 0.35
      });
      if (this.ps.barrier > 0 && !this.dead) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(150,220,255,${0.25 + 0.1 * Math.sin(t / 150)})`;
        ctx.lineWidth = Math.max(1, Z);
        ctx.beginPath();
        ctx.ellipse(px(h.x), px(h.y - 21), 15 * Z, 24 * Z, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const rar = G.player.job.rarity;
      if (rar >= 3 && !this.dead && Math.random() < 0.15) Sp.spark(px(h.x + rnd(-10, 10)), px(h.y - rnd(0, 6)), { vy: -rnd(20, 50) * Z, life: 700, col: S.RARITY_COLOR[rar], glow: 0.7, size: 1 });
    },
    drawMon(m, t) {
      if (m.alpha <= 0) return;
      const img = m.img;
      const bd = m.bd;
      const mon = m.mon;
      let bob = 0;
      let sx = 1;
      let sy = 1;
      const moving = !m.dead && !mon.st.stun && (m.state === "walk" || m.aggro > 0);
      if (m.tpl === "slime") { const k = Math.sin(m.t * 6); sx = 1 + k * 0.06; sy = 1 - k * 0.06; }
      else if (m.fly) bob = Math.sin(m.t * 9) * 2 * Z;
      else if (moving) bob = -Math.abs(Math.sin(m.t * 7)) * 2 * Z;
      if (m.wind > 0 || (m.act && m.act.kind === "slam")) { sy = 0.88; sx = 1.08; }
      const fx = px(m.x);
      const fy = px(m.y);
      if (!m.fly && !m.air) {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(fx, fy, bd.w * 0.36, 3 * Z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.globalAlpha = m.alpha;
      ctx.translate(fx, fy + bob - (m.dead ? m.deadT * 30 * Z : 0));
      ctx.scale((m.dir < 0 ? -1 : 1) * sx, sy);
      const ox = -(bd.x0 + bd.w / 2);
      const oy = -(bd.y1 + 1);
      ctx.drawImage(img, Math.round(ox), Math.round(oy));
      if (m.flash > 0 || m.dead) { ctx.globalAlpha = m.alpha * (m.dead ? 0.6 : 0.8); ctx.drawImage(S.silhouette(img, "#ffffff"), Math.round(ox), Math.round(oy)); }
      else if (mon.enraged) { ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t / 120); ctx.drawImage(S.silhouette(img, "#ff3030"), Math.round(ox), Math.round(oy)); }
      else if (mon.st.charm) { ctx.globalAlpha = 0.25; ctx.drawImage(S.silhouette(img, "#ff8ad8"), Math.round(ox), Math.round(oy)); }
      ctx.restore();
      if (m.dead) return;
      const top = fy - bd.h - 6 * Z + bob;
      if (mon.st.stun) {
        for (let k = 0; k < 3; k++) {
          const a = t / 200 + (k * Math.PI * 2) / 3;
          ctx.fillStyle = mon.st.stunKind === "freeze" ? "#bff0ff" : "#ffe066";
          ctx.fillRect(Math.round(fx + Math.cos(a) * 10 * Z), Math.round(top + Math.sin(a) * 3 * Z), Math.max(2, Math.round(2 * Z)), Math.max(2, Math.round(2 * Z)));
        }
      }
      if (m.hpBarT > 0 && !mon.boss) {
        const w = Math.max(30 * Z, bd.w * 0.7);
        const x0 = Math.round(fx - w / 2);
        const y0 = Math.round(top - 2 * Z);
        ctx.fillStyle = "#0b0918";
        ctx.fillRect(x0 - 1, y0 - 1, Math.round(w) + 2, Math.round(3 * Z) + 2);
        ctx.fillStyle = "#3a1018";
        ctx.fillRect(x0, y0, Math.round(w), Math.round(3 * Z));
        ctx.fillStyle = "#e8504a";
        ctx.fillRect(x0, y0, Math.round(w * Math.max(0, mon.hp / mon.maxHp)), Math.round(3 * Z));
      }
    },
    drawNpcs(t) {
      const h = this.hero;
      this.npcs.forEach((n) => {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(px(n.x), px(this.map.groundY), 12 * Z, 3 * Z, 0, 0, Math.PI * 2);
        ctx.fill();
        HA.draw(ctx, n.job, px(n.x), px(this.map.groundY) + Z, { dir: n.dir, anim: n.moving ? "walk" : "idle", t: n.t, h: HERO_PX() });
        if (Math.abs(n.x - h.x) < 22 && !this.dead) this.bubble(px(n.x), px(this.map.groundY - 50), "대화", t);
      });
    },
    drawHints(t) {
      const h = this.hero;
      if (this.dead || !h.ground) return;
      (this.map.doors || []).forEach((d) => {
        if (Math.abs(d.x - h.x) < (d.kind === "cave" ? 40 : 26)) {
          const label = d.kind === "down" ? (d.locked ? "봉인됨" : "내려가기") : d.kind === "up" ? "마을로" : d.label;
          this.bubble(px(d.x), px(d.y - (d.kind === "cave" ? 92 : d.kind === "tablet" ? 76 : d.kind === "up" || d.kind === "down" ? 100 : 66)), label, t);
        }
      });
    },
    bubble(x, y, text, t) {
      ctx.save();
      ctx.font = `${Math.round(10 * Z / 1.5 + 4)}px Galmuri11, sans-serif`;
      const label = `▲ ${text}`;
      const w = ctx.measureText(label).width + 10 * Z / 1.5;
      const hgt = Math.round(10 * Z / 1.5 + 10);
      const yy = Math.round(y + Math.sin(t / 250) * 2 * Z);
      ctx.fillStyle = "rgba(11,9,24,0.85)";
      ctx.fillRect(Math.round(x - w / 2), yy - hgt, Math.round(w), hgt);
      ctx.strokeStyle = "#ece8ff";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x - w / 2) + 0.5, yy - hgt + 0.5, Math.round(w) - 1, hgt - 1);
      ctx.fillStyle = "#ffd75e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, Math.round(x), yy - hgt / 2 + 1);
      ctx.restore();
    },
    drawDrops(t) {
      this.drops.forEach((d) => {
        const x = px(d.x);
        const y = px(d.y) - (d.ground ? 4 * Z + Math.sin(t / 250 + d.spin) * 1.5 * Z : 0);
        if (d.kind === "gold") {
          const w = Math.abs(Math.cos(t / 160 + d.spin)) * 4 * Z + Z;
          ctx.fillStyle = "#8a5a10";
          ctx.beginPath(); ctx.ellipse(x, y, w + Z * 0.6, 4.6 * Z, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ffcf3a";
          ctx.beginPath(); ctx.ellipse(x, y, w, 4 * Z, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff6c0";
          ctx.fillRect(Math.round(x - w * 0.4), Math.round(y - 2.5 * Z), Math.max(1, Math.round(w * 0.4)), Math.max(1, Math.round(Z)));
        } else {
          const img = potionImg(d.kind);
          if (img.complete) ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height + 2 * Z));
        }
      });
    },
    drawSummons(t) {
      this.summons.forEach((s) => {
        const x = px(s.x);
        const y = px(s.y);
        Sp.orbAt(ctx, x, y, 6 * Z, s.el);
        ctx.fillStyle = "#0b0918";
        ctx.fillRect(Math.round(x - 2 * Z), Math.round(y - Z), Math.max(1, Math.round(Z)), Math.max(1, Math.round(Z)));
        ctx.fillRect(Math.round(x + Z), Math.round(y - Z), Math.max(1, Math.round(Z)), Math.max(1, Math.round(Z)));
        if (Math.random() < 0.2) Sp.spark(x + rnd(-6, 6) * Z, y + rnd(-6, 6) * Z, { vy: -20 * Z, life: 500, col: Sp.PAL[s.el][1], glow: 0.7, size: 1 });
      });
    },
    drawAmbient() {
      this.ambient.forEach((a) => {
        const f = Math.min(1, a.t * 2, (a.life - a.t) * 2);
        const s = Math.max(1, Math.round(Z));
        ctx.globalAlpha = Math.max(0, f) * 0.8;
        switch (a.kind) {
          case "snow": ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(a.x), Math.round(a.y), s, s); break;
          case "ember": ctx.fillStyle = Math.random() < 0.5 ? "#ff6ad8" : "#ffb06a"; ctx.fillRect(Math.round(a.x), Math.round(a.y), s, s); break;
          case "firefly": case "wisp":
            Sp.glow(ctx, a.x, a.y, 5 * Z, a.kind === "wisp" ? "#b3a6ff" : "#c8ff8a", 0.5 * f);
            ctx.fillStyle = a.kind === "wisp" ? "#e0d8ff" : "#eaffc0"; ctx.fillRect(Math.round(a.x), Math.round(a.y), s, s); break;
          case "petal": ctx.fillStyle = "#ffd0e0"; ctx.fillRect(Math.round(a.x), Math.round(a.y), s * 2, s); break;
          default: ctx.fillStyle = "#c8a880"; ctx.fillRect(Math.round(a.x), Math.round(a.y), s, s);
        }
      });
      ctx.globalAlpha = 1;
    }
  };
  const px = (v) => v * Z;
  const HERO_PX = () => Math.round(52 * Z);
  const potionCache = {};
  function potionImg(kind) {
    const key = kind + Z;
    if (!potionCache[key]) { const img = new Image(); img.src = S.icon(kind === "mp" ? "ether" : "potion", Math.round(Z)); potionCache[key] = img; }
    return potionCache[key];
  }

  /* 쓰러지면 이 운명은 끝: 명예의 전당에 오르고 새 운명을 뽑는다 */
  function gameOver(cause) {
    const p = G.player;
    const bonus = Math.min(3, Math.floor(p.best / 10));
    G.tokens = Math.min(5, G.tokens + bonus);
    store.set("tokens", G.tokens);
    addHall(p, cause);
    store.del("save");
    closeAll();
    openWin(`<h2 class="win-h over">쓰러졌다…</h2>
      <div class="over-body"><img src="${thumb(p.job)}" alt="">
      <p><b>${esc(p.name)}</b><br><span class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</span> · Lv.${p.level}<br>최고 기록 지하 ${p.best}층 · 처치 ${fmt(p.kills)}<br>${esc(J(cause, "에게"))} 쓰러짐</p></div>
      <p class="win-msg">${bonus ? `깊이 내려간 보답으로 다음 운명의 재굴림 기회 +${bonus}` : "10층을 넘길 때마다 다음 운명의 재굴림 기회가 늘어납니다."}</p>
      <div class="opts"><button class="opt primary" type="button" data-opt="new">새로운 운명</button><button class="opt" type="button" data-opt="hall">명예의 전당</button><button class="opt" type="button" data-opt="title">타이틀로</button></div>`, {
      cls: "win-center", noBack: true,
      onPick: (v) => {
        if (v === "hall") { openHall(); return; }
        G.player = null;
        if (v === "new") { closeAll(); startRoll(null); }
        if (v === "title") { closeAll(); setScene(Title); }
      }
    });
  }

  /* ── 트윈 ── */
  const tweens = [];
  function tween(obj, to, ms) {
    return new Promise((res) => {
      const from = {};
      Object.keys(to).forEach((k) => { from[k] = obj[k]; });
      tweens.push({ obj, from, to, t: 0, ms: Math.max(1, ms), res });
    });
  }
  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      Object.keys(tw.to).forEach((key) => { tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e; });
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }

  /* ── 이어하기 ── */
  function continueGame() {
    const saved = store.get("save", null);
    if (!saved) { Title.menu(); return; }
    G.player = unpackPlayer(saved.player);
    closeAll();
    fade(() => setScene(Stage, { floor: saved.place === "dungeon" ? Math.max(1, G.player.floor) : 0 }));
  }

  /* ── 루프 ── */
  let last = 0;
  function frame(now) {
    const dt = Math.min(50, now - (last || now));
    last = now;
    G.t += dt;
    X.tick(dt);
    X.update(dt);
    X.updatePops(dt);
    Sp.update(dt);
    updateTweens(dt);
    if (G.scene) {
      G.scene.update(dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      G.scene.draw(G.t);
    }
    root.requestAnimationFrame(frame);
  }

  function snapshot() {
    return { player: G.player ? packPlayer(G.player) : null, place: G.place };
  }

  function start(data) {
    G.tokens = store.get("tokens", 0);
    G.codex = new Set(store.get("codex", []));
    G.hall = store.get("hall", []);
    HA.preload();
    resize();
    bindPad();
    root.addEventListener("resize", () => resize());
    if (data && data.player) {
      G.player = unpackPlayer(data.player);
      setScene(Stage, { floor: data.place === "dungeon" ? Math.max(1, G.player.floor) : 0 });
    } else setScene(Title);
    root.requestAnimationFrame(frame);
  }

  F.game = { G, Stage, Title, Roll, setScene, openCodex, openHall, held, closeAll };

  const hot = root.claude && root.claude.hot;
  if (hot && typeof hot.snapshot === "function") hot.snapshot(snapshot);
  if (hot && typeof hot.ready === "function") hot.ready(start);
  else if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => start((hot && hot.data) || {}));
  else start((hot && hot.data) || {});
})(window);
