/*
 * 삼천의 운명 — 횡스크롤 지도
 * 마을과, 마을 동굴 아래로 이어지는 던전의 각 층을 옆에서 본다. 땅과 떠 있는 바위 발판, 밧줄·사슬·사다리,
 * 왼쪽 끝 오르는 계단과 오른쪽 끝 내려가는 계단. 좌표는 기본 단위(주인공 키 ≈ 44)이고,
 * 그림은 화면 배율 z를 받아 그 해상도에서 직접 그린다. 확대하지 않으므로 1px 세부가 살아 있다.
 * 지형은 픽셀 단위로 칠하고, 나무·건물 같은 소품은 명암 렌더러(doll.js의 Painter)로 그린다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const S = F.sprites;
  const Dl = F.doll;
  const C = S.C;

  const MAP_H = 400;
  const GROUND_DEPTH = 46;
  const LAYER_GAP = 64;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1013904223)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /* 부드러운 1차원 잡음 (0~1) */
  function smooth(x, s) {
    const i = Math.floor(x);
    const f = x - i;
    const a = hash(i, 0, s);
    const b = hash(i + 1, 0, s);
    return a + (b - a) * (f * f * (3 - 2 * f));
  }
  function toRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixHex(a, b, t) {
    const x = toRgb(a);
    const y = toRgb(b);
    const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  /* ImageData의 Uint32 보기(리틀 엔디언: 0xAABBGGRR) */
  function u32(hex, a) {
    const [r, g, b] = toRgb(hex);
    return (((a === undefined ? 255 : a) << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  const cache = new Map();
  function cached(key, make) {
    let v = cache.get(key);
    if (!v) { v = make(); cache.set(key, v); }
    return v;
  }
  function canvas(w, h) {
    return S.makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  }

  /* ── 던전 단계: 10층마다 바뀐다 ── */
  const THEMES = [
    {
      name: "흙동굴", bg: ["#100907", "#1e130e", "#2c1d15"], wall: ["#24170f", "#2e1e15", "#3a281c"], pillar: ["#1a100b", "#2a1a12"],
      top: ["#3a2416", "#6a4428", "#93653c", "#c08a56"], soil: ["#1e120c", "#33201a", "#4a3024", "#634232"], stone: ["#4a3a36", "#7a665c", "#a8948a"],
      flower: [], blades: false, rope: "rope", props: ["stalagmite", "rock", "barrel", "stalagmite", "crate", "bones"], ambient: "dust", glint: "#ffb060"
    },
    {
      name: "이끼 석굴", bg: ["#06100c", "#0d1d17", "#142b22"], wall: ["#12221b", "#182b23", "#1f362c"], pillar: ["#0b1712", "#13241c"],
      top: ["#16402a", "#2a6a3c", "#45964e", "#82c86a"], soil: ["#141a1c", "#232c2e", "#334042", "#465658"], stone: ["#33403e", "#56706a", "#86a49c"],
      flower: ["#9effc8", "#e6ff8a", "#7ad8ff"], crystals: ["#6affb8", "#9effe0", "#4ad8a0"], blades: true, rope: "vine", props: ["mushroom", "stalagmite", "mushroom", "rock", "crystal"], ambient: "firefly", glint: "#9effc8"
    },
    {
      name: "지하 묘지", bg: ["#0a0812", "#151222", "#201c32"], wall: ["#191628", "#211d33", "#2a263f"], pillar: ["#110f1d", "#1c192c"],
      top: ["#3a3650", "#58547a", "#7a76a0", "#a6a2c8"], soil: ["#14121e", "#221f32", "#302c46", "#3e3a58"], stone: ["#3a3650", "#5e5a80", "#8e8ab0"],
      flower: [], blades: false, brick: true, rope: "chain", props: ["tomb", "candles", "bones", "tomb", "column"], ambient: "wisp", glint: "#b3a6ff"
    },
    {
      name: "얼음 동굴", bg: ["#050d18", "#0c1b2e", "#142a44"], wall: ["#10243a", "#163048", "#1e3c58"], pillar: ["#0a1a2c", "#122640"],
      top: ["#6e8cb4", "#a8c4e2", "#dceaf8", "#ffffff"], soil: ["#16243a", "#22365a", "#304a78", "#406098"], stone: ["#3a5070", "#6a84a8", "#a8c0dc"],
      flower: [], crystals: ["#6ad8ff", "#a8f0ff", "#6ab0ff"], blades: false, rope: "ladder", props: ["icicle", "crystal", "rock", "icicle"], ambient: "snow", glint: "#bff0ff"
    },
    {
      name: "심연", bg: ["#06030b", "#130822", "#260d34"], wall: ["#170a24", "#1f0e30", "#28123c"], pillar: ["#0f0618", "#1a0b28"],
      top: ["#2a1038", "#4a1e5e", "#7a34a0", "#c26ae0"], soil: ["#0c0610", "#180c22", "#261434", "#361e48"], stone: ["#2a2036", "#4a3a5e", "#7a6a96"],
      flower: ["#ff6ad8", "#8ae8ff"], crystals: ["#b46aff", "#ff6ad8", "#8a6aff"], blades: false, rope: "chain", props: ["crystal", "deadtree", "crystal", "rock"], ambient: "ember", glint: "#ff6ad8"
    }
  ];
  /* 마을은 바깥: 하늘과 언덕이 보인다 */
  const TOWN_THEME = {
    name: "운명의 마을", outdoor: true, sky: ["#4aa6ea", "#8fcdf6", "#d6f0ff"], sun: "#fff4c4", far: ["#86b4dc", "#a3c9e6"], mid: ["#4f9468", "#6aad7c"],
    top: ["#1f5a2c", "#358a3c", "#58b44a", "#9edd6c"], soil: ["#2e1a12", "#4f3122", "#704630", "#946243"], stone: ["#5a5a6c", "#8e8ea2", "#c4c4d4"],
    flower: ["#ffffff", "#ffd84a", "#ff8ab0", "#b9a6ff"], blades: true, rope: "ladder", props: [], ambient: "petal"
  };

  function floorThemeIndex(n) {
    return Math.floor((Math.max(1, n) - 1) / 10) % THEMES.length;
  }
  function floorName(n) {
    if (n <= 0) return TOWN_THEME.name;
    return `지하 ${n}층 · ${THEMES[floorThemeIndex(n)].name}${n % 10 === 0 ? " · 보스" : ""}`;
  }

  /* ─────────── 소품 (Painter) ─────────── */
  function painted(key, w, h, z, draw) {
    return cached(`${key}@${z}`, () => {
      const P = new Dl.Painter(w, h, z);
      draw(P);
      return P.toCanvas();
    });
  }

  function tree(v, z) {
    const leaf = [["#2f7a3c", "#46a04a"], ["#2a6a38", "#3e8c44"], ["#2f7a3c", "#46a04a"]][v % 3];
    return painted("tree" + v, 76, 96, z, (P) => {
      P.use("#6a4430"); P.capsule(38, 52, 38, 94, 4.2, 6.5);
      P.use("#6a4430"); P.capsule(38, 86, 28, 95, 2.2); P.capsule(38, 86, 49, 95, 2.2);
      P.use("#6a4430"); P.capsule(38, 66, 24, 52, 2.4); P.capsule(38, 62, 52, 50, 2.2);
      P.use(leaf[0]); P.ellipse(20, 50, 16, 13); P.ellipse(56, 50, 16, 13); P.ellipse(38, 56, 18, 11);
      P.use(leaf[1]); P.ellipse(24, 34, 18, 16); P.ellipse(52, 34, 18, 16); P.ellipse(38, 22, 22, 18);
      if (v % 3 === 1) [[22, 30], [50, 40], [36, 18], [58, 28], [30, 46]].forEach(([x, y]) => { P.use("#e0403a", { edge: 0 }); P.ellipse(x, y, 2.2, 2.2); });
      if (v % 3 === 2) [[20, 26], [46, 20], [58, 38], [30, 44], [40, 32]].forEach(([x, y]) => P.dot(x, y, "#ffd0e0").dot(x + 1, y, "#ffffff"));
    });
  }

  function bush(v, z) {
    return painted("bush" + v, 40, 26, z, (P) => {
      P.use("#2f7a3c"); P.ellipse(12, 16, 10, 9); P.ellipse(28, 16, 10, 9);
      P.use("#46a04a"); P.ellipse(20, 12, 12, 10);
      if (v % 2) { P.dot(14, 9, "#ffd84a").dot(26, 12, "#ffffff").dot(20, 6, "#ff8ab0"); }
    });
  }
  function rock(color, z) {
    return painted("rock" + color, 40, 26, z, (P) => {
      P.use(color); P.ellipse(18, 17, 16, 10); P.use(mixHex(color, "#ffffff", 0.12)); P.ellipse(28, 15, 10, 9);
    });
  }
  function mushroom(v, z) {
    const cap = ["#d8485a", "#4ab0d8", "#9a5ad8"][v % 3];
    return painted("mush" + v, 46, 52, z, (P) => {
      P.use("#e8dcc4"); P.capsule(23, 26, 23, 50, 5, 7);
      P.use(cap); P.ellipse(23, 22, 21, 13, (x, y) => y < 28);
      P.use("#ffffff", { edge: 0 }); P.ellipse(14, 17, 3, 2.4); P.ellipse(28, 13, 3.6, 2.6); P.ellipse(33, 21, 2.4, 2);
    });
  }


  function crystal(v, th, z) {
    const col = (th.crystals || ["#b46aff", "#6ad8ff", "#ff6ad8"])[v % 3];
    return painted(`crystal${v}${col}`, 50, 64, z, (P) => {
      P.use(mixHex(col, "#000000", 0.25)); P.poly([[8, 63], [18, 63], [14, 26]]);
      P.use(col); P.poly([[16, 63], [34, 63], [26, 6]]);
      P.use(mixHex(col, "#000000", 0.15)); P.poly([[30, 63], [44, 63], [40, 30]]);
      P.use("#ffffff", { edge: 0 }); P.poly([[24, 50], [26, 14], [27, 50]]);
    });
  }
  function deadtree(v, z) {
    return painted("dead" + v, 64, 90, z, (P) => {
      P.use("#3a2a3e"); P.capsule(32, 40, 32, 89, 4, 6);
      P.use("#3a2a3e"); P.capsule(32, 56, 14, 36, 2.4); P.capsule(14, 36, 8, 22, 1.6); P.capsule(32, 48, 52, 30, 2.4); P.capsule(52, 30, 56, 16, 1.4);
      P.use("#3a2a3e"); P.capsule(32, 40, 30, 14, 2.2);
    });
  }
  function bones(z) {
    return painted("bones", 34, 18, z, (P) => {
      P.use("#e8dcc0"); P.capsule(4, 12, 22, 7, 1.4); P.ellipse(4, 12, 2.4, 2.4); P.ellipse(22, 7, 2.4, 2.4);
      P.use("#e8dcc0"); P.ellipse(27, 12, 4.4, 4); P.dot(25, 12, C.black).dot(28, 12, C.black);
    });
  }
  function sign(z) {
    return painted("sign", 34, 40, z, (P) => {
      P.use("#7a5236"); P.capsule(17, 16, 17, 39, 1.8);
      P.use("#a8784e"); P.poly([[3, 6], [30, 6], [33, 12], [30, 18], [3, 18]]);
      P.use("#5a3a26", { edge: 0 }); P.capsule(8, 12, 24, 12, 0.6);
    });
  }
  function lamp(z) {
    return painted("lamp", 22, 70, z, (P) => {
      P.use("#3a4256"); P.capsule(11, 20, 11, 66, 1.8, 2.4); P.ellipse(11, 66, 6, 2.6);
      P.use("#3a4256"); P.poly([[3, 8], [19, 8], [16, 20], [6, 20]]);
      P.use("#ffd36a", { edge: 0 }); P.poly([[6, 10], [16, 10], [14, 18], [8, 18]]);
      P.dot(9, 11, "#ffffff");
      P.use("#3a4256"); P.poly([[2, 8], [20, 8], [11, 1]]);
    });
  }
  function fence(z) {
    return painted("fence", 64, 26, z, (P) => {
      [6, 22, 38, 54].forEach((x) => { P.use("#c89a6a"); P.poly([[x - 3, 25], [x + 3, 25], [x + 3, 6], [x, 2], [x - 3, 6]]); });
      P.use("#a8784e"); P.poly([[0, 10], [64, 10], [64, 14], [0, 14]]); P.poly([[0, 18], [64, 18], [64, 22], [0, 22]]);
    });
  }
  function stalagmite(v, th, z) {
    return painted(`stalag${v}${th.name}`, 40, 70, z, (P) => {
      const h = [62, 46, 54][v % 3];
      P.use(th.stone[1]); P.poly([[4, 69], [36, 69], [24, 69 - h * 0.4], [21, 69 - h], [17, 69 - h * 0.45]]);
      P.use(th.stone[0]); P.poly([[24, 69], [38, 69], [31, 69 - h * 0.35]]);
      P.use(mixHex(th.stone[2], "#ffffff", 0.1), { edge: 0 }); P.capsule(18, 69 - h * 0.6, 20, 69 - h * 0.9, 0.7);
    });
  }
  function icicle(v, z) {
    return painted("icicle" + v, 40, 72, z, (P) => {
      const h = [66, 50, 58][v % 3];
      P.use("#7fb8e8"); P.poly([[6, 71], [34, 71], [22, 71 - h], [18, 71 - h * 0.5]]);
      P.use("#c8ecff", { edge: 0 }); P.poly([[18, 71], [22, 71 - h + 4], [24, 71]]);
      P.dot(21, 71 - h * 0.7, "#ffffff");
    });
  }
  function crate(z) {
    return painted("crate", 34, 30, z, (P) => {
      P.use("#8a5e3a"); P.poly([[2, 4], [32, 4], [32, 29], [2, 29]]);
      P.use("#5a3a24", { edge: 0 }); P.capsule(3, 5, 31, 28, 1); P.capsule(31, 5, 3, 28, 1);
      P.use("#b8875a", { edge: 0 }); P.capsule(2, 5, 32, 5, 0.8);
    });
  }
  function barrel(z) {
    return painted("barrel", 28, 34, z, (P) => {
      P.use("#7a4e30"); P.ellipse(14, 18, 11, 15);
      P.use("#4a4a5a", { edge: 0 }); P.capsule(4, 9, 24, 9, 1); P.capsule(4, 27, 24, 27, 1);
    });
  }
  function tomb(v, th, z) {
    return painted(`tomb${v}${th.name}`, 34, 44, z, (P) => {
      P.use(th.stone[1]); P.poly([[5, 43], [29, 43], [29, 14], [17, 3], [5, 14]]);
      P.use(th.stone[0], { edge: 0 }); P.capsule(17, 13, 17, 29, 1.2); P.capsule(11, 19, 23, 19, 1.2);
      if (v % 2) { P.use(th.stone[0], { edge: 0 }); P.poly([[22, 30], [29, 26], [29, 32]]); }
    });
  }
  function candles(z) {
    return painted("candles", 30, 26, z, (P) => {
      [[8, 12], [15, 7], [22, 14]].forEach(([x, top]) => { P.use("#e8dcc0"); P.capsule(x, top, x, 24, 2.2); });
      P.use("#c8b89a", { edge: 0 }); P.ellipse(15, 24, 13, 2.6);
    });
  }
  function column(v, th, z) {
    return painted(`column${v}${th.name}`, 40, 90, z, (P) => {
      const h = [86, 58, 70][v % 3];
      P.use(th.stone[0]); P.poly([[4, 89], [36, 89], [34, 82], [6, 82]]);
      P.use(th.stone[1]); P.poly([[9, 82], [31, 82], [30, 89 - h], [24, 89 - h - 5], [17, 89 - h + 3], [10, 89 - h]]);
      P.use(th.stone[0], { edge: 0 }); [14, 20, 26].forEach((x) => P.capsule(x, 80, x, 92 - h, 0.6));
    });
  }
  function torchPost(z) {
    return painted("torchpost", 16, 46, z, (P) => {
      P.use("#5a3a24"); P.capsule(8, 14, 8, 45, 1.6, 2.2);
      P.use("#3a3a46"); P.poly([[3, 10], [13, 10], [11, 16], [5, 16]]);
    });
  }
  /* 층의 양 끝 계단: 바위 아치 안으로 계단이 이어진다 */
  function stairway(down, th, z) {
    return painted(`stair${down ? "d" : "u"}${th.name}`, 96, 100, z, (P) => {
      P.use(th.stone[0]); P.ellipse(48, 64, 46, 44, (x, y) => y < 99);
      P.use(th.stone[1]); P.ellipse(48, 60, 40, 38, (x, y) => y < 99);
      P.use("#05030a", { edge: 0 }); P.poly([[24, 99], [72, 99], [72, 54], [64, 38], [48, 32], [32, 38], [24, 54]]);
      for (let i = 0; i < 5; i++) {
        const y = down ? 66 + i * 7 : 92 - i * 9;
        const x1 = down ? 26 + i * 3 : 26 + i * 6;
        const x2 = down ? 70 - i * 3 : 70;
        P.use(mixHex(th.stone[1], "#05030a", down ? 0.2 + i * 0.15 : 0.6 - i * 0.1), { edge: 0 }); P.poly([[x1, y], [x2, y], [x2, y + 3], [x1, y + 3]]);
      }
      P.use(th.stone[2], { edge: 0 }); P.capsule(30, 30, 66, 30, 0.8);
    });
  }
  function caveMouth(z) {
    return painted("cavemouth", 150, 120, z, (P) => {
      P.use("#6a6a80"); P.ellipse(75, 74, 72, 46); P.ellipse(36, 80, 34, 36); P.ellipse(114, 80, 34, 36);
      P.use("#55556a"); P.ellipse(52, 52, 20, 13); P.ellipse(100, 56, 22, 14);
      P.use("#05030a", { edge: 0 }); P.ellipse(75, 98, 24, 26, (x, y) => y < 119);
      P.use("#7a5236"); P.capsule(46, 78, 46, 116, 1.8); P.capsule(104, 78, 104, 116, 1.8);
      P.use("#3a3a46"); P.poly([[42, 74], [50, 74], [49, 79], [43, 79]]); P.poly([[100, 74], [108, 74], [107, 79], [101, 79]]);
    });
  }
  function fateTablet(frame, z) {
    return painted("tablet" + frame, 50, 76, z, (P) => {
      P.use("#4a4a66"); P.poly([[4, 75], [46, 75], [43, 64], [7, 64]]);
      P.use("#6a6a8a"); P.poly([[11, 64], [39, 64], [38, 16], [31, 4], [19, 4], [12, 16]]);
      const glow = [C.cyan, "#b3a6ff", C.yellow][frame % 3];
      for (let i = 0; i < 7; i++) {
        const y = 16 + i * 6;
        P.dot(18 + (i % 2) * 2, y, glow).dot(22 + ((i + 1) % 3), y, glow).dot(26, y + (i % 2), glow).dot(30 - (i % 2), y, glow);
      }
      P.dot(25, 10, C.white);
    });
  }

  /* 건물 정면: 지붕색과 간판 그림이 다르다 */
  const BUILDINGS = {
    inn: { roof: "#b0303a", wall: "#e2c49a", sign: "bed", label: "여관" },
    shop: { roof: "#2a6ab0", wall: "#e2cca6", sign: "potion", label: "상점" },
    guild: { roof: "#6a3a8a", wall: "#d4c4ac", sign: "book", label: "모험가 길드" }
  };
  function building(type, z) {
    const b = BUILDINGS[type];
    return painted("bld" + type, 150, 140, z, (P) => {
      P.use("#8a8a9a"); P.poly([[8, 132], [142, 132], [142, 140], [8, 140]]);
      P.use(b.wall); P.poly([[14, 62], [136, 62], [136, 133], [14, 133]]);
      P.use("#7a5236", { edge: 0 });
      [14, 55, 95, 135].forEach((x) => P.capsule(x, 62, x, 133, 1.6));
      P.capsule(14, 96, 136, 96, 1.4);
      P.use(b.roof); P.poly([[0, 68], [150, 68], [130, 20], [20, 20]]);
      P.use(S.shade(b.roof, 0.72), { edge: 0 });
      for (let y = 28; y < 68; y += 7) P.capsule(10 + (68 - y) * 0.42, y, 140 - (68 - y) * 0.42, y, 0.7);
      P.use("#8a6a5a"); P.poly([[104, 6], [118, 6], [118, 30], [104, 30]]);
      P.use("#5a4a44"); P.poly([[102, 4], [120, 4], [120, 9], [102, 9]]);
      [[34, 82], [116, 82], [34, 114], [116, 114]].forEach(([x, y]) => {
        P.use("#5a3a26"); P.poly([[x - 9, y - 9], [x + 9, y - 9], [x + 9, y + 9], [x - 9, y + 9]]);
        P.use("#ffd36a", { edge: 0 }); P.poly([[x - 7, y - 7], [x + 7, y - 7], [x + 7, y + 7], [x - 7, y + 7]]);
        P.use("#5a3a26", { edge: 0 }); P.capsule(x, y - 7, x, y + 7, 0.7); P.capsule(x - 7, y, x + 7, y, 0.7);
        P.dot(x - 5, y - 5, "#fff6d0");
      });
      P.use("#5a3a2a"); P.poly([[61, 100], [89, 100], [89, 133], [61, 133]]); P.ellipse(75, 100, 14, 9, (x, y) => y < 100);
      P.dot(83, 117, C.gold);
      P.use("#7a5236"); P.poly([[52, 70], [98, 70], [98, 92], [52, 92]]);
      P.use("#ecd8b0", { edge: 0 }); P.poly([[55, 73], [95, 73], [95, 89], [55, 89]]);
      if (b.sign === "bed") { P.use(C.red, { edge: 0 }); P.poly([[63, 80], [87, 80], [87, 86], [63, 86]]); P.use(C.white, { edge: 0 }); P.ellipse(67, 79, 3.4, 2.4); }
      if (b.sign === "potion") { P.use(C.red, { edge: 0 }); P.ellipse(75, 83, 6, 5.6); P.use(C.lgrey, { edge: 0 }); P.capsule(75, 75, 75, 78, 1.4); }
      if (b.sign === "book") { P.use(C.purple, { edge: 0 }); P.poly([[66, 76], [84, 76], [84, 87], [66, 87]]); P.use(C.gold, { edge: 0 }); P.capsule(75, 76, 75, 87, 0.7); }
    });
  }

  function propCanvas(kind, v, th, z) {
    switch (kind) {
      case "tree": return tree(v, z);
      case "bush": return bush(v, z);
      case "rock": return rock(th.stone[1], z);
      case "mushroom": return mushroom(v, z);
      case "crystal": return crystal(v, th, z);
      case "deadtree": return deadtree(v, z);
      case "bones": return bones(z);
      case "sign": return sign(z);
      case "lamp": return lamp(z);
      case "fence": return fence(z);
      case "tablet": return fateTablet(0, z);
      case "stalagmite": return stalagmite(v, th, z);
      case "icicle": return icicle(v, z);
      case "crate": return crate(z);
      case "barrel": return barrel(z);
      case "tomb": return tomb(v, th, z);
      case "candles": return candles(z);
      case "column": return column(v, th, z);
      case "torch": return torchPost(z);
      case "up": return stairway(false, th, z);
      case "down": return stairway(true, th, z);
      case "cave": return caveMouth(z);
      case "shop": case "inn": case "guild": return building(kind, z);
      default: return null;
    }
  }

  /* ─────────── 지형 칠하기 ─────────── */
  /* 발판 하나: 위는 풀(눈·바위) 테두리, 아래는 흙. 떠 있는 발판은 아래가 둥글게 깎인 섬 모양 */
  function paintTerrain(map, z) {
    const W = Math.ceil(map.W * z);
    const H = Math.ceil(map.H * z);
    const cv = canvas(W, H);
    const g = cv.getContext("2d");
    const img = g.createImageData(W, H);
    const buf = new Uint32Array(img.data.buffer);
    const th = map.theme;
    const top = th.top.map((c) => u32(c));
    const soil = th.soil.map((c) => u32(c));
    const line = u32(mixHex(th.soil[0], "#000000", 0.45));
    const topLine = u32(mixHex(th.top[0], "#000000", 0.35));
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c; };
    const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? buf[y * W + x] : 0);

    map.plats.forEach((pl, pi) => {
      const seed = map.seed * 31 + pi * 977;
      const x1 = Math.round(pl.x1 * z);
      const x2 = Math.round(pl.x2 * z);
      const y0 = Math.round(pl.y * z);
      const span = Math.max(1, x2 - x1);
      const thick = pl.ground ? H - y0 : Math.round((18 + hash(pi, 1, seed) * 8) * z);
      /* 흙 */
      for (let x = x1; x < x2; x++) {
        const u = (x - x1) / span;
        let depth = thick;
        if (!pl.ground) {
          const e = Math.abs(u * 2 - 1);
          depth = Math.round(thick * (1 - Math.pow(e, 2.4) * 0.82) + (smooth(x / (6 * z), seed) - 0.5) * 5 * z);
          depth = Math.max(3 * z, depth);
        }
        for (let d = 0; d < depth; d++) {
          const y = y0 + d;
          const band = Math.floor((d + smooth(x / (14 * z), seed + 7) * 6 * z) / (9 * z));
          let c = band === 0 ? soil[3] : band % 2 ? soil[2] : soil[1];
          if (!pl.ground && d > depth - 4 * z) c = soil[1];
          if (!pl.ground && d > depth - 2 * z) c = soil[0];
          if (pl.ground && d > 60 * z) c = soil[0];
          else if (pl.ground && d > 36 * z) c = (band + (hash(x >> 1, y >> 1, seed) < 0.5 ? 0 : 1)) % 2 ? soil[1] : soil[0];
          if (th.brick && d > 5 * z) {
            /* 묘지 벽돌: 가로 줄눈과 엇갈린 세로 줄눈 */
            const bh = Math.round(8 * z);
            const row = Math.floor(d / bh);
            const bx = Math.round(16 * z);
            const off = row % 2 ? Math.round(bx / 2) : 0;
            const mortar = d % bh === 0 || (x + off) % bx === 0;
            c = mortar ? soil[0] : (hash(Math.floor((x + off) / bx), row, seed) < 0.5 ? soil[2] : soil[1]);
          }
          const n = hash(x, y, seed);
          if (n < 0.025) c = soil[Math.max(0, band === 0 ? 2 : 0)];
          else if (n > 0.985) c = soil[3];
          if (!pl.ground && d === depth - 1) c = line;
          set(x, y, c);
        }
        if (!pl.ground) set(x, y0 + depth, line);
      }
      if (!pl.ground) for (let d = 0; d < thick; d++) {
        if (get(x1, y0 + d)) set(x1 - 1, y0 + d, line);
        if (get(x2 - 1, y0 + d)) set(x2, y0 + d, line);
      }
      /* 박힌 돌 */
      const r = rng(seed + 5);
      const stones = Math.floor(span / (38 * z));
      for (let i = 0; i < stones; i++) {
        const cx = x1 + r() * span;
        const cy = y0 + (9 + r() * (pl.ground ? 40 : 6)) * z;
        const rx = (2.6 + r() * 3.4) * z;
        const ry = rx * (0.6 + r() * 0.25);
        if (!pl.ground && Math.abs((cx - x1) / span * 2 - 1) > 0.7) continue;
        for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
          for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
            const dx = (x + 0.5 - cx) / rx;
            const dy = (y + 0.5 - cy) / ry;
            const dd = dx * dx + dy * dy;
            if (!get(x, y)) continue;
            if (dd <= 1) {
              const lit = -dx * 0.6 - dy * 0.8;
              set(x, y, u32(lit > 0.45 ? th.stone[2] : lit > -0.25 ? th.stone[1] : th.stone[0]));
            } else if (dd <= 1.45) set(x, y, line);
          }
        }
      }
      /* 위 테두리(풀) */
      const over = Math.round(3 * z);
      const lipBase = Math.round(5 * z);
      for (let x = x1 - over; x < x2 + over; x++) {
        const edge = x < x1 ? (x1 - x) / over : x >= x2 ? (x - x2 + 1) / over : 0;
        const bump = Math.round(smooth(x / (5 * z), seed + 3) * 1.6 * z);
        const yt = y0 - Math.round(1.2 * z) - bump + Math.round(edge * edge * 2 * z);
        let lip = Math.round(lipBase * (1 - edge * 0.55) + smooth(x / (3 * z), seed + 9) * 2 * z);
        const drip = hash(Math.floor(x / Math.max(1, Math.round(1.5 * z))), 3, seed) < 0.14 ? Math.round((1 + hash(x, 4, seed) * 4) * z) : 0;
        lip += drip;
        for (let y = yt; y < y0 + lip; y++) {
          const d = y - yt;
          const total = y0 + lip - yt;
          let c;
          if (d === 0) c = top[3];
          else if (d < 1.4 * z) c = hash(x, y, seed + 2) < 0.7 ? top[3] : top[2];
          else if (d < total * 0.55) c = top[2];
          else if (y < y0 + lip - Math.max(1, Math.round(0.8 * z))) c = top[1];
          else c = top[0];
          if (hash(x, y, seed + 11) < 0.05 && d > 1) c = top[d < total * 0.5 ? 3 : 1];
          set(x, y, c);
        }
        set(x, yt - 1, topLine);
        set(x, y0 + lip, topLine);
        /* 풀잎(이끼) */
        if (th.blades && hash(x, 5, seed) < 0.22 && x > x1 && x < x2) {
          const hgt = Math.round((1 + hash(x, 6, seed) * 3) * z);
          for (let k = 1; k <= hgt; k++) set(x, yt - k, k === hgt ? top[3] : top[2]);
          set(x, yt - hgt - 1, topLine);
          set(x - 1, yt - Math.ceil(hgt / 2), topLine);
          set(x + 1, yt - Math.ceil(hgt / 2), topLine);
        }
      }
      for (let d = 0; d < lipBase + 2 * z; d++) {
        set(x1 - over - 1, y0 - Math.round(z) + d, topLine);
        set(x2 + over, y0 - Math.round(z) + d, topLine);
      }
      /* 꽃 */
      if (th.flower.length) {
        const nf = Math.floor(span / (26 * z));
        for (let i = 0; i < nf; i++) {
          const fx = Math.round(x1 + (0.05 + 0.9 * hash(i, 8, seed)) * span);
          const fy = y0 - Math.round(3 * z);
          const col = u32(th.flower[Math.floor(hash(i, 9, seed) * th.flower.length)]);
          const s = Math.max(1, Math.round(z * 0.8));
          for (let k = 0; k < Math.round(2 * z); k++) set(fx, fy + s + k, top[1]);
          for (let yy = -s; yy <= s; yy++) for (let xx = -s; xx <= s; xx++) if (Math.abs(xx) + Math.abs(yy) <= s) set(fx + xx, fy + yy, col);
          set(fx, fy, u32("#ffe66a"));
        }
      }
    });

    /* 동굴 천장: 들쭉날쭉한 바위와 종유석 */
    if (map.ceiling) {
      const lip = u32(th.soil[0]);
      for (let x = 0; x < W; x++) {
        let depth = (14 + smooth(x / (18 * z), map.seed + 21) * 16) * z;
        const spike = smooth(x / (4 * z), map.seed + 22);
        if (spike > 0.72) depth += (spike - 0.72) * 140 * z;
        depth = Math.round(depth);
        for (let y = 0; y < depth; y++) {
          const band = Math.floor((y + smooth(x / (12 * z), map.seed) * 5 * z) / (8 * z));
          let c = band % 2 ? soil[1] : soil[0];
          if (y > depth - 3 * z) c = soil[2];
          if (hash(x, y, map.seed + 5) < 0.03) c = soil[3];
          set(x, y, y === depth - 1 ? line : c);
        }
        set(x, depth, lip);
      }
    }

    /* 밧줄·사슬·덩굴·사다리 */
    map.ropes.forEach((rp) => {
      const cx = Math.round(rp.x * z);
      const yA = Math.round(rp.y1 * z);
      const yB = Math.round(rp.y2 * z);
      const style = rp.ladder ? "ladder" : th.rope || "rope";
      if (style === "ladder") {
        const half = Math.round(6 * z);
        const rail = Math.max(2, Math.round(1.6 * z));
        const wood = [u32("#5a3a24"), u32("#8a5e3a"), u32("#b8875a")];
        for (let y = yA; y < yB; y++) {
          for (let k = 0; k < rail; k++) {
            set(cx - half + k, y, k === 0 ? wood[0] : wood[k === 1 ? 2 : 1]);
            set(cx + half - k, y, k === 0 ? wood[0] : wood[1]);
          }
          if ((y - yA) % Math.round(8 * z) < Math.max(2, Math.round(1.5 * z))) {
            for (let x = cx - half + rail; x <= cx + half - rail; x++) set(x, y, (y - yA) % Math.round(8 * z) === 0 ? wood[2] : wood[1]);
          }
        }
      } else if (style === "chain") {
        /* 사슬: 세로 고리와 가로 고리가 번갈아 */
        const link = Math.round(6 * z);
        const ch = [u32("#2a2a36"), u32("#6a6a80"), u32("#a8a8c0")];
        for (let y = yA; y < yB; y++) {
          const k = (y - yA) % (link * 2);
          const vertical = k < link;
          const half = vertical ? Math.round(1.6 * z) : Math.round(2.6 * z);
          const edge = k % link === 0 || k % link === link - 1;
          for (let x = cx - half; x <= cx + half; x++) {
            const rim = x === cx - half || x === cx + half || edge;
            const hole = vertical && !rim && Math.abs(x - cx) < half - Math.max(1, Math.round(z * 0.6)) && k > 1 && k < link - 2;
            if (hole) continue;
            set(x, y, rim ? ch[0] : x < cx ? ch[2] : ch[1]);
          }
        }
      } else if (style === "vine") {
        const wR = Math.max(2, Math.round(1.2 * z));
        const vine = [u32("#123a20"), u32("#2a6a3c"), u32("#58a84e"), u32("#8ad06a")];
        for (let y = yA; y < yB; y++) {
          const wob = Math.round(Math.sin((y - yA) / (5 * z)) * z);
          for (let x = cx - wR; x <= cx + wR; x++) set(x + wob, y, x === cx - wR || x === cx + wR ? vine[0] : x === cx - wR + 1 ? vine[2] : vine[1]);
          if ((y - yA) % Math.round(9 * z) === 0) {
            const side = ((y - yA) / Math.round(9 * z)) % 2 ? 1 : -1;
            for (let k = 1; k <= Math.round(3.5 * z); k++) {
              set(cx + wob + side * (wR + k), y - Math.round(k / 2), vine[k < 2 * z ? 2 : 3]);
              set(cx + wob + side * (wR + k), y - Math.round(k / 2) + 1, vine[1]);
            }
          }
        }
      } else {
        const wR = Math.max(2, Math.round(1.4 * z));
        const rope = [u32("#5a3a22"), u32("#a0764a"), u32("#d6aa74")];
        for (let y = yA; y < yB; y++) {
          for (let x = cx - wR; x <= cx + wR; x++) {
            const twist = (x - cx + y) % Math.round(4 * z);
            const c = x === cx - wR || x === cx + wR ? rope[0] : twist < z ? rope[2] : rope[1];
            set(x, y, c);
          }
        }
        for (let y = yA - Math.round(3 * z); y < yA + Math.round(2 * z); y++) {
          for (let x = cx - wR - Math.round(z); x <= cx + wR + Math.round(z); x++) set(x, y, rope[y < yA ? 1 : 0]);
        }
      }
    });
    g.putImageData(img, 0, 0);
    return cv;
  }

  /* 빛을 내는 소품: 게임 화면이 빛 번짐과 어둠 속 밝은 자리로 쓴다 */
  const LIGHTS = {
    lamp: { dy: 56, col: "#ffd36a", r: 40 }, torch: { dy: 40, col: "#ffa040", r: 60, flame: true },
    crystal: { dy: 30, col: null, r: 34 }, mushroom: { dy: 24, col: ["#ff8a9a", "#7ad8ff", "#c08aff"], r: 26 },
    candles: { dy: 20, col: "#ffc860", r: 34, flame: true }, tablet: { dy: 40, col: "#8ae8ff", r: 50 }
  };

  /* 정적인 그림 한 장: 소품(뒤) → 지형(앞). 나무 밑동·바위 뿌리는 지형 테두리에 자연스럽게 가린다 */
  function renderMap(map, z) {
    const key = `${map.id}@${z}`;
    if (map._cv && map._cvKey === key) return map._cv;
    const out = canvas(map.W * z, map.H * z);
    const g = out.getContext("2d");
    const lights = [];
    map.deco.forEach((d) => {
      const img = propCanvas(d.kind, d.v || 0, map.theme, z);
      if (!img) return;
      const x = Math.round(d.x * z - img.width / 2);
      const y = Math.round(d.y * z - img.height + (d.sink || 3) * z);
      if (d.flip) { g.save(); g.translate(x + img.width, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); }
      else g.drawImage(img, x, y);
      const L = LIGHTS[d.kind];
      if (L) {
        const list = L.col || map.theme.crystals || ["#b46aff", "#6ad8ff", "#ff6ad8"];
        lights.push({ x: d.x, y: d.y - L.dy, col: Array.isArray(list) ? list[(d.v || 0) % 3] : list, r: L.r, flame: !!L.flame, seed: Math.round(d.x) });
      }
    });
    g.drawImage(paintTerrain(map, z), 0, 0);
    map._cv = out;
    map._cvKey = key;
    map.lights = lights.concat(map.extraLights || []);
    return out;
  }

  /* 횃불·촛불의 불꽃(움직이므로 매 프레임 그린다) */
  function drawFlame(ctx, x, y, z, t, seed) {
    const f = Math.sin(t / 90 + seed) * 0.5 + Math.sin(t / 47 + seed * 2) * 0.5;
    const h = (7 + f * 1.5) * z;
    const w = 3.2 * z;
    ctx.fillStyle = "#ff6a1e";
    ctx.beginPath(); ctx.ellipse(x, y - h * 0.35, w, h * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffc04a";
    ctx.beginPath(); ctx.ellipse(x + f * 0.4 * z, y - h * 0.3, w * 0.62, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff6d0";
    ctx.fillRect(Math.round(x - z * 0.5), Math.round(y - h * 0.3), Math.max(1, Math.round(z)), Math.max(1, Math.round(z * 1.5)));
  }

  /* 보스가 살아 있는 동안 내려가는 계단을 막는 봉인 */
  function drawSeal(ctx, x, y, z, t) {
    const cx = x * z;
    const cy = (y - 30) * z;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(cx, cy);
    ctx.scale(0.55, 1);
    const rot = t / 1400;
    ctx.strokeStyle = "rgba(255,90,110,0.85)";
    ctx.lineWidth = Math.max(1, z);
    [26, 20].forEach((r) => { ctx.beginPath(); ctx.arc(0, 0, r * z, 0, Math.PI * 2); ctx.stroke(); });
    ctx.beginPath();
    for (let k = 0; k <= 5; k++) {
      const a = rot + (k * 4 * Math.PI) / 5;
      const px = Math.cos(a) * 20 * z;
      const py = Math.sin(a) * 20 * z;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 * z);
    g.addColorStop(0, "rgba(255,60,90,0.35)");
    g.addColorStop(1, "rgba(255,60,90,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-30 * z, -30 * z, 60 * z, 60 * z);
    ctx.restore();
  }

  /* ─────────── 배경(시차 스크롤) ─────────── */
  function ridgeStrip(th, z, which) {
    return cached(`ridge${th.name}${which}@${z}`, () => {
      const W = Math.round(640 * z);
      const H = Math.round((which ? 120 : 150) * z);
      const cv = canvas(W, H);
      const g = cv.getContext("2d");
      const img = g.createImageData(W, H);
      const buf = new Uint32Array(img.data.buffer);
      const cols = which ? th.mid : th.far;
      const back = u32(cols[0]);
      const front = u32(cols[1]);
      const rim = u32(mixHex(cols[1], "#ffffff", 0.18));
      const snow = u32("#f4f8ff");
      const per = (x, f, s) => {
        /* 가로로 이어 붙여도 끊기지 않게 주기 함수만 쓴다 */
        const t = (x / W) * Math.PI * 2;
        return Math.sin(t * f + s) * 0.5 + Math.sin(t * f * 2.3 + s * 1.7) * 0.25 + Math.sin(t * f * 5 + s * 3.1) * 0.12;
      };
      for (let x = 0; x < W; x++) {
        let hb;
        let hf;
        switch (th.ridge) {
          case "mesa": hb = 0.55 + Math.max(-0.15, Math.min(0.2, per(x, 3, 1) * 0.6)); hf = 0.38 + Math.round(per(x, 5, 2) * 3) / 12; break;
          case "peaks": hb = 0.5 + Math.abs(per(x, 4, 0.5)) * 0.5; hf = 0.34 + Math.abs(per(x, 7, 2)) * 0.35; break;
          case "spikes": hb = 0.45 + Math.pow(Math.abs(per(x, 9, 1)), 2) * 0.6; hf = 0.3 + Math.pow(Math.abs(per(x, 13, 4)), 3) * 0.7; break;
          case "forest": hb = 0.55 + per(x, 24, 1) * 0.12 + (Math.sin((x / W) * Math.PI * 2 * 40) > 0.6 ? 0.08 : 0); hf = 0.42 + per(x, 31, 3) * 0.12; break;
          default: hb = 0.5 + per(x, 2, 0.3) * 0.28; hf = 0.32 + per(x, 4, 1.4) * 0.18;
        }
        if (which) { hb *= 0.8; hf = 0.25 + per(x, 11, 2) * 0.1 + (th.ridge === "round" || th.ridge === "forest" ? Math.abs(Math.sin((x / W) * Math.PI * 2 * 18)) * 0.12 : 0); }
        const yb = Math.round(H * (1 - hb));
        const yf = Math.round(H * (1 - hf));
        for (let y = Math.max(0, yb); y < H; y++) {
          let c = back;
          if (y >= yf) c = y === yf ? rim : front;
          if (!which && th.ridge === "peaks" && y < yb + 6 * z && y < yf) c = snow;
          buf[y * W + x] = c;
        }
      }
      g.putImageData(img, 0, 0);
      return cv;
    });
  }
  function cloud(v, z) {
    return painted("cloud" + v, 90, 34, z, (P) => {
      P.use("#ffffff", { flat: true });
      P.ellipse(22, 22, 18, 11); P.ellipse(46, 16, 22, 15); P.ellipse(68, 22, 18, 11); P.ellipse(45, 26, 34, 8);
    });
  }

  /* 동굴 벽: 불규칙한 바위 덩어리(보로노이 칸)를 이어 붙일 수 있게 칠한 질감 */
  function caveWall(th, z) {
    return cached(`wall${th.name}@${z}`, () => {
      const N = Math.round(256 * z);
      const cell = 32 * z;
      const cells = Math.round(N / cell);
      const cv = canvas(N, N);
      const g = cv.getContext("2d");
      const img = g.createImageData(N, N);
      const buf = new Uint32Array(img.data.buffer);
      const cols = th.wall.map((c) => u32(c));
      const crack = u32(mixHex(th.wall[0], "#000000", 0.4));
      const pt = (i, j) => {
        const ii = ((i % cells) + cells) % cells;
        const jj = ((j % cells) + cells) % cells;
        return [(i + 0.2 + hash(ii, jj, 7) * 0.6) * cell, (j + 0.2 + hash(ii, jj, 8) * 0.6) * cell, hash(ii, jj, 9)];
      };
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const ci = Math.floor(x / cell);
          const cj = Math.floor(y / cell);
          let d1 = 1e9;
          let d2 = 1e9;
          let v = 0;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
            const [px, py, h] = pt(ci + a, cj + b);
            const d = (px - x) * (px - x) + (py - y) * (py - y);
            if (d < d1) { d2 = d1; d1 = d; v = h; } else if (d < d2) d2 = d;
          }
          const edge = Math.sqrt(d2) - Math.sqrt(d1);
          let c = cols[v < 0.4 ? 0 : v < 0.8 ? 1 : 2];
          if (edge < 1.2 * z) c = crack;
          else if (edge < 2.6 * z && v > 0.4) c = cols[Math.min(2, (v < 0.8 ? 1 : 2))];
          if (hash(x, y, 3) < 0.02) c = cols[0];
          buf[y * N + x] = c;
        }
      }
      g.putImageData(img, 0, 0);
      return cv;
    });
  }
  /* 가까운 돌기둥 줄: 천장에서 내려온 종유석과 바닥의 석순이 만난 기둥 */
  function pillarStrip(th, z) {
    return cached(`pillars${th.name}@${z}`, () => {
      const W = Math.round(720 * z);
      const H = Math.round(360 * z);
      const cv = canvas(W, H);
      const g = cv.getContext("2d");
      const r = rng(th.name.length * 97 + 3);
      let x = 40 * z;
      while (x < W - 60 * z) {
        const w = (26 + r() * 30) * z;
        const gap = r() < 0.4 ? (40 + r() * 80) * z : 0;
        const mid = H * (0.35 + r() * 0.3);
        const drawPart = (y0, y1, wide0, wide1) => {
          g.beginPath();
          g.moveTo(x - wide0 / 2, y0);
          g.lineTo(x + wide0 / 2, y0);
          g.lineTo(x + wide1 / 2, y1);
          g.lineTo(x - wide1 / 2, y1);
          g.closePath();
          g.fill();
        };
        g.fillStyle = th.pillar[0];
        if (gap) {
          drawPart(0, mid - gap / 2, w * 1.4, 2 * z);
          drawPart(mid + gap / 2, H, 2 * z, w * 1.6);
        } else {
          drawPart(0, mid, w * 1.5, w * 0.7);
          drawPart(mid, H, w * 0.7, w * 1.7);
        }
        g.fillStyle = th.pillar[1];
        g.fillRect(Math.round(x - w * 0.35), 0, Math.max(1, Math.round(z * 1.5)), H);
        x += w + (90 + r() * 160) * z;
      }
      return cv;
    });
  }

  function drawCave(ctx, map, z, camX, camY, VW, VH, t) {
    const th = map.theme;
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, th.bg[0]);
    grad.addColorStop(0.5, th.bg[1]);
    grad.addColorStop(1, th.bg[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);
    const wall = caveWall(th, z);
    const ox = -(((camX * 0.15) % wall.width) + wall.width) % wall.width;
    const oy = -(((camY * 0.15) % wall.height) + wall.height) % wall.height;
    ctx.globalAlpha = 0.5;
    for (let y = oy; y < VH; y += wall.height) for (let x = ox; x < VW; x += wall.width) ctx.drawImage(wall, Math.round(x), Math.round(y));
    ctx.globalAlpha = 1;
    /* 먼 벽 속 반짝이는 광물 */
    const cell = 90 * z;
    const gx0 = Math.floor((camX * 0.15) / cell) - 1;
    const gy0 = Math.floor((camY * 0.15) / cell) - 1;
    for (let j = gy0; j < gy0 + VH / cell + 2; j++) {
      for (let i = gx0; i < gx0 + VW / cell + 2; i++) {
        if (hash(i, j, 41) > 0.45) continue;
        const px = i * cell + hash(i, j, 42) * cell - camX * 0.15;
        const py = j * cell + hash(i, j, 43) * cell - camY * 0.15;
        const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 700 + i * 3.1 + j));
        ctx.fillStyle = th.glint;
        ctx.globalAlpha = a * 0.8;
        ctx.fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(z)), Math.max(1, Math.round(z)));
      }
    }
    ctx.globalAlpha = 1;
    const dark = ctx.createLinearGradient(0, 0, 0, VH);
    dark.addColorStop(0, "rgba(0,0,0,0.45)");
    dark.addColorStop(0.5, "rgba(0,0,0,0.15)");
    dark.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, VW, VH);
    const strip = pillarStrip(th, z);
    const px0 = -(((camX * 0.4) % strip.width) + strip.width) % strip.width;
    const top = Math.round(-camY * 0.4);
    for (let x = px0; x < VW; x += strip.width) ctx.drawImage(strip, Math.round(x), top, strip.width, Math.max(strip.height, VH - top));
  }

  /* 화면 좌표계에서 배경을 그린다. camX/camY는 화면 왼쪽 위의 월드 픽셀 좌표 */
  function drawBackground(ctx, map, z, camX, camY, VW, VH, t) {
    const th = map.theme;
    if (!th.outdoor) { drawCave(ctx, map, z, camX, camY, VW, VH, t); return; }
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, th.sky[0]);
    grad.addColorStop(0.55, th.sky[1]);
    grad.addColorStop(1, th.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);
    const groundY = map.groundY * z - camY;
    const orb = th.sun || th.moon;
    if (orb) {
      const ox = VW * 0.78 - camX * 0.02;
      const oy = VH * 0.18 - camY * 0.02;
      const r = (th.sun ? 26 : 20) * z;
      const gl = ctx.createRadialGradient(ox, oy, r * 0.5, ox, oy, r * 3);
      gl.addColorStop(0, orb + "88");
      gl.addColorStop(1, orb + "00");
      ctx.fillStyle = gl;
      ctx.fillRect(ox - r * 3, oy - r * 3, r * 6, r * 6);
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(Math.round(ox), Math.round(oy), r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (th.sun) {
      for (let i = 0; i < 4; i++) {
        const c = cloud(i % 2, z);
        const span = VW + c.width * 2;
        const x = ((i * 397 + t * 0.006 * (1 + i * 0.3) - camX * 0.05) % span + span) % span - c.width;
        const y = VH * (0.08 + i * 0.07) - camY * 0.03;
        ctx.globalAlpha = th.ridge === "mesa" ? 0.55 : 0.85;
        ctx.drawImage(c, Math.round(x), Math.round(y));
        ctx.globalAlpha = 1;
      }
    }
    const layers = [[ridgeStrip(th, z, 0), 0.12, 0.35], [ridgeStrip(th, z, 1), 0.3, 0.62]];
    layers.forEach(([strip, px, py], li) => {
      const bottom = Math.round(VH * (0.82 - li * 0.06) * (1 - py) + (groundY - 8 * z) * py);
      const x0 = -(((camX * px) % strip.width) + strip.width) % strip.width;
      for (let x = x0; x < VW; x += strip.width) ctx.drawImage(strip, Math.round(x), bottom - strip.height);
      ctx.fillStyle = (li ? th.mid : th.far)[1];
      if (bottom < VH) ctx.fillRect(0, bottom, VW, VH - bottom);
    });
    const haze = ctx.createLinearGradient(0, VH * 0.35, 0, VH);
    haze.addColorStop(0, th.sky[2] + "00");
    haze.addColorStop(1, th.sky[2] + "33");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, VW, VH);
  }

  /* ─────────── 지도 만들기 ─────────── */
  function surfaceBelow(plats, x, y) {
    let best = null;
    plats.forEach((p) => {
      if (x < p.x1 || x > p.x2 || p.y <= y + 1) return;
      if (!best || p.y < best.y) best = p;
    });
    return best;
  }

  const TALL = new Set(["tree", "deadtree", "column", "stalagmite", "icicle"]);
  function scatterDeco(map, r, keepOut) {
    const th = map.theme;
    if (!th.props.length) return;
    map.plats.forEach((pl) => {
      const span = pl.x2 - pl.x1;
      const n = Math.floor(span / (pl.ground ? 66 : 90));
      for (let i = 0; i < n; i++) {
        const x = pl.x1 + 16 + r() * (span - 32);
        if (pl.ground && keepOut.some(([a, b]) => x > a && x < b)) continue;
        if (map.ropes.some((rp) => Math.abs(rp.x - x) < 26 && rp.y1 <= pl.y && rp.y2 >= pl.y - 2)) continue;
        let kind = th.props[Math.floor(r() * th.props.length)];
        if (!pl.ground && (kind === "deadtree" || kind === "column")) kind = "rock";
        map.deco.push({ kind, v: Math.floor(r() * 3), x, y: pl.y, flip: r() < 0.5 });
      }
    });
    map.deco.sort((a, b) => (TALL.has(b.kind) ? 1 : 0) - (TALL.has(a.kind) ? 1 : 0));
  }

  /* 지하 n층: 땅 위로 2~3단 바위 발판, 발판마다 아래로 내려가는 밧줄(사슬·덩굴·사다리).
     왼쪽 끝은 올라온 계단, 오른쪽 끝은 내려가는 계단. 10층마다 보스가 계단을 봉인한다 */
  function makeFloor(n) {
    const r = rng(9001 + n * 7919);
    const boss = n % 10 === 0;
    const theme = THEMES[floorThemeIndex(n)];
    const W = boss ? 780 : 980 + Math.floor(r() * 4) * 120;
    const H = MAP_H;
    const G = H - GROUND_DEPTH;
    const plats = [{ x1: 0, x2: W, y: G, ground: true }];
    const ropes = [];
    if (boss) {
      plats.push({ x1: 110, x2: 250, y: G - LAYER_GAP }, { x1: W - 270, x2: W - 130, y: G - LAYER_GAP }, { x1: W / 2 - 80, x2: W / 2 + 80, y: G - LAYER_GAP * 2 });
    } else {
      for (let li = 1; li <= 3; li++) {
        const y = G - LAYER_GAP * li;
        let x = 110 + r() * 90 + (li % 2) * 40;
        while (x < W - 200) {
          const w = 130 + r() * 150;
          if (x + w > W - 110) break;
          const below = plats.filter((p) => p.y > y && !(p.x2 < x || p.x1 > x + w));
          if (r() < 0.86 - li * 0.14 && below.length) plats.push({ x1: Math.round(x), x2: Math.round(x + w), y, layer: li });
          x += w + 46 + r() * 110;
        }
      }
    }
    plats.forEach((pl) => {
      if (pl.ground) return;
      let rx = pl.x1 + 20 + r() * (pl.x2 - pl.x1 - 40);
      let below = surfaceBelow(plats, rx, pl.y);
      for (let k = 0; k < 6 && !below; k++) { rx = pl.x1 + 20 + r() * (pl.x2 - pl.x1 - 40); below = surfaceBelow(plats, rx, pl.y); }
      if (below) ropes.push({ x: Math.round(rx), y1: pl.y - 10, y2: below.y, ladder: theme.rope === "ladder" || r() < 0.18, top: pl });
    });
    const map = {
      id: "floor" + n, kind: boss ? "boss" : "floor", floor: n, seed: n * 13 + 7, theme, name: floorName(n), ceiling: true,
      W, H, groundY: G, plats, ropes, deco: [],
      doors: [{ kind: "up", x: 46, y: G }, { kind: "down", x: W - 52, y: G, locked: boss }],
      spawns: [], boss: boss ? F.engine.pickMonster(n, true) : null, spawnX: 84
    };
    map.deco.push({ kind: "up", x: 46, y: G, sink: 2 }, { kind: "down", x: W - 52, y: G, sink: 2 });
    for (let x = 104; x < W - 100; x += 230 + r() * 80) map.deco.push({ kind: "torch", x: Math.round(x), y: G });
    map.deco.push({ kind: "torch", x: W - 112, y: G });
    /* 이 층에 사는 몬스터 2~3종 */
    const tier = F.engine.floorTier(n);
    const pool = F.engine.MONSTERS.filter((m) => m.tier === tier && !m.boss);
    const kinds = [];
    const want = 2 + (r() < 0.5 ? 1 : 0);
    while (kinds.length < want && kinds.length < pool.length) {
      const m = pool[Math.floor(r() * pool.length)];
      if (!kinds.includes(m)) kinds.push(m);
    }
    map.pool = kinds;
    if (!boss) {
      plats.forEach((pl, pi) => {
        const span = pl.x2 - pl.x1;
        const count = pl.ground ? Math.floor((W - 300) / 150) : Math.floor(span / 110);
        for (let i = 0; i < count; i++) {
          const x = pl.ground ? 170 + ((i + 0.5) / count) * (W - 340) : pl.x1 + ((i + 0.5) / count) * span;
          map.spawns.push({ x: Math.round(x + (r() - 0.5) * 30), plat: pi, mon: kinds[Math.floor(r() * kinds.length)] });
        }
      });
    } else {
      map.spawns.push({ x: Math.round(W * 0.62), plat: 0, mon: map.boss, boss: true });
    }
    scatterDeco(map, r, [[0, 130], [W - 140, W]]);
    return map;
  }

  /* 마을: 상점·여관·길드, 운명의 석판, 오른쪽 끝 던전 입구 */
  function makeTown() {
    const W = 1000;
    const H = MAP_H;
    const G = H - GROUND_DEPTH;
    const plats = [{ x1: 0, x2: W, y: G, ground: true }, { x1: 640, x2: 760, y: G - LAYER_GAP }];
    const ropes = [{ x: 660, y1: G - LAYER_GAP - 10, y2: G, ladder: true, top: plats[1] }];
    const deco = [
      { kind: "tree", v: 0, x: 22, y: G }, { kind: "tree", v: 2, x: 980, y: G, flip: true },
      { kind: "shop", x: 150, y: G, sink: 2 }, { kind: "inn", x: 330, y: G, sink: 2 }, { kind: "guild", x: 540, y: G, sink: 2 },
      { kind: "cave", x: 862, y: G, sink: 2 },
      { kind: "lamp", x: 52, y: G }, { kind: "lamp", x: 240, y: G }, { kind: "lamp", x: 628, y: G }, { kind: "lamp", x: 770, y: G },
      { kind: "fence", x: 700, y: G }, { kind: "bush", v: 1, x: 418, y: G }, { kind: "bush", v: 0, x: 730, y: G - LAYER_GAP },
      { kind: "tablet", x: 436, y: G }, { kind: "sign", x: 776, y: G - LAYER_GAP }
    ];
    return {
      id: "town", kind: "town", floor: 0, seed: 3, theme: TOWN_THEME, name: TOWN_THEME.name, W, H, groundY: G, plats, ropes, deco,
      doors: [
        { kind: "shop", x: 150, y: G, label: "상점" }, { kind: "inn", x: 330, y: G, label: "여관" }, { kind: "guild", x: 540, y: G, label: "모험가 길드" },
        { kind: "tablet", x: 436, y: G, label: "운명의 석판" }, { kind: "cave", x: 862, y: G, label: "던전 입구" }
      ],
      spawns: [], pool: [], spawnX: 436
    };
  }

  F.world = {
    MAP_H, LAYER_GAP, THEMES, TOWN_THEME, rng, hash, mixHex, floorName, floorThemeIndex, makeFloor, makeTown, renderMap, drawBackground,
    drawFlame, drawSeal, surfaceBelow, propCanvas, building, fateTablet, lamp, tree, cloud, BUILDINGS
  };
})(typeof window !== "undefined" ? window : globalThis);
