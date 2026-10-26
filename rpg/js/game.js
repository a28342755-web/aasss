/*
 * 삼천의 운명 — 게임 진행
 * 화면 하나(캔버스) 위에 장면(타이틀·운명 뽑기·마을·전투)을 그리고, 글자가 필요한 창은 DOM으로 띄운다.
 * 마을은 메뉴로 다니고, 던전의 각 층(밤의 숲·언덕·폐성…)에서는 포켓몬처럼 몬스터와 1대1로 번갈아 싸운다.
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
     hires 장면은 화면 픽셀 그대로 그리고 캐릭터·몬스터를 Z배로 그린다. */
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  let VW = 360;
  let VH = 480;
  let SCALE = 1;
  let Z = 2;
  const touch = !!(root.matchMedia && root.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in root;
  const PAD_H = 164;

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
     방향키로 고르고 Z·Enter·Space로 결정, X·Esc로 취소. 모든 조작은 창(메뉴)으로 한다 */
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    KeyZ: "a", Space: "a", Enter: "a", NumpadEnter: "a", Escape: "b", KeyX: "b", Backspace: "b"
  };
  function press(k) {
    if (winTop()) { winKey(k); return; }
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
    /* 방향키는 누르고 있으면 되풀이, 결정·취소는 한 번만 */
    if (!ev.repeat || k === "up" || k === "down" || k === "left" || k === "right") press(k);
  });

  function bindPad() {
    doc.querySelectorAll("#pad [data-k]").forEach((btn) => {
      const k = btn.dataset.k;
      const down = (ev) => {
        ev.preventDefault();
        btn.classList.add("on");
        press(k);
      };
      const up = (ev) => {
        ev.preventDefault();
        btn.classList.remove("on");
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

  /* 타이틀·운명 뽑기의 하늘: 마을과 같은 밤(참고: 마법사의 밤) */
  const skyMap = { theme: null, groundY: 0 };
  function drawSky(t, groundY) {
    skyMap.theme = Wd.TOWN_THEME;
    skyMap.groundY = (groundY === undefined ? VH * 0.8 : groundY) / (G.scene && G.scene.hires ? Z : 2);
    Wd.drawBackground(ctx, skyMap, G.scene && G.scene.hires ? Z : 2, t * 0.02, 0, VW, VH, t);
  }
  /* 참고 그림의 땅: 보랏빛 몸 위로 밝은 줄 두 개 */
  function groundBand(y) {
    const g = Wd.TOWN_THEME.ground;
    const e = (n) => Math.max(1, Math.round((n * Z) / 2));
    ctx.fillStyle = g.body; ctx.fillRect(0, y, VW, VH - y);
    ctx.fillStyle = g.top; ctx.fillRect(0, y, VW, e(4));
    ctx.fillStyle = g.top2; ctx.fillRect(0, y + e(4), VW, e(2));
    ctx.fillStyle = g.speck[0];
    for (let x = 11; x < VW; x += e(31)) ctx.fillRect(x, y + e(12 + (x % 13)), e(2), e(2));
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
    /* 타이틀: 무작위 직업 일곱이 한 줄로 서 있고, 가끔 한 명씩 다른 운명으로 바뀐다 */
    enter() {
      this.parade = [];
      for (let i = 0; i < 7; i++) this.parade.push({ job: E.randomJob(), t: Math.random() * 3, flash: 0 });
      this.swapT = 2400;
      this.menu();
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
      this.swapT -= dt;
      this.parade.forEach((w) => { w.t += dt / 1000; w.flash = Math.max(0, w.flash - dt / 1000); });
      if (this.swapT <= 0) {
        this.swapT = 2200 + Math.random() * 1200;
        const w = this.parade[Math.floor(Math.random() * this.parade.length)];
        w.job = E.randomJob();
        w.flash = 0.5;
      }
    },
    draw(t) {
      const ground = Math.round(VH * 0.86);
      drawSky(t, ground);
      ctx.drawImage(titleStrip(), 0, ground - 4);
      const hh = Math.round(Math.min(VH * 0.17, 110));
      const gap = VW / this.parade.length;
      this.parade.forEach((w, i) => {
        const x = Math.round(gap * (i + 0.5));
        shadow(x, ground + 3, hh * 0.2, hh * 0.05);
        HA.draw(ctx, w.job, x, ground + 4, { dir: i < this.parade.length / 2 ? 1 : -1, anim: "idle", t: w.t, h: hh, still: w.flash > 0 });
        if (w.flash > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          Sp.glow(ctx, x, ground - hh * 0.4, hh * 0.6, S.RARITY_COLOR[w.job.rarity], w.flash);
          ctx.restore();
        }
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
        setScene(Town);
        say([`<b>${esc(name)}</b>의 운명은 <b class="rar-t-${G.player.job.rarity}">${esc(G.player.job.name)}</b>.`,
          `전투는 차례대로 명령을 고르는 턴제다. 던전 한 층마다 몬스터 셋이 기다리고, 10층마다 마지막에 보스가 길을 막는다.`,
          `마을 메뉴에서 던전으로 내려가거나 상점·여관·길드를 고를 수 있다. 쓰러지면 이 운명은 끝난다.`]);
      });
    },
    /* ── 캐릭터 시트: 뽑힌 직업이 기본 공격·기술·궁극기를 차례로 보여 준다 ── */
    DEMO: [["idle", "대기", 1.2], ["attack", "기본 공격", 1.3], ["skill", "기술", 1.8], ["ult", "궁극기", 3.4]],
    heroH() {
      return Math.round(Math.min(VH * 0.27, 180, VW * 0.4));
    },
    demoSpot() {
      const reach = reachOf(this.shown);
      const gy = this.groundY();
      const dx = Math.round(VW * 0.7);
      const hh = this.heroH();
      const hx = reach.far ? Math.round(VW * 0.32) : Math.round(dx - hh * 0.8);
      return { reach, gy, dx, hx };
    },
    /* 전투의 기술·궁극기 연출(Moves)을 가짜 무대(허수아비 하나)로 그대로 쓴다 */
    demoStage() {
      const sp = this.demoSpot();
      const job = this.shown;
      const dummy = { x: sp.dx / Z, y: sp.gy / Z, h: 30, w: 30, fly: false, dead: false, mon: { hp: 1 } };
      const fake = {
        hero: { x: sp.hx / Z, y: sp.gy / Z, dir: 1, casting: false, inv: 0, atk: null },
        reach: sp.reach, quake: 0, dim: 0, flash: null,
        pickTargets: () => [dummy],
        applySkill: () => { this.hitT = 0.2; }
      };
      return { fake, dummy, job };
    },
    demoFire(step) {
      const { fake, dummy, job } = this.demoStage();
      const sp = this.demoSpot();
      if (step === "attack") {
        const a = job.attack;
        weaponFx(fake, a.el, [dummy], sp.reach.weapon.far ? sp.reach.weapon.range : sp.reach.weapon.reach).then(() => { this.hitT = 0.15; });
      }
      if (step === "skill") {
        const sk = this.demoSkill();
        const plan = visPlan(sk, sp.reach.far);
        if (!SELF_TYPES.has(sk.type)) Moves.skillVisual.call(fake, sk, plan, [dummy]).then(() => { this.hitT = 0.2; });
        else {
          /* 공격 기술이 없는 직업은 자기 강화 연출을 보여 준다 */
          const el = sk.el === "phys" ? "light" : sk.el;
          if (sk.type === "heal" || sk.type === "regen") Sp.heal(sp.hx, sp.gy);
          else if (sk.type === "shield") Sp.shieldBubble(sp.hx, sp.gy - 22 * Z, 26 * Z);
          else Sp.aura(sp.hx, sp.gy, el);
        }
      }
      if (step === "ult") {
        const sk = job.skills[4];
        this.demoFake = fake;
        Moves.castUlt.call(fake, sk, visPlan(sk, sp.reach.far));
      }
    },
    /* 시트에 보여 줄 기술: 앞쪽 네 기술 가운데 첫 공격 기술(없으면 첫 기술) */
    demoSkill() {
      const job = this.shown;
      return job.skills.slice(0, 4).find((sk) => !SELF_TYPES.has(sk.type)) || job.skills[0];
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
      const caster = sp.reach.caster;
      switch (this.DEMO[d.step][0]) {
        case "idle": return { x: sp.hx, y: sp.gy, anim: "idle", t: d.t, f: 0 };
        case "attack": case "skill": {
          const s = d.t;
          const mo = sp.reach.motion === "melee" ? "slash" : sp.reach.motion;
          if (s > 0.6) return { x: sp.hx, y: sp.gy, anim: "idle", t: s, f: 0 };
          if (caster) return { x: sp.hx, y: sp.gy, anim: mo, t: s, f: s < 0.16 ? 0 : 1 };
          return { x: sp.hx, y: sp.gy, anim: mo, t: s, f: s < 0.13 ? 0 : s < 0.28 ? 1 : 2 };
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
      const gy = this.groundY();
      drawSky(t, gy + 10);
      groundBand(gy + 10);
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
          HA.draw(ctx, this.shown, VW / 2, gy + 4, { dir: 1, anim: "idle", t: t / 1000, h: hh, alpha: rolling ? 0.8 : 1, still: rolling });
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
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b><br>"던전은 10층마다 보스가 다음 문을 봉인하고 있대. 물약은 넉넉히 챙겨."`
    ];
    say(lines[Math.floor(Math.random() * lines.length)] + `<br><small>(직업 도감에 기록됨)</small>`);
  }

  function tabletTalk() {
    const p = G.player;
    say([`운명의 석판이 빛난다…<br>"<b>${esc(p.name)}</b>, 그대의 운명은 <b class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</b>."`, `지금까지 만난 직업 <b>${fmt(G.codex.size)}</b> / 3,000. 최고 기록 <b>${p.best}</b>층.`]);
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
    const rows = (touch
      ? [["▲ ▼ ◀ ▶", "명령 고르기"], ["A", "결정 · 전투 연출 빨리 넘기기"], ["B", "취소 · 명령으로 돌아가기"]]
      : [["방향키", "명령 고르기"], ["Z · Enter · Space", "결정 · 전투 연출 빨리 넘기기"], ["X · Esc", "취소 · 명령으로 돌아가기"]])
      .concat([["공격", "무기로 치고 MP를 조금 회복"], ["기술", "MP를 써서 기술 사용 (Lv.1·1·4·7·10에 배움)"], ["방어", "받는 피해 절반, MP 회복"], ["도구", "물약 (한 차례를 쓴다)"], ["도망", "보상 없이 다음 싸움으로 (보스전 불가)"]]);
    openWin(`<h2 class="win-h">조작 안내</h2><dl class="sheet help">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      <p class="win-msg">전투는 주인공과 몬스터가 한 번씩 번갈아 움직이는 턴제다. 한 층에 몬스터 셋, 10층마다 마지막에 보스. 쓰러지면 그 운명은 끝난다.</p>
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
    const w = openWin(`<h2 class="win-h">메뉴</h2><div class="opts">
      <button class="opt" type="button" data-opt="status">상태</button>
      <button class="opt" type="button" data-opt="items">도구 <small>HP ${p.potions.hp} · MP ${p.potions.mp}</small></button>
      <button class="opt" type="button" data-opt="codex">직업 도감</button>
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

  function openItems(onDone) {
    const p = G.player;
    const pot = 1 + (p.job.passive.pot || 0);
    const w = openWin(`<h2 class="win-h">도구</h2><div class="opts">
      <button class="opt" type="button" data-opt="hp"${p.potions.hp ? "" : " disabled"}><img src="${S.icon("potion", 2)}" alt="">회복 물약 <small>${p.potions.hp}개 · HP ${Math.round(40 * pot)}%</small></button>
      <button class="opt" type="button" data-opt="mp"${p.potions.mp ? "" : " disabled"}><img src="${S.icon("ether", 2)}" alt="">마나 물약 <small>${p.potions.mp}개 · MP ${Math.round(50 * pot)}%</small></button>
      <button class="opt" type="button" data-opt="close">닫기</button></div><p class="win-msg" role="status"></p>`, {
      onClose: onDone,
      onPick: (v) => {
        if (v === "close") { closeWin(w); return; }
        const res = E.drink(p, v);
        save();
        w.o.onClose = null;
        closeWin(w);
        openItems(onDone);
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
            closeAll();
            if (G.scene === Town) Town.jobChanged();
            say([`두루마리가 빛나며 운명이 다시 쓰였다!`, `새 직업: <b class="rar-t-${res.job.rarity}">${rarName(res.job.rarity)} ${esc(res.job.name)}</b>`], () => { if (onDone) onDone(); });
          });
          return;
        }
        const res = E.buy(p, v);
        save();
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

  /* ─────────────────────── 마을·전투 장면 ─────────────────────── */
  /* 거리는 기본 단위(주인공 키 ≈ 44)로 적고, 화면에는 Z배로 그린다 */
  const FLYERS = new Set(["bat", "harpy", "dragon", "ghost", "wisp", "bird", "eye"]);
  const SHOOTERS = new Set(["witch", "wisp", "eye", "caped"]);
  const SELF_TYPES = new Set(["heal", "regen", "buff", "rage", "shield", "counter", "summon"]);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* 캐릭터 그림에 맞춘 싸움 방식: 근접은 베기, 활·총·던지기는 날아가는 것, 마법은 속성 주문 */
  const CAST_OF = { staff: "cast", talisman: "cast", book: "read", orb: "raise", summon: "raise", music: "play" };
  function reachOf(job) {
    const style = F.heroes.styleOf(job);
    const weapon = F.heroes.weaponOf(job);
    const motion = weapon.far ? (weapon.caster ? CAST_OF[weapon.key] : "shoot") : weapon.motion;
    return { style, weapon, motion, shot: weapon.shot || style.shot || "orb", caster: !!weapon.caster, far: !!weapon.far };
  }
  /* 무기별 공격 연출(기본 공격과 연타 기술이 같이 쓴다). st: 무대(hero·reach), targets: 맞을 몬스터(없으면 허공으로).
     돌려주는 Promise가 끝나는 순간이 맞는 순간이다 */
  function weaponFx(st, el, targets, range) {
    const h = st.hero;
    const W = st.reach.weapon;
    const d = h.dir;
    const hand = [px(h.x + d * 16), px(h.y - 24)];
    const t0 = targets[0];
    const aim = t0 ? [px(t0.x), px(t0.y - t0.h * 0.5)] : [px(h.x + d * range), hand[1]];
    const hy = px(h.y - 22);
    switch (W.key) {
      case "spear": Sp.thrust(px(h.x + d * 8), hy, d, el, W.reach * Z * 0.95, false); return X.sleep(60);
      case "dagger": Sp.thrust(px(h.x + d * 8), hy + 2 * Z, d, el, W.reach * Z * 0.85, false); return X.sleep(40);
      case "heavy": Sp.smash(px(h.x + d * 16), px(h.y), d, el, false); st.quake = Math.max(st.quake || 0, 0.14); return X.sleep(90);
      case "twin":
        Sp.slash(px(h.x + d * 20), hy, d, el, false, false);
        X.sleep(110).then(() => Sp.slash(px(h.x + d * 22), hy + 2 * Z, d, el, false, true));
        return X.sleep(40);
      case "fist": st.jab = !st.jab; Sp.punch(px(h.x + d * 24), hy + (st.jab ? 0 : 4) * Z, d, el); return X.sleep(30);
      case "whip": Sp.lash(hand[0], hand[1], d, el, W.reach * Z); return X.sleep(110);
      case "scythe": Sp.sweep(px(h.x + d * 4), px(h.y - 18), d, el); return X.sleep(90);
      case "sword": st.swing = !st.swing; Sp.slash(px(h.x + d * 20), hy, d, el, false, st.swing); return X.sleep(30);
      case "orb": return Sp.beam(hand, aim, el);
      case "book": return Sp.runeAt(aim[0], aim[1], el);
      case "cannon": return Sp.shot(hand, aim, el, "bomb").then(() => { st.quake = Math.max(st.quake || 0, 0.12); });
      default: return Sp.shot(hand, aim, el, st.reach.shot);
    }
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

  /* 기술 연출(전투와 운명 뽑기 시연이 같이 쓴다). this는 무대: hero{x,y,dir,casting}, reach, quake, dim, flash,
     pickTargets(plan), applySkill(궁극기가 내리치는 순간). 돌려주는 Promise가 끝나는 순간 피해가 들어간다 */
  const Moves = {
    /* 기술 연출: 기술 종류마다 다른 동작과 덧연출. 돌려주는 Promise가 끝나는 순간 피해가 들어간다 */
    skillVisual(sk, plan, targets) {
      const h = this.hero;
      const el = sk.el;
      const far = this.reach.far;
      const hand = [px(h.x + h.dir * 16), px(h.y - 24)];
      const list = targets.length ? targets.slice(0, 4) : [null];
      const at = (m) => (m ? [px(m.x), px(m.y - m.h / 2)] : [px(h.x + h.dir * Math.min(plan.range, 200)), hand[1]]);
      const gyOf = (m) => (m ? px(m.fly ? m.y + 10 : m.y) : px(h.y));
      if (plan.area === "around") {
        Sp.impact(px(h.x), px(h.y - 20), el, true);
        [-1, 1].forEach((sg) => (el === "fire" ? Sp.flames : Sp.crystals)(px(h.x + sg * 50), px(h.y), el, 70 * Z, true));
        Sp.ring(px(h.x), px(h.y), el, 120 * Z);
        this.quake = 0.25;
        return X.sleep(140);
      }
      let go;
      switch (sk.type) {
        case "pierce":
          /* 꿰뚫기: 근접은 길게 찌르고, 원거리는 곧게 뻗는 광선 */
          if (!far) Sp.thrust(px(h.x + h.dir * 8), px(h.y - 22), h.dir, el, plan.range * Z, true);
          else Sp.beam(hand, [px(h.x + h.dir * plan.range), hand[1]], el);
          this.quake = 0.1;
          go = X.sleep(90);
          break;
        case "multi":
          /* 연타: 무기 공격을 빠르게 세 번 */
          go = Promise.all([0, 1, 2].map((i) => X.sleep(i * 110).then(() => weaponFx(this, el, targets, far ? 220 : plan.range))));
          break;
        case "strike":
        case "stun":
          /* 강타·기절: 내려찍고 땅이 울린다 */
          if (!far) { Sp.smash(px(h.x + h.dir * 18), px(h.y), h.dir, el, true); go = X.sleep(110); }
          else go = Moves.deliver.call(this, sk, plan, targets);
          go = go.then(() => list.forEach((m) => Sp.ring(at(m)[0], gyOf(m), el, 64 * Z)));
          this.quake = 0.18;
          break;
        default:
          go = Moves.deliver.call(this, sk, plan, targets);
      }
      return go.then(() => {
        list.forEach((m) => {
          const [x, y] = at(m);
          const gy = gyOf(m);
          switch (sk.type) {
            case "burn": Sp.flames(x, gy, "fire", 36 * Z, false); break;
            case "poison": Sp.cloud(x, gy, "poison"); break;
            case "curse": Sp.cloud(x, gy, "curse"); break;
            case "bleed": Sp.drops(x, y); break;
            case "freeze": Sp.crystals(x, gy, "ice", 40 * Z, false); break;
            case "drain": Sp.stream([x, y], hand, "#ff5a7a"); break;
            case "mana": Sp.stream([x, y], hand, "#5ac8ff"); break;
            case "charm": Sp.hearts(x, y - 10 * Z); break;
            case "debuff": Sp.weaken(x, y); break;
            case "gold": Sp.coins([x, y], hand); break;
            case "gamble": Sp.dice(x, y); break;
            case "crit": case "execute": Sp.cross(x, y, el); break;
            default: break;
          }
        });
      });
    },
    /* 싸움 방식대로 기술을 날린다(근접은 무기 동작, 활·총·던지기는 물건, 마법은 속성 주문) */
    deliver(sk, plan, targets) {
      const h = this.hero;
      const el = sk.el;
      const st = this.reach.style;
      const hand = [px(h.x + h.dir * 16), px(h.y - 24)];
      const first = targets[0];
      const center = (m) => [px(m.x), px(m.y - m.h / 2)];
      const aim = first ? center(first) : [px(h.x + h.dir * Math.min(plan.range, 200)), hand[1]];
      const list = targets.length ? targets.slice(0, 4) : [null];
      if (st.reach === "melee") {
        const go = weaponFx(this, el, targets, plan.range);
        if (el !== "phys") list.forEach((m) => Moves.groundFx.call(this, el, m, false));
        return go;
      }
      if (st.reach !== "magic") {
        /* 활·총·던지기: 대상마다 자기 물건을 날리고, 속성이 있으면 맞은 자리에 터진다 */
        return Promise.all(list.map((m, i) => X.sleep(i * 70).then(() => Sp.shot(hand, m ? center(m) : aim, el, this.reach.shot))))
          .then(() => { if (el !== "phys") list.forEach((m) => Moves.groundFx.call(this, el, m, false)); });
      }
      switch (el) {
        case "fire":
          return Sp.shot(hand, aim, "fire", "fireball").then(() => list.forEach((m) => Moves.groundFx.call(this, "fire", m, false)));
        case "bolt": {
          let prev = hand;
          list.forEach((m) => { const to = m ? center(m) : aim; Sp.bolt(prev, to, "bolt"); prev = to; });
          return X.sleep(90);
        }
        case "dark": case "arcane": case "phys":
          return Sp.shot(hand, aim, el === "phys" ? "arcane" : el, "fireball");
        default:
          list.forEach((m) => Moves.groundFx.call(this, el, m, plan.targets > 3));
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
      Sp.circle(px(h.x), px(h.y), el, 1500);
      this.dim = 0.25;
      return X.sleep(620).then(() => {
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
            if (sk.el !== "phys") xs.forEach((x, i) => X.sleep(120 + i * 60).then(() => Moves.groundFx.call(this, sk.el, targets[i] || null, true)));
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
    }
  };

  /* 연출에 쓰는 기술 범위(피해·효과는 engine이 정한다) */
  function visPlan(sk, far) {
    const ult = sk.tag === "ult";
    const pierce = sk.type === "pierce";
    return {
      ult, area: ult ? "screen" : sk.type === "nuke" ? "around" : "front",
      range: pierce ? (far ? 250 : 160) : far ? 190 : 84, targets: sk.type === "nuke" ? 8 : 1
    };
  }

  /* 밤하늘에 떠도는 것(눈·불티·반딧불이·꽃잎·먼지) */
  const Ambient = {
    list: [],
    update(dt, kind) {
      const A = this.list;
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
    draw() {
      this.list.forEach((a) => {
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

  /* 주인공 한 명 그리기: 발밑 그림자, 그림, 보호막 테두리, 등급 반짝이 */
  function drawHeroAt(job, x, y, pose, o) {
    const hh = HERO_PX();
    shadow(x, y + Z, hh * 0.2, hh * 0.05, 0.32);
    HA.draw(ctx, job, x, y + Z, {
      dir: 1, anim: pose.anim, f: pose.f, t: pose.t, alt: pose.alt, h: hh, alpha: o && o.alpha !== undefined ? o.alpha : 1,
      tint: o && o.hurt ? "#ff4050" : null, tintA: 0.35
    });
    if (o && o.barrier) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(150,220,255,${0.25 + 0.1 * Math.sin(G.t / 150)})`;
      ctx.lineWidth = Math.max(1, Z);
      ctx.beginPath();
      ctx.ellipse(x, y - 21 * Z, 15 * Z, 24 * Z, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (job.rarity >= 3 && Math.random() < 0.12) Sp.spark(x + rnd(-10, 10) * Z, y - rnd(0, 6) * Z, { vy: -rnd(20, 50) * Z, life: 700, col: S.RARITY_COLOR[job.rarity], glow: 0.7, size: 1 });
  }

  /* ─────────────────────── 마을 ─────────────────────── */
  /* 걸어 다니지 않는 마을: 메뉴에서 고른 곳으로 화면이 옮겨 가고, 주인공은 그 앞에 서 있다 */
  const TOWN_SPOTS = { dungeon: 862, shop: 150, inn: 330, guild: 540, tablet: 436 };
  const Town = {
    hires: true,
    enter() {
      const p = G.player;
      G.place = "town";
      this.map = Wd.makeTown();
      this.spot = "dungeon";
      this.pick = "dungeon";
      this.camX = null;
      this.hx = TOWN_SPOTS.dungeon - 40;
      this.npcs = [255, 640, 738].map((x) => ({ job: E.randomJob(), x: x + rnd(-20, 20), dir: Math.random() < 0.5 ? -1 : 1, t: Math.random() * 3 }));
      [p.job].concat(this.npcs.map((n) => n.job)).forEach((j) => HA.warm(j, HERO_PX()));
      Ambient.list = [];
      this.hud();
      save();
    },
    hud() {
      const p = G.player;
      const d = E.derive(p);
      const r = (a, b) => `${Math.max(0, Math.min(100, (a / b) * 100)).toFixed(1)}%`;
      $("hud").className = "hud-stage";
      $("hud").innerHTML = `
        <div class="hud-plate stage-plate">
          <div class="hud-l"><b>${esc(p.name)}</b><span class="rar-t-${p.job.rarity}">${esc(p.job.name)}</span><span>Lv.${p.level}</span></div>
          <div class="hud-bars"><i class="hp"><b style="width:${r(p.hp, d.maxHp)}"></b><em>${fmt(p.hp)}/${fmt(d.maxHp)}</em></i><i class="mp"><b style="width:${r(p.mp, d.maxMp)}"></b><em>${fmt(p.mp)}/${fmt(d.maxMp)}</em></i><i class="xp"><b style="width:${r(p.exp, E.expNeed(p.level))}"></b></i></div>
          <div class="hud-r"><span class="where">마을</span><span class="gold">${fmt(p.gold)} G</span><span class="pots">물약 ${p.potions.hp} · ${p.potions.mp}</span></div>
        </div>`;
      this.hudKey = `${p.hp}|${p.mp}|${p.gold}|${p.level}|${p.exp}|${p.job.id}|${p.potions.hp}|${p.potions.mp}`;
    },
    menu() {
      const p = G.player;
      const pr = E.prices(p);
      openWin(`<h2 class="win-h">마을 <small>${esc(Wd.TOWN_THEME.name)}</small></h2><div class="opts">
        <button class="opt primary" type="button" data-opt="dungeon">던전으로 <small>${Math.max(1, p.floor)}층부터</small></button>
        <button class="opt" type="button" data-opt="shop">상점 <small>${fmt(p.gold)}G</small></button>
        <button class="opt" type="button" data-opt="inn">여관 <small>${pr.inn ? fmt(pr.inn) + "G" : "무료"}</small></button>
        <button class="opt" type="button" data-opt="guild">모험가 길드</button>
        <button class="opt" type="button" data-opt="tablet">운명의 석판</button>
        <button class="opt" type="button" data-opt="talk">주민과 이야기</button>
        <button class="opt" type="button" data-opt="menu">메뉴 <small>상태·도구·저장</small></button></div>`, {
        cls: "win-town", noBack: true, focus: this.pick || "dungeon",
        onFocus: (v) => { if (TOWN_SPOTS[v]) this.spot = v; },
        onPick: (v, b, w) => {
          closeWin(w);
          this.pick = v;
          if (TOWN_SPOTS[v]) this.spot = v;
          if (v === "dungeon") goFloor(Math.max(1, p.floor));
          if (v === "shop") openShop();
          if (v === "inn") innTalk();
          if (v === "guild") guildMenu();
          if (v === "tablet") tabletTalk();
          if (v === "talk") { const n = this.npcs.reduce((a, c) => (Math.abs(c.x - this.hx) < Math.abs(a.x - this.hx) ? c : a)); npcTalk(n, { x: this.hx }); }
          if (v === "menu") openMenu();
        }
      });
    },
    /* 전직의 두루마리로 직업이 바뀌면 새 그림을 미리 준비한다 */
    jobChanged() {
      HA.warm(G.player.job, HERO_PX());
      Sp.pillar(px(this.hx) - this.camX, this.groundScreenY(), "light", true);
    },
    groundScreenY() {
      return Math.round(VH * (VW < 560 ? 0.5 : 0.72));
    },
    update(dt) {
      const p = G.player;
      if (!winTop() && !G.busy) this.menu();
      const s = dt / 1000;
      /* 고른 곳으로 화면이 미끄러지고, 주인공은 그 건물 앞에 선다 */
      const goal = TOWN_SPOTS[this.spot] + (this.spot === "dungeon" ? -40 : 20);
      if (Math.abs(goal - this.hx) > 1) {
        this.fadeT = (this.fadeT || 0) + s;
        if (this.fadeT > 0.12) { this.hx = goal; this.fadeT = 0; Sp.sparkBurst(px(this.hx), this.groundScreenY() + (this.camY || 0) - 20 * Z, "light", 8, 40); }
      }
      const tx = clamp(px(this.hx) - VW * (VW < 560 ? 0.5 : 0.36), 0, Math.max(0, px(this.map.W) - VW));
      if (this.camX === null) this.camX = tx;
      this.camX += (tx - this.camX) * Math.min(1, s * 6);
      this.camY = px(this.map.groundY) - this.groundScreenY();
      this.npcs.forEach((n) => { n.t += s; });
      Ambient.update(s, this.map.theme.ambient);
      const key = `${p.hp}|${p.mp}|${p.gold}|${p.level}|${p.exp}|${p.job.id}|${p.potions.hp}|${p.potions.mp}`;
      if (key !== this.hudKey) this.hud();
    },
    draw(t) {
      const m = this.map;
      const cx = Math.round(this.camX || 0);
      const cy = Math.round(this.camY || 0);
      Wd.drawBackground(ctx, m, Z, cx, cy, VW, VH, t);
      ctx.save();
      ctx.translate(-cx, -cy);
      const img = Wd.renderMap(m, Z);
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = m.theme.ground.body;
      if (img.height - cy < VH) ctx.fillRect(cx, img.height, VW, VH - (img.height - cy));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      (m.lights || []).forEach((L) => {
        const lx = px(L.x);
        const r = L.r * Z;
        if (lx < cx - r || lx > cx + VW + r) return;
        const fl = L.flame ? 0.85 + 0.15 * Math.sin(t / 70 + L.seed) : 0.9 + 0.1 * Math.sin(t / 600 + L.seed);
        Sp.glow(ctx, lx, px(L.y), r * fl, L.col, 0.32);
      });
      ctx.restore();
      (m.lights || []).forEach((L) => { if (L.flame && L.r > 40) Wd.drawFlame(ctx, px(L.x), px(L.y) + 4 * Z, Z, t, L.seed); });
      const gy = px(m.groundY);
      this.npcs.forEach((n) => {
        shadow(px(n.x), gy + Z, HERO_PX() * 0.2, HERO_PX() * 0.05, 0.25);
        HA.draw(ctx, n.job, px(n.x), gy + Z, { dir: n.dir, anim: "idle", t: n.t, h: HERO_PX() });
      });
      const p = G.player;
      const d = E.derive(p);
      drawHeroAt(p.job, px(this.hx), gy, { anim: "idle", t: t / 1000 }, { barrier: false, alpha: p.hp < d.maxHp * 0.25 ? 0.85 : 1 });
      Sp.draw(ctx);
      X.draw(ctx);
      Sp.drawNumbers(ctx);
      ctx.restore();
      Ambient.draw();
    }
  };

  /* 던전 n층으로: 처음 내려가는 층이면 최고 기록을 고치고, 보스를 넘어선 보답을 준다 */
  function goFloor(n) {
    closeAll();
    fade(() => setScene(Battle, { floor: n, idx: 0 }));
  }

  /* ─────────────────────── 턴제 전투 ─────────────────────── */
  /* 포켓몬처럼 1대1: 왼쪽에 주인공, 오른쪽에 몬스터. 한 층에 몬스터 셋, 10층마다 마지막에 보스 */
  const DOT_FX = { burn: "flames", poison: "cloud", bleed: "drops", curse: "cloud" };
  const Battle = {
    hires: true,
    enter(arg) {
      const p = G.player;
      this.floor = arg.floor;
      this.idx = arg.idx || 0;
      /* 층의 마지막 전투를 이긴 직후에 저장됐다면 다음 층에서 시작 */
      if (this.idx >= E.floorFights(this.floor)) { this.floor++; this.idx = 0; arg = { floor: this.floor }; }
      G.place = "dungeon";
      const prevBest = p.best;
      E.enterFloor(p, this.floor);
      this.note = null;
      if (p.best > prevBest && p.best > 1 && p.best % 10 === 1) {
        G.tokens = Math.min(5, G.tokens + 1);
        store.set("tokens", G.tokens);
        this.note = "보스를 넘어선 보답으로 다음 운명의 재굴림 기회 +1";
      }
      this.theme = Wd.THEMES[Wd.floorThemeIndex(this.floor)];
      this.reach = reachOf(p.job);
      this.quake = 0;
      this.dim = 0;
      this.flash = null;
      this.vw = 0;
      this.hero = { x: 0, y: 0, dir: 1, casting: false, flash: 0, alpha: 1, ko: false };
      this.pose = { anim: "idle", t0: 0 };
      Ambient.list = [];
      HA.warm(p.job, HERO_PX());
      this.layout();
      this.hero.x = -40 / Z;
      this.ui();
      if (this.idx === 0) banner(Wd.floorName(this.floor));
      this.encounter(arg.mon ? E.monsterByName(arg.mon) : null, true);
    },
    leave() { G.fast = false; },
    layout() {
      this.vw = VW;
      this.vh = VH;
      this.cmdH = VW < 560 ? 204 : Math.min(228, Math.max(206, Math.round(VH * 0.36)));
      this.sceneH = VH - this.cmdH;
      this.gy = Math.round(this.sceneH * 0.86);
      this.heroX0 = Math.round(VW * (VW < 560 ? 0.25 : 0.3));
      this.foeX0 = Math.round(VW * (VW < 560 ? 0.72 : 0.68));
      this.sky = { theme: this.theme, groundY: this.gy / Z };
      const W = Math.ceil(VW / Z) + 4;
      this.strip = { id: `battle${Wd.floorThemeIndex(this.floor)}-${W}`, theme: this.theme, W, H: 90, groundY: 4, seed: 7 + this.floor, plats: [{ x1: 0, x2: W, y: 4, ground: true }], ropes: [], deco: [] };
      if (this.hero && !this.busyMove) { this.hero.x = this.heroX0 / Z; this.hero.y = this.gy / Z; }
      if (this.foe) { this.foe.x = this.foeX0 / Z; this.foe.y = this.gy / Z - (this.foe.fly ? 34 : 0); }
      if (this.win) this.win.el.style.height = this.cmdH + "px";
    },
    /* 몬스터 하나를 불러낸다 */
    encounter(mon, first) {
      const p = G.player;
      const boss = E.isBossFight(this.floor, this.idx);
      this.b = E.startBattle(p, { floor: this.floor, monster: mon || E.pickMonster(this.floor, boss) });
      const e = this.b.enemy;
      const tpl = (S.MON_LOOK[e.base] || ["slime"])[0];
      /* 포켓몬처럼 몬스터도 주인공만큼 크게(보스는 더 크게) */
      const img = S.monsterBig(e.name, e.boss ? (Z >= 2 ? 8 : 6) : (Z >= 2 ? 6 : 4));
      const bd = bounds(img);
      const fly = FLYERS.has(tpl) && !e.boss;
      this.foe = {
        img, bd, tpl, fly, shooter: SHOOTERS.has(tpl), mon: e, w: bd.w / Z, h: bd.h / Z,
        x: (VW + bd.w) / Z, y: this.gy / Z - (fly ? 34 : 0), t: Math.random() * 3, flash: 0, alpha: 1, dead: false, deadT: 0
      };
      this.mode = "intro";
      this.plates();
      $("bcmd").innerHTML = "";
      const lines = this.b.log.map((l) => esc(l.text));
      if (this.note) { lines.push(`<b class="lvup">${esc(this.note)}</b>`); this.note = null; }
      this.msg(lines);
      save({ fight: this.idx, mon: e.base });
      const ins = [tween(this.foe, { x: this.foeX0 / Z }, 520)];
      if (first) ins.push(tween(this.hero, { x: this.heroX0 / Z }, 520));
      Promise.all(ins).then(() => X.sleep(e.boss ? 700 : 350)).then(() => {
        if (e.boss) { this.quake = 0.4; Sp.ring(px(this.foe.x), px(this.foe.y), e.el === "phys" ? "dark" : e.el, 120 * Z); }
        this.mode = "cmd";
        this.commands();
      });
    },
    ui() {
      $("hud").className = "hud-battle";
      $("hud").innerHTML = `<div class="foe-plate"><b id="bf-name"></b><span id="bf-lv"></span><i class="hp"><b id="bf-hp"></b></i><div class="chips" id="bf-st"></div></div>
        <div class="where-plate" id="bf-where"></div>`;
      closeAll();
      this.win = openWin(`<div class="bwin">
        <div class="bme"><b id="bm-name"></b><span id="bm-job"></span><i class="hp"><b id="bm-hp"></b><em id="bm-hpt"></em></i><i class="mp"><b id="bm-mp"></b><em id="bm-mpt"></em></i><div class="chips" id="bm-st"></div></div>
        <div class="bmsg" id="bmsg" aria-live="polite"></div>
        <div class="bcmd" id="bcmd"></div>
      </div>`, {
        cls: "win-battle", noBack: true, cols: 3,
        onPick: (v) => this.pick(v), onBack: () => this.back(), onFocus: (v) => this.focusInfo(v),
        onA: (w) => {
          if (this.mode !== "cmd") { G.fast = true; return; }
          const b = opts2(w)[w.idx];
          if (b) b.click();
        }
      });
      this.win.el.style.height = this.cmdH + "px";
    },
    plates() {
      const p = G.player;
      const d = E.derive(p);
      const e = this.b.enemy;
      $("bf-name").textContent = e.name;
      $("bf-lv").textContent = `Lv.${e.lv}${e.boss ? " · 보스" : ""}`;
      $("bf-hp").style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
      $("bf-hp").parentNode.classList.toggle("low", e.hp / e.maxHp < 0.25);
      const est = [];
      ["burn", "poison", "bleed", "curse"].forEach((k) => { if (e.st[k]) est.push({ burn: "화상", poison: "중독", bleed: "출혈", curse: "저주" }[k]); });
      if (e.st.stun) est.push(e.st.stunLabel === "얼어붙어" ? "빙결" : "기절");
      if (e.st.charm) est.push("혼란");
      if (e.st.debuff) est.push("약화");
      if (e.enraged) est.push("분노");
      const weak = this.b.weakKnown && e.weak ? `<span class="chip weak">약점 ${D.ELEMENTS[e.weak]}</span>` : "";
      $("bf-st").innerHTML = weak + est.map((s) => `<span class="chip">${s}</span>`).join("");
      const n = E.floorFights(this.floor);
      $("bf-where").innerHTML = `<b>${this.floor}층</b> ${esc(this.theme.name)}<span class="dots">${Array.from({ length: n }, (_, i) => `<i class="${i < this.idx ? "done" : i === this.idx ? "now" : ""}${E.isBossFight(this.floor, i) ? " boss" : ""}"></i>`).join("")}</span>`;
      $("bm-name").textContent = p.name;
      $("bm-job").innerHTML = `<span class="rar-t-${p.job.rarity}">${esc(p.job.name)}</span> · Lv.${p.level}`;
      $("bm-hp").style.width = `${Math.max(0, (p.hp / d.maxHp) * 100)}%`;
      $("bm-hp").parentNode.classList.toggle("low", p.hp / d.maxHp < 0.25);
      $("bm-mp").style.width = `${Math.max(0, (p.mp / d.maxMp) * 100)}%`;
      $("bm-hpt").textContent = `${fmt(Math.max(0, p.hp))}/${fmt(d.maxHp)}`;
      $("bm-mpt").textContent = `${fmt(p.mp)}/${fmt(d.maxMp)}`;
      const ps = this.b.ps;
      const pst = [];
      if (ps.barrier > 0) pst.push(`보호막 ${fmt(ps.barrier)}`);
      const turns = (v) => (v && typeof v === "object" ? v.t : v);
      [["atkUp", "공격↑"], ["rage", "광폭"], ["counter", "반격"], ["evade", "회피↑"], ["regen", "재생"], ["summon", "소환수"], ["burn", "화상"], ["poison", "중독"], ["weaken", "쇠약"]].forEach(([k, label]) => {
        if (ps[k]) pst.push(`${label} ${turns(ps[k])}`);
      });
      $("bm-st").innerHTML = pst.map((s) => `<span class="chip">${s}</span>`).join("");
    },
    msg(lines) {
      const el = $("bmsg");
      if (!el) return;
      this.lastMsg = lines.slice(-3).map((l) => `<p>${l}</p>`).join("");
      el.innerHTML = this.lastMsg;
    },
    /* 명령: 포켓몬의 '싸운다·가방·도망' 자리에 공격·기술·방어·도구·도망·정보 */
    commands() {
      const p = G.player;
      this.sub = null;
      if (this.lastMsg !== undefined) $("bmsg").innerHTML = this.lastMsg + `<p class="ask">${esc(J(p.name, "은/는"))} 무엇을 할까?</p>`;
      const box = $("bcmd");
      box.className = "bcmd";
      box.innerHTML = `
        <button class="opt" type="button" data-opt="attack">공격<small>${esc(p.job.attack.name)}</small></button>
        <button class="opt" type="button" data-opt="skills">기술<small>${p.job.skills.filter((s) => s.lv <= p.level).length}개</small></button>
        <button class="opt" type="button" data-opt="guard">방어<small>피해↓ MP↑</small></button>
        <button class="opt" type="button" data-opt="items"${p.potions.hp + p.potions.mp ? "" : " disabled"}>도구<small>HP ${p.potions.hp} · MP ${p.potions.mp}</small></button>
        <button class="opt" type="button" data-opt="flee"${this.b.enemy.boss ? " disabled" : ""}>도망<small>${this.b.enemy.boss ? "보스전" : Math.round(E.fleeChance(p, this.b) * 100) + "%"}</small></button>
        <button class="opt" type="button" data-opt="info">정보<small>상태·기술</small></button>`;
      this.win.o.cols = 3;
      this.win.idx = this.lastCmd || 0;
      focusOpt(this.win);
    },
    skillList() {
      const p = G.player;
      this.sub = "skills";
      const box = $("bcmd");
      box.className = "bcmd skills";
      box.innerHTML = p.job.skills.map((sk, i) => {
        const av = E.skillAvailable(p, this.b, i);
        const sub = av.ok ? (av.hpCost ? "HP 소모" : `MP ${av.cost}`) : av.why;
        return `<button class="opt sk${sk.tag === "ult" ? " ult" : ""}" type="button" data-opt="sk${i}"${av.ok ? "" : " disabled"}><img src="${skillIcon(sk)}" alt=""><span>${esc(sk.name)}<small>${sub}</small></span></button>`;
      }).join("") + `<button class="opt" type="button" data-opt="back">돌아가기<small>명령으로</small></button>`;
      this.win.o.cols = 3;
      this.win.idx = 0;
      focusOpt(this.win);
    },
    itemList() {
      const p = G.player;
      this.sub = "items";
      const pot = 1 + (p.job.passive.pot || 0);
      const box = $("bcmd");
      box.className = "bcmd list";
      box.innerHTML = `<button class="opt" type="button" data-opt="ihp"${p.potions.hp ? "" : " disabled"}><img src="${S.icon("potion", 2)}" alt="">회복 물약<small>${p.potions.hp}개 · HP ${Math.round(40 * pot)}%</small></button>
        <button class="opt" type="button" data-opt="imp"${p.potions.mp ? "" : " disabled"}><img src="${S.icon("ether", 2)}" alt="">마나 물약<small>${p.potions.mp}개 · MP ${Math.round(50 * pot)}%</small></button>
        <button class="opt" type="button" data-opt="back">돌아가기</button>`;
      this.win.o.cols = 1;
      this.win.idx = 0;
      focusOpt(this.win);
    },
    focusInfo(v) {
      const el = $("bmsg");
      if (!el || !v) return;
      if (this.sub === "skills" && v.startsWith("sk")) {
        const sk = G.player.job.skills[Number(v.slice(2))];
        el.innerHTML = `<p class="sk-desc"><b>${esc(sk.name)}</b> ${esc(E.describeSkill(sk, G.player))}${G.player.level < sk.lv ? ` <em>(Lv.${sk.lv}에 배움)</em>` : ""}</p>`;
      } else if (this.sub === "skills") el.innerHTML = this.lastMsg || "";
    },
    back() {
      if (this.mode === "cmd" && this.sub) this.commands();
    },
    pick(v) {
      if (this.mode !== "cmd") return;
      if (!this.sub) this.lastCmd = this.win.idx;
      if (v === "skills") { this.skillList(); return; }
      if (v === "items") { this.itemList(); return; }
      if (v === "back") { this.commands(); return; }
      if (v === "info") { openStatus(); return; }
      let action = null;
      if (v === "attack") action = { kind: "attack" };
      if (v === "guard") action = { kind: "guard" };
      if (v === "flee") action = { kind: "flee" };
      if (v === "ihp") action = { kind: "potion", item: "hp" };
      if (v === "imp") action = { kind: "potion", item: "mp" };
      if (v.startsWith("sk")) action = { kind: "skill", idx: Number(v.slice(2)) };
      if (action) this.run(action);
    },
    /* 한 차례: 엔진이 결과를 정하고, 화면은 단계별로 연출과 문장을 보여 준다 */
    async run(action) {
      const b = this.b;
      const p = G.player;
      const before = b.logCount;
      this.action = action;
      E.act(p, b, action);
      const n = b.logCount - before;
      const logs = b.log.slice(-n);
      const fxs = b.fx.slice();
      this.mode = "anim";
      $("bcmd").innerHTML = "";
      await this.animate(logs, fxs);
      G.fast = false;
      this.plates();
      if (b.result === "win") return this.victory();
      if (b.result === "lose") return this.defeat();
      if (b.result === "fled") return this.fled();
      save({ fight: this.idx, mon: b.enemy.base });
      this.mode = "cmd";
      this.commands();
    },
    async animate(logs, fxs) {
      const phases = Array.from(new Set(logs.map((l) => l.ph).concat(fxs.map((f) => f.ph)))).sort((a, b) => a - b);
      const shown = [];
      for (const ph of phases) {
        const L = logs.filter((l) => l.ph === ph);
        L.forEach((l) => shown.push(esc(l.text)));
        if (L.length) this.msg(shown);
        const list = fxs.filter((f) => f.ph === ph);
        let i = 0;
        while (i < list.length) {
          const f = list[i];
          if (f.kind === "act") {
            const hits = [];
            let j = i + 1;
            while (j < list.length && list[j].kind !== "act") { hits.push(list[j]); j++; }
            if (f.target === "player") await this.playerAct(f, hits);
            else await this.enemyAct(f, hits);
            i = j;
            continue;
          }
          await this.applyFx(f);
          i++;
        }
        this.plates();
        await X.sleep(L.length ? 620 : 160);
      }
    },
    setPose(anim, alt) { this.pose = { anim, t0: G.t, alt: !!alt }; },
    heroPose(t) {
      const P = this.pose;
      const s = (t - P.t0) / 1000;
      const idle = { anim: "idle", f: 0, t: t / 1000 };
      const mo = this.reach.motion === "melee" ? "slash" : this.reach.motion;
      switch (P.anim) {
        case "act": {
          if (s > 0.62) return idle;
          if (this.reach.caster) return { anim: mo, f: s < 0.16 ? 0 : 1, t: s, alt: P.alt };
          return { anim: mo, f: s < 0.13 ? 0 : s < 0.28 ? 1 : 2, t: s, alt: P.alt };
        }
        case "wind": return { anim: mo, f: 0, t: s, alt: P.alt };
        case "cast": return { anim: "cast", f: s < 0.35 ? 0 : 1, t: s };
        case "hurt": return s < 0.4 ? { anim: "hurt", f: 0, t: s } : idle;
        case "ko": return { anim: "hurt", f: 0, t: s };
        case "victory": return { anim: "victory", f: 0, t: s };
        default: return idle;
      }
    },
    foeCenter() {
      const Fo = this.foe;
      return [px(Fo.x), px(Fo.y - Fo.h * 0.5)];
    },
    heroCenter() {
      const H = this.hero;
      return [px(H.x), px(H.y - 24)];
    },
    /* Moves가 쓰는 무대 함수: 대상은 언제나 눈앞의 몬스터 하나 */
    pickTargets() { return this.foe.dead ? [] : [this.foe]; },
    applySkill() { if (this.onUltHit) { const f = this.onUltHit; this.onUltHit = null; f(); } },
    async playerAct(act, hits) {
      const p = G.player;
      const H = this.hero;
      const el = act.el || "phys";
      if (act.action === "item") {
        this.setPose("cast");
        await X.sleep(220);
        for (const h of hits) await this.applyFx(h);
        await X.sleep(120);
        this.setPose("idle");
        return;
      }
      const sk = act.action === "skill" ? p.job.skills[this.action.idx] : null;
      const plan = sk ? visPlan(sk, this.reach.far) : null;
      if (sk && plan.ult) {
        this.setPose("cast");
        let landed = null;
        this.onUltHit = () => { landed = this.hitFx(hits); };
        await Moves.castUlt.call(this, sk, plan);
        if (landed) await landed;
        else await this.hitFx(hits);
        this.setPose("idle");
        return;
      }
      if (sk && SELF_TYPES.has(sk.type)) {
        this.setPose("cast");
        await X.sleep(260);
        for (const h of hits) await this.applyFx(h);
        await X.sleep(160);
        this.setPose("idle");
        return;
      }
      /* 근접은 몬스터 앞까지 한달음에 다가가 휘두르고 돌아온다 */
      const melee = !this.reach.far;
      const home = this.heroX0 / Z;
      if (melee) {
        this.setPose("wind", !!sk);
        this.busyMove = true;
        await tween(H, { x: this.foe.x - this.foe.w * 0.45 - 22 }, 170);
      }
      this.setPose("act", !!sk);
      await X.sleep(this.reach.caster ? 140 : 90);
      const W = this.reach.weapon;
      const go = sk ? Moves.skillVisual.call(this, sk, plan, [this.foe]) : weaponFx(this, el, [this.foe], W.far ? W.range : W.reach);
      await go;
      await this.hitFx(hits);
      await X.sleep(180);
      if (melee) {
        this.setPose("idle");
        await tween(H, { x: home }, 200);
        this.busyMove = false;
      }
      this.setPose("idle");
    },
    async hitFx(hits) {
      for (const h of hits) await this.applyFx(h);
    },
    /* 몬스터 차례: 달려들어 치거나(근접), 마력을 쏘거나(마법형), 특성에 맞는 덧연출 */
    async enemyAct(act, hits) {
      const Fo = this.foe;
      const trait = act.trait || "attack";
      const el = act.el && act.el !== "phys" ? act.el : null;
      const [hx, hy] = this.heroCenter();
      const hgy = px(this.hero.y);
      const home = Fo.x;
      const ranged = Fo.shooter || trait === "drain" || (el && Math.random() < 0.35);
      Fo.wind = 1;
      await X.sleep(trait === "heavy" ? 380 : 160);
      Fo.wind = 0;
      if (ranged) {
        await Sp.shot([px(Fo.x - Fo.w * 0.3), px(Fo.y - Fo.h * 0.55)], [hx, hy], el || "dark", "orb");
      } else {
        await tween(Fo, { x: this.hero.x + Fo.w * 0.45 + 18 }, 150);
        if (trait === "heavy") { Sp.smash(hx - 6 * Z, hgy, -1, el || "phys", true); this.quake = 0.3; }
        else Sp.slash(hx + 4 * Z, hy, -1, el || "phys", false, Math.random() < 0.5);
      }
      if (trait === "drain") Sp.stream([hx, hy], this.foeCenter(), "#ff5a7a");
      if (trait === "stun") Sp.bolt([hx + 16 * Z, hy - 120 * Z], [hx, hy], "bolt");
      if (trait === "steal") Sp.coins([hx, hy], this.foeCenter());
      if (trait === "weaken") Sp.weaken(hx, hy);
      if (trait === "poison") Sp.cloud(hx, hgy, "poison");
      if (trait === "burn") Sp.flames(hx, hgy, "fire", 30 * Z, false);
      await X.sleep(70);
      for (const h of hits) await this.applyFx(h);
      if (!ranged) await tween(Fo, { x: home }, 200);
    },
    async applyFx(f) {
      const H = this.hero;
      const Fo = this.foe;
      const [hx, hy] = this.heroCenter();
      const [fx, fy] = this.foeCenter();
      const ftop = px(Fo.y - Fo.h) - 2 * Z;
      const htop = px(H.y - 46);
      switch (f.kind) {
        case "hit": case "crit":
          if (f.target === "enemy") {
            if (f.src === "summon") await Sp.shot([px(H.x - 20), px(H.y - 52)], [fx, fy], "arcane", "orb");
            if (f.src === "counter") Sp.slash(fx, fy, 1, "phys", false, false);
            if (f.src === "self") Sp.impact(fx, fy, "dark", false);
            Fo.flash = 0.12;
            Fo.shake = 0.2;
            Sp.number(fx, ftop, f.amount, f.kind === "crit" ? "crit" : "hit", 0);
            if (f.kind === "crit") this.quake = Math.max(this.quake, 0.16);
          } else {
            H.flash = 0.2;
            this.setPose("hurt");
            Sp.number(hx, htop, f.amount, "taken", 0);
            if (f.absorbed) Sp.shieldBubble(hx, hy + 2 * Z, 24 * Z);
            this.quake = Math.max(this.quake, f.amount > E.derive(G.player).maxHp * 0.25 ? 0.22 : 0.1);
            await X.sleep(150);
          }
          await X.sleep(100);
          break;
        case "miss":
          Sp.number(hx, htop, "MISS", "miss", 0);
          await tween(H, { x: H.x - 14 }, 90);
          await tween(H, { x: H.x + 14 }, 120);
          break;
        case "dot": {
          const enemy = f.target === "enemy";
          const x = enemy ? fx : hx;
          const gy = enemy ? px(Fo.y) : px(H.y);
          const kind = DOT_FX[f.dot] || "cloud";
          if (kind === "flames") Sp.flames(x, gy, "fire", 30 * Z, false);
          else if (kind === "drops") Sp.drops(x, enemy ? fy : hy);
          else Sp.cloud(x, gy, f.dot === "curse" ? "curse" : "poison");
          if (enemy) Fo.flash = 0.08; else H.flash = 0.1;
          Sp.number(x, enemy ? ftop : htop, f.amount, "dot", 0);
          await X.sleep(260);
          break;
        }
        case "status":
          switch (f.st) {
            case "freeze": Sp.crystals(fx, px(Fo.y), "ice", 46 * Z, false); break;
            case "stun": Sp.ring(fx, px(Fo.y), "bolt", 50 * Z); break;
            case "charm": Sp.hearts(fx, fy - 8 * Z); break;
            case "debuff": Sp.weaken(fx, fy); break;
            case "curse": case "poison": Sp.cloud(fx, px(Fo.y), f.st); break;
            case "burn": Sp.flames(fx, px(Fo.y), "fire", 36 * Z, false); break;
            case "bleed": Sp.drops(fx, fy); break;
            case "enrage": Fo.flash = 0.25; this.quake = 0.25; Sp.impact(fx, fy, "fire", true); break;
            default: break;
          }
          await X.sleep(200);
          break;
        case "heal":
          if (f.target === "enemy") { Sp.heal(fx, px(Fo.y)); Sp.number(fx, ftop, "+" + f.amount, "heal", 0); }
          else {
            if (f.src === "revive") Sp.pillar(hx, px(H.y), "fire", true);
            else Sp.heal(hx, px(H.y));
            Sp.number(hx, htop, "+" + f.amount, "heal", 0);
          }
          await X.sleep(280);
          break;
        case "mana":
          Sp.aura(hx, px(H.y), "ice");
          Sp.number(hx, htop, "+" + f.amount, "mp", 0);
          await X.sleep(220);
          break;
        case "shield":
          Sp.shieldBubble(hx, hy + 2 * Z, 26 * Z);
          Sp.number(hx, htop, "+" + f.amount, "mp", 0);
          await X.sleep(240);
          break;
        case "buff":
          Sp.aura(hx, px(H.y), f.el && f.el !== "phys" ? f.el : "light");
          if (f.summon) Sp.circle(px(H.x - 20), px(H.y), f.el && f.el !== "phys" ? f.el : "arcane", 700);
          await X.sleep(260);
          break;
        case "gold":
          Sp.coins([fx, fy], [hx, hy]);
          Sp.number(hx, htop, "+" + f.amount + "G", "gold", 0);
          await X.sleep(200);
          break;
        default:
          break;
      }
    },
    async victory() {
      const b = this.b;
      const e = b.enemy;
      const Fo = this.foe;
      const [fx, fy] = this.foeCenter();
      Sp.impact(fx, fy, e.el === "phys" ? "light" : e.el, true);
      if (e.boss) { Sp.pillar(fx, px(Fo.y), "light", true); this.quake = 0.4; }
      Fo.dead = true;
      await tween(Fo, { alpha: 0 }, 420);
      const rw = b.reward;
      const lines = [`<b>${esc(J(e.name, "을/를"))}</b> 쓰러뜨렸다!`, `경험치 <b>+${fmt(rw.exp)}</b> · <b>${fmt(rw.gold)}G</b>`];
      rw.drops.forEach((d) => lines.push(esc(d)));
      if (rw.post) lines.push(`전투 후 회복 HP +${fmt(rw.post)}`);
      if (rw.levels.length) {
        lines.push(`<b class="lvup">레벨 업! Lv.${rw.levels[rw.levels.length - 1]}</b>`);
        Sp.levelUp(px(this.hero.x), px(this.hero.y));
      }
      if (rw.unlocked.length) lines.push(`새 기술: <b>${rw.unlocked.map(esc).join(", ")}</b>`);
      this.setPose("victory");
      this.plates();
      this.msg(lines.slice(0, 2));
      save({ fight: this.idx + 1, mon: null });
      await X.sleep(500);
      G.fast = false;
      const pages = [lines.slice(0, 2).join("<br>")];
      if (lines.length > 2) pages.push(lines.slice(2).join("<br>"));
      say(pages, () => { this.setPose("idle"); this.next(); }, { cls: "say-battle" });
    },
    /* 다음 몬스터, 또는 층을 다 돌았으면 갈림길 */
    next() {
      const p = G.player;
      this.idx++;
      if (this.idx < E.floorFights(this.floor)) {
        this.ui();
        this.encounter(null, false);
        return;
      }
      p.floor = this.floor + 1;
      save({ fight: 0, mon: null });
      this.crossroads();
    },
    crossroads() {
      const p = G.player;
      const d = E.derive(p);
      const n = this.floor;
      closeAll();
      openWin(`<h2 class="win-h">${n}층 돌파! <small>HP ${fmt(p.hp)}/${fmt(d.maxHp)} · MP ${fmt(p.mp)}/${fmt(d.maxMp)} · 물약 ${p.potions.hp}·${p.potions.mp}</small></h2>
        <div class="opts">
          <button class="opt primary" type="button" data-opt="down">${n + 1}층으로 내려간다 <small>${esc(Wd.floorName(n + 1))}</small></button>
          <button class="opt" type="button" data-opt="items">도구 쓰기</button>
          <button class="opt" type="button" data-opt="town">마을로 돌아간다 <small>다음엔 ${n + 1}층부터</small></button>
        </div>`, {
        cls: "win-center", noBack: true,
        onPick: (v) => {
          if (v === "down") goFloor(n + 1);
          if (v === "items") openItems(() => this.crossroads());
          if (v === "town") { closeAll(); G.place = "town"; fade(() => setScene(Town)); }
        }
      });
    },
    async fled() {
      await tween(this.hero, { x: -40 / Z }, 300);
      this.hero.x = this.heroX0 / Z;
      const p = G.player;
      say(`${esc(J(p.name, "은/는"))} 몸을 피해 다음 길로 빠져나갔다. (보상 없음)`, () => this.next(), { cls: "say-battle" });
    },
    async defeat() {
      const e = this.b.enemy;
      this.setPose("ko");
      this.hero.ko = true;
      await tween(this.hero, { alpha: 0.45 }, 600);
      await X.sleep(500);
      G.fast = false;
      gameOver(e.name);
    },
    key(k) {
      if (this.mode === "anim" && k === "a") G.fast = true;
    },
    update(dt) {
      if (this.vw !== VW || this.vh !== VH) this.layout();
      const s = dt / 1000;
      this.quake = Math.max(0, this.quake - s);
      if (this.flash) this.flash.t -= s;
      const H = this.hero;
      const Fo = this.foe;
      H.flash = Math.max(0, H.flash - s);
      if (Fo) { Fo.t += s; Fo.flash = Math.max(0, Fo.flash - s); Fo.shake = Math.max(0, (Fo.shake || 0) - s); }
      Ambient.update(s, this.theme.ambient);
    },
    draw(t) {
      const qx = this.quake ? Math.round(rnd(-3, 3) * Z) : 0;
      const qy = this.quake ? Math.round(rnd(-2, 2) * Z) : 0;
      ctx.save();
      ctx.translate(qx, qy);
      Wd.drawBackground(ctx, this.sky, Z, 0, 0, VW, VH, t);
      const strip = Wd.renderMap(this.strip, Z);
      ctx.drawImage(strip, -2 * Z, this.gy - 4 * Z);
      ctx.fillStyle = this.theme.ground.body;
      ctx.fillRect(-8, this.gy - 4 * Z + strip.height, VW + 16, VH);
      /* 둘이 서는 자리: 포켓몬의 둥근 받침처럼 땅 위의 옅은 타원 */
      [[this.heroX0, 30], [this.foeX0, this.foe && this.foe.mon.boss ? 54 : 38]].forEach(([x, r]) => {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.ellipse(x, this.gy + 3 * Z, r * Z, 6 * Z, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      if (this.foe) this.drawFoe(t);
      this.drawHero(t);
      Sp.draw(ctx);
      X.draw(ctx);
      Sp.drawNumbers(ctx);
      ctx.restore();
      if (this.dim) { ctx.fillStyle = `rgba(4,2,14,${this.dim})`; ctx.fillRect(0, 0, VW, VH); }
      if (this.flash && this.flash.t > 0) {
        ctx.globalAlpha = Math.min(0.45, this.flash.t * 2);
        ctx.fillStyle = this.flash.col;
        ctx.fillRect(0, 0, VW, VH);
        ctx.globalAlpha = 1;
      }
      Ambient.draw();
    },
    drawHero(t) {
      const p = G.player;
      const H = this.hero;
      const pose = this.heroPose(t);
      const blink = H.flash > 0 && Math.floor(t / 60) % 2;
      drawHeroAt(p.job, px(H.x), px(H.y), pose, { alpha: H.alpha * (blink ? 0.6 : 1), hurt: pose.anim === "hurt" && !H.ko, barrier: this.b && this.b.ps.barrier > 0 && !H.ko });
      if (this.b && this.b.ps.summon && !H.ko) {
        const x = px(H.x - 22);
        const y = px(H.y - 54) + Math.sin(t / 300) * 3 * Z;
        Sp.orbAt(ctx, x, y, 6 * Z, "arcane");
        if (Math.random() < 0.2) Sp.spark(x + rnd(-6, 6) * Z, y + rnd(-6, 6) * Z, { vy: -20 * Z, life: 500, col: Sp.PAL.arcane[1], glow: 0.7, size: 1 });
      }
    },
    drawFoe(t) {
      const Fo = this.foe;
      if (Fo.alpha <= 0) return;
      const { img, bd, mon } = Fo;
      let bob = 0;
      let sx = 1;
      let sy = 1;
      if (Fo.tpl === "slime") { const k = Math.sin(Fo.t * 4); sx = 1 + k * 0.05; sy = 1 - k * 0.05; }
      else if (Fo.fly) bob = Math.sin(Fo.t * 5) * 3 * Z;
      else sy = 1 + Math.sin(Fo.t * 2.4) * 0.018;
      if (Fo.wind) { sy = 0.9; sx = 1.07; }
      const shake = Fo.shake > 0 ? Math.round(Math.sin(t / 18) * 3 * Z) : 0;
      const x = px(Fo.x) + shake;
      const y = px(Fo.y);
      shadow(px(Fo.x), px(this.gy / Z) + Z, bd.w * 0.34, 3.4 * Z, Fo.fly ? 0.18 : 0.3);
      ctx.save();
      ctx.globalAlpha = Fo.alpha;
      ctx.translate(x, y + bob);
      ctx.scale(-sx, sy);
      const ox = Math.round(-(bd.x0 + bd.w / 2));
      const oy = Math.round(-(bd.y1 + 1));
      ctx.drawImage(img, ox, oy);
      if (Fo.flash > 0 || Fo.dead) { ctx.globalAlpha = Fo.alpha * (Fo.dead ? 0.7 : 0.8); ctx.drawImage(S.silhouette(img, "#ffffff"), ox, oy); }
      else if (mon.enraged) { ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t / 120); ctx.drawImage(S.silhouette(img, "#ff3030"), ox, oy); }
      else if (mon.st.charm) { ctx.globalAlpha = 0.25; ctx.drawImage(S.silhouette(img, "#ff8ad8"), ox, oy); }
      else if (mon.st.stun && mon.st.stunLabel === "얼어붙어") { ctx.globalAlpha = 0.35; ctx.drawImage(S.silhouette(img, "#9ae6ff"), ox, oy); }
      ctx.restore();
      if (Fo.dead || !mon.st.stun) return;
      const top = y + bob - bd.h - 4 * Z;
      for (let k = 0; k < 3; k++) {
        const a = t / 200 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = mon.st.stunLabel === "얼어붙어" ? "#bff0ff" : "#ffe066";
        ctx.fillRect(Math.round(x + Math.cos(a) * 10 * Z), Math.round(top + Math.sin(a) * 3 * Z), Math.max(2, Math.round(2 * Z)), Math.max(2, Math.round(2 * Z)));
      }
    }
  };
  const px = (v) => v * Z;
  const HERO_PX = () => Math.round(62 * Z);
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
      <p><b>${esc(p.name)}</b><br><span class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</span> · Lv.${p.level}<br>최고 기록 ${p.best}층 · 처치 ${fmt(p.kills)}<br>${esc(J(cause, "에게"))} 쓰러짐</p></div>
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

  /* ── 이어하기: 던전에서 저장했으면 그 층의 그 싸움부터 ── */
  function resume(saved) {
    if (saved.place === "dungeon") setScene(Battle, { floor: Math.max(1, G.player.floor), idx: saved.fight || 0, mon: saved.mon || null });
    else setScene(Town);
  }
  function continueGame() {
    const saved = store.get("save", null);
    if (!saved) { Title.menu(); return; }
    G.player = unpackPlayer(saved.player);
    closeAll();
    fade(() => resume(saved));
  }

  /* ── 루프 ── */
  let last = 0;
  function frame(now) {
    const real = Math.min(50, now - (last || now));
    last = now;
    /* 전투 연출 중 결정 키를 누르면 세 배 빠르게 */
    const dt = G.fast ? real * 3 : real;
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
    const saved = store.get("save", null);
    return { player: G.player ? packPlayer(G.player) : null, place: G.place, fight: saved && saved.fight, mon: saved && saved.mon };
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
      resume(data);
    } else setScene(Title);
    root.requestAnimationFrame(frame);
  }

  F.game = { G, Town, Battle, Title, Roll, setScene, openCodex, openHall, closeAll };

  const hot = root.claude && root.claude.hot;
  if (hot && typeof hot.snapshot === "function") hot.snapshot(snapshot);
  if (hot && typeof hot.ready === "function") hot.ready(start);
  else if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => start((hot && hot.data) || {}));
  else start((hot && hot.data) || {});
})(window);
