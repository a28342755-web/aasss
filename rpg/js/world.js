/*
 * 삼천의 운명 — 마을과 던전
 * 32px 타일. 바닥 질감은 픽셀 단위로 직접 만들고, 나무·건물·상자 같은 물체는 명암 렌더러(doll.js의 Painter)로 그린다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const S = F.sprites;
  const Dl = F.doll;
  const C = S.C;
  const TS = 32;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function toRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* 픽셀 질감 캔버스 */
  function texture(w, h, fn) {
    const cv = S.makeCanvas(w, h);
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(w, h);
    const put = (x, y, hex) => {
      if (!hex || x < 0 || y < 0 || x >= w || y >= h) return;
      const c = toRgb(hex);
      const i = (y * w + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    };
    fn(put);
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  const cache = new Map();
  function cached(key, make) {
    let v = cache.get(key);
    if (!v) { v = make(); cache.set(key, v); }
    return v;
  }

  /* ── 바닥 타일 ── */
  const GRASS = ["#2f6e3c", "#3e8948", "#57a64a", "#7cc95a"];
  const DIRT = ["#7a4f33", "#a8754a", "#c48a56", "#ddb07a"];
  const COBBLE = ["#4a4a5e", "#6a6a80", "#8a8aa0", "#b0b0c4"];

  function grass(variant) {
    return cached("grass" + variant, () => texture(TS, TS, (put) => {
      const r = rng(77 + variant * 131);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, r() < 0.12 ? GRASS[1] : GRASS[2]);
      for (let n = 0; n < 16; n++) {
        const x = Math.floor(r() * TS);
        const y = Math.floor(r() * (TS - 3)) + 2;
        put(x, y, GRASS[3]); put(x, y - 1, GRASS[3]); put(x + 1, y + 1, GRASS[1]); put(x, y + 1, GRASS[0]);
      }
      if (variant === 3) {
        for (let n = 0; n < 4; n++) {
          const x = 4 + Math.floor(r() * 24);
          const y = 4 + Math.floor(r() * 24);
          const col = [C.white, C.yellow, C.pink, "#b3a6ff"][n % 4];
          put(x, y, col); put(x - 1, y, col); put(x + 1, y, col); put(x, y - 1, col); put(x, y + 1, col); put(x, y, C.gold);
        }
      }
    }));
  }

  function dirt(variant) {
    return cached("dirt" + variant, () => texture(TS, TS, (put) => {
      const r = rng(311 + variant * 17);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, r() < 0.15 ? DIRT[1] : DIRT[2]);
      for (let n = 0; n < 7; n++) {
        const x = Math.floor(r() * TS);
        const y = Math.floor(r() * TS);
        put(x, y, DIRT[3]); put(x + 1, y, DIRT[3]); put(x, y + 1, DIRT[0]); put(x + 1, y + 1, DIRT[1]);
      }
    }));
  }

  function cobble() {
    return cached("cobble", () => texture(TS, TS, (put) => {
      const r = rng(999);
      for (let by = 0; by < 4; by++) {
        for (let bx = 0; bx < 4; bx++) {
          const off = by % 2 ? 4 : 0;
          const tone = r() < 0.3 ? 1 : 2;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const px = (bx * 8 + x + off) % TS;
            const py = by * 8 + y;
            let col = COBBLE[tone];
            if (x === 7 || y === 7) col = COBBLE[0];
            else if (x === 0 || y === 0) col = COBBLE[3];
            put(px, py, col);
          }
        }
      }
    }));
  }

  function water(frame) {
    return cached("water" + frame, () => texture(TS, TS, (put) => {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const w = Math.sin((x + frame * 4) * 0.4 + y * 0.9) + Math.sin(y * 0.35 - frame);
        put(x, y, w > 1.3 ? "#9fd8ff" : w > 0.6 ? "#4fa3e0" : w > -0.8 ? "#2b6cb0" : "#1d4e89");
      }
    }));
  }

  /* 던전 단계별 색 */
  const DPAL = [
    { slab: ["#3b2620", "#5a3a2c", "#74503c", "#946a50"], wall: ["#2a1a16", "#4a3026", "#6a4634", "#8a6048"], moss: "#5a6a2c", top: "#1a100e", accent: C.orange },
    { slab: ["#232e28", "#3a4a40", "#4f6456", "#6a8270"], wall: ["#18201c", "#2c3a32", "#41564a", "#5a7466"], moss: "#3e8948", top: "#0e1410", accent: C.green },
    { slab: ["#26223a", "#3a3456", "#4f4874", "#6a6294"], wall: ["#1a1628", "#2c2644", "#403862", "#584e82"], moss: "#68386c", top: "#0e0c18", accent: C.magenta },
    { slab: ["#2a4a66", "#3e6a8c", "#5a8cb0", "#88b8d8"], wall: ["#1e3650", "#2e4e70", "#466c92", "#6a92b8"], moss: "#c0e8ff", top: "#0e1a28", accent: C.cyan },
    { slab: ["#2a1020", "#441a30", "#5e2442", "#7e3458"], wall: ["#1c0a14", "#321224", "#4a1c36", "#68284c"], moss: "#a22633", top: "#0a0408", accent: C.hot }
  ];

  function floorTile(tier, variant) {
    return cached(`fl${tier}_${variant}`, () => texture(TS, TS, (put) => {
      const p = DPAL[tier];
      const r = rng(1000 + tier * 97 + variant * 13);
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const tone = r() < 0.25 ? 1 : 2;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          let col = p.slab[tone];
          if (x === 15 || y === 15) col = p.slab[0];
          else if (x === 0 || y === 0) col = p.slab[3];
          else if (r() < 0.04) col = p.slab[tone === 2 ? 1 : 2];
          put(sx * 16 + x, sy * 16 + y, col);
        }
      }
      if (variant === 1) {
        let x = 6 + Math.floor(r() * 8);
        for (let y = 4; y < 20; y++) { put(x, y, p.slab[0]); if (r() < 0.4) x += r() < 0.5 ? -1 : 1; }
      }
      if (variant === 2) {
        for (let n = 0; n < 14; n++) { const x = 18 + Math.floor(r() * 12); const y = 18 + Math.floor(r() * 12); put(x, y, p.moss); }
      }
    }));
  }

  function wallFace(tier, variant) {
    return cached(`wf${tier}_${variant}`, () => texture(TS, TS, (put) => {
      const p = DPAL[tier];
      const r = rng(2000 + tier * 31 + variant);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, p.wall[0]);
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? 8 : 0;
        for (let b = -1; b < 3; b++) {
          const bx = b * 16 + off;
          const tone = r() < 0.3 ? 1 : 2;
          for (let y = 1; y < 8; y++) for (let x = 1; x < 16; x++) {
            let col = p.wall[tone];
            if (y === 1 || x === 1) col = p.wall[3];
            if (y === 7) col = p.wall[1];
            put(bx + x, row * 8 + y, col);
          }
        }
      }
      for (let x = 0; x < TS; x++) { put(x, 31, p.top); put(x, 30, p.wall[0]); }
      if (variant === 1) for (let n = 0; n < 10; n++) put(Math.floor(r() * TS), Math.floor(r() * 8), p.moss);
    }));
  }

  function wallTop(tier) {
    return cached(`wt${tier}`, () => texture(TS, TS, (put) => {
      const p = DPAL[tier];
      const r = rng(3000 + tier);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, r() < 0.08 ? p.wall[0] : p.top);
    }));
  }

  function stairs(tier) {
    return cached(`st${tier}`, () => texture(TS, TS, (put) => {
      const p = DPAL[tier];
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, "#05030a");
      for (let s = 0; s < 5; s++) {
        const inset = s * 3;
        const y0 = 2 + s * 6;
        for (let y = y0; y < y0 + 5; y++) for (let x = 2 + inset; x < 30 - inset; x++) {
          const col = y === y0 ? p.slab[3] : y < y0 + 3 ? p.slab[2 - Math.min(2, Math.floor(s / 2))] : p.slab[0];
          put(x, y, s > 3 ? p.slab[0] : col);
        }
      }
    }));
  }

  /* ── 물체: 명암 렌더러로 그린 스프라이트 ── */
  function painted(key, w, h, draw) {
    return cached(key, () => {
      const P = new Dl.Painter(w, h, 1);
      draw(P);
      return P.toCanvas();
    });
  }

  function tree(variant) {
    const leaf = [C.dgreen, "#4a9a48", C.green][variant % 3];
    return painted("tree" + variant, 44, 58, (P) => {
      P.use(C.brown); P.capsule(22, 40, 22, 54, 3.2, 4);
      P.use(C.brown); P.capsule(22, 50, 16, 55, 1.6); P.capsule(22, 50, 28, 55, 1.6);
      P.use(leaf); P.ellipse(13, 31, 10, 9); P.ellipse(31, 31, 10, 9); P.ellipse(22, 22, 14, 12); P.ellipse(22, 34, 12, 8);
      if (variant === 1) { P.dot(15, 24, C.red).dot(28, 28, C.red).dot(21, 34, C.red); }
      if (variant === 2) { P.dot(14, 22, C.pink).dot(29, 25, C.pink).dot(24, 18, C.white); }
    });
  }

  function bush() {
    return painted("bush", 28, 22, (P) => { P.use("#3e8948"); P.ellipse(9, 13, 7, 6); P.ellipse(19, 13, 7, 6); P.ellipse(14, 9, 7, 6); P.dot(12, 8, C.yellow); });
  }

  function rock(tier) {
    const col = tier === undefined ? "#7a7a8e" : DPAL[tier].wall[2];
    return painted("rock" + tier, 30, 24, (P) => { P.use(col); P.ellipse(14, 15, 11, 7.5); P.use(col); P.ellipse(20, 12, 7, 6); });
  }

  function chest(open) {
    return painted("chest" + (open ? 1 : 0), 30, 28, (P) => {
      P.use(C.brown); P.poly([[3, 12], [27, 12], [27, 26], [3, 26]]);
      P.use(C.gold, { edge: 0 }); P.capsule(3.5, 19, 26.5, 19, 0.8); P.capsule(8, 12, 8, 26, 0.7); P.capsule(22, 12, 22, 26, 0.7);
      if (open) {
        P.use(C.brown); P.poly([[3, 4], [27, 4], [27, 11], [3, 11]]);
        P.use("#1a1018", { edge: 0 }); P.poly([[5, 9], [25, 9], [25, 13], [5, 13]]);
        P.dot(10, 10, C.yellow).dot(14, 10, C.gold).dot(18, 10, C.yellow);
      } else {
        P.use(C.leather); P.poly([[3, 6], [27, 6], [28, 13], [2, 13]]);
        P.use(C.gold); P.ellipse(15, 15, 2.6, 2.6); P.dot(15, 16, C.dbrown);
      }
    });
  }

  function barrel() {
    return painted("barrel", 24, 30, (P) => {
      P.use(C.leather); P.ellipse(12, 16, 9, 12);
      P.use(C.dgrey, { edge: 0 }); P.capsule(4, 9, 20, 9, 0.8); P.capsule(4, 22, 20, 22, 0.8);
    });
  }

  function bones() {
    return painted("bones", 28, 16, (P) => {
      P.use(C.sand); P.capsule(4, 10, 20, 6, 1.2); P.ellipse(4, 10, 2, 2); P.ellipse(20, 6, 2, 2);
      P.use(C.sand); P.ellipse(22, 11, 3.6, 3.2); P.dot(21, 11, C.black).dot(23, 11, C.black);
    });
  }

  function torch(frame) {
    return painted("torch" + frame, 14, 26, (P) => {
      P.use(C.brown); P.capsule(7, 13, 7, 24, 1.5);
      P.use(C.dgrey); P.ellipse(7, 13, 3.4, 1.8);
      const h = frame % 2 ? 1 : 0;
      P.use(C.orange, { edge: 0 }); P.ellipse(7, 8 + h * 0.5, 3.4, 5 - h);
      P.use(C.yellow, { edge: 0 }); P.ellipse(7, 9 + h * 0.5, 1.8, 3 - h * 0.5);
      P.dot(7, 10, C.white);
    });
  }

  function lamp() {
    return painted("lamp", 18, 50, (P) => {
      P.use(C.slate); P.capsule(9, 14, 9, 46, 1.4); P.ellipse(9, 46, 4, 1.8);
      P.use(C.slate); P.poly([[3, 6], [15, 6], [13, 15], [5, 15]]);
      P.use(C.yellow, { edge: 0 }); P.poly([[5, 8], [13, 8], [12, 13], [6, 13]]);
      P.dot(8, 9, C.white);
      P.use(C.slate); P.poly([[2, 6], [16, 6], [9, 1]]);
    });
  }

  function fateTablet(frame) {
    return painted("tablet" + frame, 44, 64, (P) => {
      P.use("#4a4a66"); P.poly([[6, 60], [38, 60], [36, 52], [8, 52]]);
      P.use("#6a6a88"); P.poly([[10, 52], [34, 52], [33, 12], [27, 4], [17, 4], [11, 12]]);
      const glow = [C.cyan, "#b3a6ff", C.yellow][frame % 3];
      for (let i = 0; i < 6; i++) {
        const y = 14 + i * 6;
        P.dot(16 + (i % 2) * 2, y, glow).dot(19 + ((i + 1) % 3), y, glow).dot(23, y + (i % 2), glow).dot(26 - (i % 2), y, glow);
      }
      P.dot(22, 9, C.white);
    });
  }

  /* 건물: 지붕색과 간판 그림이 다르다 */
  const BUILDINGS = {
    inn: { roof: "#b0303a", wall: "#d9b48a", sign: "bed", label: "여관" },
    shop: { roof: "#2a6ab0", wall: "#d9c09a", sign: "potion", label: "상점" },
    guild: { roof: "#6a3a8a", wall: "#c8b8a0", sign: "book", label: "길드" },
    cave: { label: "던전" }
  };

  function building(type) {
    if (type === "cave") {
      return painted("cave", 128, 104, (P) => {
        P.use("#6a6a80"); P.ellipse(64, 66, 62, 40); P.ellipse(30, 70, 30, 32); P.ellipse(98, 70, 30, 32);
        P.use("#55556a"); P.ellipse(44, 46, 18, 12); P.ellipse(86, 50, 20, 13);
        P.use("#05030a", { edge: 0 }); P.ellipse(64, 86, 20, 22, (x, y) => y < 103);
        P.use(C.brown); P.capsule(40, 70, 40, 100, 1.6); P.capsule(88, 70, 88, 100, 1.6);
        P.use(C.orange, { edge: 0 }); P.ellipse(40, 66, 3.6, 5); P.ellipse(88, 66, 3.6, 5);
        P.use(C.yellow, { edge: 0 }); P.ellipse(40, 67, 1.8, 3); P.ellipse(88, 67, 1.8, 3);
      });
    }
    const b = BUILDINGS[type];
    return painted("bld" + type, 128, 112, (P) => {
      // 벽
      P.use(b.wall); P.poly([[10, 48], [118, 48], [118, 108], [10, 108]]);
      P.use(C.brown, { edge: 0 });
      [10, 46, 82, 117].forEach((x) => P.capsule(x, 48, x, 108, 1.4));
      P.capsule(10, 76, 118, 76, 1.2);
      // 지붕
      P.use(b.roof); P.poly([[0, 52], [128, 52], [112, 14], [16, 14]]);
      P.use(S.shade(b.roof, 0.7), { edge: 0 });
      for (let y = 22; y < 52; y += 7) P.capsule(10 + (52 - y) * 0.42, y, 118 - (52 - y) * 0.42, y, 0.6);
      P.use("#7a5a4a"); P.poly([[92, 4], [104, 4], [104, 24], [92, 24]]);
      // 창문
      [[26, 64], [94, 64], [26, 90], [94, 90]].forEach(([x, y]) => {
        P.use(C.dbrown); P.poly([[x - 7, y - 7], [x + 7, y - 7], [x + 7, y + 7], [x - 7, y + 7]]);
        P.use("#ffd36a", { edge: 0 }); P.poly([[x - 5, y - 5], [x + 5, y - 5], [x + 5, y + 5], [x - 5, y + 5]]);
        P.use(C.dbrown, { edge: 0 }); P.capsule(x, y - 5, x, y + 5, 0.6); P.capsule(x - 5, y, x + 5, y, 0.6);
      });
      // 문
      P.use("#5a3a2a"); P.poly([[52, 80], [76, 80], [76, 108], [52, 108]]); P.ellipse(64, 80, 12, 8, (x, y) => y < 80);
      P.use(C.gold, { edge: 0 }); P.dot(71, 94, C.gold);
      // 간판
      P.use(C.brown); P.poly([[46, 54], [82, 54], [82, 72], [46, 72]]);
      P.use(C.sand, { edge: 0 }); P.poly([[48, 56], [80, 56], [80, 70], [48, 70]]);
      if (b.sign === "bed") { P.use(C.red, { edge: 0 }); P.poly([[54, 62], [74, 62], [74, 67], [54, 67]]); P.use(C.white, { edge: 0 }); P.ellipse(57, 61, 3, 2); }
      if (b.sign === "potion") { P.use(C.red, { edge: 0 }); P.ellipse(64, 64, 5, 5); P.use(C.lgrey, { edge: 0 }); P.capsule(64, 57, 64, 60, 1.2); }
      if (b.sign === "book") { P.use(C.purple, { edge: 0 }); P.poly([[56, 58], [72, 58], [72, 68], [56, 68]]); P.use(C.gold, { edge: 0 }); P.capsule(64, 58, 64, 68, 0.6); }
    });
  }

  /* ─────────── 마을 지도 ─────────── */
  /* 범례: T 나무  . 풀  , 꽃  = 흙길  o 광장 돌  ~ 물  b 덤불 */
  const TOWN_ROWS = [
    "TTTTTTTTTTTTTTTTTTTTTTTT",
    "T..,.......b.....,....bT",
    "T......................T",
    "T.....,..........,.....T",
    "T......................T",
    "T......................T",
    "T..==========o=======..T",
    "T..=.........o......=..T",
    "T..=....ooooooooo...=..T",
    "T,.=....ooooooooo...=.,T",
    "T..=====ooooooooo====..T",
    "T..=....ooooooooo...=..T",
    "T..=....ooooooooo...=..T",
    "T~~~~...=...........=..T",
    "T~~~~~..=..b........=..T",
    "T~~~~~..=...........=..T",
    "T.~~~...=========...=..T",
    "T..,....,.......=...=..T",
    "T...b...........=====..T",
    "TTTTTTTTTTTTTTTTTTTTTTTT"
  ];

  function makeTown() {
    const w = TOWN_ROWS[0].length;
    const h = TOWN_ROWS.length;
    const ground = [];
    const solid = [];
    const props = [];
    const r = rng(42);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = TOWN_ROWS[y][x];
        let g = "grass";
        let block = false;
        if (ch === "=") g = "dirt";
        else if (ch === "o") g = "cobble";
        else if (ch === "~") { g = "water"; block = true; }
        else if (ch === ",") g = "flowers";
        else if (ch === "T") { block = true; props.push({ kind: "tree", x, y, v: Math.floor(r() * 3) }); }
        else if (ch === "b") { block = true; props.push({ kind: "bush", x, y }); }
        ground.push(g === "grass" ? "grass" + Math.floor(r() * 3) : g);
        solid.push(block);
      }
    }
    const buildings = [
      { type: "inn", x: 2, y: 2, w: 4, h: 4, door: [4, 5] },
      { type: "shop", x: 10, y: 2, w: 4, h: 4, door: [12, 5] },
      { type: "guild", x: 17, y: 2, w: 4, h: 4, door: [19, 5] },
      { type: "cave", x: 15, y: 13, w: 4, h: 4, door: [17, 16] }
    ];
    buildings.forEach((b) => {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
        if (x === b.door[0] && y === b.door[1]) continue;
        solid[y * w + x] = true;
      }
    });
    // 광장 중앙의 운명의 석판과 가로등
    const tablet = { x: 12, y: 9 };
    solid[tablet.y * w + tablet.x] = true;
    [[8, 7], [16, 7], [8, 12], [16, 12]].forEach(([x, y]) => { props.push({ kind: "lamp", x, y }); solid[y * w + x] = true; });
    return { kind: "town", w, h, ground, solid, props, buildings, tablet, spawn: { x: 12, y: 11 }, light: 0.35 };
  }

  /* ─────────── 던전 생성 ─────────── */
  function makeDungeon(floor, seed) {
    const r = rng(seed || Math.floor(Math.random() * 1e9));
    const tier = Math.min(4, Math.floor((floor - 1) / 10));
    const boss = floor % 10 === 0;
    const w = boss ? 21 : 34;
    const h = boss ? 19 : 28;
    const cells = new Array(w * h).fill(0);
    const set = (x, y, v) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) cells[y * w + x] = v; };
    const rooms = [];
    if (boss) {
      const room = { x: 3, y: 3, w: 15, h: 13 };
      rooms.push(room);
      for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) set(x, y, 1);
    } else {
      let tries = 0;
      while (rooms.length < 8 && tries++ < 300) {
        const rw = 4 + Math.floor(r() * 6);
        const rh = 4 + Math.floor(r() * 4);
        const rx = 2 + Math.floor(r() * (w - rw - 4));
        const ry = 2 + Math.floor(r() * (h - rh - 4));
        if (rooms.some((o) => rx < o.x + o.w + 2 && rx + rw + 2 > o.x && ry < o.y + o.h + 2 && ry + rh + 2 > o.y)) continue;
        rooms.push({ x: rx, y: ry, w: rw, h: rh });
      }
      rooms.forEach((rm) => { for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) set(x, y, 1); });
      // 방 중심을 차례로 잇는 통로
      const centers = rooms.map((rm) => [rm.x + Math.floor(rm.w / 2), rm.y + Math.floor(rm.h / 2)]);
      for (let i = 1; i < centers.length; i++) {
        const [x1, y1] = centers[i - 1];
        const [x2, y2] = centers[i];
        if (r() < 0.5) {
          for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) set(x, y1, 1);
          for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) set(x2, y, 1);
        } else {
          for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) set(x1, y, 1);
          for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) set(x, y2, 1);
        }
      }
    }
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] === 1;
    // 거리 계산으로 가장 먼 방에 계단
    const start = boss ? { x: 10, y: 14 } : { x: rooms[0].x + 1, y: rooms[0].y + Math.floor(rooms[0].h / 2) };
    const dist = new Array(w * h).fill(-1);
    const q = [[start.x, start.y]];
    dist[start.y * w + start.x] = 0;
    while (q.length) {
      const [x, y] = q.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (isFloor(nx, ny) && dist[ny * w + nx] < 0) { dist[ny * w + nx] = dist[y * w + x] + 1; q.push([nx, ny]); }
      });
    }
    let far = start;
    let best = -1;
    rooms.slice(1).forEach((rm) => {
      const cx = rm.x + Math.floor(rm.w / 2);
      const cy = rm.y + Math.floor(rm.h / 2);
      const dd = dist[cy * w + cx];
      if (dd > best) { best = dd; far = { x: cx, y: cy }; }
    });
    const occupied = new Set([`${start.x},${start.y}`]);
    const freeSpot = (rm, margin) => {
      for (let n = 0; n < 40; n++) {
        const x = rm.x + margin + Math.floor(r() * Math.max(1, rm.w - margin * 2));
        const y = rm.y + margin + Math.floor(r() * Math.max(1, rm.h - margin * 2));
        const k = `${x},${y}`;
        if (isFloor(x, y) && !occupied.has(k) && Math.abs(x - start.x) + Math.abs(y - start.y) > 4) { occupied.add(k); return { x, y }; }
      }
      return null;
    };
    const monsters = [];
    const chests = [];
    const props = [];
    let stairs = null;
    if (boss) {
      const spot = { x: 10, y: 6 };
      occupied.add("10,6");
      monsters.push({ x: spot.x, y: spot.y, mon: F.engine.pickMonster(floor, true), boss: true });
    } else {
      stairs = far;
      occupied.add(`${far.x},${far.y}`);
      const count = 3 + Math.floor(r() * 3);
      for (let i = 0; i < count; i++) {
        const rm = rooms[1 + Math.floor(r() * (rooms.length - 1))];
        const spot = freeSpot(rm, 1);
        if (spot) monsters.push({ x: spot.x, y: spot.y, mon: F.engine.pickMonster(floor, false) });
      }
      const nChest = 1 + (r() < 0.45 ? 1 : 0);
      for (let i = 0; i < nChest; i++) {
        const rm = rooms[1 + Math.floor(r() * (rooms.length - 1))];
        const spot = freeSpot(rm, 0);
        if (spot) chests.push({ x: spot.x, y: spot.y, open: false });
      }
    }
    // 장식
    rooms.forEach((rm) => {
      if (r() < 0.6) { const spot = freeSpot(rm, 0); if (spot) props.push({ kind: r() < 0.5 ? "barrel" : r() < 0.5 ? "bones" : "rock", x: spot.x, y: spot.y }); }
    });
    // 벽 횃불: 바닥 바로 위 벽면
    const torches = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (!isFloor(x, y) && isFloor(x, y + 1) && r() < 0.07) torches.push({ x, y });
    }
    const ground = cells.map((c, i) => {
      if (c === 1) return "floor" + (r() < 0.12 ? 1 : r() < 0.1 ? 2 : 0);
      const x = i % w;
      const y = Math.floor(i / w);
      return isFloor(x, y + 1) ? "wall" + (r() < 0.2 ? 1 : 0) : "top";
    });
    const solid = cells.map((c) => c !== 1);
    props.forEach((p) => { if (p.kind === "barrel" || p.kind === "rock") solid[p.y * w + p.x] = true; });
    return { kind: "dungeon", floor, tier, boss, w, h, ground, solid, props, chests, monsters, torches, stairs, spawn: start, seen: new Uint8Array(w * h), light: 0.82 };
  }

  /* 지면 타일 그리기 */
  function groundTile(map, name, t) {
    if (map.kind === "town") {
      if (name.startsWith("grass")) return grass(Number(name.slice(5)) || 0);
      if (name === "flowers") return grass(3);
      if (name === "dirt") return dirt(0);
      if (name === "cobble") return cobble();
      if (name === "water") return water(Math.floor(t * 2.5) % 3);
      return grass(0);
    }
    const tier = map.tier;
    if (name.startsWith("floor")) return floorTile(tier, Number(name.slice(5)));
    if (name.startsWith("wall")) return wallFace(tier, Number(name.slice(4)));
    return wallTop(tier);
  }

  F.world = {
    TS, makeTown, makeDungeon, groundTile, tree, bush, rock, chest, barrel, bones, torch, lamp, fateTablet, building, stairs, BUILDINGS, DPAL, rng
  };
})(typeof window !== "undefined" ? window : globalThis);
