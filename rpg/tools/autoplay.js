#!/usr/bin/env node
/*
 * 자동 플레이 밸런스 측정: node rpg/tools/autoplay.js [판 수] [목표 층]
 * 실제 게임 코드(Stage.update)를 브라우저(Playwright)에서 빠르게 돌린다. 봇은 가까운 적에게 다가가
 * 쓸 수 있는 가장 센 기술부터 쓰고, HP가 45% 아래면 물약을 마시고, 5층마다 물약과 장비를 산다.
 * 5층마다 그 구간의 최저 HP와 마신 물약 수를 출력한다.
 * 환경 변수: MAXT(판당 최대 분, 기본 40), JOBNAME(직업 이름 고정), TRACE(5초마다 상태 출력)
 */
const path = require("path");
const { chromium } = require("playwright");
const URL = "file://" + path.resolve(__dirname, "..", "index.html");
(async () => {
  const runs = Number(process.argv[2] || 6);
  const maxT = Number(process.env.MAXT || 40);
  const maxFloor = Number(process.argv[3] || 30);
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message + " " + (e.stack || "").split("\n")[1]));
  page.on("console", (m) => { if (process.env.TRACE) console.log(m.text()); });
  await page.goto(URL);
  if (process.env.JOBNAME) await page.evaluate((n) => { window.__JOB = FATES.JOBS.find((j) => j.name === n).id; window.__TRACE = true; }, process.env.JOBNAME);
  await page.waitForTimeout(800);
  const results = await page.evaluate(async ({ runs, maxFloor, maxT }) => {
    const F = FATES; const Gm = F.game; const E = F.engine; const held = Gm.held;
    const out = [];
    for (let run = 0; run < runs; run++) {
      const job = window.__JOB ? F.jobById(window.__JOB) : F.JOBS[Math.floor(Math.random() * F.JOBS.length)];
      Gm.G.player = E.newPlayer(job, "봇");
      Gm.closeAll();
      Gm.setScene(Gm.Stage, { floor: 1 });
      const S = Gm.Stage;
      let t = 0; let floorT = 0; let floor = 1; const log = []; let minHp = 100; let pots = 0; let stuck = 0; let lastX = 0;
      const dt = 1000 / 20;
      while (t < maxT * 60 * 1000) {
        t += dt; floorT += dt;
        F.fx.tick(dt); F.fx.update(dt); F.spells.update(dt);
        S.update(dt);
        if ((t / dt) % 4 < 1) await null;
        if (S.dead) break;
        if (window.__TRACE && Math.round(t) % 5000 < dt) { const hh = S.hero; console.log(JSON.stringify({ t: Math.round(t / 1000), x: Math.round(hh.x), y: Math.round(hh.y), g: !!hh.ground, rope: !!hh.rope, atk: hh.atk && hh.atk.kind, cast: hh.casting, stun: hh.stun, knock: hh.knock, busy: Gm.G.busy, kills: Gm.G.player.kills, hp: Gm.G.player.hp })); }
        const p = Gm.G.player; const h = S.hero; const d = E.derive(p); minHp = Math.min(minHp, Math.round((p.hp / d.maxHp) * 100));
        Object.keys(held).forEach((k) => { held[k] = false; });
        if (p.hp < d.maxHp * 0.45 && p.potions.hp > 0) { S.potion("hp"); pots++; }
        if (p.mp < d.maxMp * 0.2 && p.potions.mp > 0) S.potion("mp");
        if (p.hp < d.maxHp * 0.35 && p.potions.hp === 0 && p.gold > 30) { /* 마을에 들러 물약 */ }
        const live = S.mons.filter((m) => !m.dead);
        const boss = live.find((m) => m.mon.boss);
        const reach = S.reach.far ? 150 : 40;
        const near = live.filter((m) => Math.abs(m.y - h.y) < 30 || (m.fly && Math.abs(m.y - h.y) < 70)).sort((a, c) => Math.abs(a.x - h.x) - Math.abs(c.x - h.x))[0];
        const door = S.map.doors.find((dd) => dd.kind === "down");
        const groundLive = live.filter((m) => m.plat.ground || m.mon.boss).length;
        const goDown = !boss && (floorT > 70000 || groundLive === 0 || (floorT > 25000 && groundLive <= 2));
        let tx = null;
        if (!h.ground && !h.rope) { /* 공중 */ }
        if (h.rope) { held.down = true; }
        else if (goDown && !door.locked) {
          tx = door.x;
          if (Math.abs(door.x - h.x) < 12 && h.ground && h.ground.ground) {
            floor++;
            log.push({ floor: floor - 1, sec: Math.round(floorT / 1000), lv: p.level, hp: minHp, pot: pots, gold: p.gold }); if ((floor - 1) % 5 === 0) { minHp = 100; pots = 0; }
            if (floor > maxFloor) break;
            /* 5층마다 마을에서 물약을 산다 */
            if ((floor - 1) % 5 === 0) {
              while (p.gold >= E.prices(p).hp && p.potions.hp < 12) E.buy(p, "hp");
              while (p.gold >= E.prices(p).mp && p.potions.mp < 6) E.buy(p, "mp");
              while (p.gold >= E.prices(p).weapon * 1.2) { E.buy(p, "weapon"); }
              while (p.gold >= E.prices(p).armor * 1.2) { E.buy(p, "armor"); }
              E.rest(p);
            }
            Gm.closeAll();
            Gm.setScene(Gm.Stage, { floor, keep: true });
            floorT = 0;
            continue;
          }
        } else if (near) {
          const dx = near.x - h.x;
          h.dir = dx < 0 ? -1 : 1;
          if (Math.abs(dx) > reach) tx = near.x;
          else {
            held.atk = true;
            for (let i = 4; i >= 0; i--) {
              const sk = p.job.skills[i];
              const plan = E.skillPlan(p, sk, S.reach.far);
              if (E.skillReady(p, sk, plan, S.cds[i]).ok && !(plan.heal && p.hp > d.maxHp * 0.7)) { S.useSkill(i); break; }
            }
          }
        } else if (live.length) {
          const m = live.sort((a, c) => Math.abs(a.x - h.x) - Math.abs(c.x - h.x))[0];
          tx = m.x;
        } else if (door) tx = door.x;
        if (tx !== null) {
          if (tx < h.x - 4) held.left = true;
          else if (tx > h.x + 4) held.right = true;
        }
        if (Math.abs(h.x - lastX) < 0.01 && tx !== null) stuck++; else stuck = 0;
        lastX = h.x;
        if (stuck > 60) { S.jump(); stuck = 0; }
      }
      const p = Gm.G.player;
      out.push({ job: job.name, rar: job.rarity, fam: F.FAMILY_LIST[job.fam].name, dead: S.dead, floor, lv: p.level, min: Math.round(t / 600) / 100, kills: p.kills, log: log.filter((l) => l.floor % 5 === 0) });
      Object.keys(held).forEach((k) => { held[k] = false; });
      /* 쓰러진 뒤 예약된 결과 창이 다음 판에 뜨지 않게 시계를 넘겨 둔다 */
      F.fx.tick(3000); await null; await null; await null;
      F.game.G.player = null;
      Gm.closeAll();
    }
    return out;
  }, { runs, maxFloor, maxT });
  results.forEach((r) => console.log(`${r.dead ? "사망" : "생존"} ${String(r.floor).padStart(3)}층 Lv.${String(r.lv).padStart(2)} ${String(r.min).padStart(6)}분 처치 ${String(r.kills).padStart(4)} | ${r.fam} ${r.job} (${r.rar}) | ` + r.log.map((l) => `${l.floor}층 Lv${l.lv} 최저${l.hp}% 물약${l.pot}`).join(" ")));
  console.log(errs.length ? errs.slice(0, 5).join("\n") : "no errors");
  await b.close();
})();
