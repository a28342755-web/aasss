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
  const diffName = (k) => E.diffOf(k).name;
  const diffTag = (k) => `<span class="diff-tag d-${E.DIFFS[k] ? k : "normal"}">${diffName(k)}</span>`;
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

  /* 전투 화면은 아래쪽 버튼이 곧 터치 화면이라 패드를 숨긴다 */
  function padShown() {
    return touch && !(G.scene && G.scene.noPad);
  }
  function resize() {
    const pad = $("pad");
    pad.hidden = !padShown();
    $("keys-hint").hidden = touch;
    const reserve = touch ? (padShown() ? PAD_H : 0) : 34;
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

  cv.addEventListener("pointerdown", () => { if (G.scene && G.scene.tap) G.scene.tap(); });
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
    if (w.o.nav && (k === "up" || k === "down" || k === "left" || k === "right")) { w.idx = w.o.nav(k, w.idx, list); focusOpt(w); return; }
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
    const hadPad = padShown();
    G.scene = sc;
    if (wasHires !== !!sc.hires || hadPad !== padShown()) resize();
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
      for (let i = 0; i < 7; i++) this.parade.push({ job: E.randomJob(), flash: 0 });
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
          ${saved ? `<button class="opt" type="button" data-opt="cont">이어하기 <small>${esc(saved.player.name)} · Lv.${saved.player.level} · ${diffName(saved.player.diff)}</small></button>` : ""}
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
      this.parade.forEach((w) => { w.flash = Math.max(0, w.flash - dt / 1000); });
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
        HA.drawStill(ctx, w.job, x, ground + 4, { dir: i < this.parade.length / 2 ? 1 : -1, h: hh });
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
    const diff = store.get("diff", "normal");
    if (pending) G.roll = { job: F.jobById(pending.jobId) || E.randomJob(), left: pending.left, name: pending.name || randomName(), diff: pending.diff || diff, rolling: false, t: 0 };
    else {
      G.roll = { job: null, left: 3 + G.tokens, name: randomName(), diff, rolling: false, t: 0 };
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
      store.set("roll", { jobId: r.job.id, left: r.left, name: r.name, diff: r.diff });
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
        <span class="roll-fam">${jobNo(j.id)} · ${esc(fam.name)} 계열${fam.combat ? "" : "(생활)"} · ${D.ELEMENTS[j.el]} · ${esc(E.weaponOf(j).name)}</span>
        <span class="roll-trait">고유 특성 <b>${esc(E.traitOf(j).name)}</b></span></div>`;
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
          <div class="diff-row"><span>난이도</span>${E.DIFF_KEYS.map((k) => `<button type="button" class="opt mini diff d-${k}${r.diff === k ? " on" : ""}" data-opt="d-${k}" aria-pressed="${r.diff === k}">${diffName(k)}</button>`).join("")}</div>
          <p class="diff-desc" id="diff-desc">${esc(E.diffOf(r.diff).desc)}</p>
          <div class="opts row2">
            <button class="opt primary" type="button" data-opt="ok">이 운명으로 시작</button>
            <button class="opt" type="button" data-opt="re"${r.left <= 0 ? " disabled" : ""}>다시 굴리기 <small>${r.left}회</small></button>
          </div>
        </div>`;
      openWin(html, {
        cls: "win-roll", noBack: false, focus: "ok",
        onBack: () => { store.set("roll", { jobId: r.job.id, left: r.left, name: $("hero-name").value, diff: r.diff }); closeAll(); setScene(Title); },
        onPick: (v, btn, w) => {
          if (v === "dice") { $("hero-name").value = randomName(); return; }
          if (v.startsWith("d-")) {
            r.diff = v.slice(2);
            store.set("diff", r.diff);
            w.el.querySelectorAll(".diff").forEach((b) => { const on = b.dataset.opt === v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
            $("diff-desc").textContent = E.diffOf(r.diff).desc;
            return;
          }
          if (v === "re" && r.left > 0) { r.left--; r.name = $("hero-name").value; this.spin(); return; }
          if (v === "ok") this.accept();
        }
      });
    },
    accept() {
      const r = G.roll;
      const name = ($("hero-name").value || "").trim().slice(0, 10) || randomName();
      G.player = E.newPlayer(r.job, name);
      G.player.diff = r.diff || "normal";
      const dv = E.diffOf(G.player.diff);
      G.roll = null;
      store.del("roll");
      G.place = "town";
      save();
      closeAll();
      fade(() => {
        setScene(Town);
        say([`<b>${esc(name)}</b>의 운명은 <b class="rar-t-${G.player.job.rarity}">${esc(G.player.job.name)}</b>. 난이도는 <b>${dv.name}</b>.`,
          `전투는 차례대로 명령을 고르는 턴제다. 던전 한 층마다 몬스터 셋이 기다리고, 10층마다 마지막에 보스가 길을 막는다.${dv.mid ? " 어려움에서는 5층마다 중간 보스도 나온다." : ""}`,
          `마을 메뉴에서 던전으로 내려가거나 상점·여관·길드를 고를 수 있다. 쓰러지면 이 운명은 끝난다.`]);
      });
    },
    /* ── 캐릭터 시트: 뽑힌 직업의 기본 공격·기술·궁극기 효과를 차례로 보여 준다(캐릭터는 움직이지 않는다) ── */
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
        const a = E.attackOf(job);
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
          /* 빠르게 바뀌는 동안은 덧그림 없이 가볍게 */
          if (rolling) HA.draw(ctx, this.shown, VW / 2, gy + 4, { dir: 1, h: hh, alpha: 0.8, still: true });
          else HA.drawStill(ctx, this.shown, VW / 2, gy + 4, { dir: 1, h: hh });
        } else {
          const sp = this.demoSpot();
          /* 허수아비 */
          const dum = S.monsterBig("슬라임", Z >= 2 ? 3 : 2);
          shadow(sp.dx, gy + 2, dum.width * 0.3, 4 * Z, 0.4);
          drawSprite(dum, sp.dx - dum.width / 2, gy + 4 - dum.height, 1);
          if (this.hitT > 0) drawSprite(S.silhouette(dum, "#ffffff"), sp.dx - dum.width / 2, gy + 4 - dum.height, Math.min(1, this.hitT * 6));
          shadow(sp.hx, gy + 2, hh * 0.2, hh * 0.05, 0.5);
          HA.drawStill(ctx, this.shown, sp.hx, gy + 4, { dir: 1, h: hh });
          Sp.draw(ctx);
          Sp.drawNumbers(ctx);
          const fk = this.demoFake;
          if (fk && fk.flash && fk.flash.t > 0) { ctx.globalAlpha = Math.min(0.22, fk.flash.t * 1.2); ctx.fillStyle = fk.flash.col; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
          /* 지금 보여 주는 동작 이름: 땅과 정보 창 사이 띠에 쓴다 */
          const d = this.demo;
          const job = this.shown;
          const key = this.DEMO[d.step][0];
          const label = key === "attack" ? `기본 공격 · ${E.attackOf(job).name}` : key === "skill" ? `기술 · ${this.demoSkill().name}` : key === "ult" ? `궁극기 · ${job.skills[4].name}` : this.DEMO[d.step][1];
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
    const tr = E.traitOf(job);
    const wp = E.weaponOf(job);
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
        <div class="card-art"><img src="${HA.profile(job)}" alt="${esc(job.name)} 프로필"><img class="card-fam" src="${portraitURL(fam.id)}" alt="${esc(fam.name)} 계열" title="${esc(fam.name)} 계열" onerror="this.style.visibility='hidden'"></div>
        <ul class="card-lines">
          <li><b>본업</b> ${esc(job.base)} · ${esc(job.desc)}</li>
          <li><b>기원</b> ${job.mod ? `${esc(job.mod)} · ${esc(job.modDesc)}` : "수식어 없는 정통 직업 (능력치 +5%)"}</li>
          <li><b>계열</b> ${esc(fam.name)} · ${esc(fam.desc)}</li>
        </ul>
      </div>
      <h3>직업 특색</h3><ul class="traits">
        <li><span class="tr-tag">고유 특성</span><b>${esc(tr.name)}</b><p>${esc(tr.desc)}</p></li>
        <li><span class="tr-tag wp">무기</span><b>${esc(wp.name)}</b><p>기본 공격 ${esc(E.attackOf(job).name)}: ${esc(E.describeAttack(job))}</p></li>
      </ul>
      <h3>능력치 Lv.${level}</h3><div class="stats">${stats}</div>
      <h3>계열·기원 효과</h3><ul class="passives">${passives}</ul>
      <h3>기술</h3><ul class="skills"><li><b>${esc(E.attackOf(job).name)}</b><span class="sk-tag">기본 공격 · ${esc(wp.name)} · ${D.ELEMENTS[job.attack.el]}</span><p>${esc(E.describeAttack(job))}</p></li>${skills}</ul>
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
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b><br>"던전은 10층마다 보스가 다음 문을 봉인하고 있대. 물약은 넉넉히 챙겨."`,
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b><br>"내 고유 특성은 <b>${esc(E.traitOf(j).name)}</b>. ${esc(E.traitOf(j).desc)}. ${esc(E.J(E.weaponOf(j).name, "을/를"))} 쥐고 싸우지."`
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
      .concat([["싸운다", "기본 공격(쥔 무기마다 다르다)과 기술 카드 (기술은 Lv.1·1·4·7·10에 배움)"], ["고유 특성", "직업마다 하나. 드러나면 이름표 위에 특성 이름이 뜬다"], ["가방", "물약 (한 차례를 쓴다)"], ["방어", "받는 피해 절반, MP 회복"], ["도망", "보상 없이 다음 싸움으로 (보스전 불가)"], ["상태", "능력치와 기술 설명"]]);
    openWin(`<h2 class="win-h">조작 안내</h2><dl class="sheet help">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      <p class="win-msg">전투는 주인공과 몬스터가 한 번씩 번갈아 움직이는 턴제다. 한 층에 몬스터 셋, 10층마다 마지막에 보스. 난이도는 운명을 뽑을 때 고른다: 쉬움은 몬스터가 약하고 순한 몬스터가 섞이며, 어려움은 몬스터가 세고 정예가 섞이며 5층마다 중간 보스가 나온다. 쓰러지면 그 운명은 끝난다.</p>
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
      ["경험치", `${fmt(p.exp)}/${fmt(E.expNeed(p.level))}`], ["골드", fmt(p.gold)], ["최고 층", p.best], ["처치", fmt(p.kills)], ["난이도", diffName(p.diff)]];
    openWin(`<h2 class="win-h">${esc(p.name)} <small>Lv.${p.level} · <span class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</span></small></h2>
      <div class="scroll"><dl class="sheet">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>${jobCard(p.job, p.level, p)}</div>
      <div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full", onPick: (v, b, w) => { if (v === "close") closeWin(w); }
    });
  }

  function openItems(onDone) {
    const p = G.player;
    const pot = E.potionPower(p);
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
    const pot = E.potionPower(p);
    const tr = E.traitOf(p.job);
    const craft = tr.id === "craftsman" ? ` · 장인 정신으로 효과 +${Math.round(tr.v * 100)}%` : "";
    const row = (key, icon, name, note) => `<button class="opt shop-row" type="button" data-opt="${key}"${p.gold >= pr[key] ? "" : " disabled"}><img src="${S.icon(icon, 2)}" alt=""><span><b>${name}</b><small>${note}</small></span><em>${fmt(pr[key])}G</em></button>`;
    const w = openWin(`<h2 class="win-h">상점 <small>보유 ${fmt(p.gold)}G${p.job.passive.disc ? ` · 할인 ${Math.round(Math.min(0.5, p.job.passive.disc) * 100)}%` : ""}</small></h2>
      <div class="opts scroll">
        ${row("hp", "potion", "회복 물약", `HP ${Math.round(40 * pot)}% 회복 · 보유 ${p.potions.hp}`)}
        ${row("mp", "ether", "마나 물약", `MP ${Math.round(50 * pot)}% 회복 · 보유 ${p.potions.mp}`)}
        ${row("weapon", "sword", `무기 강화 +${p.weaponLv}→+${p.weaponLv + 1}`, `공격력 +6%, 추가 피해 +3${craft}`)}
        ${row("armor", "shield", `방어구 강화 +${p.armorLv}→+${p.armorLv + 1}`, `최대 HP +4%, 방어력 +3${craft}`)}
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
        <input id="cx-q" type="search" placeholder="직업·기술·특성 이름" aria-label="직업 검색">
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
        if (q && !j.name.includes(q) && !j.skills.some((s) => s.name.includes(q)) && !E.traitOf(j).name.includes(q) && E.weaponOf(j).name !== q) return false;
        return true;
      });
      $("cx-count").textContent = `${fmt(list.length)}개 직업`;
      $("cx-list").innerHTML = list.slice(0, limit).map((j) => `<button class="opt cx-row${G.codex.has(j.id) ? "" : " unseen"}" type="button" data-opt="job${j.id}">
        <img src="${thumb(j)}" alt=""><span><b class="rar-t-${j.rarity}">${esc(j.name)}</b><small>${jobNo(j.id)} · ${esc(famOf(j).name)} · ${rarName(j.rarity)} · ${esc(E.traitOf(j).name)}</small></span>${G.codex.has(j.id) ? "<em>만남</em>" : ""}</button>`).join("")
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
    G.hall.push({ name: p.name, job: p.job.name, jobId: p.job.id, rarity: p.job.rarity, fam: p.job.fam, level: p.level, best: p.best, kills: p.kills, diff: p.diff || "normal", cause, date: Date.now() });
    G.hall.sort((a, b) => b.best - a.best || b.level - a.level || a.date - b.date);
    G.hall = G.hall.slice(0, 50);
    store.set("hall", G.hall);
  }

  function openHall() {
    const rows = G.hall.length ? G.hall.map((h, i) => {
      const job = F.jobById(h.jobId);
      return `<div class="hall-row"><span class="hall-rank">${i + 1}</span>${job ? `<img src="${thumb(job)}" alt="">` : ""}<span><b>${esc(h.name)}</b> ${diffTag(h.diff)}<small><span class="rar-t-${h.rarity}">${rarName(h.rarity)} ${esc(h.job)}</span> · Lv.${h.level} · ${h.cause ? esc(J(h.cause, "에게")) + " 쓰러짐" : "은퇴"}</small></span><em>${h.best}층</em></div>`;
    }).join("") : `<p class="empty">아직 기록이 없습니다. 첫 운명을 뽑아 던전에 들어가 보세요.</p>`;
    openWin(`<h2 class="win-h">명예의 전당</h2><div class="scroll hall">${rows}</div><div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full", onPick: (v, b, w) => { if (v === "close") closeWin(w); }
    });
  }

  /* ─────────────────────── 마을·전투 장면 ─────────────────────── */
  /* 거리는 기본 단위(주인공 키 ≈ 44)로 적고, 화면에는 Z배로 그린다 */
  const FLYERS = new Set(["bat", "harpy", "dragon", "ghost", "wisp", "bird", "eye", "fairy", "imp"]);
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
      /* 마법진과 마지막 빛기둥이 서는 자리(전투에서는 시전자 발밑을 무대가 정해 준다) */
      const at = this.casterAt || [px(h.x), px(h.y)];
      Sp.circle(at[0], at[1], el, 1500);
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
          Sp.pillar(at[0], at[1], el, true);
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

  /* 직업 한 명 그리기: 발밑 그림자와 프로필 그림 그대로(움직이지 않는다), 보호막 테두리, 등급 반짝이 */
  function drawHeroAt(job, x, y, h, o) {
    const opt = o || {};
    shadow(x, y + Z, h * 0.2, h * 0.05, 0.32 * (opt.alpha === undefined ? 1 : opt.alpha));
    HA.drawStill(ctx, job, x, y + Z, { dir: opt.dir || 1, h, alpha: opt.alpha, tint: opt.hurt ? "#ff4050" : null, tintA: 0.4 });
    if (opt.barrier) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(150,220,255,0.3)";
      ctx.lineWidth = Math.max(1, Z);
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.46, h * 0.3, h * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (job.rarity >= 3 && opt.alpha !== 0 && Math.random() < 0.12) Sp.spark(x + rnd(-0.14, 0.14) * h, y - rnd(0.1, 0.6) * h, { vy: -rnd(20, 50) * Z, life: 700, col: S.RARITY_COLOR[job.rarity], glow: 0.7, size: 1 });
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
      this.npcs = [255, 640, 738].map((x) => ({ job: E.randomJob(), x: x + rnd(-20, 20), dir: Math.random() < 0.5 ? -1 : 1 }));
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
          <div class="hud-r"><span class="where">마을 ${diffTag(p.diff)}</span><span class="gold">${fmt(p.gold)} G</span><span class="pots">물약 ${p.potions.hp} · ${p.potions.mp}</span></div>
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
    /* 전직의 두루마리로 직업이 바뀌면 빛기둥 속에서 새 모습으로 */
    jobChanged() {
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
      this.npcs.forEach((n) => drawHeroAt(n.job, px(n.x), gy, HERO_PX(), { dir: n.dir }));
      drawHeroAt(G.player.job, px(this.hx), gy, HERO_PX());
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
    battleFlash(() => setScene(Battle, { floor: n, idx: 0 }));
  }

  /* ─────────────────────── 턴제 전투 ─────────────────────── */
  /* 포켓몬(4세대) 방식: 위 화면에는 멀리 오른쪽 위 받침에 몬스터, 가까이 왼쪽 아래에 주인공,
     두 이름표와 흰 대화창. 아래 화면에는 커다란 명령 버튼과 속성 색 기술 카드.
     한 층에 몬스터 셋, 10층마다 마지막에 보스 */
  const EL_CARD = {
    phys: ["#a8a07a", "#6e6a4c"], fire: ["#f08030", "#b04e14"], ice: ["#68c0d4", "#2e8094"], bolt: ["#f0c828", "#a07c06"],
    earth: ["#d0a858", "#86622a"], wind: ["#98a8f0", "#5464b8"], light: ["#eccb60", "#a8861c"], dark: ["#7a5a48", "#4a3428"],
    nature: ["#68b848", "#3a7a24"], arcane: ["#e868a8", "#a8306c"]
  };
  const ST_BADGE = {
    burn: ["화상", "#e06a2a"], poison: ["독", "#9a48b0"], bleed: ["출혈", "#c03040"], curse: ["저주", "#6a5498"], stun: ["기절", "#c89810"],
    freeze: ["빙결", "#3a98b8"], charm: ["혼란", "#d8508a"], debuff: ["약화", "#7a7a5a"], enrage: ["분노", "#d02828"],
    weaken: ["쇠약", "#7a7a5a"], atkUp: ["공격↑", "#e0782a"], rage: ["광폭", "#d02828"], counter: ["반격", "#5a6a8a"], evade: ["회피↑", "#4a98c8"],
    regen: ["재생", "#48a048"], summon: ["소환", "#a058c8"], barrier: ["보호막", "#3a88c8"]
  };
  const DOT_FX = { burn: "flames", poison: "cloud", bleed: "drops", curse: "cloud" };
  const hpCls = (r) => (r <= 0.2 ? "low" : r <= 0.5 ? "mid" : "");

  /* 몬스터를 만날 때: 화면이 두 번 번쩍인 뒤 어두워졌다 밝아진다 */
  function battleFlash(mid) {
    if (reduceMotion) { fade(mid); return; }
    const f = $("fade");
    G.busy++;
    let k = 0;
    const blink = () => {
      f.classList.toggle("white-on");
      if (++k < 4) setTimeout(blink, 85);
      else { G.busy = Math.max(0, G.busy - 1); fade(mid); }
    };
    blink();
  }

  const Battle = {
    hires: true,
    noPad: true,
    enter(arg) {
      const p = G.player;
      this.floor = arg.floor;
      this.idx = arg.idx || 0;
      /* 층의 마지막 전투를 이긴 직후에 저장됐다면 다음 층에서 시작 */
      if (this.idx >= E.floorFights(this.floor, p.diff)) { this.floor++; this.idx = 0; arg = { floor: this.floor }; }
      G.place = "dungeon";
      const prevBest = p.best;
      E.enterFloor(p, this.floor);
      this.note = null;
      if (p.best > prevBest && p.best > 1 && p.best % 10 === 1) {
        G.tokens = Math.min(5, G.tokens + 1);
        store.set("tokens", G.tokens);
        this.note = "보스를 넘어선 보답으로 다음 운명의 재굴림 기회가 1번 늘었다!";
      }
      this.theme = Wd.THEMES[Wd.floorThemeIndex(this.floor)];
      this.reach = reachOf(p.job);
      this.quake = 0;
      this.dim = 0;
      this.flash = null;
      this.msg = null;
      this.barWait = [];
      this.vw = 0;
      Ambient.list = [];
      this.layout();
      this.ui();
      if (this.idx === 0) banner(Wd.floorName(this.floor));
      this.encounter(arg.mon ? E.monsterByName(arg.mon) : null);
    },
    leave() { G.fast = false; this.msg = null; },
    /* 세로로 긴 화면은 DS처럼 위(전투)·아래(버튼), 낮고 넓은 화면(가로로 든 휴대폰)은 왼쪽(전투)·오른쪽(버튼) */
    layout() {
      this.vw = VW;
      this.vh = VH;
      const narrow = VW < 560;
      this.narrow = narrow;
      this.side = VH < 470 && VW > VH * 1.5;
      if (this.side) {
        this.panelW = Math.round(clamp(VW * 0.36, 240, 360));
        this.panelH = VH;
        this.SW = VW - this.panelW;
        this.msgH = Math.round(clamp(VH * 0.17, 56, 70));
        this.sceneB = VH - 4;
      } else {
        this.panelW = VW;
        this.panelH = Math.round(clamp(VH * 0.32, 150, narrow ? 224 : 200));
        this.SW = VW;
        this.msgH = Math.round(clamp(VH * 0.11, 56, 76));
        this.sceneB = VH - this.panelH;
      }
      const SW = this.SW;
      this.msgTop = this.sceneB - this.msgH;
      this.hz = Math.round(this.msgTop * 0.4);
      this.fbx = Math.round(SW * 0.71);
      this.fby = Math.round(this.msgTop * 0.6);
      this.hbx = Math.round(SW * (narrow ? 0.27 : 0.25));
      this.heroH = Math.round(HERO_PX() * (this.side ? 1.15 : narrow ? 1.25 : 1.4));
      this.hby = this.msgTop + Math.round(this.msgH * 0.35);
      this.short = !this.side && this.msgTop < 300;
      this.specks = null;
      this.baseCache = {};
      this.place();
    },
    /* 창·이름표 자리를 화면 크기에 맞춘다 */
    place() {
      const right = VW - this.SW;
      const m = $("bmsg");
      if (m) { m.style.top = this.msgTop + "px"; m.style.height = this.msgH + "px"; m.style.right = right + 4 + "px"; }
      const wh = $("bf-where");
      if (wh) wh.style.right = right + 8 + "px";
      const me = $("bx-me");
      if (me) {
        me.style.bottom = VH - this.msgTop + 8 + "px";
        /* 낮은 화면에서는 몬스터와 겹치지 않게 주인공 옆에 둔다 */
        me.classList.toggle("float", this.short);
        if (this.short) { me.style.left = Math.round(this.hbx + this.heroH * 0.42) + "px"; me.style.right = "auto"; }
        else { me.style.left = "auto"; me.style.right = right + "px"; }
      }
      if (this.panel) {
        const el = this.panel.el;
        el.classList.toggle("side", this.side);
        el.style.height = this.panelH + "px";
        el.style.width = this.side ? this.panelW + "px" : "";
      }
    },
    ui() {
      $("hud").className = "hud-pk";
      $("hud").innerHTML = `
        <div class="pkb foe" id="bx-foe"><div class="pkb-top"><b id="bf-name"></b><span class="pkb-lv" id="bf-lv"></span></div>
          <div class="pkb-st" id="bf-st"></div>
          <div class="pkb-bar hp"><span>HP</span><i><b id="bf-hp"></b></i></div></div>
        <div class="pkb me" id="bx-me"><div class="pkb-top"><b id="bm-name"></b><span class="pkb-lv" id="bm-lv"></span></div>
          <div class="pkb-job" id="bm-job"></div>
          <div class="pkb-st" id="bm-st"></div>
          <div class="pkb-bar hp"><span>HP</span><i><b id="bm-hp"></b></i></div>
          <div class="pkb-num" id="bm-hpt"></div>
          <div class="pkb-bar mp"><span>MP</span><i><b id="bm-mp"></b></i><em id="bm-mpt"></em></div>
          <div class="pkb-bar xp"><span>EXP</span><i><b id="bm-xp"></b></i></div>
          <div class="pk-trait" id="btrait" aria-hidden="true"></div></div>
        <div class="pk-where" id="bf-where"></div>
        <div class="pk-msg" id="bmsg"><p id="bmsg-t"></p><i class="pk-more" id="bmsg-more" hidden>▼</i></div>`;
      this.el = {};
      ["bf-hp", "bm-hp", "bm-mp", "bm-xp", "bm-hpt", "bm-mpt", "bm-lv"].forEach((id) => { this.el[id] = $(id); });
      this.shownBars = {};
      closeAll();
      this.panel = openWin(`<div class="pk-panel" id="bpanel"></div>`, {
        cls: "win-pk", noBack: true,
        onPick: (v) => this.pick(v),
        onBack: () => this.back(),
        onFocus: (v) => this.focusInfo(v),
        nav: (k, i, list) => this.nav(k, i, list),
        onA: (w) => {
          if (this.mode !== "cmd") { this.tap(); return; }
          const b = opts2(w)[w.idx];
          if (b) b.click();
        }
      });
      this.panel.el.addEventListener("pointerdown", () => { if (this.mode !== "cmd") this.tap(); });
      this.place();
      this.setPanel("wait");
    },

    /* ── 몬스터 만나기 ── */
    async encounter(mon) {
      const p = G.player;
      const kind = E.fightKind(this.floor, this.idx, p.diff);
      this.b = E.startBattle(p, { floor: this.floor, monster: mon || E.pickMonster(this.floor, kind, p.diff) });
      const e = this.b.enemy;
      const tpl = (S.MON_LOOK[e.base] || ["slime"])[0];
      if (F.monArt) await F.monArt.load(e.name);
      /* 포켓몬처럼 몬스터도 주인공만큼 크게(보스는 더 크게) */
      const img = (F.monArt && F.monArt.render(e.name, Math.round((e.boss ? 116 : 92) * Z))) || S.monsterBig(e.name, e.boss ? (Z >= 2 ? 8 : 6) : (Z >= 2 ? 6 : 4));
      const bd = bounds(img);
      const art = F.monArt && F.monArt.info(e.base);
      const fly = art ? art.fly : FLYERS.has(tpl);
      const shooter = art ? art.shooter : SHOOTERS.has(tpl);
      this.foe = { img, bd, tpl, fly: fly && !e.boss, shooter, mon: e, blink: 0, dark: 1, alpha: 0, dead: false };
      this.hero = { blink: 0, hurt: 0, alpha: 0, down: false };
      this.disp = { fhp: e.hp, php: p.hp, pmp: p.mp, xp: p.exp / E.expNeed(p.level), lv: p.level };
      this.goal = { fhp: e.hp, php: p.hp, pmp: p.mp };
      this.mode = "intro";
      this.setPanel("wait");
      $("bx-foe").classList.remove("in");
      $("bx-me").classList.remove("in");
      this.plates();
      this.say("");
      save({ fight: this.idx, mon: e.base });
      /* 둘이 제자리에 나타나고, 그림자 같던 몬스터가 제 색을 찾는다(움직이지 않는다) */
      await Promise.all([tween(this.foe, { alpha: 1 }, 360), tween(this.hero, { alpha: 1 }, 360)]);
      await tween(this.foe, { dark: 0 }, 300);
      $("bx-foe").classList.add("in");
      if (e.boss) { this.quake = 0.45; Sp.ring(this.fbx, this.fby, e.el === "phys" ? "dark" : e.el, 130 * Z); }
      /* 첫 줄(몬스터 등장) → 주인공 이름표 → 전투 시작 때 드러나는 특성(보호막·위압·동료 등) */
      const evs = this.b.log.concat(this.b.fx).sort((x, y) => x.n - y.n);
      const first = evs.findIndex((ev) => ev.text !== undefined);
      if (first >= 0) await this.say(evs[first].text);
      if (this.note) { await this.say(this.note); this.note = null; }
      $("bx-me").classList.add("in");
      await X.sleep(260);
      const rest = evs.slice(first + 1);
      if (rest.length) { await this.play(rest); await this.barsIdle(); }
      G.fast = false;
      this.prompt();
    },
    prompt() {
      this.mode = "cmd";
      this.setPanel("main");
      this.sayStatic(`${J(G.player.name, "은/는")} 무엇을 할까?`);
    },

    /* ── 이름표 ── */
    plates() {
      const p = G.player;
      const e = this.b.enemy;
      $("bf-name").textContent = e.name;
      $("bf-lv").textContent = `Lv.${e.lv}`;
      const est = [];
      if (e.boss) est.push([e.mid ? "강적" : "보스", e.mid ? "#a0482a" : "#3c4448"]);
      if (this.b.weakKnown && e.weak) est.push([`약점 ${D.ELEMENTS[e.weak]}`, (EL_CARD[e.weak] || EL_CARD.phys)[1]]);
      ["burn", "poison", "bleed", "curse", "charm", "debuff"].forEach((k) => { if (e.st[k]) est.push(ST_BADGE[k]); });
      if (e.st.stun) est.push(ST_BADGE[e.st.stunLabel === "얼어붙어" ? "freeze" : "stun"]);
      if (e.enraged) est.push(ST_BADGE.enrage);
      if (e.st.shred) est.push([`방어↓${Math.round(e.st.shred * 100)}%`, "#7a6a4a"]);
      if (e.st.cow) est.push(["공격↓", "#6a6a8a"]);
      $("bf-st").innerHTML = est.map(([t, c]) => `<i style="background:${c}">${t}</i>`).join("");
      $("bm-name").textContent = p.name;
      $("bm-job").innerHTML = `<span class="r${p.job.rarity}">${rarName(p.job.rarity)}</span> ${esc(p.job.name)}`;
      const ps = this.b.ps;
      const pst = [];
      ["burn", "poison", "weaken", "atkUp", "rage", "counter", "evade", "regen", "summon"].forEach((k) => {
        if (!ps[k]) return;
        const turns = typeof ps[k] === "object" ? ps[k].t : ps[k];
        pst.push([`${ST_BADGE[k][0]} ${turns}`, ST_BADGE[k][1]]);
      });
      if (ps.barrier > 0) pst.push([`보호막 ${fmt(ps.barrier)}`, ST_BADGE.barrier[1]]);
      if (ps.momentum) pst.push([`기세 ${ps.momentum}`, "#d0602a"]);
      if (ps.ready) pst.push(["빈틈", "#3a88a8"]);
      $("bm-st").innerHTML = pst.map(([t, c]) => `<i style="background:${c}">${t}</i>`).join("");
      const n = E.floorFights(this.floor, p.diff);
      $("bf-where").innerHTML = `<b>${this.floor}층</b> ${esc(this.theme.name)} ${diffTag(p.diff)}<span class="dots">${Array.from({ length: n }, (_, i) => { const k = E.fightKind(this.floor, i, p.diff); return `<i class="${i < this.idx ? "done" : i === this.idx ? "now" : ""}${k === "mob" ? "" : " " + k}"></i>`; }).join("")}</span>`;
    },
    /* HP·MP 바는 정해진 빠르기로 따라가고, 다 따라가면 기다리던 연출이 이어진다 */
    updateBars(s) {
      const p = G.player;
      const d = E.derive(p);
      const e = this.b.enemy;
      const step = (k, max, secs) => {
        const g = this.goal[k];
        const v = this.disp[k];
        if (v === g) return true;
        const sp = (Math.max(1, max) / secs) * s;
        this.disp[k] = v < g ? Math.min(g, v + sp) : Math.max(g, v - sp);
        return this.disp[k] === g;
      };
      const idle = [step("fhp", e.maxHp, 1.1), step("php", d.maxHp, 1.1), step("pmp", d.maxMp, 0.7)].every(Boolean);
      if (idle && this.barWait.length) { const w = this.barWait; this.barWait = []; w.forEach((r) => r()); }
      const put = (id, ratio, cls) => {
        const el = this.el[id];
        if (!el) return;
        const w = `${(clamp(ratio, 0, 1) * 100).toFixed(1)}%`;
        const key = w + (cls || "");
        if (this.shownBars[id] === key) return;
        this.shownBars[id] = key;
        el.style.width = w;
        el.className = cls || "";
      };
      const text = (id, v) => { const el = this.el[id]; if (el && el.textContent !== v) el.textContent = v; };
      const fr = this.disp.fhp / e.maxHp;
      const pr = this.disp.php / d.maxHp;
      put("bf-hp", fr, hpCls(fr));
      put("bm-hp", pr, hpCls(pr));
      put("bm-mp", this.disp.pmp / d.maxMp);
      put("bm-xp", this.disp.xp);
      text("bm-hpt", `${Math.max(0, Math.ceil(this.disp.php))}/ ${d.maxHp}`);
      text("bm-mpt", `${Math.max(0, Math.round(this.disp.pmp))}/${d.maxMp}`);
      text("bm-lv", `Lv.${this.disp.lv}`);
    },
    barsIdle() {
      return new Promise((res) => { this.barWait.push(res); });
    },
    sync() {
      const p = G.player;
      this.goal.php = Math.max(0, p.hp);
      this.goal.pmp = p.mp;
      this.goal.fhp = Math.max(0, this.b.enemy.hp);
    },
    /* 경험치 바: 레벨이 오를 때마다 끝까지 찼다가 비워지며 Lv 숫자가 오른다 */
    async fillExp() {
      const p = G.player;
      const rw = this.b.reward;
      if (!rw) return;
      let lv = rw.from.level;
      this.disp.lv = lv;
      this.disp.xp = rw.from.exp / E.expNeed(lv);
      while (lv < p.level) {
        await tween(this.disp, { xp: 1 }, Math.max(160, (1 - this.disp.xp) * 900));
        lv++;
        this.disp.lv = lv;
        this.disp.xp = 0;
        const f = this.heroFeet();
        Sp.levelUp(f.x, Math.min(f.y, this.msgTop - 4));
      }
      await tween(this.disp, { xp: p.exp / E.expNeed(p.level) }, Math.max(160, (p.exp / E.expNeed(p.level) - this.disp.xp) * 900));
    },

    /* ── 대화창: 글자가 한 자씩 찍히고, 잠시 뒤 다음 줄로. 결정 키는 빨리 넘긴다 ── */
    say(text, wait) {
      return new Promise((res) => {
        this.msg = { text, shown: 0, hold: wait ? Infinity : 0.5 + Math.min(0.8, text.length * 0.018), wait: !!wait, res };
        this.paintMsg();
      });
    },
    sayStatic(text) {
      this.msg = { text, shown: 0, hold: Infinity, still: true };
      this.paintMsg();
    },
    showText(text) {
      this.msg = { text, shown: text.length, hold: Infinity, still: true };
      this.paintMsg();
    },
    /* 지금 문장 끝에 ▼를 띄우고 결정 키를 기다린다 */
    pause() {
      const last = $("bmsg-t").textContent;
      return new Promise((res) => {
        this.msg = { text: last, shown: last.length, hold: Infinity, wait: true, res };
        this.paintMsg();
      });
    },
    paintMsg() {
      const m = this.msg;
      const el = $("bmsg-t");
      if (!el || !m) return;
      const txt = m.text.slice(0, Math.floor(m.shown));
      if (el.textContent !== txt) el.textContent = txt;
      $("bmsg-more").hidden = !(m.wait && m.shown >= m.text.length);
    },
    updateMsg(s) {
      const m = this.msg;
      if (!m) return;
      if (m.shown < m.text.length) { m.shown = Math.min(m.text.length, m.shown + s * 50); this.paintMsg(); return; }
      if (m.still || m.wait) return;
      m.hold -= s;
      if (m.hold <= 0) { this.msg = null; m.res(); }
    },
    tap() {
      const m = this.msg;
      if (m && m.shown < m.text.length) { m.shown = m.text.length; this.paintMsg(); return; }
      if (m && m.wait) { this.msg = null; $("bmsg-more").hidden = true; m.res(); return; }
      if (m && !m.still) m.hold = Math.min(m.hold, 0.04);
      if (this.mode === "anim" || this.mode === "intro") G.fast = true;
    },
    key(k) {
      if (k === "a") this.tap();
    },

    /* ── 아래 화면: 명령 버튼·기술 카드·가방 ── */
    setPanel(kind) {
      this.sub = kind;
      const box = $("bpanel");
      if (!box) return;
      const p = G.player;
      let focus = 0;
      if (kind === "wait") {
        box.className = "pk-panel wait";
        box.innerHTML = `<p class="pk-hint">${touch ? "화면을 누르면" : "Z · Enter를 누르면"} 빨리 넘어간다</p>`;
      } else if (kind === "main") {
        const fl = Math.round(E.fleeChance(p, this.b) * 100);
        box.className = "pk-panel main";
        box.innerHTML = `
          <button type="button" class="pkbtn fight" data-opt="fight"><span>싸운다</span></button>
          <div class="pk-row4">
            <button type="button" class="pkbtn bag" data-opt="bag"><span>가방</span><small>물약 ${p.potions.hp}·${p.potions.mp}</small></button>
            <button type="button" class="pkbtn run" data-opt="run"><span>도망</span><small>${this.b.enemy.boss ? "보스전" : fl + "%"}</small></button>
            <button type="button" class="pkbtn guard" data-opt="guard"><span>방어</span><small>피해↓ MP↑</small></button>
            <button type="button" class="pkbtn info" data-opt="info"><span>상태</span></button>
          </div>`;
        focus = this.lastMain || 0;
      } else if (kind === "moves") {
        box.className = "pk-panel moves";
        box.innerHTML = `<div class="pk-moves" style="--cols:${this.cols()}">${[this.moveCard(-1)].concat(p.job.skills.map((sk, i) => this.moveCard(i))).join("")}</div>
          <button type="button" class="pkbtn cancel" data-opt="back"><span>취소</span></button>`;
        focus = this.lastMove || 0;
      } else if (kind === "bag") {
        const pot = E.potionPower(p);
        box.className = "pk-panel moves";
        box.innerHTML = `<div class="pk-moves" style="--cols:2">
          <button type="button" class="pkmove item${p.potions.hp ? "" : " off"}" data-opt="ihp" style="--t:#e06060;--td:#a83030"><b><img src="${S.icon("potion", 2)}" alt="">회복 물약</b><span class="pkm-foot"><i class="pk-type">${p.potions.hp}개</i><em>HP ${Math.round(40 * pot)}%</em></span></button>
          <button type="button" class="pkmove item${p.potions.mp ? "" : " off"}" data-opt="imp" style="--t:#6080e0;--td:#3048a8"><b><img src="${S.icon("ether", 2)}" alt="">마나 물약</b><span class="pkm-foot"><i class="pk-type">${p.potions.mp}개</i><em>MP ${Math.round(50 * pot)}%</em></span></button>
        </div>
        <button type="button" class="pkbtn cancel" data-opt="back"><span>취소</span></button>`;
      }
      if (this.panel) {
        this.panel.idx = focus;
        focusOpt(this.panel, true);
      }
    },
    cols() { return this.narrow || this.side ? 2 : 3; },
    /* 기술 카드: 포켓몬의 기술 버튼처럼 속성 색 테두리, 속성 이름표, PP 자리에 MP */
    moveCard(i) {
      const p = G.player;
      if (i < 0) {
        const a = E.attackOf(p.job);
        const c = EL_CARD[a.el] || EL_CARD.phys;
        const w = E.weaponOf(p.job);
        return `<button type="button" class="pkmove" data-opt="atk" style="--t:${c[0]};--td:${c[1]}"><b>${esc(a.name)}</b><span class="pkm-foot"><i class="pk-type">${D.ELEMENTS[a.el]}</i><em>${esc(w.name)}${w.hits > 1 ? ` ${w.hits}회` : ""}</em></span></button>`;
      }
      const sk = p.job.skills[i];
      const av = E.skillAvailable(p, this.b, i);
      const c = EL_CARD[sk.el] || EL_CARD.phys;
      const cost = sk.type === "sacrifice" ? `HP ${Math.round(D.SKILL_TYPES.sacrifice.hpCost * 100)}%` : `MP ${E.skillSpec(p, sk).cost}`;
      const right = av.ok ? cost : av.why.startsWith("Lv.") ? `${av.why} 습득` : av.why.endsWith("턴") ? `${av.why} 후` : av.why;
      return `<button type="button" class="pkmove${av.ok ? "" : " off"}${sk.tag === "ult" ? " ult" : ""}" data-opt="sk${i}" style="--t:${c[0]};--td:${c[1]}"><b>${esc(sk.name)}</b><span class="pkm-foot"><i class="pk-type">${D.ELEMENTS[sk.el]}</i><em${av.ok ? "" : ' class="no"'}>${right}</em></span></button>`;
    },
    focusInfo(v) {
      if (this.mode !== "cmd" || !v) return;
      const p = G.player;
      if (this.sub === "moves") {
        this.lastMove = this.panel.idx;
        if (v === "atk") this.showText(`${E.attackOf(p.job).name}(${E.weaponOf(p.job).name}): ${E.describeAttack(p.job)}.`);
        else if (v.startsWith("sk")) {
          const sk = p.job.skills[Number(v.slice(2))];
          this.showText(`${sk.name}: ${E.describeSkill(sk, p)}${p.level < sk.lv ? ` (Lv.${sk.lv}에 배운다)` : ""}`);
        } else this.showText(`${J(p.name, "은/는")} 무엇을 할까?`);
      } else if (this.sub === "bag") {
        if (v === "ihp") this.showText("회복 물약: HP를 회복하고 화상과 독을 낫게 한다.");
        else if (v === "imp") this.showText("마나 물약: MP를 회복한다.");
        else this.showText(`${J(p.name, "은/는")} 무엇을 할까?`);
      }
    },
    /* 방향키: 큰 '싸운다' 아래 네 버튼, 기술 카드는 격자, 맨 아래는 취소 */
    nav(k, i, list) {
      const n = list.length;
      if (this.sub === "main") {
        const M = this.side
          ? [{ down: 1 }, { up: 0, right: 2, down: 3 }, { up: 0, left: 1, down: 4 }, { up: 1, right: 4 }, { up: 2, left: 3 }]
          : [{ down: 2, left: 1, right: 3 }, { up: 0, right: 2 }, { up: 0, left: 1, right: 3 }, { up: 0, left: 2, right: 4 }, { up: 0, left: 3 }];
        const j = (M[i] || {})[k];
        return j === undefined ? i : j;
      }
      const cols = this.sub === "bag" ? 2 : this.cols();
      const cards = n - 1;
      if (i >= cards) return k === "up" ? Math.floor((cards - 1) / cols) * cols : i;
      if (k === "left") return i % cols ? i - 1 : i;
      if (k === "right") return i % cols < cols - 1 && i + 1 < cards ? i + 1 : i;
      if (k === "up") return i - cols >= 0 ? i - cols : i;
      if (k === "down") return i + cols < cards ? i + cols : n - 1;
      return i;
    },
    back() {
      if (this.mode === "cmd" && this.sub !== "main") this.prompt();
    },
    pick(v) {
      if (this.mode !== "cmd") return;
      const p = G.player;
      if (this.sub === "main") this.lastMain = this.panel.idx;
      switch (v) {
        case "fight": this.setPanel("moves"); return;
        case "bag": this.setPanel("bag"); return;
        case "back": this.prompt(); return;
        case "info": openStatus(); return;
        case "guard": this.run({ kind: "guard" }); return;
        case "run":
          if (this.b.enemy.boss) { this.showText("안 돼! 보스와의 싸움에서는 도망칠 수 없다!"); return; }
          this.run({ kind: "flee" });
          return;
        case "atk": this.run({ kind: "attack" }); return;
        case "ihp": case "imp": {
          const item = v === "ihp" ? "hp" : "mp";
          if (!p.potions[item]) { this.showText(item === "hp" ? "회복 물약이 없다!" : "마나 물약이 없다!"); return; }
          this.run({ kind: "potion", item });
          return;
        }
        default:
          if (v.startsWith("sk")) {
            const i = Number(v.slice(2));
            const sk = p.job.skills[i];
            const av = E.skillAvailable(p, this.b, i);
            if (!av.ok) {
              this.showText(av.why.startsWith("Lv.") ? `${J(sk.name, "은/는")} ${av.why}에 배우는 기술이다!` : av.why === "MP 부족" ? "MP가 모자라서 쓸 수 없다!" : av.why === "HP 부족" ? "HP가 모자라서 쓸 수 없다!" : `${J(sk.name, "은/는")} ${av.why} 뒤에 다시 쓸 수 있다!`);
              return;
            }
            this.run({ kind: "skill", idx: i });
          }
      }
    },

    /* ── 한 차례: 엔진이 결과를 정하고, 화면은 문장과 연출을 일어난 순서대로 보여 준다 ── */
    async run(action) {
      const b = this.b;
      const p = G.player;
      const n0 = b.seq;
      this.mode = "anim";
      this.setPanel("wait");
      this.sync();
      E.act(p, b, action);
      const evs = b.log.filter((l) => l.n > n0).concat(b.fx.filter((f) => f.n > n0)).sort((x, y) => x.n - y.n);
      await this.play(evs);
      this.sync();
      await this.barsIdle();
      this.plates();
      if (b.result === "win") { await this.victoryEnd(); return; }
      if (b.result === "lose") { await this.defeatEnd(); return; }
      if (b.result === "fled") { await this.fledEnd(); return; }
      G.fast = false;
      save({ fight: this.idx, mon: b.enemy.base });
      this.prompt();
    },
    async play(evs) {
      let i = 0;
      while (i < evs.length) {
        const ev = evs[i];
        if (ev.text !== undefined) {
          if (ev.kind === "exp") { const said = this.say(ev.text); await this.fillExp(); await said; }
          else await this.say(ev.text);
          this.plates();
          i++;
          continue;
        }
        if (ev.kind === "act") {
          const hits = [];
          let j = i + 1;
          while (j < evs.length && evs[j].text === undefined && evs[j].kind !== "act") { hits.push(evs[j]); j++; }
          if (ev.target === "player") await this.heroAct(ev, hits);
          else await this.foeAct(ev, hits);
          i = j;
          continue;
        }
        await this.applyFx(ev);
        i++;
      }
    },
    /* 화면 위치(픽셀): 둘 다 제자리에 서 있다 */
    heroFeet() {
      return { x: this.hbx, y: this.hby };
    },
    heroCenter() {
      const f = this.heroFeet();
      return [f.x + this.heroH * 0.06, f.y - this.heroH * 0.55];
    },
    foeFeet() {
      return { x: this.fbx, y: this.fby - (this.foe.fly ? 30 * Z : 0) };
    },
    foeCenter() {
      const f = this.foeFeet();
      return [f.x, f.y - this.foe.bd.h * 0.5];
    },
    /* Moves·weaponFx가 쓰는 대상(기본 단위) */
    foeT() {
      const f = this.foeFeet();
      const Fo = this.foe;
      return { x: f.x / Z, y: f.y / Z, w: Fo.bd.w / Z, h: Fo.bd.h / Z, fly: Fo.fly, dead: Fo.dead, mon: Fo.mon };
    },
    /* 기술 연출에 넘기는 무대: 근접·범위 기술은 몬스터 바로 앞에서 터지고, 원거리는 주인공 손에서 날아간다 */
    stage(where) {
      const B = this;
      const t = this.foeT();
      let hero;
      if (where === "on") hero = { x: t.x, y: t.y, dir: 1 };
      else if (where === "near") hero = { x: t.x - t.w * 0.5 - 24, y: t.y, dir: 1 };
      else {
        const [hx, hy] = this.heroCenter();
        hero = { x: (hx + this.heroH * 0.16) / Z - 16, y: hy / Z + 24, dir: 1 };
      }
      return {
        hero, reach: this.reach,
        get quake() { return B.quake; }, set quake(v) { B.quake = v; },
        get dim() { return B.dim; }, set dim(v) { B.dim = v; },
        get flash() { return B.flash; }, set flash(v) { B.flash = v; },
        pickTargets: () => (B.foe.dead ? [] : [t]),
        applySkill() {}
      };
    },
    /* 주인공 차례: 캐릭터는 그대로 서 있고, 무기·기술 효과만 몬스터 쪽으로 터지거나 날아간다 */
    async heroAct(ev, hits) {
      const p = G.player;
      if (ev.mp) this.goal.pmp = Math.max(0, this.goal.pmp - ev.mp);
      if (ev.hp) this.goal.php = Math.max(1, this.goal.php - ev.hp);
      if (ev.action === "item" || ev.action === "guard") {
        await X.sleep(160);
        for (const h of hits) await this.applyFx(h);
        await X.sleep(100);
        return;
      }
      const sk = ev.action === "skill" ? p.job.skills[ev.idx] : null;
      if (sk && sk.tag === "ult") {
        const st = this.stage("near");
        st.casterAt = [this.heroFeet().x, this.msgTop - 2];
        let landed = null;
        st.applySkill = () => { landed = this.hitFx(hits); };
        await Moves.castUlt.call(st, sk, visPlan(sk, this.reach.far));
        await (landed || this.hitFx(hits));
        return;
      }
      if (sk && SELF_TYPES.has(sk.type)) {
        await X.sleep(160);
        for (const h of hits) await this.applyFx(h);
        await X.sleep(120);
        return;
      }
      /* 근접 무기·범위 기술은 몬스터 자리에서 터지고, 활·총·마법은 주인공 손에서 날아간다 */
      const plan = sk ? visPlan(sk, this.reach.far) : null;
      const where = plan && plan.area === "around" ? "on" : this.reach.far ? "hand" : "near";
      await X.sleep(100);
      const st = this.stage(where);
      const W = this.reach.weapon;
      const el = ev.el || "phys";
      await (sk ? Moves.skillVisual.call(st, sk, plan, [this.foeT()]) : weaponFx(st, el, [this.foeT()], W.far ? W.range : W.reach));
      await this.hitFx(hits);
      await X.sleep(120);
    },
    async hitFx(hits) {
      for (const h of hits) await this.applyFx(h);
    },
    /* 몬스터 차례: 몬스터도 제자리에서, 마법형은 마력탄을 쏘고 나머지는 주인공 자리에 할퀴기·내려찍기가 터진다 */
    async foeAct(ev, hits) {
      const Fo = this.foe;
      const trait = ev.trait || "attack";
      const el = ev.el && ev.el !== "phys" ? ev.el : null;
      const [hx, hy] = this.heroCenter();
      const ground = this.msgTop - 2 * Z;
      const ranged = Fo.shooter || trait === "drain" || (el && Math.random() < 0.35);
      await X.sleep(trait === "heavy" ? 260 : 120);
      if (ranged) {
        const [fx, fy] = this.foeCenter();
        await Sp.shot([fx - Fo.bd.w * 0.3, fy], [hx, hy], el || "dark", "orb");
      } else if (trait === "heavy") {
        Sp.smash(hx, ground, -1, el || "phys", true);
        this.quake = 0.3;
        await X.sleep(90);
      } else {
        Sp.slash(hx, hy, -1, el || "phys", false, Math.random() < 0.5);
        await X.sleep(60);
      }
      if (trait === "drain") Sp.stream([hx, hy], this.foeCenter(), "#ff5a7a");
      if (trait === "steal") Sp.coins([hx, hy], this.foeCenter());
      await X.sleep(70);
      for (const h of hits) await this.applyFx(h);
    },
    async applyFx(f) {
      const H = this.hero;
      const Fo = this.foe;
      const [hx, hy] = this.heroCenter();
      const [fx, fy] = this.foeCenter();
      const fgy = this.fby;
      const hgy = this.msgTop - 2 * Z;
      /* 숫자가 화면 위로 잘리지 않게 */
      const ftop = Math.max(16 * Z, this.foeFeet().y - Fo.bd.h - 2 * Z);
      const htop = Math.max(16 * Z, this.heroFeet().y - this.heroH);
      switch (f.kind) {
        case "hit": case "crit":
          if (f.target === "enemy") {
            if (f.src === "summon") await Sp.shot([this.heroFeet().x - this.heroH * 0.3, this.heroFeet().y - this.heroH * 0.95], [fx, fy], "arcane", "orb");
            if (f.src === "counter") Sp.slash(fx, fy, 1, "phys", false, false);
            if (f.src === "self") Sp.impact(fx, fy, "dark", false);
            if (f.src === "thorns") Sp.impact(fx, fy, "nature", false);
            Fo.blink = 0.5;
            Sp.number(fx, ftop, f.amount, f.kind === "crit" ? "crit" : "hit", 0);
            if (f.kind === "crit") this.quake = Math.max(this.quake, 0.16);
            this.goal.fhp = Math.max(0, this.goal.fhp - f.amount);
          } else {
            H.blink = 0.5;
            H.hurt = 0.35;
            Sp.number(hx, htop, f.amount, "taken", 0);
            if (f.absorbed) Sp.shieldBubble(hx, hy, 30 * Z);
            this.quake = Math.max(this.quake, f.amount > E.derive(G.player).maxHp * 0.25 ? 0.22 : 0.1);
            this.goal.php = Math.max(0, this.goal.php - f.amount);
          }
          await this.barsIdle();
          await X.sleep(120);
          break;
        case "miss":
          Sp.number(hx, htop, "MISS", "miss", 0);
          await X.sleep(260);
          break;
        case "trait": {
          /* 특성이 드러나면 주인공 이름표 위에 특성 이름이 잠깐 뜬다 */
          const el = $("btrait");
          if (el) {
            el.innerHTML = `<small>특성</small>${esc(f.name)}`;
            el.classList.remove("show");
            void el.offsetWidth;
            el.classList.add("show");
            clearTimeout(this.traitTimer);
            this.traitTimer = setTimeout(() => el.classList.remove("show"), 1500);
          }
          Sp.aura(hx, hgy, "light");
          await X.sleep(140);
          break;
        }
        case "zap":
          Sp.bolt([fx + 16 * Z, fy - 120 * Z], [fx, fy], "bolt");
          this.quake = Math.max(this.quake, 0.12);
          await X.sleep(150);
          break;
        case "dot": {
          const enemy = f.target === "enemy";
          const x = enemy ? fx : hx;
          const gy = enemy ? fgy : hgy;
          const kind = DOT_FX[f.dot] || "cloud";
          if (kind === "flames") Sp.flames(x, gy, "fire", 30 * Z, false);
          else if (kind === "drops") Sp.drops(x, enemy ? fy : hy);
          else Sp.cloud(x, gy, f.dot === "curse" ? "curse" : "poison");
          if (enemy) { Fo.blink = 0.3; this.goal.fhp = Math.max(0, this.goal.fhp - f.amount); }
          else { H.blink = 0.3; this.goal.php = Math.max(0, this.goal.php - f.amount); }
          Sp.number(x, enemy ? ftop : htop, f.amount, "dot", 0);
          await this.barsIdle();
          await X.sleep(160);
          break;
        }
        case "status": {
          const enemy = f.target === "enemy";
          const x = enemy ? fx : hx;
          const y = enemy ? fy : hy;
          const gy = enemy ? fgy : hgy;
          switch (f.st) {
            case "freeze": Sp.crystals(x, gy, "ice", 46 * Z, false); break;
            case "stun": if (enemy) Sp.ring(x, gy, "bolt", 50 * Z); else Sp.bolt([x + 16 * Z, y - 120 * Z], [x, y], "bolt"); break;
            case "charm": Sp.hearts(x, y - 8 * Z); break;
            case "debuff": case "weaken": Sp.weaken(x, y); break;
            case "curse": case "poison": Sp.cloud(x, gy, f.st); break;
            case "burn": Sp.flames(x, gy, "fire", 36 * Z, false); break;
            case "bleed": Sp.drops(x, y); break;
            case "enrage": Fo.blink = 0.3; this.quake = 0.25; Sp.impact(x, y, "fire", true); break;
            default: break;
          }
          this.plates();
          await X.sleep(220);
          break;
        }
        case "heal":
          if (f.target === "enemy") {
            Sp.heal(fx, fgy);
            Sp.number(fx, ftop, "+" + f.amount, "heal", 0);
            this.goal.fhp = Math.min(Fo.mon.maxHp, this.goal.fhp + f.amount);
          } else {
            if (f.src === "revive") Sp.pillar(hx, hgy, "fire", true);
            else Sp.heal(hx, hgy);
            Sp.number(hx, htop, "+" + f.amount, "heal", 0);
            this.goal.php = f.src === "revive" ? f.amount : Math.min(E.derive(G.player).maxHp, this.goal.php + f.amount);
          }
          await this.barsIdle();
          await X.sleep(160);
          break;
        case "mana":
          this.goal.pmp = Math.min(E.derive(G.player).maxMp, this.goal.pmp + f.amount);
          if (f.quiet) break;
          Sp.aura(hx, hgy, "ice");
          Sp.number(hx, htop, "+" + f.amount, "mp", 0);
          await this.barsIdle();
          await X.sleep(120);
          break;
        case "shield":
          Sp.shieldBubble(hx, hy, 34 * Z);
          Sp.number(hx, htop, "+" + f.amount, "mp", 0);
          this.plates();
          await X.sleep(260);
          break;
        case "buff":
          Sp.aura(hx, hgy, f.el && f.el !== "phys" ? f.el : "light");
          if (f.guard) Sp.shieldBubble(hx, hy, 30 * Z);
          if (f.summon) Sp.circle(hx - this.heroH * 0.3, hgy, f.el && f.el !== "phys" ? f.el : "arcane", 700);
          this.plates();
          await X.sleep(280);
          break;
        case "gold":
          Sp.coins([fx, fy], [hx, hy]);
          Sp.number(hx, htop, "+" + f.amount + "G", "gold", 0);
          await X.sleep(220);
          break;
        case "faint":
          /* 쓰러지면 그 자리에서 흐려져 사라진다 */
          if (f.target === "enemy") {
            Sp.impact(fx, fy, Fo.mon.el === "phys" ? "light" : Fo.mon.el, false);
            if (Fo.mon.boss) { Sp.pillar(fx, fgy, "light", true); this.quake = 0.4; }
            await tween(Fo, { alpha: 0 }, 520);
            Fo.dead = true;
          } else {
            H.down = true;
            await tween(H, { alpha: 0.35 }, 620);
          }
          break;
        default:
          break;
      }
    },

    /* ── 끝맺음 ── */
    async victoryEnd() {
      save({ fight: this.idx + 1, mon: null });
      G.fast = false;
      await this.pause();
      this.next();
    },
    async defeatEnd() {
      G.fast = false;
      await this.say("눈앞이 캄캄해졌다!");
      await tween(this, { dim: 1 }, 700);
      gameOver(this.b.enemy.name);
    },
    async fledEnd() {
      await tween(this.hero, { alpha: 0 }, 380);
      G.fast = false;
      this.next();
    },
    /* 다음 몬스터, 또는 층을 다 돌았으면 갈림길 */
    next() {
      const p = G.player;
      this.mode = "done";
      this.idx++;
      if (this.idx < E.floorFights(this.floor, p.diff)) {
        battleFlash(() => { this.dim = 0; this.ui(); this.encounter(null); });
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
          <button class="opt primary" type="button" data-opt="down">${n + 1}층으로 내려간다 <small>${esc(Wd.floorName(n + 1))}${E.floorBoss(n + 1, p.diff) === "boss" ? " · 보스" : E.floorBoss(n + 1, p.diff) === "mid" ? " · 중간 보스" : ""}</small></button>
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

    update(dt) {
      if (this.vw !== VW || this.vh !== VH) this.layout();
      const s = dt / 1000;
      this.quake = Math.max(0, this.quake - s);
      if (this.flash) this.flash.t -= s;
      if (this.foe) this.foe.blink = Math.max(0, this.foe.blink - s);
      if (this.hero) { this.hero.blink = Math.max(0, this.hero.blink - s); this.hero.hurt = Math.max(0, this.hero.hurt - s); }
      this.updateMsg(s);
      if (this.b) this.updateBars(s);
      Ambient.update(s, this.theme.ambient);
    },

    /* ── 그리기 ── */
    draw(t) {
      const qx = this.quake ? Math.round(rnd(-3, 3) * Z) : 0;
      const qy = this.quake ? Math.round(rnd(-2, 2) * Z) : 0;
      ctx.save();
      ctx.translate(qx, qy);
      this.drawField(t);
      if (this.foe) {
        this.drawBase(this.fbx, this.fby, Math.max(this.foe.bd.w / Z * 0.62, this.foe.mon.boss ? 70 : 48), "foe");
        this.drawFoe(t);
      }
      this.drawBase(this.hbx, this.hby - 6 * Z, 84, "hero");
      if (this.foe) this.drawHero(t);
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
    /* 하늘·먼 산은 지역 배경을 지평선에 맞춰 그리고, 그 아래는 원근 줄무늬가 있는 평평한 들판 */
    drawField(t) {
      const th = this.theme;
      const g = th.ground;
      const hz = this.hz;
      const big = Math.max(VH, 640);
      const G0 = Math.round(big * 0.8);
      ctx.save();
      ctx.translate(0, hz - G0);
      Wd.drawBackground(ctx, { theme: th, groundY: G0 / Z }, Z, 0, 0, VW, big, t);
      ctx.restore();
      /* 달: 배경 그림의 달은 지평선에서 너무 높아 따로 그린다 */
      const mx = Math.round(this.SW * 0.86);
      const my = Math.round(Math.max(22 * Z, hz * 0.32));
      const R = 46 * (Z / 2);
      const gl = ctx.createRadialGradient(mx, my, 2, mx, my, R);
      gl.addColorStop(0, th.moon[0]);
      gl.addColorStop(1, th.moon[0] + "00");
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = gl;
      ctx.fillRect(mx - R, my - R, R * 2, R * 2);
      ctx.globalAlpha = 1;
      const mc = Wd.moonCanvas(th, Z);
      ctx.drawImage(mc, Math.round(mx - mc.width / 2), Math.round(my - mc.height / 2));
      ctx.fillStyle = g.body;
      ctx.fillRect(0, hz, VW, VH - hz);
      const e = (n) => Math.max(1, Math.round((n * Z) / 2));
      ctx.fillStyle = g.top;
      ctx.fillRect(0, hz, VW, e(3));
      ctx.fillStyle = g.top2;
      ctx.fillRect(0, hz + e(3), VW, e(2));
      const depth = this.sceneB - hz;
      ctx.globalAlpha = 0.14;
      for (let k = 1; k < 9; k++) {
        const y = hz + depth * Math.pow(k / 9, 1.7);
        ctx.fillRect(0, Math.round(y), VW, e(1 + k * 0.6));
      }
      ctx.globalAlpha = 1;
      if (!this.specks) {
        const r = Wd.rng(41 + this.floor);
        this.specks = Array.from({ length: 70 }, () => ({ u: r(), v: r(), c: Math.floor(r() * 3) }));
      }
      this.specks.forEach((s) => {
        const v = Math.pow(s.v, 1.5);
        const y = Math.round(hz + 6 * Z + depth * v);
        const sz = e(1 + v * 3);
        ctx.fillStyle = s.c ? g.speck[Math.min(g.speck.length - 1, s.c - 1)] : g.top2;
        ctx.fillRect(Math.round(s.u * this.SW), y, sz, sz);
      });
    },
    /* 받침: 픽셀로 칠한 납작한 타원(테두리·윗면·안쪽 고리) */
    drawBase(cx, cy, rxU, key) {
      const rx = Math.round(rxU);
      const ry = Math.max(8, Math.round(rx * 0.24));
      const ck = `${key}|${rx}|${Z}`;
      let c = this.baseCache[ck];
      if (!c) {
        const g = this.theme.ground;
        const top = Wd.mixHex(g.top, g.body, 0.45);
        const rim = Wd.mixHex(g.body, "#000000", 0.35);
        c = S.makeCanvas(Math.round((rx * 2 + 2) * Z), Math.round((ry * 2 + 6) * Z));
        const x = c.getContext("2d");
        const row = (ox, oy, rX, rY, col) => {
          x.fillStyle = col;
          for (let y = -rY; y <= rY; y++) {
            const half = Math.round(rX * Math.sqrt(Math.max(0, 1 - (y / (rY + 0.5)) ** 2)));
            x.fillRect(Math.round((ox - half) * Z), Math.round((oy + y) * Z), Math.round(half * 2 * Z), Math.ceil(Z));
          }
        };
        row(rx + 1, ry + 3, rx, ry, rim);
        row(rx + 1, ry + 1, rx, ry, top);
        row(rx + 1, ry + 1, Math.round(rx * 0.82), Math.round(ry * 0.7), Wd.mixHex(top, g.top, 0.5));
        row(rx + 1, ry + 1, Math.round(rx * 0.74), Math.round(ry * 0.6), top);
        const r = Wd.rng(rx * 7 + ry);
        x.fillStyle = Wd.mixHex(top, g.top2, 0.6);
        for (let k = 0; k < rx * 0.6; k++) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * 0.85;
          x.fillRect(Math.round((rx + 1 + Math.cos(a) * rx * d) * Z), Math.round((ry + 1 + Math.sin(a) * ry * d) * Z), Math.ceil(Z), Math.ceil(Z));
        }
        this.baseCache[ck] = c;
      }
      ctx.drawImage(c, Math.round(cx - c.width / 2), Math.round(cy - (ry + 1) * Z));
    },
    drawHero(t) {
      const p = G.player;
      const H = this.hero;
      if (H.blink > 0 && Math.floor(t / 70) % 2) return;
      const f = this.heroFeet();
      drawHeroAt(p.job, f.x, f.y, this.heroH, { alpha: H.alpha, hurt: H.hurt > 0, barrier: this.b && this.b.ps.barrier > 0 && !H.down });
      if (this.b && this.b.ps.summon && !H.down) {
        const x = f.x - this.heroH * 0.3;
        const y = f.y - this.heroH * 0.95;
        Sp.orbAt(ctx, x, y, 6 * Z, "arcane");
        if (Math.random() < 0.2) Sp.spark(x + rnd(-6, 6) * Z, y + rnd(-6, 6) * Z, { vy: -20 * Z, life: 500, col: Sp.PAL.arcane[1], glow: 0.7, size: 1 });
      }
    },
    drawFoe(t) {
      const Fo = this.foe;
      const { img, bd, mon } = Fo;
      const f = this.foeFeet();
      shadow(f.x, this.fby + Z, bd.w * 0.32, 3.4 * Z, (Fo.fly ? 0.16 : 0.3) * Fo.alpha);
      if (Fo.dead || Fo.alpha <= 0 || (Fo.blink > 0 && Math.floor(t / 70) % 2)) return;
      ctx.save();
      ctx.globalAlpha = Fo.alpha;
      ctx.translate(f.x, f.y);
      ctx.scale(-1, 1);
      const ox = Math.round(-(bd.x0 + bd.w / 2));
      const oy = Math.round(-(bd.y1 + 1));
      ctx.drawImage(img, ox, oy);
      const over = (col, a) => { ctx.globalAlpha = Fo.alpha * a; ctx.drawImage(S.silhouette(img, col), ox, oy); };
      if (Fo.dark > 0) over("#120e22", Fo.dark);
      else if (mon.enraged) over("#ff3030", 0.3);
      else if (mon.st.charm) over("#ff8ad8", 0.25);
      else if (mon.st.stun && mon.st.stunLabel === "얼어붙어") over("#9ae6ff", 0.35);
      ctx.restore();
      if (!mon.st.stun) return;
      const top = f.y - bd.h - 4 * Z;
      for (let k = 0; k < 3; k++) {
        const a = t / 200 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = mon.st.stunLabel === "얼어붙어" ? "#bff0ff" : "#ffe066";
        ctx.fillRect(Math.round(f.x + Math.cos(a) * 10 * Z), Math.round(top + Math.sin(a) * 3 * Z), Math.max(2, Math.round(2 * Z)), Math.max(2, Math.round(2 * Z)));
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
      <div class="over-body"><img class="over-pf" src="${HA.profile(p.job)}" alt="">
      <p><b>${esc(p.name)}</b> ${diffTag(p.diff)}<br><span class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</span> · Lv.${p.level}<br>최고 기록 ${p.best}층 · 처치 ${fmt(p.kills)}<br>${esc(J(cause, "에게"))} 쓰러짐</p></div>
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
