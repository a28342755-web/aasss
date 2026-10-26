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

  /* ── 밤의 지역: 10층마다 바뀐다(참고: 마법사의 밤) ──
     sky 하늘 세 단, moon 달, far·near 먼 산·가까운 산, row 지평선 실루엣 줄(posts 말뚝, pines 전나무, crosses 묘비, spires 첨탑),
     castle 먼 성(0 없음, 1 성 하나, 2 무너진 탑들), ridge 산 모양, ground 땅(body 몸, top·top2 윗면 두 줄, speck 점), plants 작은 마법 풀,
     tint 소품을 밤빛으로 덮는 색 */
  const THEMES = [
    {
      name: "별빛 숲", sky: ["#101126", "#202047", "#35274d"], moon: ["#d4d1ff", "#c2c3ed", "#989ac9"], stars: ["#d4d4ff", "#a9b2ed"],
      far: "#272743", near: "#1d2039", sil: "#191a31", row: "pines", castle: 1, ridge: "zig",
      ground: { body: "#201a32", deep: "#181428", top: "#514064", top2: "#352843", speck: ["#7c5f82", "#554166"], line: "#0e0a18" },
      plants: ["#437a80", "#75c6bd", "#7f83dc"], stone: ["#3a3456", "#5a5280", "#8a82b0"], crystals: ["#75c6bd", "#7f83dc", "#a58dff"],
      rope: "vine", props: ["tree", "bush", "mushroom", "rock", "bush"], tint: "rgba(18,16,52,0.5)", ambient: "firefly", glint: "#a58dff"
    },
    {
      name: "달빛 언덕", sky: ["#0c1428", "#1a2a50", "#2c3e66"], moon: ["#eef2ff", "#dfe6ff", "#a8b4dc"], stars: ["#e0e8ff", "#a8bce8"],
      far: "#243457", near: "#1a2642", sil: "#141d33", row: "posts", castle: 0, ridge: "round",
      ground: { body: "#1b2034", deep: "#141828", top: "#4f6488", top2: "#2e3a56", speck: ["#7a90b8", "#3e4c6c"], line: "#0a0e1a" },
      plants: ["#3f6e7a", "#8fd8e8", "#c8d4ff"], stone: ["#34405c", "#566488", "#8a98b8"], crystals: ["#8fd8e8", "#c8d4ff", "#7f9bff"],
      rope: "rope", props: ["rock", "bush", "fence", "tree", "sign"], tint: "rgba(14,22,52,0.5)", ambient: "dust", glint: "#c8d4ff"
    },
    {
      name: "폐성 외곽", sky: ["#140b20", "#2a1636", "#4a2240"], moon: ["#ffe0d0", "#f4c8b8", "#c08a8a"], stars: ["#ffd8e8", "#c8a8d8"],
      far: "#2e1c3a", near: "#211530", sil: "#170f22", row: "crosses", castle: 2, ridge: "zig",
      ground: { body: "#22172a", deep: "#1a1020", top: "#5e3f5e", top2: "#3a2840", speck: ["#8a5a78", "#4e3550"], line: "#100812" },
      plants: ["#5a3a5a", "#ff8ab8", "#b88aff"], stone: ["#3e3046", "#62506e", "#968aa6"], crystals: ["#ff8ab8", "#b88aff", "#ffb0d8"],
      rope: "chain", props: ["tomb", "candles", "column", "deadtree", "tomb"], tint: "rgba(30,12,40,0.5)", ambient: "wisp", glint: "#ff8ab8"
    },
    {
      name: "서리 고원", sky: ["#08121f", "#142a46", "#1f3858"], moon: ["#f4faff", "#e4f2ff", "#a8c4e0"], stars: ["#ffffff", "#bfe0ff"],
      far: "#2a4468", near: "#18283f", sil: "#111c32", row: "pines", castle: 0, ridge: "peaks", snow: "#9ab4d4",
      ground: { body: "#1a2236", deep: "#131a2a", top: "#a8c8e8", top2: "#5a7aa0", speck: ["#d0e4f8", "#3a4c6c"], line: "#0a101c" },
      plants: ["#3a6a8a", "#bff0ff", "#8ab8ff"], stone: ["#3a4c6a", "#6a84a8", "#a8c0dc"], crystals: ["#bff0ff", "#8ab8ff", "#e0f4ff"],
      rope: "ladder", props: ["rock", "deadtree", "crystal", "rock"], tint: "rgba(14,28,56,0.45)", ambient: "snow", glint: "#bff0ff"
    },
    {
      name: "심연의 밤", sky: ["#06030c", "#170a28", "#34103e"], moon: ["#ff9ab8", "#f07aa0", "#a8406a"], stars: ["#ffb8e0", "#b88aff"],
      far: "#22102e", near: "#180a24", sil: "#10061a", row: "spires", castle: 2, ridge: "spikes",
      ground: { body: "#150a1e", deep: "#0e0616", top: "#6a2e86", top2: "#3a1650", speck: ["#b05ad0", "#4a2060"], line: "#08030c" },
      plants: ["#4a1e5e", "#ff6ad8", "#8ae8ff"], stone: ["#2e2040", "#4e3a6a", "#7e6a9e"], crystals: ["#ff6ad8", "#8ae8ff", "#b46aff"],
      rope: "chain", props: ["crystal", "deadtree", "crystal", "rock"], tint: "rgba(24,6,40,0.5)", ambient: "ember", glint: "#ff6ad8"
    }
  ];
  /* 마을도 밤: 등불과 창문이 밝다 */
  const TOWN_THEME = Object.assign({}, THEMES[0], {
    name: "운명의 마을", row: "posts", castle: 1, props: [], tint: "rgba(20,16,52,0.38)", ambient: "firefly", rope: "ladder"
  });

  function floorThemeIndex(n) {
    return Math.floor((Math.max(1, n) - 1) / 10) % THEMES.length;
  }
  function floorName(n) {
    if (n <= 0) return TOWN_THEME.name;
    return `${n}층 · ${THEMES[floorThemeIndex(n)].name}${n % 10 === 0 ? " · 보스" : ""}`;
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
  /* 층과 층 사이의 문: 돌기둥 두 개와 아치, 안쪽은 어둠 속에 은은한 빛(돌아가는 문은 푸른빛, 나아가는 문은 보랏빛) */
  function gate(down, th, z) {
    return painted(`gate${down ? "d" : "u"}${th.name}`, 76, 104, z, (P) => {
      const glow = down ? "#b88aff" : "#8ae8ff";
      P.use(th.stone[0]); P.poly([[4, 103], [22, 103], [20, 40], [6, 40]]); P.poly([[54, 103], [72, 103], [70, 40], [56, 40]]);
      P.use(th.stone[0]); P.ellipse(38, 42, 36, 32, (x, y) => y < 44);
      P.use("#06040e", { edge: 0 }); P.ellipse(38, 46, 20, 22, (x, y) => y < 46); P.poly([[18, 46], [58, 46], [58, 103], [18, 103]]);
      P.use(mixHex(glow, "#06040e", 0.72), { edge: 0 }); P.ellipse(38, 74, 14, 26);
      P.use(mixHex(glow, "#06040e", 0.45), { edge: 0 }); P.ellipse(38, 80, 8, 18);
      P.use(th.stone[1], { edge: 0 }); P.poly([[8, 100], [18, 100], [17, 44], [9, 44]]); P.poly([[58, 100], [68, 100], [67, 44], [59, 44]]);
      P.use(th.stone[2], { edge: 0 }); P.capsule(10, 98, 10, 46, 0.8); P.capsule(60, 98, 60, 46, 0.8);
      /* 아치 머릿돌의 룬 */
      P.use(th.stone[1], { edge: 0 }); P.poly([[31, 8], [45, 8], [43, 18], [33, 18]]);
      P.dot(38, 12, glow).dot(37, 13, glow).dot(39, 13, glow).dot(38, 14, glow);
      for (let i = 0; i < 4; i++) P.dot(26 + i * 8, 26 - Math.abs(i - 1.5) * 2, glow);
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
      case "up": return gate(false, th, z);
      case "down": return gate(true, th, z);
      case "cave": return gate(true, th, z);
      case "shop": case "inn": case "guild": return building(kind, z);
      default: return null;
    }
  }

  /* ─────────── 지형 칠하기 ─────────── */
  /* 참고(마법사의 밤)의 땅: 보랏빛 몸, 위로 밝은 줄 두 개, 드문드문 점, 작은 마법 풀.
     떠 있는 발판은 같은 윗면에 아래가 들쭉날쭉 깎인 바위. 크기는 참고 그림의 한 칸을 E()로 바꾼다 */
  function paintTerrain(map, z, lightsOut) {
    const W = Math.ceil(map.W * z);
    const H = Math.ceil(map.H * z);
    const cv = canvas(W, H);
    const g = cv.getContext("2d");
    const img = g.createImageData(W, H);
    const buf = new Uint32Array(img.data.buffer);
    const th = map.theme;
    const gr = th.ground;
    const E = (n) => Math.max(1, Math.round((n * z) / 2));
    const body = u32(gr.body);
    const deep = u32(gr.deep);
    const top = u32(gr.top);
    const top2 = u32(gr.top2);
    const sp = gr.speck.map((c) => u32(c));
    const line = u32(gr.line);
    const pl3 = th.plants.map((c) => u32(c));
    const N = (hex) => u32(mixHex(hex, "#16143a", 0.38));
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c; };
    const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? buf[y * W + x] : 0);
    const rect = (x, y, w, h, c) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, c); };

    map.plats.forEach((pl, pi) => {
      const seed = map.seed * 31 + pi * 977;
      const x1 = Math.round(pl.x1 * z);
      const x2 = Math.round(pl.x2 * z);
      const y0 = Math.round(pl.y * z);
      const span = Math.max(1, x2 - x1);
      if (pl.ground) {
        rect(x1, y0, span, H - y0, body);
        /* 아래쪽은 한 단 어두운 띠 */
        rect(x1, y0 + E(64), span, H - y0 - E(64), deep);
        rect(x1, y0 + E(64), span, E(2), line);
      } else {
        /* 떠 있는 바위: 윗면은 평평, 아랫면은 가운데가 두껍고 들쭉날쭉 */
        const thick = E(34 + hash(pi, 1, seed) * 14);
        for (let x = x1; x < x2; x++) {
          const u = Math.abs(((x - x1) / span) * 2 - 1);
          const jag = Math.floor(hash(Math.floor(x / E(5)), 2, seed) * 3) * E(3);
          const d = Math.max(E(8), Math.round(thick * (1 - Math.pow(u, 1.8) * 0.75)) - jag);
          for (let k = 0; k < d; k++) set(x, y0 + k, k > d - E(6) ? deep : body);
          set(x, y0 + d, line);
        }
        for (let k = 0; k < thick; k++) {
          if (get(x1, y0 + k)) set(x1 - 1, y0 + k, line);
          if (get(x2 - 1, y0 + k)) set(x2, y0 + k, line);
        }
      }
      /* 점: 참고처럼 31칸마다 한 쌍 */
      for (let x = x1 + E(11); x < x2 - E(4); x += E(31)) {
        const k = Math.round(x / z);
        const ya = y0 + E(12 + (k % 13));
        const yb = y0 + E(25 + (k % 17));
        if (get(x, ya) === body || pl.ground) rect(x, ya, E(2), E(2), sp[0]);
        if (get(x + E(13), yb) === body || pl.ground) rect(x + E(13), yb, E(3), E(1), sp[1]);
      }
      /* 윗면 두 줄 */
      rect(x1, y0, span, E(4), top);
      rect(x1, y0 + E(4), span, E(2), top2);
      rect(x1, y0 - 1, span, 1, line);
      if (!pl.ground) { rect(x1 - 1, y0 - 1, 1, E(6) + 1, line); rect(x2, y0 - 1, 1, E(6) + 1, line); }
      /* 작은 마법 풀: 줄기 하나와 잎 두 장. 몇 개는 빛난다 */
      let n = 0;
      for (let x = x1 + E(18) + Math.round(hash(pi, 7, seed) * E(30)); x < x2 - E(10); x += E(67) + Math.round(hash(x, 8, seed) * E(30))) {
        rect(x, y0 - E(7), E(2), E(7), pl3[0]);
        rect(x - E(3), y0 - E(9), E(3), E(3), pl3[1]);
        rect(x + E(2), y0 - E(11), E(3), E(3), pl3[2]);
        if (lightsOut && n++ % 3 === 1) lightsOut.push({ x: (x + E(1)) / z, y: (y0 - E(10)) / z, col: th.plants[1 + (n % 2)], r: 16, flame: false, seed: x });
      }
    });

    /* 밧줄·사슬·덩굴·사다리 */
    map.ropes.forEach((rp) => {
      const cx = Math.round(rp.x * z);
      const yA = Math.round(rp.y1 * z);
      const yB = Math.round(rp.y2 * z);
      const style = rp.ladder ? "ladder" : th.rope || "rope";
      if (style === "ladder") {
        const half = Math.round(6 * z);
        const rail = Math.max(2, Math.round(1.6 * z));
        const wood = [N("#5a3a24"), N("#8a5e3a"), N("#b8875a")];
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
        const ch = [N("#2a2a36"), N("#6a6a80"), N("#a8a8c0")];
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
        const vine = [N("#123a20"), N("#2a6a3c"), N("#58a84e"), N("#8ad06a")];
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
        const rope = [N("#5a3a22"), N("#a0764a"), N("#d6aa74")];
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
    candles: { dy: 20, col: "#ffc860", r: 34, flame: true }, tablet: { dy: 40, col: "#8ae8ff", r: 50 },
    up: { dy: 34, col: "#8ae8ff", r: 44 }, down: { dy: 34, col: "#b88aff", r: 44 }, cave: { dy: 34, col: "#b88aff", r: 52 }
  };

  /* 정적인 그림 한 장: 소품(뒤) → 지형(앞). 나무 밑동·바위 뿌리는 지형 테두리에 자연스럽게 가린다 */
  function renderMap(map, z) {
    const key = `${map.id}@${z}`;
    if (map._cv && map._cvKey === key) return map._cv;
    const out = canvas(map.W * z, map.H * z);
    const props = canvas(map.W * z, map.H * z);
    const g = props.getContext("2d");
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
    /* 소품을 밤빛으로 덮는다(빛나는 것은 따로 빛 번짐을 그린다) */
    if (map.theme.tint) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = map.theme.tint;
      g.fillRect(0, 0, props.width, props.height);
    }
    const og = out.getContext("2d");
    og.drawImage(props, 0, 0);
    const plantLights = [];
    og.drawImage(paintTerrain(map, z, plantLights), 0, 0);
    map._cv = out;
    map._cvKey = key;
    map.lights = lights.concat(plantLights, map.extraLights || []);
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

  /* ─────────── 배경(참고: 마법사의 밤) ───────────
     밤하늘 세 단 → 반짝이는 별 → 달과 달빛 → 먼 산(성 실루엣) → 가까운 산 → 지평선 실루엣 줄.
     산과 실루엣 줄은 가로로 이어 붙는 띠로 한 번 그려 두고 시차를 두어 움직인다 */
  const BAND = 640;
  function ridgeStrip(th, z, which) {
    return cached(`nridge${th.name}${which}@${z}`, () => {
      const W = Math.round(BAND * z);
      const H = Math.round((which ? 120 : 170) * z);
      const cv = canvas(W, H);
      const g = cv.getContext("2d");
      const r = rng(th.name.length * 131 + which * 17 + 5);
      /* 꼭짓점: 높낮이를 번갈아, 끝은 처음과 같은 높이(이어 붙임) */
      const pts = [];
      let x = 0;
      let up = true;
      const lo = which ? 0.25 : 0.32;
      const hi = which ? 0.68 : 0.92;
      while (x < BAND) {
        const t = up ? hi - r() * (hi - lo) * 0.35 : lo + r() * (hi - lo) * 0.3;
        pts.push([x, t]);
        x += (th.ridge === "spikes" ? 30 : th.ridge === "peaks" ? 64 : 52) + r() * 34;
        up = !up;
      }
      pts.push([BAND, pts[0][1]]);
      g.fillStyle = which ? th.near : th.far;
      g.beginPath();
      g.moveTo(0, H);
      if (th.ridge === "round") {
        g.lineTo(0, H * (1 - pts[0][1]));
        for (let i = 1; i < pts.length; i++) {
          const [xa, ya] = pts[i - 1];
          const [xb, yb] = pts[i];
          g.quadraticCurveTo(((xa + xb) / 2) * z, H * (1 - Math.max(ya, yb) * 1.05), xb * z, H * (1 - yb));
        }
      } else pts.forEach(([px, py]) => g.lineTo(px * z, H * (1 - py)));
      g.lineTo(W, H);
      g.closePath();
      g.fill();
      /* 눈 덮인 봉우리 */
      if (th.snow && !which) {
        g.fillStyle = th.snow;
        for (let i = 0; i < pts.length - 1; i++) {
          const [px, py] = pts[i];
          if (py < 0.7) continue;
          const [qx, qy] = pts[i + 1];
          const [ox, oy] = pts[Math.max(0, i - 1)];
          const k = 0.14;
          g.beginPath();
          g.moveTo(px * z, H * (1 - py));
          g.lineTo((px + (qx - px) * k) * z, H * (1 - (py + (qy - py) * k)));
          g.lineTo((px + (qx - px) * k * 0.5) * z, H * (1 - (py + (qy - py) * k)) + 3 * z);
          g.lineTo((px + (ox - px) * k * 0.5) * z, H * (1 - (py + (oy - py) * k)) + 3 * z);
          g.lineTo((px + (ox - px) * k) * z, H * (1 - (py + (oy - py) * k)));
          g.closePath();
          g.fill();
        }
      }
      /* 먼 성 */
      if (!which && th.castle) {
        g.fillStyle = th.sil;
        const R = (x, y, w, h) => g.fillRect(Math.round(x * z), Math.round(H - y * z), Math.round(w * z), Math.round(h * z));
        const castle = (cx, s, ruined) => {
          const towers = [[-26, 46, 8], [-14, 64, 10], [0, 84, 12], [16, 60, 10], [28, 40, 8]];
          towers.forEach(([dx, hgt, w], i) => {
            const hh = (ruined && i % 2 ? hgt * 0.55 : hgt) * s;
            R(cx + dx * s - (w * s) / 2, hh, w * s, hh);
            R(cx + dx * s - (w * s) / 2 - 2 * s, hh + 2 * s, w * s + 4 * s, 4 * s);
            if (!ruined || i % 2 === 0) for (let k = 0; k < 3; k++) R(cx + dx * s - (w * s) / 2 - 2 * s + k * ((w + 2) * s) / 2, hh + 5 * s, 2 * s, 3 * s);
          });
          R(cx - 30 * s, 26 * s, 60 * s, 26 * s);
        };
        if (th.castle === 1) castle(BAND * 0.62, 0.9, false);
        else { castle(BAND * 0.22, 0.7, true); castle(BAND * 0.7, 0.85, true); }
      }
      return cv;
    });
  }
  /* 지평선 실루엣 줄: 말뚝(참고와 같은 모양), 전나무, 묘비, 첨탑 */
  function rowStrip(th, z) {
    return cached(`nrow${th.name}@${z}`, () => {
      const W = Math.round(BAND * z);
      const H = Math.round(48 * z);
      const cv = canvas(W, H);
      const g = cv.getContext("2d");
      g.fillStyle = th.sil;
      const R = (x, y, w, h) => g.fillRect(Math.round(x * z), Math.round(H - y * z), Math.max(1, Math.round(w * z)), Math.max(1, Math.round(h * z)));
      for (let x = 0; x < BAND; x += 17) {
        const h = 7 + ((x * 17) % 23) / 2;
        switch (th.row) {
          case "pines": {
            if ((x / 17) % 3 === 2) break;
            const hh = h * 2.2;
            for (let k = 0; k < hh; k += 2) { const w = Math.max(1, (hh - k) * 0.42); R(x + 4 - w / 2, k + 2, w, 2); }
            R(x + 3.5, 3, 1.5, 3);
            break;
          }
          case "crosses":
            R(x + 2, h, 3.5, h); R(x, h - 2, 7.5, 1.5);
            if ((x / 17) % 2) R(x + 9, 5, 5, 5);
            break;
          case "spires": { const hh = h * 2; for (let k = 0; k < hh; k += 1.5) { const w = Math.max(0.6, (hh - k) * 0.22); R(x + 4 - w / 2, k + 1.5, w, 1.5); } break; }
          default:
            /* 참고의 말뚝: 기둥, 가로대, 꼭대기 침 */
            R(x, h, 3.5, h); R(x - 2, h, 7.5, 1.5); R(x + 1.5, h + 2.5, 0.5, 3);
        }
      }
      return cv;
    });
  }
  /* 픽셀 달: 둥근 네모와 그늘 몇 칸(참고처럼) */
  function moonCanvas(th, z) {
    return cached(`nmoon${th.name}@${z}`, () => {
      const s = Math.max(1, Math.round(z / 2));
      const N = 14;
      const cv = canvas(N * 2 * s, N * 2 * s);
      const g = cv.getContext("2d");
      const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x * 2 * s, y * 2 * s, 2 * s, 2 * s); };
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x - (N - 1) / 2;
        const dy = y - (N - 1) / 2;
        if (dx * dx + dy * dy > (N / 2) * (N / 2) - 1) continue;
        px(x, y, th.moon[1]);
      }
      [[3, 4], [4, 4], [8, 7], [9, 7], [9, 8], [5, 9], [10, 3]].forEach(([x, y]) => px(x, y, th.moon[2]));
      [[3, 2], [2, 3], [2, 4]].forEach(([x, y]) => px(x, y, th.moon[0]));
      return cv;
    });
  }
  const STARS = [];
  for (let i = 0; i < 90; i++) STARS.push({ x: ((i * 83 + 23) % 640) / 640, y: ((i * 47 + 13) % 190) / 190, s: i % 7 === 0 ? 2 : 1, p: (i * 2.39) % 6.28 });

  /* 화면 좌표계에서 배경을 그린다. camX/camY는 화면 왼쪽 위의 월드 픽셀 좌표 */
  function drawBackground(ctx, map, z, camX, camY, VW, VH, t) {
    const th = map.theme;
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, th.sky[0]);
    grad.addColorStop(0.58, th.sky[1]);
    grad.addColorStop(1, th.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);
    const groundY = map.groundY * z - camY;
    /* 별 */
    const sw = VW + 40;
    const skyH = Math.max(VH * 0.55, groundY - 120 * z);
    STARS.forEach((st) => {
      const x = ((st.x * sw - camX * 0.03) % sw + sw) % sw - 20;
      const y = st.y * skyH - camY * 0.02;
      const tw = 0.45 + 0.55 * Math.sin(t * 0.0017 + st.p);
      const sz = Math.max(1, Math.round((st.s * z) / 2));
      ctx.globalAlpha = Math.max(0, tw);
      ctx.fillStyle = th.stars[st.s === 2 ? 0 : 1];
      ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
      if (st.s === 2) { ctx.globalAlpha = tw * 0.45; ctx.fillRect(Math.round(x - sz), Math.round(y + sz / 2), sz * 3, Math.max(1, Math.round(sz / 2))); }
    });
    ctx.globalAlpha = 1;
    /* 달 */
    const mx = VW * 0.78 - camX * 0.02;
    const my = Math.min(VH * 0.19, groundY - 150 * z) - camY * 0.02;
    const R = 62 * (z / 2);
    const gl = ctx.createRadialGradient(mx, my, 3, mx, my, R);
    gl.addColorStop(0, th.moon[0]);
    gl.addColorStop(0.14, mixHex(th.moon[0], th.sky[1], 0.25));
    gl.addColorStop(1, th.moon[0] + "00");
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = gl;
    ctx.fillRect(mx - R, my - R, R * 2, R * 2);
    ctx.globalAlpha = 1;
    const mc = moonCanvas(th, z);
    ctx.drawImage(mc, Math.round(mx - mc.width / 2), Math.round(my - mc.height / 2));
    /* 산 두 겹과 실루엣 줄 */
    const layers = [[ridgeStrip(th, z, 0), 0.12, 0.35, th.far], [ridgeStrip(th, z, 1), 0.3, 0.62, th.near]];
    layers.forEach(([strip, sx, sy, col], li) => {
      const bottom = Math.round(VH * (0.84 - li * 0.06) * (1 - sy) + (groundY - 10 * z) * sy);
      const x0 = -(((camX * sx) % strip.width) + strip.width) % strip.width;
      for (let x = x0; x < VW; x += strip.width) ctx.drawImage(strip, Math.round(x), bottom - strip.height);
      ctx.fillStyle = col;
      if (bottom < VH) ctx.fillRect(0, bottom, VW, VH - bottom);
    });
    const row = rowStrip(th, z);
    const rb = Math.round(groundY - 2 * z + (VH * 0.8 - groundY) * 0.15);
    const rx0 = -(((camX * 0.55) % row.width) + row.width) % row.width;
    for (let x = rx0; x < VW; x += row.width) ctx.drawImage(row, Math.round(x), rb - row.height);
    ctx.fillStyle = th.sil;
    if (rb < VH) ctx.fillRect(0, rb, VW, VH - rb);
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

  /* n층: 땅 위로 2~3단 떠 있는 바위 발판, 발판마다 아래로 내려가는 밧줄(사슬·덩굴·사다리).
     왼쪽 끝은 돌아가는 문, 오른쪽 끝은 다음 층으로 가는 문. 10층마다 보스가 문을 봉인한다 */
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
      id: "floor" + n, kind: boss ? "boss" : "floor", floor: n, seed: n * 13 + 7, theme, name: floorName(n),
      W, H, groundY: G, plats, ropes, deco: [],
      doors: [{ kind: "up", x: 46, y: G }, { kind: "down", x: W - 52, y: G, locked: boss }],
      spawns: [], boss: boss ? F.engine.pickMonster(n, true) : null, spawnX: 84
    };
    map.deco.push({ kind: "up", x: 46, y: G, sink: 2 }, { kind: "down", x: W - 52, y: G, sink: 2 });
    for (let x = 160; x < W - 140; x += 300 + r() * 120) map.deco.push({ kind: "lamp", x: Math.round(x), y: G });
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
    drawFlame, drawSeal, surfaceBelow, propCanvas, building, fateTablet, lamp, tree, gate, ridgeStrip, rowStrip, moonCanvas, BUILDINGS
  };
})(typeof window !== "undefined" ? window : globalThis);
