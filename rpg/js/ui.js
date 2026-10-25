/*
 * 삼천의 운명 — 화면과 입력
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const D = F.data;
  const E = F.engine;
  const J = E.J;
  const doc = root.document;
  const $ = (id) => doc.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString("ko-KR");
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const reduceMotion = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const SCREENS = ["title", "roll", "town", "battle", "codex", "hall"];
  const NON_DAMAGE = new Set(["heal", "regen", "buff", "rage", "shield", "counter", "summon"]);
  const TRAIT_NAMES = {
    heavy: "강타", multi: "연속 공격", poison: "독", burn: "화염", drain: "흡혈",
    stun: "기절", heal: "재생", enrage: "분노", steal: "도둑질", weaken: "쇠약"
  };
  const TAG_NAMES = { family: "계열 기술", sig: "대표 기술", mod: "기원 기술", true: "각성 기술", ult: "궁극기" };

  /* ── 저장소: 사용할 수 없으면 메모리에서만 진행 ── */
  const PREFIX = "fates3000:";
  const store = {
    get(key, fallback) {
      try {
        const raw = root.localStorage.getItem(PREFIX + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try { root.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (err) { /* 저장 불가 환경 */ }
    },
    del(key) {
      try { root.localStorage.removeItem(PREFIX + key); } catch (err) { /* 저장 불가 환경 */ }
    }
  };

  const state = {
    screen: "title",
    player: null,
    battle: null,
    roll: null,
    tokens: 0,
    codex: new Set(),
    hall: [],
    codexFrom: "title",
    codexLimit: 120,
    potionMenu: false,
    resultMsg: ""
  };

  /* ── 공통 조각 ── */
  const famOf = (job) => F.FAMILY_LIST[job.fam];
  const rarName = (r) => D.RARITIES[r].name;
  const jobNo = (id) => "No." + String(id).padStart(4, "0");
  const sealHTML = (job) => {
    const fam = famOf(job);
    return `<span class="seal${fam.combat ? "" : " life"}" aria-hidden="true">${esc(fam.name[0])}</span>`;
  };
  const elChip = (el) => `<span class="chip el el-${el}">${D.ELEMENTS[el]}</span>`;
  const randomName = () => D.HERO_NAMES[Math.floor(Math.random() * D.HERO_NAMES.length)];

  function barRow(label, cur, max, cls) {
    const w = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
    return `<div class="bar-row"><span>${label}</span><div class="bar ${cls || ""}"><i style="width:${w.toFixed(1)}%"></i></div><span>${fmt(Math.max(0, cur))} / ${fmt(max)}</span></div>`;
  }

  function costText(p, skill) {
    if (skill.type === "sacrifice") return "HP 소모";
    return `MP ${E.skillSpec(p, skill).cost}`;
  }

  function jobDetail(job, level, player) {
    const fam = famOf(job);
    const ctx = player || { level, job };
    const s = E.statsAt(job, level);
    const max = Math.max.apply(null, D.STATS.map((k) => s[k]));
    const lines = [`<li><b>본업</b><span>${esc(job.base)} · ${esc(job.desc)}</span></li>`];
    lines.push(job.mod
      ? `<li><b>기원</b><span>${esc(job.mod)} · ${esc(job.modDesc)}</span></li>`
      : `<li><b>기원</b><span>수식어 없는 정통 직업이라 능력치가 5% 높다.</span></li>`);
    lines.push(`<li><b>계열</b><span>${esc(fam.name)} 계열${fam.combat ? "" : "(생활)"} · ${esc(fam.desc)}</span></li>`);
    const stats = D.STATS.map((k) => (
      `<div class="stat-row${k === job.atkStat ? " top" : ""}"><span>${D.STAT_NAMES[k]}</span>` +
      `<div class="bar thin"><i style="width:${Math.round((s[k] / max) * 100)}%"></i></div><span>${s[k]}</span></div>`
    )).join("");
    const passives = E.passiveLines(job.passive).map((t) => `<li>${esc(t)}</li>`).join("");
    const skills = job.skills.map((sk) => {
      const locked = player && player.level < sk.lv;
      const el = NON_DAMAGE.has(sk.type) ? "" : ` · ${D.ELEMENTS[sk.el]}`;
      return `<li class="${locked ? "locked" : ""}"><span class="sk-name">${esc(sk.name)}</span>` +
        `<span class="sk-meta"><span class="sk-tag">${TAG_NAMES[sk.tag]}</span> · Lv.${sk.lv}</span>` +
        `<p class="sk-desc">${E.describeSkill(sk, ctx)}${el} · ${costText(ctx, sk)}</p></li>`;
    }).join("");
    return `<div class="jd">
      <ul class="jd-lines">${lines.join("")}</ul>
      <div class="jd-grid">
        <section><h3>능력치 · Lv.${level} (주황 막대가 공격 능력치)</h3><div class="stat-rows">${stats}</div></section>
        <section><h3>특성</h3><ul class="passive-list">${passives}</ul></section>
      </div>
      <section><h3>기술 · 속성 ${D.ELEMENTS[job.el]}</h3><ol class="skill-list">
        <li><span class="sk-name">${esc(job.attack.name)}</span><span class="sk-meta">기본 공격</span>
        <p class="sk-desc">위력 100% 공격, MP 조금 회복 · ${D.ELEMENTS[job.attack.el]}</p></li>${skills}
      </ol></section>
    </div>`;
  }

  /* ── 화면 전환 ── */
  const RENDER = {
    title: renderTitle,
    roll: renderRoll,
    town: renderTown,
    battle: () => renderBattle(false),
    codex: renderCodex,
    hall: renderHall
  };

  function show(name) {
    state.screen = name;
    SCREENS.forEach((s) => { $("scr-" + s).hidden = s !== name; });
    RENDER[name]();
    root.scrollTo(0, 0);
  }

  function save() {
    if (!state.player) return;
    if (state.battle && state.battle.result === "lose") return;
    const battle = state.battle && !state.battle.result ? state.battle : null;
    store.set("save", { player: state.player, battle });
  }

  function discover(job) {
    if (state.codex.has(job.id)) return;
    state.codex.add(job.id);
    store.set("codex", Array.from(state.codex));
  }

  /* ── 타이틀 ── */
  function buildTicker() {
    const picks = [];
    for (let i = 0; i < 48; i++) picks.push(F.JOBS[Math.floor(Math.random() * F.JOBS.length)]);
    const html = picks.map((j) => `<span class="rar-${j.rarity}">${esc(j.name)}</span>`).join("");
    $("ticker").innerHTML = html + html;
  }

  function renderTitle() {
    const saved = store.get("save", null) || (state.player && state.player.hp > 0 ? { player: state.player } : null);
    $("btn-continue").hidden = !saved;
    if (saved) {
      const p = saved.player;
      $("continue-sub").textContent = `${p.name} · ${p.job.name} · Lv.${p.level} · ${p.floor}층`;
    }
    const pending = store.get("roll", null);
    $("new-sub").textContent = pending ? "뽑던 운명 이어서" : state.tokens ? `재굴림 +${state.tokens}` : "";
    $("codex-sub").textContent = `${fmt(state.codex.size)} / ${fmt(F.JOBS.length)}`;
    $("hall-sub").textContent = state.hall.length ? `${state.hall.length}명` : "";
    const life = F.FAMILY_LIST.filter((f) => !f.combat).reduce((a, f) => a + f.count, 0);
    $("facts").innerHTML = [
      ["직업", fmt(F.JOBS.length)], ["계열", F.FAMILY_LIST.length],
      ["생활 직업", fmt(life)], ["신화 등급", D.RARITIES[5].count]
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  }

  /* ── 운명 뽑기 ── */
  function requestNewFate() {
    const saved = store.get("save", null) || (state.player && state.player.hp > 0 ? { player: state.player } : null);
    const pending = store.get("roll", null);
    if (pending) { resumeRoll(pending); return; }
    if (saved && saved.player) {
      const p = saved.player;
      openModal(`<h2 class="modal-title" id="modal-title">진행 중인 모험이 있습니다</h2>
        <p class="modal-sub">${esc(p.name)}(${esc(p.job.name)}, Lv.${p.level}, ${p.floor}층)을 은퇴시키고 새 운명을 뽑을까요? 은퇴한 모험가는 명예의 전당에 남습니다.</p>
        <div class="confirm-actions"><button class="btn btn-primary" type="button" data-do="retire">은퇴하고 새로 뽑기</button>
        <button class="btn" type="button" data-close>그만두기</button></div>`, (target) => {
        if (target.dataset.do !== "retire") return;
        closeModal();
        addHall(p, null);
        store.del("save");
        state.player = null;
        state.battle = null;
        beginRoll();
      });
      return;
    }
    beginRoll();
  }

  function beginRoll() {
    state.roll = { job: null, left: 3 + state.tokens, rolling: false };
    state.tokens = 0;
    store.set("tokens", 0);
    $("hero-name").value = randomName();
    show("roll");
    doRoll();
  }

  function resumeRoll(pending) {
    const job = F.jobById(pending.jobId);
    if (!job) { store.del("roll"); beginRoll(); return; }
    state.roll = { job, left: pending.left, rolling: false };
    if (!$("hero-name").value) $("hero-name").value = pending.name || randomName();
    show("roll");
  }

  function doRoll() {
    const job = E.randomJob();
    state.roll.job = job;
    discover(job);
    store.set("roll", { jobId: job.id, left: state.roll.left, name: $("hero-name").value });
    animateRoll(job);
  }

  function paintTablet(job, rolling) {
    const fam = famOf(job);
    $("tab-no").textContent = jobNo(job.id);
    $("tab-rarity").textContent = rolling ? "?" : rarName(job.rarity);
    const seal = $("tab-seal");
    seal.textContent = fam.name[0];
    seal.classList.toggle("life", !fam.combat);
    $("tab-family").textContent = `${fam.name} 계열${fam.combat ? "" : " · 생활"}`;
    $("tab-name").textContent = job.name;
    $("tab-origin").textContent = rolling ? "" : `${D.ELEMENTS[job.el]} 속성 · ${job.mod ? `${job.mod} 기원의 ${job.base}` : `정통 ${job.base}`}`;
  }

  function animateRoll(job) {
    const tablet = $("tablet");
    state.roll.rolling = true;
    renderRollButtons();
    $("roll-body").innerHTML = "";
    tablet.className = "tablet rolling";
    const steps = reduceMotion ? 0 : 16;
    let i = 0;
    const tick = () => {
      if (i < steps) {
        paintTablet(F.JOBS[Math.floor(Math.random() * F.JOBS.length)], true);
        i++;
        setTimeout(tick, 40 + i * i * 0.8);
        return;
      }
      state.roll.rolling = false;
      renderRoll();
    };
    tick();
  }

  function renderRoll() {
    const r = state.roll;
    if (!r || !r.job) return;
    if (r.rolling) return;
    paintTablet(r.job, false);
    $("tablet").className = `tablet revealed rar-${r.job.rarity}`;
    $("roll-body").innerHTML = jobDetail(r.job, 1, null);
    renderRollButtons();
  }

  function renderRollButtons() {
    const r = state.roll;
    $("btn-accept").disabled = r.rolling;
    $("btn-reroll").disabled = r.rolling || r.left <= 0;
    $("reroll-left").textContent = `${r.left}회`;
    $("roll-note").textContent = r.rolling ? "운명을 읽는 중…" : "운명의 석판";
  }

  function acceptFate(ev) {
    ev.preventDefault();
    const r = state.roll;
    if (!r || r.rolling || !r.job) return;
    const name = $("hero-name").value.trim().slice(0, 10) || randomName();
    state.player = E.newPlayer(r.job, name);
    state.battle = null;
    state.roll = null;
    store.del("roll");
    save();
    show("town");
    townMsg(`${J(name, "은/는")} ${J(state.player.job.name, "으로/로")} 첫걸음을 내디뎠다.`);
  }

  /* ── 마을 ── */
  function townMsg(text) {
    $("town-msg").textContent = text || "";
  }

  function renderTown() {
    const p = state.player;
    if (!p) { show("title"); return; }
    const d = E.derive(p);
    const job = p.job;
    const pr = E.prices(p);
    $("hero-head").innerHTML = `
      <div class="hero-line"><h2 class="hero-name">${esc(p.name)}</h2><span class="gold">${fmt(p.gold)} G</span></div>
      <div class="hero-job">${sealHTML(job)} <span class="rar-${job.rarity} rar-text">${rarName(job.rarity)}</span> ${esc(job.name)} · Lv.${p.level}</div>
      <div class="hero-bars">${barRow("HP", p.hp, d.maxHp)}${barRow("MP", p.mp, d.maxMp, "mp")}${barRow("EXP", p.exp, E.expNeed(p.level), "xp")}</div>`;
    const boss = p.floor % 10 === 0;
    const card = $("depth-card");
    card.classList.toggle("boss", boss);
    card.innerHTML = `<span class="depth-num">${p.floor}<small>층</small></span>
      <span class="depth-title">${boss ? "보스가 기다리는 층" : "다음 전투"}</span>
      <span class="depth-note">최고 기록 ${p.best}층 · 처치 ${fmt(p.kills)} · 물약 HP ${p.potions.hp} · MP ${p.potions.mp}</span>`;
    $("t-dungeon-sub").textContent = `${p.floor}층${boss ? " 보스" : ""}`;
    $("t-train-sub").textContent = `${E.trainingFloor(p)}층`;
    $("t-inn-sub").textContent = pr.inn ? `${fmt(pr.inn)}G` : "무료";
  }

  /* ── 전투 ── */
  function enterBattle(training) {
    state.battle = E.startBattle(state.player, { training });
    state.potionMenu = false;
    state.resultMsg = "";
    save();
    show("battle");
  }

  function statusChipsEnemy(e) {
    const out = [];
    const dot = { burn: "화상", poison: "중독", bleed: "출혈", curse: "저주" };
    Object.keys(dot).forEach((k) => { if (e.st[k]) out.push(`<span class="chip chip-good">${dot[k]} <b>${e.st[k].t}</b></span>`); });
    if (e.st.stun) out.push(`<span class="chip chip-good">${e.st.stunLabel === "얼어붙어" ? "빙결" : "기절"}</span>`);
    if (e.st.charm) out.push(`<span class="chip chip-good">혼란 <b>${e.st.charm}</b></span>`);
    if (e.st.debuff) out.push(`<span class="chip chip-good">약화 <b>${e.st.debuff}</b></span>`);
    if (e.enraged) out.push(`<span class="chip chip-bad">분노</span>`);
    return out.join("");
  }

  function statusChipsPlayer(ps) {
    const out = [];
    if (ps.guard) out.push(`<span class="chip chip-good">방어 자세</span>`);
    if (ps.barrier > 0) out.push(`<span class="chip chip-good">보호막 <b>${fmt(ps.barrier)}</b></span>`);
    if (ps.atkUp) out.push(`<span class="chip chip-good">공격 +${Math.round(ps.atkUp.v * 100)}% <b>${ps.atkUp.t}</b></span>`);
    if (ps.rage) out.push(`<span class="chip chip-good">광폭 <b>${ps.rage.t}</b></span>`);
    if (ps.counter) out.push(`<span class="chip chip-good">반격 <b>${ps.counter}</b></span>`);
    if (ps.evade) out.push(`<span class="chip chip-good">회피 <b>${ps.evade}</b></span>`);
    if (ps.regen) out.push(`<span class="chip chip-good">재생 <b>${ps.regen.t}</b></span>`);
    if (ps.summon) out.push(`<span class="chip chip-good">소환수 <b>${ps.summon.t}</b></span>`);
    if (ps.burn) out.push(`<span class="chip chip-bad">화상 <b>${ps.burn.t}</b></span>`);
    if (ps.poison) out.push(`<span class="chip chip-bad">중독 <b>${ps.poison.t}</b></span>`);
    if (ps.weaken) out.push(`<span class="chip chip-bad">쇠약 <b>${ps.weaken}</b></span>`);
    if (ps.stun) out.push(`<span class="chip chip-bad">기절</span>`);
    return out.join("");
  }

  function actBtn(attrs, title, sub, opts) {
    const o = opts || {};
    return `<button type="button" class="act${o.cls ? " " + o.cls : ""}" ${attrs}${o.disabled ? " disabled" : ""}${o.tip ? ` title="${esc(o.tip)}"` : ""}><b>${esc(title)}</b><small>${esc(sub)}</small></button>`;
  }

  function renderActions() {
    const p = state.player;
    const b = state.battle;
    const box = $("actions");
    if (state.potionMenu) {
      const pot = 1 + (p.job.passive.pot || 0);
      box.innerHTML =
        actBtn('data-act="potion-hp"', "회복 물약", `${p.potions.hp}개 · HP ${Math.round(40 * pot)}%`, { disabled: p.potions.hp <= 0 }) +
        actBtn('data-act="potion-mp"', "마나 물약", `${p.potions.mp}개 · MP ${Math.round(50 * pot)}%`, { disabled: p.potions.mp <= 0 }) +
        actBtn('data-act="potion-cancel"', "취소", "다른 행동 고르기", { cls: "basic" });
      return;
    }
    const a = p.job.attack;
    const cells = [
      actBtn('data-act="attack"', a.name, "기본 공격", { cls: "basic" }),
      actBtn('data-act="guard"', "방어", "피해 절반 · MP 회복", { cls: "basic" }),
      actBtn('data-act="potion"', "물약", `HP ${p.potions.hp} · MP ${p.potions.mp}`, { cls: "basic", disabled: p.potions.hp + p.potions.mp <= 0 })
    ];
    p.job.skills.forEach((sk, i) => {
      const av = E.skillAvailable(p, b, i);
      const sub = av.ok ? (av.hpCost ? "HP 소모" : `MP ${av.cost}`) : av.why;
      cells.push(actBtn(`data-act="skill" data-idx="${i}"`, sk.name, sub, {
        cls: sk.tag === "ult" ? "ult" : "", disabled: !av.ok, tip: E.describeSkill(sk, p)
      }));
    });
    const chance = E.fleeChance(p, b);
    cells.push(actBtn('data-act="flee"', "도주", b.enemy.boss ? "보스전 불가" : `성공률 ${Math.round(chance * 100)}%`, { disabled: b.enemy.boss }));
    box.innerHTML = cells.join("");
  }

  function renderResult() {
    const p = state.player;
    const b = state.battle;
    const box = $("b-result");
    box.hidden = false;
    if (b.result === "win") {
      const rw = b.reward;
      const d = E.derive(p);
      const items = [`경험치 +${fmt(rw.exp)} · ${fmt(rw.gold)}G`];
      rw.drops.forEach((t) => items.push(esc(t)));
      if (rw.post) items.push(`전투 후 회복 HP +${fmt(rw.post)}`);
      if (rw.levels.length) items.push(`<span class="levelup">레벨 업! Lv.${rw.levels[rw.levels.length - 1]}</span>`);
      if (rw.unlocked.length) items.push(`<span class="levelup">새 기술: ${rw.unlocked.map(esc).join(", ")}</span>`);
      const next = p.floor;
      const nextLabel = b.training ? "다시 수련" : `다음 층으로 · ${next}층${next % 10 === 0 ? " 보스" : ""}`;
      box.className = "result";
      box.innerHTML = `<h3>승리</h3><ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul>
        ${barRow("HP", p.hp, d.maxHp)}${barRow("MP", p.mp, d.maxMp, "mp")}
        <div class="result-actions">
          <button class="btn btn-primary" type="button" data-res="next">${nextLabel}</button>
          <button class="btn" type="button" data-res="town">마을로</button>
        </div>
        <div class="topline">
          <button class="link-btn" type="button" data-res="drink-hp"${p.potions.hp <= 0 || p.hp >= d.maxHp ? " disabled" : ""}>회복 물약 마시기 (${p.potions.hp})</button>
          <button class="link-btn" type="button" data-res="drink-mp"${p.potions.mp <= 0 || p.mp >= d.maxMp ? " disabled" : ""}>마나 물약 (${p.potions.mp})</button>
        </div>
        <p role="status">${esc(state.resultMsg)}</p>`;
      return;
    }
    if (b.result === "lose") {
      const job = p.job;
      box.className = "result lose";
      box.innerHTML = `<h3>쓰러졌다</h3>
        <p>${esc(p.name)} · <span class="rar-${job.rarity} rar-text">${rarName(job.rarity)}</span> ${esc(job.name)} · Lv.${p.level}</p>
        <ul><li>최고 기록 ${p.best}층</li><li>처치 ${fmt(p.kills)}</li><li>${esc(J(b.enemy.name, "에게"))} 패배</li></ul>
        <p>${b.deathBonus ? `깊이 내려간 보답으로 다음 운명 굴림 기회 +${b.deathBonus}` : "10층을 넘길 때마다 다음 운명의 재굴림 기회가 늘어납니다."}</p>
        <div class="result-actions">
          <button class="btn btn-primary" type="button" data-res="newfate">새로운 운명</button>
          <button class="btn" type="button" data-res="hall">명예의 전당</button>
        </div>`;
    }
  }

  function pop(layerId, kind, amount, delay) {
    if (kind !== "miss" && !(amount > 0)) return;
    setTimeout(() => {
      const layer = $(layerId);
      if (!layer) return;
      const el = doc.createElement("span");
      el.className = `pop ${kind}`;
      if (kind === "miss") el.textContent = "회피";
      else if (kind === "heal" || kind === "mana" || kind === "shield") el.textContent = `+${fmt(amount)}`;
      else el.textContent = `-${fmt(amount)}`;
      el.style.top = `${8 + Math.random() * 28}px`;
      el.style.right = `${12 + Math.random() * 44}px`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 950);
    }, delay);
  }

  function shake(id) {
    const el = $(id);
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }

  function renderBattle(withFx) {
    const p = state.player;
    const b = state.battle;
    if (!p || !b) { show(p ? "town" : "title"); return; }
    const e = b.enemy;
    const d = E.derive(p);
    $("b-floor").textContent = `${b.floor}층${b.training ? " · 수련" : ""}${e.boss ? " · 보스" : ""} · ${b.turn}턴`;
    $("foe").classList.toggle("boss", e.boss);
    $("foe-name").textContent = e.name;
    $("foe-lv").textContent = `Lv.${e.lv}`;
    const tags = [elChip(e.el)];
    tags.push(b.weakKnown && e.weak ? `<span class="chip">약점 <b>${D.ELEMENTS[e.weak]}</b></span>` : `<span class="chip">약점 ???</span>`);
    if (b.weakKnown && e.resist) tags.push(`<span class="chip">저항 <b>${D.ELEMENTS[e.resist]}</b></span>`);
    e.traits.forEach((t) => tags.push(`<span class="chip">${TRAIT_NAMES[t] || t}</span>`));
    $("foe-tags").innerHTML = tags.join("");
    $("foe-bar").style.width = `${Math.max(0, (e.hp / e.maxHp) * 100).toFixed(1)}%`;
    $("foe-hp").textContent = `${fmt(Math.max(0, e.hp))} / ${fmt(e.maxHp)}`;
    $("foe-status").innerHTML = statusChipsEnemy(e);

    $("b-log").innerHTML = b.log.slice(-40).map((l) => `<li class="k-${l.kind}">${esc(l.text)}</li>`).join("");
    $("b-log").scrollTop = $("b-log").scrollHeight;

    $("me-name").textContent = p.name;
    $("me-job").innerHTML = `<span class="rar-${p.job.rarity} rar-text">${rarName(p.job.rarity)}</span> ${esc(p.job.name)} · Lv.${p.level}`;
    $("me-hpbar").style.width = `${Math.max(0, (p.hp / d.maxHp) * 100).toFixed(1)}%`;
    $("me-hp").textContent = `${fmt(Math.max(0, p.hp))} / ${fmt(d.maxHp)}`;
    $("me-mpbar").style.width = `${Math.max(0, (p.mp / d.maxMp) * 100).toFixed(1)}%`;
    $("me-mp").textContent = `${fmt(p.mp)} / ${fmt(d.maxMp)}`;
    $("me-status").innerHTML = statusChipsPlayer(b.ps);

    if (b.result) {
      $("actions").hidden = true;
      renderResult();
    } else {
      $("actions").hidden = false;
      $("b-result").hidden = true;
      renderActions();
    }

    if (withFx && !reduceMotion) {
      let foeHit = false;
      let meHit = false;
      b.fx.forEach((f, i) => {
        pop(f.target === "enemy" ? "foe-pop" : "me-pop", f.kind, f.amount, i * 140);
        if (f.target === "enemy" && (f.kind === "hit" || f.kind === "crit")) foeHit = true;
        if (f.target === "player" && f.kind === "hit") meHit = true;
      });
      if (foeHit) shake("foe");
      if (meHit) setTimeout(() => shake("me"), 160);
    }
  }

  function doAction(action) {
    const b = state.battle;
    if (!b || b.result) return;
    E.act(state.player, b, action);
    state.potionMenu = false;
    if (b.result === "fled") {
      state.battle = null;
      save();
      show("town");
      townMsg("무사히 마을로 돌아왔다.");
      return;
    }
    if (b.result === "lose") onDeath();
    save();
    renderBattle(true);
  }

  function onActionClick(ev) {
    const btn = ev.target.closest("button[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === "potion") { state.potionMenu = true; renderActions(); return; }
    if (act === "potion-cancel") { state.potionMenu = false; renderActions(); return; }
    if (act === "potion-hp") { doAction({ kind: "potion", item: "hp" }); return; }
    if (act === "potion-mp") { doAction({ kind: "potion", item: "mp" }); return; }
    if (act === "skill") { doAction({ kind: "skill", idx: Number(btn.dataset.idx) }); return; }
    doAction({ kind: act });
  }

  function onResultClick(ev) {
    const btn = ev.target.closest("button[data-res]");
    if (!btn || btn.disabled) return;
    const res = btn.dataset.res;
    const b = state.battle;
    if (res === "next") { enterBattle(!!(b && b.training)); return; }
    if (res === "town") { state.battle = null; save(); show("town"); townMsg(""); return; }
    if (res === "drink-hp" || res === "drink-mp") {
      state.resultMsg = E.drink(state.player, res === "drink-hp" ? "hp" : "mp").msg;
      save();
      renderBattle(false);
      return;
    }
    if (res === "newfate") { state.player = null; state.battle = null; beginRoll(); return; }
    if (res === "hall") { state.player = null; state.battle = null; show("hall"); }
  }

  function onDeath() {
    const p = state.player;
    const b = state.battle;
    const bonus = Math.min(3, Math.floor(p.best / 10));
    state.tokens = Math.min(5, state.tokens + bonus);
    store.set("tokens", state.tokens);
    b.deathBonus = bonus;
    addHall(p, b.enemy.name);
    store.del("save");
  }

  /* ── 명예의 전당 ── */
  function addHall(p, cause) {
    state.hall.push({
      name: p.name, job: p.job.name, jobId: p.job.id, rarity: p.job.rarity, fam: p.job.fam,
      level: p.level, best: p.best, kills: p.kills, cause, date: Date.now()
    });
    state.hall.sort((a, c) => c.best - a.best || c.level - a.level || a.date - c.date);
    state.hall = state.hall.slice(0, 50);
    store.set("hall", state.hall);
  }

  function renderHall() {
    $("hall-count").textContent = state.hall.length ? `${state.hall.length}명 기록` : "";
    if (!state.hall.length) {
      $("hall-list").innerHTML = `<li class="empty">아직 기록이 없습니다. 첫 운명을 뽑아 던전에 들어가 보세요.</li>`;
      return;
    }
    $("hall-list").innerHTML = state.hall.map((h) => {
      const fam = F.FAMILY_LIST[h.fam];
      const when = new Date(h.date);
      const date = `${when.getMonth() + 1}월 ${when.getDate()}일`;
      return `<li><div class="hall-main"><strong>${esc(h.name)}</strong>
        <span><span class="rar-${h.rarity} rar-text">${rarName(h.rarity)}</span> ${esc(h.job)} · ${esc(fam ? fam.name : "")} · Lv.${h.level}</span><br>
        <span>${h.cause ? `${esc(J(h.cause, "에게"))} 패배` : "은퇴"} · 처치 ${fmt(h.kills)} · ${date}</span></div>
        <div class="hall-floor">${h.best}<small>최고 층</small></div></li>`;
    }).join("");
  }

  /* ── 직업 도감 ── */
  let codexReady = false;
  let codexTimer = null;

  function openCodex(from) {
    state.codexFrom = from;
    state.codexLimit = 120;
    show("codex");
  }

  function codexFilter() {
    const q = $("cx-q").value.trim();
    const fam = $("cx-fam").value;
    const rar = $("cx-rar").value;
    const found = $("cx-found").checked;
    return F.JOBS.filter((j) => {
      const f = famOf(j);
      if (fam === "combat" && !f.combat) return false;
      if (fam === "life" && f.combat) return false;
      if (fam !== "all" && fam !== "combat" && fam !== "life" && String(j.fam) !== fam) return false;
      if (rar !== "all" && String(j.rarity) !== rar) return false;
      if (found && !state.codex.has(j.id)) return false;
      if (q && !j.name.includes(q) && !j.attack.name.includes(q) && !j.skills.some((s) => s.name.includes(q))) return false;
      return true;
    });
  }

  function renderCodex() {
    if (!codexReady) {
      codexReady = true;
      $("cx-fam").innerHTML = `<option value="all">모든 계열</option><option value="combat">전투 계열 전체</option><option value="life">생활 계열 전체</option>` +
        F.FAMILY_LIST.map((f) => `<option value="${f.idx}">${esc(f.name)}${f.combat ? "" : " (생활)"} · ${f.count}</option>`).join("");
      $("cx-rar").innerHTML = `<option value="all">모든 등급</option>` +
        D.RARITIES.map((r, i) => `<option value="${i}">${r.name} · ${r.count}</option>`).join("");
    }
    $("codex-progress").textContent = `만난 직업 ${fmt(state.codex.size)} / ${fmt(F.JOBS.length)}`;
    $("codex-back").textContent = state.codexFrom === "town" ? "← 마을로" : "← 처음으로";
    const list = codexFilter();
    $("cx-count").textContent = `${fmt(list.length)}개 직업`;
    $("cx-list").innerHTML = list.slice(0, state.codexLimit).map((j) => {
      const f = famOf(j);
      const found = state.codex.has(j.id);
      return `<li><button type="button" data-job="${j.id}" class="${found ? "" : "unfound"}">${sealHTML(j)}
        <span class="cx-main"><span class="cx-name">${esc(j.name)}</span><span class="cx-sub">${esc(f.name)} · ${esc(j.base)}${j.mod ? "" : " · 정통"}</span></span>
        <span class="cx-right rar-${j.rarity}"><span class="rar-text">${rarName(j.rarity)}</span><span class="cx-no">${jobNo(j.id)}</span>${found ? '<span class="found-mark">만남</span>' : ""}</span>
      </button></li>`;
    }).join("") || `<li class="empty">조건에 맞는 직업이 없습니다.</li>`;
    $("cx-more").hidden = list.length <= state.codexLimit;
  }

  function openJob(job) {
    const fam = famOf(job);
    openModal(`<h2 class="modal-title" id="modal-title">${esc(job.name)}</h2>
      <p class="modal-sub">${jobNo(job.id)} · <span class="rar-${job.rarity} rar-text">${rarName(job.rarity)}</span> · ${esc(fam.name)} 계열${state.codex.has(job.id) ? " · 만난 적 있음" : ""}</p>
      ${jobDetail(job, 1, null)}`);
  }

  /* ── 상점·정보 ── */
  function openShop(msg, bad) {
    const p = state.player;
    const pr = E.prices(p);
    const pot = 1 + (p.job.passive.pot || 0);
    const disc = p.job.passive.disc ? ` · 할인 ${Math.round(Math.min(0.5, p.job.passive.disc) * 100)}% 적용` : "";
    const row = (key, name, note) => `<li><div><b>${name}</b><small>${note}</small></div>
      <button class="btn" type="button" data-buy="${key}"${p.gold >= pr[key] ? "" : " disabled"}>${fmt(pr[key])}G</button></li>`;
    openModal(`<h2 class="modal-title" id="modal-title">상점</h2>
      <p class="modal-sub">보유 ${fmt(p.gold)}G${disc}</p>
      <ul class="shop">
        ${row("hp", "회복 물약", `HP ${Math.round(40 * pot)}% 회복, 화상·중독 해제 · 보유 ${p.potions.hp}`)}
        ${row("mp", "마나 물약", `MP ${Math.round(50 * pot)}% 회복 · 보유 ${p.potions.mp}`)}
        ${row("weapon", `무기 강화 +${p.weaponLv} → +${p.weaponLv + 1}`, "공격력 +6%, 추가 피해 +3")}
        ${row("armor", `방어구 강화 +${p.armorLv} → +${p.armorLv + 1}`, "최대 HP +4%, 방어력 +3")}
        ${row("scroll", "전직의 두루마리", "레벨·장비·골드는 그대로, 직업만 3,000개 중 무작위로 다시 정해진다")}
      </ul>
      <p class="shop-msg${bad ? " bad" : ""}" role="status">${esc(msg || "")}</p>`, onShopClick);
  }

  function onShopClick(target) {
    const key = target.dataset.buy;
    if (target.dataset.do === "scroll-yes") { buyScroll(); return; }
    if (target.dataset.do === "scroll-no") { openShop(""); return; }
    if (!key) return;
    if (key === "scroll") {
      const p = state.player;
      openModal(`<h2 class="modal-title" id="modal-title">전직의 두루마리</h2>
        <p class="modal-sub">${esc(J(p.job.name, "은/는"))} 사라지고 새 직업이 무작위로 정해집니다. 레벨 ${p.level}, 장비, 골드는 그대로입니다. 되돌릴 수 없습니다.</p>
        <div class="confirm-actions"><button class="btn btn-primary" type="button" data-do="scroll-yes">두루마리를 읽는다 (${fmt(E.prices(p).scroll)}G)</button>
        <button class="btn" type="button" data-do="scroll-no">그만두기</button></div>`, onShopClick);
      return;
    }
    const res = E.buy(state.player, key);
    save();
    renderTown();
    openShop(res.msg, !res.ok);
  }

  function buyScroll() {
    const p = state.player;
    const res = E.buy(p, "scroll");
    if (!res.ok) { openShop(res.msg, true); return; }
    discover(res.job);
    save();
    renderTown();
    townMsg(res.msg);
    openModal(`<p class="eyebrow">운명이 다시 쓰였다</p>
      <h2 class="modal-title" id="modal-title">${esc(res.job.name)}</h2>
      <p class="modal-sub">${jobNo(res.job.id)} · <span class="rar-${res.job.rarity} rar-text">${rarName(res.job.rarity)}</span> · ${esc(famOf(res.job).name)} 계열</p>
      ${jobDetail(res.job, p.level, p)}`);
  }

  function openSheet(title) {
    const p = state.player;
    const d = E.derive(p);
    const job = p.job;
    const cells = [
      ["HP", `${fmt(p.hp)}/${fmt(d.maxHp)}`], ["MP", `${fmt(p.mp)}/${fmt(d.maxMp)}`], ["공격력", fmt(E.power(p, d, job.atkStat))],
      ["방어력", fmt(d.def)], ["치명타", `${Math.round(d.crit * 100)}%`], ["회피", `${Math.round(d.eva * 100)}%`],
      ["무기", `+${p.weaponLv}`], ["방어구", `+${p.armorLv}`], ["최고 층", p.best],
      ["처치", fmt(p.kills)], ["골드", fmt(p.gold)], ["거친 직업", p.jobsHeld.length]
    ];
    openModal(`<h2 class="modal-title" id="modal-title">${esc(title || p.name)}</h2>
      <p class="modal-sub">${jobNo(job.id)} · <span class="rar-${job.rarity} rar-text">${rarName(job.rarity)}</span> ${esc(job.name)} · Lv.${p.level}</p>
      <div class="modal-section">
        <dl class="sheet-grid">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        ${jobDetail(job, p.level, p)}
      </div>`);
  }

  /* ── 모달 ── */
  let modalHandler = null;
  let lastFocus = null;

  function openModal(html, handler) {
    $("modal-body").innerHTML = html;
    modalHandler = handler || null;
    const wasHidden = $("modal").hidden;
    $("modal").hidden = false;
    if (wasHidden) lastFocus = doc.activeElement;
    $("modal").querySelector(".modal-card").scrollTop = 0;
    $("modal").querySelector(".modal-x").focus();
  }

  function closeModal() {
    $("modal").hidden = true;
    modalHandler = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ── 연결 ── */
  function bind() {
    $("btn-new").addEventListener("click", requestNewFate);
    $("btn-continue").addEventListener("click", () => {
      const saved = store.get("save", null);
      if (saved) { state.player = saved.player; state.battle = saved.battle; }
      if (!state.player) { renderTitle(); return; }
      show(state.battle ? "battle" : "town");
    });
    $("btn-codex").addEventListener("click", () => openCodex("title"));
    $("btn-hall").addEventListener("click", () => show("hall"));

    $("roll-back").addEventListener("click", () => {
      if (state.roll && state.roll.rolling) return;
      if (state.roll) store.set("roll", { jobId: state.roll.job.id, left: state.roll.left, name: $("hero-name").value });
      show("title");
    });
    $("btn-reroll").addEventListener("click", () => {
      const r = state.roll;
      if (!r || r.rolling || r.left <= 0) return;
      r.left--;
      doRoll();
    });
    $("name-dice").addEventListener("click", () => { $("hero-name").value = randomName(); });
    $("roll-form").addEventListener("submit", acceptFate);

    $("t-dungeon").addEventListener("click", () => enterBattle(false));
    $("t-train").addEventListener("click", () => enterBattle(true));
    $("t-inn").addEventListener("click", () => {
      const res = E.rest(state.player);
      save();
      renderTown();
      townMsg(res.msg);
    });
    $("t-shop").addEventListener("click", () => openShop(""));
    $("t-sheet").addEventListener("click", () => openSheet());
    $("t-codex").addEventListener("click", () => openCodex("town"));
    $("t-menu").addEventListener("click", () => { save(); show("title"); });

    $("actions").addEventListener("click", onActionClick);
    $("b-result").addEventListener("click", onResultClick);
    $("b-skills").addEventListener("click", () => openSheet("기술 설명"));

    $("codex-back").addEventListener("click", () => show(state.codexFrom === "town" && state.player ? "town" : "title"));
    $("cx-q").addEventListener("input", () => {
      clearTimeout(codexTimer);
      codexTimer = setTimeout(() => { state.codexLimit = 120; renderCodex(); }, 150);
    });
    ["cx-fam", "cx-rar", "cx-found"].forEach((id) => $(id).addEventListener("change", () => { state.codexLimit = 120; renderCodex(); }));
    $("cx-more").addEventListener("click", () => { state.codexLimit += 240; renderCodex(); });
    $("cx-list").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-job]");
      if (btn) openJob(F.jobById(Number(btn.dataset.job)));
    });
    $("hall-back").addEventListener("click", () => show("title"));

    $("modal").addEventListener("click", (ev) => {
      if (ev.target.closest("[data-close]")) { closeModal(); return; }
      const target = ev.target.closest("button");
      if (target && modalHandler && $("modal-body").contains(target)) modalHandler(target);
    });
    doc.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !$("modal").hidden) closeModal();
    });
  }

  function snapshot() {
    return { screen: state.screen, player: state.player, battle: state.battle };
  }

  function start(data) {
    state.tokens = store.get("tokens", 0);
    state.codex = new Set(store.get("codex", []));
    state.hall = store.get("hall", []);
    if (data && data.player && data.player.hp > 0) {
      state.player = data.player;
      state.battle = data.battle || null;
    }
    bind();
    buildTicker();
    if (data && data.screen === "battle" && state.battle) show("battle");
    else if (data && data.screen === "town" && state.player) show("town");
    else show("title");
  }

  const hot = root.claude && root.claude.hot;
  if (hot && typeof hot.snapshot === "function") hot.snapshot(snapshot);
  if (hot && typeof hot.ready === "function") hot.ready(start);
  else start((hot && hot.data) || {});
})(window);
