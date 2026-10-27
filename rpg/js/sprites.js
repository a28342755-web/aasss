/*
 * 삼천의 운명 — 도트 스프라이트
 *
 * 모든 그림은 이 파일 안의 문자 격자로 그린다(외부 이미지 없음).
 * 템플릿은 외곽선 없이 그리고, 합성한 뒤 자동으로 1px 외곽선을 두른다.
 * 직업 3,000개는 몸통 + 옷 색 + 모자 + 들고 있는 물건 + 종족 특징을 조합해 저마다 다른 모습이 된다.
 */
(function (root) {
  "use strict";
  const F = (root.FATES = root.FATES || {});

  /* ── 팔레트 (Endesga 32) ── */
  const C = {
    rust: "#be4a2f", tan: "#d77643", sand: "#ead4aa", skin1: "#e4a672", leather: "#b86f50", brown: "#733e39",
    dbrown: "#3e2731", dred: "#a22633", red: "#e43b44", orange: "#f77622", gold: "#feae34", yellow: "#fee761",
    green: "#63c74d", dgreen: "#3e8948", ddgreen: "#265c42", teal: "#193c3e", blue: "#124e89", lblue: "#0099db",
    cyan: "#2ce8f5", white: "#ffffff", lgrey: "#c0cbdc", grey: "#8b9bb4", dgrey: "#5a6988", slate: "#3a4466",
    navy: "#262b44", black: "#181425", hot: "#ff0044", purple: "#68386c", magenta: "#b55088", pink: "#f6757a",
    skinL: "#e8b796", skinM: "#c28569"
  };
  const OUTLINE = "#181425";

  const EL_COLOR = {
    phys: C.lgrey, fire: C.orange, ice: C.cyan, bolt: C.yellow, earth: C.leather,
    wind: C.green, light: C.yellow, dark: C.magenta, nature: C.green, arcane: C.pink
  };
  const RARITY_COLOR = [C.lgrey, C.green, C.lblue, C.magenta, C.gold, C.hot];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  }
  /* 그림자색: 어둡게 하면서 살짝 푸른 쪽으로 */
  function shade(hex, k) {
    const [r, g, b] = hexToRgb(hex);
    const f = k || 0.68;
    return rgbToHex(r * f, g * f, b * f + 18 * (1 - f));
  }
  function light(hex, k) {
    const [r, g, b] = hexToRgb(hex);
    const f = k || 0.4;
    return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  const pick = (list, h, salt) => list[(h >>> (salt || 0)) % list.length];

  /* ── 픽셀 버퍼 ── */
  function Pix(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Array(w * h).fill(null);
  }
  Pix.prototype.set = function (x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  };
  Pix.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.d[y * this.w + x];
  };

  function mirror(rows) {
    return rows.map((r) => r + r.split("").reverse().join(""));
  }

  /* 회전·뒤집기 */
  function rotCCW(rows) {
    const h = rows.length;
    const w = rows[0].length;
    const out = [];
    for (let x = w - 1; x >= 0; x--) {
      let line = "";
      for (let y = 0; y < h; y++) line += rows[y][x] || ".";
      out.push(line);
    }
    return out;
  }
  function flipV(rows) {
    return rows.slice().reverse();
  }

  /* 격자를 버퍼에 찍는다. pal[ch]가 없거나 '.'이면 건너뛴다. */
  function stamp(pix, rows, x0, y0, pal, flip) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === "." || ch === " ") continue;
        const color = pal[ch];
        if (!color) continue;
        const px = flip ? x0 + (row.length - 1 - x) : x0 + x;
        pix.set(px, y0 + y, color);
      }
    }
  }

  function patchRuns(pix, runs, pal, ox, oy) {
    (runs || []).forEach(([x, y, s]) => stamp(pix, [s], ox + x, oy + y, pal));
  }

  function outline(pix, color) {
    const out = new Pix(pix.w, pix.h);
    out.d = pix.d.slice();
    for (let y = 0; y < pix.h; y++) {
      for (let x = 0; x < pix.w; x++) {
        if (pix.get(x, y)) continue;
        if (pix.get(x - 1, y) || pix.get(x + 1, y) || pix.get(x, y - 1) || pix.get(x, y + 1)) {
          out.set(x, y, color || OUTLINE);
        }
      }
    }
    return out;
  }

  function makeCanvas(w, h) {
    const c = root.document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  const rgbCache = {};
  function toCanvas(pix, alpha) {
    const cv = makeCanvas(pix.w, pix.h);
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(pix.w, pix.h);
    const a = Math.round((alpha === undefined ? 1 : alpha) * 255);
    for (let i = 0; i < pix.d.length; i++) {
      const c = pix.d[i];
      if (!c) continue;
      const rgb = rgbCache[c] || (rgbCache[c] = hexToRgb(c));
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* 흰색 실루엣 (피격 깜빡임용) */
  /* 같은 그림·색이면 다시 만들지 않는다(피격 번쩍임은 매 프레임 그린다) */
  const silCache = new WeakMap();
  function silhouette(cv, color) {
    let byColor = silCache.get(cv);
    if (!byColor) { byColor = new Map(); silCache.set(cv, byColor); }
    const hit = byColor.get(color || "#ffffff");
    if (hit) return hit;
    const out = makeCanvas(cv.width, cv.height);
    const ctx = out.getContext("2d");
    ctx.drawImage(cv, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color || "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    byColor.set(color || "#ffffff", out);
    return out;
  }

  /* ─────────────────────────── 주인공 ─────────────────────────── */

  /* 머리 12×9: 앞·뒤·옆(왼쪽을 봄) */
  const HEAD = {
    front: [
      "...hhhhhh...",
      ".hhhhhhhhhh.",
      "hhhhhhhhhhhh",
      "hhhsshhsshhh",
      "hssssssssssh",
      "hssesssseSsh",
      "hssesssseSsh",
      ".ssssssssss.",
      "..SssssssS.."
    ],
    back: [
      "...hhhhhh...",
      ".hhhhhhhhhh.",
      "hhhhhhhhhhhh",
      "hhhhhhhhhhhh",
      "hhhhhhhhhhhh",
      "hhhhhhhhhhhh",
      "hhhhhhhhhhhh",
      ".HhhhhhhhhH.",
      "..HHHHHHHH.."
    ],
    side: [
      "...hhhhhh...",
      ".hhhhhhhhhh.",
      "hhhhhhhhhhhh",
      "hhsshhhhhhhh",
      "hsssssshhhhh",
      "hsesssSShhhh",
      "ssesssSShhhH",
      ".ssssssshhH.",
      "..sssssHH..."
    ]
  };
  // 얼굴 쪽 눈 하이라이트를 위해 앞모습 눈 오른쪽은 살짝 밝힌다(SKIN 그림자 대신 흰색 사용 X)
  HEAD.front[5] = "hssesssseSsh".replace("eSs", "ess");
  HEAD.front[6] = HEAD.front[5];

  /* 몸통: 머리 원점은 (2,1). 행은 10부터 시작 */
  const BODY = {
    down: [
      [
        "....aaaaaaaa....",
        "...sAaaaaaaAs...",
        "...SccccccccS...",
        "....bbbbbbbb....",
        "....bbb..bbb....",
        "....fff..fff...."
      ],
      [
        "....aaaaaaaa....",
        "...sAaaaaaaAs...",
        "...SccccccccS...",
        "....bbbbbbbb....",
        "....bbb..fff....",
        "....fff........."
      ]
    ],
    up: [
      [
        "....aaaaaaaa....",
        "...sAaaaaaaAs...",
        "...SccccccccS...",
        "....bbbbbbbb....",
        "....bbb..bbb....",
        "....fff..fff...."
      ],
      [
        "....aaaaaaaa....",
        "...sAaaaaaaAs...",
        "...SccccccccS...",
        "....bbbbbbbb....",
        "....fff..bbb....",
        ".........fff...."
      ]
    ],
    side: [
      [
        ".....aaaaaa.....",
        "....sAaaaaa.....",
        "....Sccccca.....",
        ".....bbbbbb.....",
        ".....bb..bb.....",
        "....fff.fff....."
      ],
      [
        ".....aaaaaa.....",
        "....sAaaaaa.....",
        "....Sccccca.....",
        ".....bbbbbb.....",
        "....bb....bb....",
        "...fff....fff..."
      ]
    ]
  };

  /* 전투 자세(왼쪽을 봄). 손 위치(grip)에 무기를 쥔다 */
  const BATTLE = {
    idle: {
      head: [2, 1],
      grip: [1, 14],
      rows: [
        ".....aaaaaa.....",
        "....aaaaaaaa....",
        "...AAaaaaaaa....",
        "..AA.aaaaaaa....",
        ".ss..ccccccc....",
        ".....bbbbbbb....",
        ".....bbb.bbb....",
        ".....bbb.bbb....",
        ".....fff.fff....",
        "....ffff.fff...."
      ]
    },
    reach: {
      head: [1, 1],
      grip: [0, 12],
      rows: [
        "....aaaaaa......",
        "...aaaaaaaa.....",
        "ssAAaaaaaaa.....",
        "...Aaaaaaaa.....",
        "...cccccccc.....",
        "...bbbbbbb......",
        "..bbb...bbb.....",
        ".bbb.....bbb....",
        ".fff.....fff....",
        "ffff.....fff...."
      ]
    }
  };

  /* 머리 모양 덧칠 (머리 원점 기준) */
  const HAIR = {
    long: {
      front: [[0, 7, "hh"], [10, 7, "hh"], [0, 8, "hh"], [10, 8, "hh"], [0, 9, "hh"], [10, 9, "hh"], [0, 10, "H"], [11, 10, "H"]],
      back: [[1, 9, "hhhhhhhhhh"], [1, 10, "hhhhhhhhhh"], [2, 11, "HHHHHHHH"]],
      side: [[8, 8, "hhhh"], [8, 9, "hhhh"], [8, 10, "hhhH"], [9, 11, "HH"]]
    },
    tail: {
      front: [[11, 3, "h"], [12, 4, "h"], [12, 5, "h"]],
      back: [[5, 9, "hh"], [5, 10, "hh"], [5, 11, "HH"]],
      side: [[12, 3, "hh"], [12, 4, "hhh"], [13, 5, "hh"], [13, 6, "H"]]
    },
    spiky: {
      front: [[2, -1, "h..h..h"], [1, 0, "h"], [10, 0, "h"]],
      back: [[2, -1, "h..h..h"]],
      side: [[3, -1, "h.h.h.h"], [11, 1, "h"]]
    },
    bun: {
      front: [[4, -2, "hhhh"], [4, -1, "HhhH"]],
      back: [[4, -2, "hhhh"], [4, -1, "HhhH"]],
      side: [[6, -2, "hhh"], [6, -1, "hhH"]]
    }
  };

  /* 모자: 머리 원점 기준 [x, y, 행들]. p=주색 P=그림자 q=보조 g=금 w=흰색 k=검정 r=보석 h=머리카락 */
  const HATS = {
    band: {
      front: [0, 2, ["pppppppppppp"]],
      side: [0, 2, ["pppppppppppppp", "............pp"]]
    },
    bandana: {
      front: [0, -1, ["...pppppp...", ".pppppppppp.", "pppwppppwppp", "pPPPPPPPPPPp"]],
      side: [0, -1, ["...pppppp...", ".pppppppppp.", "ppppppwppppp", "PPPPPPPPPPppp", "...........pp"]]
    },
    hood: {
      front: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "ppPPPPPPPPPPpp", "pP..........Pp", "pP..........Pp", "pp..........pp", "pp..........pp", ".pp........pp."]],
      back: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "PPpppppppppppP", ".PPPPPPPPPPPP."]],
      side: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "ppPPpppppppppp", "pP....pppppppp", "......Ppppppppp", ".......pppppppp", "......ppppppppP", "......PpppppPP.", ".......PPPPP..."]]
    },
    ninja: {
      front: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "ppPPPPPPPPPPpp", "pP..........Pp", "pP..........Pp", "pppppppppppppp", ".pppppppppppp.", "..pppppppppp.."]],
      back: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "PPppppppppppPP", ".PPPPPPPPPPPPrr"]],
      side: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "ppPPpppppppppp", "pP....pppppppp", "......Ppppppppp", ".......pppppppp", "pppppppppppppPrr", ".pppppppppppP..r", "..pppppPPPPP..."]]
    },
    helm: {
      front: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "pPPPPPPPPPPPPp", "pkkkkkkkkkkkkp", "pppppppppppppp", "ppPppppppppPpp", ".pppppppppppp.", "..PPPPPPPPPP.."]],
      back: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", ".pppppppppppp.", "..PPPPPPPPPP.."]],
      side: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "PPPPPPPpppppPp", "kkkkkkPppppppp", "pppppppppppppp", "ppPpPppppppppp", ".pppppppppppP.", "..ppppppPPPP.."]]
    },
    plume: {
      front: [-1, -1, ["......rr......", "....rrrrpp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "pkkkkkkkkkkkkp", "pppppppppppppp", "ppPppppppppPpp", ".pppppppppppp.", "..PPPPPPPPPP.."]],
      side: [-1, -1, ["......rrrrr...", "....pppppprrr.", "..pppppppppprr", ".pppppppppppp.", "PPPPPPPpppppPp", "kkkkkkPppppppp", "pppppppppppppp", "ppPpPppppppppp", ".pppppppppppP.", "..ppppppPPPP.."]]
    },
    hornhelm: {
      front: [-2, -3, ["w..............w", "ww............ww", ".ww..pppppp..ww.", "..wpppppppppppw.", "...pppppppppppp.", "..pPPPPPPPPPPPPp", "...p..........p."]],
      side: [-2, -3, ["..w.............", "..ww............", "...wwpppppp.....", "....pppppppppp..", "...pppppppppppp.", "..PPPPPPPPPPPPP.", ".............ww.", "..............w."]]
    },
    wizard: {
      front: [-1, -6, ["......pP......", ".....ppP......", ".....pppP.....", "....ppppP.....", "....pppppP....", "...ppppppPP...", "..qqqqqqqqqq..", "ppppppppppppPP"]],
      side: [-2, -6, ["..........pP...", ".........ppP...", "........pppP...", ".......ppppP...", "......pppppP...", ".....ppppppP...", "....qqqqqqqq...", "pppppppppppppPP"]]
    },
    witch: {
      front: [-2, -6, ["........pp......", ".......ppP......", "......pppP......", ".....ppppP......", "....pppppPP.....", "....ppppppP.....", "...qqqqqqqqq....", "ppppppppppppppPP"]],
      side: [-3, -6, ["...........ppp..", "..........ppP...", ".........pppP...", "........ppppP...", ".......pppppP...", "......ppppppP...", ".....qqqqqqqq...", "ppppppppppppppPP"]]
    },
    mitre: {
      front: [2, -6, ["...pp...", "..pppp..", ".ppggpp.", ".pggggp.", ".ppggpp.", "pppggppp", "qqqqqqqq"]],
      side: [3, -6, ["..pp...", ".pppp..", ".pggpp.", "pggggp.", "ppggpp.", "pppppp.", "qqqqqqq"]]
    },
    veil: {
      front: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pqqqqqqqqqqp.", "ppqqqqqqqqqqpp", "pp..........pp", "pp..........pp", "pp..........pp", "pp..........pp", "pp..........pp", "ppp........ppp", "PPP........PPP"]],
      back: [-1, -1, ["....pppppp....", "..pppppppppp..", ".pppppppppppp.", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "pppppppppppppp", "PPPPPPPPPPPPPP"]],
      side: [-1, -1, ["....pppppp....", "..pppppppppp..", ".qqqpppppppppp", "qq..pppppppppp", "......pppppppp", "......pppppppp", ".......ppppppp", ".......ppppppp", "......pppppppp", "......pppppppp", "......PPPPPPPP"]]
    },
    halo: {
      front: [2, -4, ["..gggg..", ".g....g.", "..gggg.."]],
      side: [2, -4, [".ggggg..", "g.....g.", ".ggggg.."]]
    },
    leaves: {
      front: [-1, -1, ["..q..q..q..q..", ".qpq.qpq.qpqq.", "pqpqpqpqpqpqpq"]],
      side: [-1, -1, ["....q..q..q...", "...qpq.qpq.qq.", "..pqpqpqpqpqpq"]]
    },
    antlers: {
      front: [-3, -5, ["p.p............p.p", ".pp............pp.", "..p.p........p.p..", "...pp........pp...", "....pp......pp....", ".....p......p....."]],
      side: [3, -5, ["p.p.p...", ".ppp....", "..pp.p..", "...ppp..", "....p..."]]
    },
    feathers: {
      front: [-1, -5, ["..r..q..q..r..", "..r..q..q..r..", ".rr.qq..qq.rr.", ".r..q....q..r.", "gggggggggggggg", "ggrgggrgggrggg"]],
      side: [1, -5, ["......r.q.r..", ".....r.q.r...", "....rr.qq.rr.", "....r..q..r..", "ggggggggggggg", "ggrgggrgggrgg"]]
    },
    featherCap: {
      front: [-1, -3, [".........w....", "........ww....", "....ppppwwp...", "..pppppppppp..", ".pppppppppppp.", "pPPPPPPPPPPPPp"]],
      side: [-3, -3, ["............ww..", "...........ww...", "......pppppwp...", ".....pppppppppp.", "....pppppppppppp", "PPPPPPPPPPPPPP.."]]
    },
    goggles: {
      front: [0, 1, ["..ggg..ggg..", "ppgwgppgwgpp", "..ggg..ggg.."]],
      side: [-1, 1, [".ggg..........", "pgwgppppppppppp", ".ggg.........."]]
    },
    straw: {
      front: [-3, -3, [".......pppp.......", ".....pppppppp.....", "....qqqqqqqqqq....", "pppppppppppppppppp", ".PPPPPPPPPPPPPPPP."]],
      side: [-4, -3, [".........pppp......", ".......pppppppp....", "......qqqqqqqqqq...", "ppppppppppppppppppp", ".PPPPPPPPPPPPPPPPP."]]
    },
    hardhat: {
      front: [-1, -2, ["....pppppp....", "..pppwpppppp..", ".pppppppppppp.", "pppppppppppppp", "PPPPPPPPPPPPPP"]],
      side: [-3, -2, [".......pppppp...", ".....pppwpppppp.", "....pppppppppppp", "...ppppppppppppp", "PPPPPPPPPPPPPPPP"]]
    },
    lamphat: {
      front: [-1, -2, ["....pppppp....", "..pppppppppp..", ".pppppyypppp..", "pppppyyyyppppp", "PPPPPPPPPPPPPP"]],
      side: [-3, -2, [".......pppppp...", ".....pppppppppp.", "..yyppppppppppp.", ".yyypppppppppppp", "PPPPPPPPPPPPPPPP"]]
    },
    chef: {
      front: [0, -6, ["..ww..ww..", ".wwwwwwwww.", "wwwwwwwwwww", ".wwwwwwwww.", "..wwwwwww..", "..wwwwwww..", ".qqqqqqqqq."]],
      side: [1, -6, [".ww..ww...", "wwwwwwwww.", "wwwwwwwwww", ".wwwwwwww.", "..wwwwwww.", "..wwwwwww.", ".qqqqqqqqq"]]
    },
    tophat: {
      front: [1, -6, ["..pppppp..", "..pppppp..", "..pppppp..", "..pppppp..", "..qqqqqq..", "pppppppppp"]],
      side: [0, -6, ["...pppppp...", "...pppppp...", "...pppppp...", "...pppppp...", "...qqqqqq...", "pppppppppppp"]]
    },
    tricorn: {
      front: [-2, -3, ["..p..........p..", ".pppppppppppppp.", "pppppppwwppppppp", ".pppppppppppppp.", "...PPPPPPPPPP..."]],
      side: [-2, -3, ["p..........p...", "pppppppppppp...", "ppppppppwwpppp.", ".pppppppppppppp", "..PPPPPPPPPP..."]]
    },
    cowboy: {
      front: [-3, -4, ["......pppppp......", ".....pppPPppp.....", ".....pppppppp.....", "....qqqqqqqqqq....", "pp..pppppppppp..pp", ".pppppppppppppppp."]],
      side: [-4, -4, ["........pppppp.....", ".......pppPPppp....", ".......pppppppp....", "......qqqqqqqqqq...", "pp..pppppppppppppp.", ".ppppppppppppppppp."]]
    },
    cap: {
      front: [0, -1, ["...pppppp...", ".pppppppppp.", "pppppqpppppp", "..qqqqqqqq.."]],
      side: [-3, -1, ["......pppppp...", "....pppppppppp.", "...ppppppppppp.", "qqqqqq........."]]
    },
    crown: {
      front: [1, -3, ["g..g..g..g", "gggggggggg", "grggrggrgg"]],
      side: [2, -3, ["g..g..g..", "ggggggggg", "grggrgggg"]]
    },
    jester: {
      front: [-3, -5, ["q................p", "qq..............pp", ".qq............pp.", "..qqq..qqpp..ppp..", "...qqqqqqpppppp...", "..qqqqqqqpppppppp."]],
      side: [-1, -5, ["...........pp", "..........pp.", "q........pp..", "qq...qqqppp..", ".qqqqqqqpppp.", "qqqqqqqpppppp"]]
    },
    beret: {
      front: [-1, -2, ["...pppppppp...", ".pppppppppppp.", "ppppppppppppkp", "..PPPPPPPPPP.."]],
      side: [0, -2, ["..pppppppppp..", "pppppppppppppp", "pppppppppppppk", "..PPPPPPPPPP.."]]
    },
    kasa: {
      front: [-3, -4, ["........pp........", "......pppppp......", "....pppppppppp....", "..pppppppppppppp..", "pppppppppppppppppp", "PPPPPPPPPPPPPPPPPP"]],
      side: [-3, -4, ["........pp........", "......pppppp......", "....pppppppppp....", "..pppppppppppppp..", "pppppppppppppppppp", "PPPPPPPPPPPPPPPPPP"]]
    },
    horns: {
      front: [-1, -3, ["k............k", "kk..........kk", ".kk........kk."]],
      side: [4, -3, ["..k...", ".kk...", "kk...."]]
    },
    smallhorns: {
      front: [1, -2, ["p........p", "pp......pp"]],
      side: [5, -2, ["p..", "pp."]]
    },
    animalEars: {
      front: [0, -2, ["hh......hh", "hHh....hHh", "hhh....hhh"]],
      side: [6, -2, ["hh..", "hHh.", "hhh."]]
    },
    catEars: {
      front: [0, -2, ["h........h", "hh......hh", "hqh....hqh"]],
      side: [6, -2, ["h...", "hh..", "hqh."]]
    },
    mortar: {
      front: [-2, -2, ["pppppppppppppppp", "..pppppppppppg..", "..pppppppppp.g.."]],
      side: [-1, -2, ["pppppppppppppp", ".pppppppppppg.", ".pppppppppp.g."]]
    },
    nurse: {
      front: [2, -2, ["..wwww..", "wwwrrwww", "wwrrrrww"]],
      side: [3, -2, [".wwww..", "wwrrwww", "wrrrrww"]]
    },
    maid: {
      front: [1, -1, ["w.w.w.w.w.", "wwwwwwwwww"]],
      side: [2, -1, ["w.w.w.w.", "wwwwwwww"]]
    },
    turban: {
      front: [-1, -3, ["....ppprpp....", "..pppppppppp..", ".pPpPpPpPpPpp.", "pppppppppppppp"]],
      side: [-1, -3, ["...prppppp....", "..pppppppppp..", ".pPpPpPpPpPpp.", "pppppppppppppp"]]
    },
    skullmask: {
      front: [1, 3, ["wwwwwwwwww", "wkkwwwwkkw", "wkkwwwwkkw", ".wwwkkwww.", "..wkwkwkw."]],
      side: [-1, 3, ["wwwwwww...", "wkkwwww...", "wkkwwww...", "wwwkkww...", ".wkwkww..."]]
    }
  };

  /* 얼굴·종족 특징 (머리 원점 기준) */
  const FEATURES = {
    elfEars: { front: [[-2, 4, "ss"], [-1, 5, "S"], [12, 4, "ss"], [12, 5, "S"]], side: [[7, 3, "ss"], [8, 2, "s"]] },
    beard: { front: [[2, 7, "hhhhhhhh"], [2, 8, "hhhhhhhh"], [3, 9, "hhhhhh"], [4, 10, "hhhh"]], side: [[0, 7, "hhhhhh"], [0, 8, "hhhhh"], [1, 9, "hhhh"]] },
    tusks: { front: [[3, 8, "w"], [8, 8, "w"]], side: [[1, 8, "w"]] },
    glasses: { front: [[1, 5, "k"], [2, 4, "kkk"], [4, 5, "k"], [5, 5, "kk"], [7, 4, "kkk"], [10, 5, "k"], [2, 6, "k.k"], [7, 6, "k.k"]], side: [[1, 4, "kkk"], [1, 6, "kkk"], [3, 5, "kkk"]] },
    eyepatch: { front: [[1, 4, "kkkkkkkkkkk"], [7, 5, "kkk"], [7, 6, "kkk"]], side: [[0, 4, "kkkkkkkk"], [1, 5, "kk"], [1, 6, "kk"]] },
    scar: { front: [[8, 4, "r"], [9, 5, "r"], [8, 6, "r"]], side: [[3, 5, "r"], [4, 6, "r"]] },
    gills: { front: [[0, 6, "q"], [11, 6, "q"]], side: [[6, 6, "qq"]] }
  };

  /* 날개: 몸통 기준(행 10 = 0) */
  const WINGS = {
    front: { x: -2, y: -3, rows: ["q..................q", "qq................qq", "qqq..............qqq", "qqqq............qqqq", ".qqq............qqq.", "..qq............qq.."] },
    side: { x: 8, y: -4, rows: [".....q", "...qqq", "..qqqq", ".qqqq.", "qqqq..", "qqq...", "qq...."] }
  };

  /* 들고 있는 물건: rows는 위쪽을 향한 모습, grip은 손 위치, up=평소에도 세워 든다 */
  const W = {
    sword: { grip: [1, 7], melee: 1, rows: [".x..", ".mM.", ".mM.", ".mM.", ".mM.", ".mM.", "gggg", ".l..", ".g.."] },
    katana: { grip: [0, 8], melee: 1, rows: ["..x", ".mM", ".mM", ".mM", ".mM", "mM.", "mM.", "gg.", "kk.", "kk."] },
    greatsword: { grip: [2, 9], melee: 1, rows: ["..x..", ".xmM.", ".mmM.", ".mmM.", ".mmM.", ".mmM.", ".mmM.", ".mmM.", "ggggg", "..l..", "..l..", "..g.."] },
    axe: { grip: [3, 7], melee: 1, rows: [".mmw.", "mmmw.", "mmMw.", ".mMw.", "...w.", "...w.", "...W.", "...W."] },
    bigaxe: { grip: [3, 8], melee: 1, rows: ["mm.w.mm", "mmmwmmm", "mmMwMmm", "mM.w.Mm", "...w...", "...w...", "...W...", "...W...", "...W..."] },
    spear: { grip: [1, 9], up: 1, melee: 1, rows: [".x.", "mmM", ".m.", ".r.", ".w.", ".w.", ".w.", ".w.", ".w.", ".w.", ".W.", ".W.", ".W."] },
    harpoon: { grip: [1, 9], up: 1, melee: 1, rows: [".m.", "mmm", "m.m", ".w.", ".w.", ".w.", ".w.", ".w.", ".w.", ".w.", ".W.", ".l.", ".l."] },
    glaive: { grip: [2, 9], up: 1, melee: 1, rows: [".mm..", "mmMm.", "mmM..", ".mr..", "..w..", "..w..", "..w..", "..w..", "..w..", "..w..", "..W..", "..W.."] },
    hammer: { grip: [1, 6], melee: 1, rows: ["mmmM", "mmmM", "MMMM", ".w..", ".w..", ".w..", ".W..", ".W.."] },
    mace: { grip: [1, 6], melee: 1, rows: [".m.", "mmm", "mMm", ".M.", ".w.", ".w.", ".W.", ".W."] },
    dagger: { grip: [0, 4], melee: 1, rows: [".x", "mM", "mM", "gg", "l."] },
    claws: { grip: [2, 3], melee: 1, rows: ["m.m.m", "m.m.m", ".mmm.", "..l.."] },
    fist: { grip: [1, 1], melee: 1, rows: ["mmm", "mMm", "MMM"] },
    scythe: { grip: [4, 8], up: 1, melee: 1, rows: [".mmmw", "m...w", "M...w", "....w", "....w", "....w", "....w", "....W", "....W", "....W"] },
    whip: { grip: [2, 5], melee: 1, rows: [".ll.", "l..l", "l..l", ".ll.", "..W.", "..W."] },
    bow: { grip: [0, 5], up: 1, rows: ["..w.", ".w.s", "w..s", "w..s", "w..s", "Wlls", "w..s", "w..s", "w..s", ".w.s", "..w."] },
    crossbow: { grip: [4, 2], up: 1, rows: [".w....", ".w....", "mWWWWl", ".w....", ".w...."] },
    gun: { grip: [4, 2], up: 1, rows: ["mmmmM.", "MMMMgl", "....ll"] },
    rifle: { grip: [7, 1], up: 1, rows: ["mmmmmmmWWW", "......WWWW", ".......WW."] },
    cannon: { grip: [5, 4], up: 1, rows: [".kkkkkkk..", "kmmmmmmmkk", "kmMMMMMMkk", ".kkkkkkk..", "....ll...."] },
    bomb: { grip: [1, 4], rows: ["..y.", "..W.", ".kk.", "kkxk", "kkkk", ".kk."] },
    staff: { grip: [1, 9], up: 1, rows: [".rr.", "rxrR", ".rR.", ".w..", ".w..", ".w..", ".w..", ".w..", ".w..", ".w..", ".W..", ".W..", ".W.."] },
    holystaff: { grip: [2, 9], up: 1, rows: ["..g..", ".ggg.", "..g..", "..g..", "..x..", "..x..", "..x..", "..x..", "..x..", "..x..", "..m..", "..m..", "..m.."] },
    skullstaff: { grip: [1, 9], up: 1, rows: [".xx.", "xkkx", "xxxx", ".xk.", ".W..", ".W..", ".W..", ".W..", ".W..", ".W..", ".W..", ".W..", ".W.."] },
    starstaff: { grip: [2, 9], up: 1, rows: ["..y..", ".yyy.", "yyxyy", ".y.y.", "..g..", "..g..", "..g..", "..g..", "..g..", "..g..", "..g..", "..G..", "..G.."] },
    leafstaff: { grip: [2, 9], up: 1, rows: ["q.q.q", ".qwq.", "q.w.q", "..w..", "..w..", "..w..", "..w..", "..w..", "..w..", "..w..", "..W..", "..W..", "..W.."] },
    totem: { grip: [1, 9], up: 1, rows: ["rrrr", "wkkw", "wwww", "wrrw", ".w..", ".w..", ".w..", ".w..", ".w..", ".w..", ".W..", ".W..", ".W.."] },
    wand: { grip: [0, 5], up: 1, rows: [".r", "rx", ".r", "w.", "w.", "W."] },
    book: { grip: [1, 3], rows: ["pppP", "pggP", "pppP", "pppP", "xxxx"] },
    lute: { grip: [2, 3], up: 1, rows: ["...W.", "...W.", "..w..", ".www.", "wwkww", "wwwww", ".www."] },
    drum: { grip: [0, 1], rows: ["xxxx", "rrrr", "rgrg", "rrrr", "xxxx"] },
    horn: { grip: [3, 2], up: 1, rows: ["g...", "gg..", ".ggg", "...g"] },
    cards: { grip: [1, 3], rows: [".x.x", "xrxr", "xxxx", ".xx."] },
    dice: { grip: [1, 3], rows: ["xxx..", "xkx..", "xxxxx", "..xkx", "..xxx"] },
    flask: { grip: [1, 4], rows: [".k.", ".x.", "xrx", "xrr", "xrr", ".x."] },
    potion: { grip: [1, 4], rows: [".W.", ".x.", "rrr", "rxr", "rrr", ".r."] },
    wrench: { grip: [1, 4], melee: 1, rows: ["m.m", "mmm", ".m.", ".m.", ".M.", ".M."] },
    pitchfork: { grip: [2, 8], up: 1, melee: 1, rows: ["m.m.m", "m.m.m", "mmmmm", "..w..", "..w..", "..w..", "..w..", "..w..", "..W..", "..W..", "..W.."] },
    pickaxe: { grip: [2, 6], melee: 1, rows: ["mmmmm", "m.w.M", "..w..", "..w..", "..w..", "..W..", "..W.."] },
    shovel: { grip: [1, 2], rows: ["ww.", ".w.", ".w.", ".w.", ".w.", "mmm", "mmm", ".m."] },
    rod: { grip: [5, 9], up: 1, rows: ["w.....", ".w....", "..w...", "s..w..", "s...w.", "s...w.", "s....w", "r....w", ".....W", ".....W"] },
    pan: { grip: [2, 5], melee: 1, rows: [".kkk.", "kkkkk", "kkMkk", ".kkk.", "..l..", "..l.."] },
    ladle: { grip: [2, 5], rows: ["..m..", "..m..", "..m..", "..m..", ".mmm.", "mMMMm", ".mmm."] },
    coinbag: { grip: [1, 1], rows: [".g..", ".ll.", "llll", "lgll", ".ll."] },
    brush: { grip: [1, 6], up: 1, rows: [".r.", "rrr", ".m.", ".w.", ".w.", ".w.", ".W.", ".W."] },
    quill: { grip: [1, 5], up: 1, rows: ["..x", ".xx", "xxx", "xx.", "x..", "k.."] },
    broom: { grip: [1, 3], rows: [".w.", ".w.", ".w.", ".w.", ".w.", ".w.", "sss", "sss", "s.s"] },
    lantern: { grip: [1, 1], rows: [".k.", ".k.", "kkk", "kyk", "kyk", "kkk"] },
    orb: { grip: [2, 4], rows: [".rr.", "rxrR", "rrRR", ".RR.", "gggg"] },
    fan: { grip: [3, 5], up: 1, rows: ["prprp..", "rprprp.", ".prprp.", "..prp..", "...g...", "...g..."] },
    shuriken: { grip: [1, 2], rows: [".m.", "mkm", ".m."] },
    medkit: { grip: [2, 1], rows: [".kkk.", "xxxxx", "xxrxx", "xrrrx", "xxrxx", "xxxxx"] },
    club: { grip: [1, 6], melee: 1, rows: [".ww", "www", "wwW", "wW.", ".w.", ".w.", ".W.", ".W."] },
    anchor: { grip: [2, 1], melee: 1, rows: ["..m..", ".mmm.", "..m..", "..m..", "..m..", "m.m.m", "mmmmm", ".mmm."] },
    trowel: { grip: [1, 4], melee: 1, rows: [".m.", "mmm", "mmm", ".m.", ".w.", ".W."] },
    needle: { grip: [0, 4], melee: 1, rows: ["x.", "m.", "m.", "m.", "m."] },
    boomerang: { grip: [3, 1], rows: ["ww..", ".www", "..ww", ".ww.", "ww.."] }
  };

  const SHIELD = { rows: ["gggggg", "gppppg", "gpwwpg", "gppppg", "gppppg", ".gppg.", "..gg.."] };

  /* ── 직업 → 모습 ── */
  const WEAPON_RULES = [
    [/석궁/, "crossbow"], [/공성포|대포|포병|포수|박격포/, "cannon"], [/머스킷|장총/, "rifle"], [/총|마탄|무법자/, "gun"],
    [/폭탄|수류탄|지뢰|섬광탄|화약|폭파/, "bomb"],
    [/궁수|궁사|궁병|신궁|천궁|장궁|레인저|활장인|기마궁|사수|저격수/, "bow"],
    [/작살|고래사냥|해룡/, "harpoon"], [/닻/, "anchor"], [/언월도/, "glaive"], [/창술|장창|창기병|투창|창병|근위병/, "spear"],
    [/바이킹|도끼|나무꾼|벌목/, "axe"], [/파괴자|대검|극검|거인살해/, "greatsword"], [/사슬낫/, "scythe"],
    [/채찍/, "whip"], [/표창|닌자/, "shuriken"], [/부메랑/, "boomerang"],
    [/망치|대장장이|철퇴|석공|철거|벽돌|대목장|목수/, "hammer"], [/미장|지붕/, "trowel"],
    [/사무라이|낭인|검선|검귀|검귀|발도|퇴마 무사|협객|화랑|천하제일/, "katana"],
    [/단검|도적|칼잡이|암살|비수|소매치기|강도|해결사|처단|교살|독살|살수|첩자|간첩|칼날/, "dagger"],
    [/권|무투|복서|레슬러|격투|싸움꾼|씨름|장사|유술|점혈|태극|팔극|금강|기공|무도승|투사|차력/, "fist"],
    [/여의봉|봉술/, "staff"], [/부채/, "fan"],
    [/리치|네크로|뼈|해골|시체|망령|강시/, "skullstaff"],
    [/사제|성녀|교황|신관|성직|퇴마사|심판관|정화|기도|고해|축복|천사/, "holystaff"],
    [/드루이드|숲|식물|세계수|계절|대지모신|트렌트|뿌리/, "leafstaff"],
    [/샤먼|토템|주술|부두/, "totem"],
    [/점성|별|운석|천문|혜성|성운|우주/, "starstaff"],
    [/마녀/, "broom"], [/빗자루|청소|하녀|굴뚝/, "broom"],
    [/수정|점쟁이|예언|타로|관상|꿈해몽|풍수|사주/, "orb"],
    [/카드|타로/, "cards"], [/주사위|도박|야바위|투기/, "dice"],
    [/악기|음유|현악|하프|마에스트로|작곡|가희|서사시인|가수|성악/, "lute"], [/북|장구|고수/, "drum"], [/나팔|피리/, "horn"],
    [/연금|비약|약사|물약|영약|촉매|약제|독물|수은|정수|변성/, "flask"], [/양조|바텐더|소믈리에|꿀술/, "potion"],
    [/의사|외과|간호|산파|명의|군의관|위생병|치유사|수의사|요양/, "medkit"], [/침술|재봉|직조|누에/, "needle"],
    [/렌치|기계|정비|발명|태엽|공학|자동인형|시계/, "wrench"],
    [/농부|개간|비료|과수원|포도|벼농사|허수아비|대지주|약초 재배|버섯재배|거대 작물/, "pitchfork"],
    [/광부|굴착|채석|화석|미스릴/, "pickaxe"], [/어부|낚시|원양/, "rod"], [/삽|묘지기|장의사|우물/, "shovel"],
    [/요리사|프라이팬|취사병|화덕|국수|떡/, "pan"], [/제빵|제과|치즈|발효|커피|찻집/, "ladle"],
    [/상인|은행|환전|상단|금융|전당포|행상|노점|무역|보석상|장물|밀수|세리|세금|경매/, "coinbag"],
    [/화가|서예|벽화|초상|염색|문신/, "brush"], [/서기|필사|시인|소설|극작|외교|판사|변론/, "quill"],
    [/등불|야경|점등|등대|광부/, "lantern"],
    [/학자|사서|교수|역사|철학|언어|신학|편찬|가정교사|마도학자|금서|박물/, "book"],
    [/흡혈|늑대인간|키메라|야수|오우거|반마|그림자 인간|반요|구미호/, "claws"]
  ];

  const FAMILY_WEAPON = {
    warrior: ["sword", "axe", "greatsword", "hammer", "spear"], knight: ["sword"], archer: ["bow"], gunner: ["gun", "rifle"],
    rogue: ["dagger"], assassin: ["dagger", "shuriken"], elemental: ["staff", "wand"], arcane: ["staff", "wand", "book"],
    dark: ["skullstaff", "staff"], holy: ["holystaff", "mace"], nature: ["leafstaff"], spirit: ["totem", "staff"],
    martial: ["fist"], summoner: ["staff", "book"], bard: ["lute", "horn"], tech: ["wrench", "hammer"], alchemy: ["flask"],
    oriental: ["katana", "fan", "staff"], hunter: ["crossbow", "bow", "spear"], sea: ["sword", "harpoon"], military: ["spear", "sword"],
    cosmic: ["starstaff", "orb"], trickster: ["cards", "dice", "dagger"], bloodline: ["claws", "club"],
    farming: ["pitchfork"], gathering: ["pickaxe", "rod"], craft: ["hammer", "needle"], culinary: ["pan", "ladle"],
    commerce: ["coinbag"], scholar: ["book", "quill"], arts: ["brush", "quill"], medicine: ["medkit", "flask"],
    civic: ["club", "quill"], service: ["broom"], building: ["hammer", "trowel"], mystic: ["orb", "lantern", "holystaff"]
  };

  const HAT_RULES = [
    [/왕$|국왕|군주|도둑왕|야수왕|금융왕|권왕|마탑주/, "crown"], [/교황|대사제|주교/, "mitre"], [/수녀|성녀|무녀|신탁무녀/, "veil"],
    [/천사|성배|순교/, "halo"], [/바이킹|야만|광전사|북방/, "hornhelm"], [/성기사|성전기사|성당기사|왕실근위|기사단장|장미기사|은빛기사|성배기사/, "plume"],
    [/기사|철갑|중장|근위|백인대장/, "helm"], [/닌자|암살|살수|암영|은형|정적의|밤의 칼날/, "ninja"],
    [/마녀/, "witch"], [/마법사|마도|마탑|현자|원소|술사$|룬술|인챈터|결계|중력|환술|공간술|변이술|마나 포식/, "wizard"],
    [/드루이드|숲의|세계수|계절|대지모신|트렌트|꽃의/, "leaves"], [/변신술사|야수조련|늑대인도|사슴/, "antlers"],
    [/샤먼|토템|가면 주술|북 주술|조상|동물령/, "feathers"], [/음유|서사시인|레인저|궁수|신궁|하프|피리|사냥꾼/, "featherCap"],
    [/공학|기계|발명|태엽|증기|전기|정비|글라이더|자동인형|보석세공|시계|폭파|연금|드릴/, "goggles"],
    [/농부|목동|과수원|포도|축산|벼농사|양계|소몰이|염소|낙농|개간|원예|허수아비|대지주|비료|양봉/, "straw"],
    [/광부|굴착|채석|심층|미스릴|보석 광부/, "lamphat"], [/건축|벽돌|비계|철거|석공|도로|다리|성벽|운하|측량|미장|지붕|우물/, "hardhat"],
    [/요리사|제빵|제과|취사병|화덕|국수|떡장수|횟감|정육/, "chef"], [/은행|금융|마술사|상단주|외교|재상|집사|경매|투기/, "tophat"],
    [/해적|사략|칠대양|선장/, "tricorn"], [/총잡이|무법자|현상금|소몰이/, "cowboy"],
    [/광대|저글러|장난|복화술|풍선|만담|탈춤/, "jester"], [/화가|초상|벽화|조각가|의상|작곡|시인|소설/, "beret"],
    [/학자|교수|대학자|철학|역사가|언어학자|수학자|물리학자|신학자/, "mortar"], [/간호|산파|요양|유모/, "nurse"],
    [/하녀|세탁부|청소부|가정교사/, "maid"], [/사무라이|낭인|검선|선인|무도승|탁발|순례/, "kasa"],
    [/승$|수도사|무도승|금강/, null], [/모자 장인/, "tophat"], [/해녀|잠수|작살|갑판|해병|어부|원양/, "bandana"],
    [/도적|강도|산적|밀수|칼잡이|소매치기|장물|탈옥|하수도/, "bandana"], [/점쟁이|타로|관상|사주|점성|예언/, "turban"],
    [/흑마법|네크로|저주|악마술|영혼술|역병|그림자술|공포|부두|악몽|계약|시체|망령|허무|리치|암흑/, "hood"],
    [/경비|간수|병$|보병|척후|전차|공병|궁병대장|돌격|결사|훈련교관|탈영|국경|야경|첩보/, "cap"],
    [/사형집행|처형|해골/, "skullmask"]
  ];

  const FAMILY_HAT = {
    warrior: ["band", null, "hornhelm"], knight: ["helm", "plume"], archer: ["featherCap", "hood", null], gunner: ["cap", "cowboy", null],
    rogue: ["bandana", "hood"], assassin: ["ninja", "hood"], elemental: ["wizard"], arcane: ["wizard", "hood"], dark: ["hood"],
    holy: ["halo", "mitre", "veil", null], nature: ["leaves", "hood"], spirit: ["feathers", "band"], martial: ["band", null],
    summoner: ["hood", "wizard", "band"], bard: ["featherCap", "beret"], tech: ["goggles"], alchemy: ["goggles", "hood"],
    oriental: ["kasa", "band", null], hunter: ["hood", "featherCap", "cowboy"], sea: ["tricorn", "bandana"], military: ["cap", "helm"],
    cosmic: ["wizard", "turban", "hood"], trickster: ["jester", "tophat"], bloodline: [null, "hood"],
    farming: ["straw"], gathering: ["cap", "bandana", "straw"], craft: ["band", "goggles", "cap"], culinary: ["chef"],
    commerce: ["tophat", "cap", "turban"], scholar: ["mortar", null], arts: ["beret", null], medicine: ["nurse", null],
    civic: ["cap", null], service: ["maid", "cap", null], building: ["hardhat"], mystic: ["hood", "turban", "veil"]
  };

  /* 계열별 옷 색 [상의, 하의, 장식] */
  const OUTFITS = {
    warrior: [[C.leather, C.brown, C.gold], [C.red, C.brown, C.lgrey], [C.dgreen, C.brown, C.gold], [C.rust, C.dbrown, C.sand]],
    knight: [[C.lgrey, C.dgrey, C.gold], [C.lgrey, C.blue, C.gold], [C.grey, C.slate, C.red], [C.white, C.lgrey, C.gold]],
    archer: [[C.dgreen, C.brown, C.gold], [C.green, C.leather, C.sand], [C.leather, C.dgreen, C.sand]],
    gunner: [[C.blue, C.brown, C.gold], [C.leather, C.dgrey, C.gold], [C.dred, C.slate, C.sand]],
    rogue: [[C.dgrey, C.slate, C.red], [C.dgreen, C.slate, C.gold], [C.brown, C.dbrown, C.sand]],
    assassin: [[C.slate, C.navy, C.red], [C.purple, C.navy, C.magenta], [C.navy, C.black, C.lgrey]],
    elemental: [[C.blue, C.blue, C.gold]], arcane: [[C.blue, C.navy, C.gold], [C.purple, C.purple, C.gold], [C.magenta, C.purple, C.yellow]],
    dark: [[C.purple, C.navy, C.red], [C.slate, C.black, C.green], [C.navy, C.black, C.magenta]],
    holy: [[C.white, C.lgrey, C.gold], [C.sand, C.white, C.gold], [C.lgrey, C.white, C.lblue]],
    nature: [[C.dgreen, C.leather, C.green], [C.ddgreen, C.brown, C.gold], [C.leather, C.dgreen, C.green]],
    spirit: [[C.leather, C.rust, C.gold], [C.teal, C.brown, C.cyan], [C.rust, C.brown, C.sand]],
    martial: [[C.orange, C.slate, C.gold], [C.white, C.black, C.red], [C.red, C.dred, C.gold], [C.sand, C.brown, C.dred]],
    summoner: [[C.magenta, C.purple, C.gold], [C.teal, C.navy, C.cyan], [C.lblue, C.blue, C.white]],
    bard: [[C.red, C.blue, C.gold], [C.green, C.dgreen, C.yellow], [C.magenta, C.navy, C.gold]],
    tech: [[C.leather, C.slate, C.gold], [C.dgrey, C.brown, C.orange], [C.blue, C.slate, C.yellow]],
    alchemy: [[C.dgreen, C.leather, C.gold], [C.white, C.slate, C.cyan], [C.purple, C.brown, C.green]],
    oriental: [[C.blue, C.white, C.red], [C.white, C.red, C.gold], [C.navy, C.slate, C.gold], [C.dred, C.black, C.gold]],
    hunter: [[C.brown, C.slate, C.gold], [C.dgreen, C.brown, C.sand], [C.dred, C.dbrown, C.lgrey]],
    sea: [[C.white, C.blue, C.red], [C.red, C.brown, C.gold], [C.lblue, C.navy, C.white]],
    military: [[C.dgreen, C.dgreen, C.gold], [C.red, C.white, C.gold], [C.blue, C.navy, C.gold]],
    cosmic: [[C.navy, C.navy, C.yellow], [C.purple, C.navy, C.cyan], [C.blue, C.black, C.white]],
    trickster: [[C.red, C.yellow, C.white], [C.magenta, C.green, C.gold], [C.purple, C.orange, C.yellow]],
    bloodline: [[C.brown, C.slate, C.red], [C.black, C.dred, C.gold], [C.dgrey, C.brown, C.sand]],
    farming: [[C.lblue, C.lblue, C.sand], [C.white, C.brown, C.red], [C.sand, C.blue, C.dred]],
    gathering: [[C.rust, C.slate, C.gold], [C.lblue, C.brown, C.gold], [C.dgreen, C.brown, C.sand]],
    craft: [[C.leather, C.slate, C.dgrey], [C.brown, C.dgrey, C.gold], [C.sand, C.brown, C.dred]],
    culinary: [[C.white, C.slate, C.red], [C.white, C.brown, C.lblue]],
    commerce: [[C.purple, C.slate, C.gold], [C.dgreen, C.brown, C.gold], [C.dred, C.navy, C.gold]],
    scholar: [[C.navy, C.navy, C.gold], [C.brown, C.brown, C.sand], [C.dgreen, C.dgreen, C.gold]],
    arts: [[C.magenta, C.slate, C.yellow], [C.lblue, C.navy, C.white], [C.orange, C.brown, C.white]],
    medicine: [[C.white, C.lgrey, C.red], [C.lblue, C.white, C.red]],
    civic: [[C.blue, C.slate, C.gold], [C.dred, C.navy, C.gold], [C.black, C.slate, C.white]],
    service: [[C.black, C.black, C.white], [C.sand, C.brown, C.white], [C.dgrey, C.slate, C.lgrey]],
    building: [[C.orange, C.blue, C.yellow], [C.lblue, C.slate, C.orange], [C.yellow, C.brown, C.dgrey]],
    mystic: [[C.sand, C.brown, C.gold], [C.purple, C.purple, C.gold], [C.white, C.lgrey, C.lblue]]
  };
  const ELEMENT_ROBE = {
    fire: C.red, ice: C.lblue, bolt: C.gold, earth: C.leather, wind: C.green, light: C.white,
    dark: C.purple, nature: C.dgreen, arcane: C.magenta, phys: C.dgrey
  };
  const ROBE_FAMILIES = new Set(["elemental", "arcane", "cosmic", "summoner"]);
  const SKINS = ["#f6dcc4", C.skinL, "#f0c6a0", C.skin1, C.skinM, "#a8704e"];
  const HAIRS = [C.brown, C.dbrown, C.black, C.gold, C.orange, C.rust, C.lgrey, C.sand, C.navy, C.yellow];
  const HAIR_STYLES = ["short", "short", "long", "tail", "spiky", "bun"];

  const RACE = {
    엘프: { skin: C.skinL, ears: 1 }, 다크엘프: { skin: "#7d6aa6", hair: C.white, ears: 1 },
    드워프: { skin: C.skin1, beard: 1, hair: C.rust }, 오크: { skin: C.dgreen, tusks: 1 }, 하플링: { hairStyle: "spiky" },
    수인: { ears: "animal" }, 용인: { skin: "#d9805a", horns: "small", hornColor: C.gold, eye: C.gold },
    거인족: { beard: 1 }, 요정: { skin: C.skinL, ears: 1, wings: C.cyan }, 언데드: { skin: "#a7b8a4", eye: C.red },
    리자드맨: { skin: C.green, bald: 1, eye: C.yellow }, 노움: { hat: "wizard", hatColor: C.red, beard: 1 },
    고블린: { skin: C.green, ears: 1, eye: C.yellow }, 인어족: { skin: "#8fd3c4", hair: C.lblue, gills: 1 },
    트롤: { skin: "#6a9bb0", tusks: 1 }, 고양이족: { ears: "cat" }, 천사혈통: { wings: C.white, halo: 1 },
    악마혈통: { horns: "big", hornColor: C.black, eye: C.red, wings: C.dred }, 유령: { ghost: 1, skin: "#c8d4e0" },
    기계: { skin: C.lgrey, eye: C.cyan }, 용혈: { horns: "small", hornColor: C.dred, eye: C.orange }, 천상: { halo: 1, wings: C.white },
    마왕: { horns: "big", hornColor: C.black, eye: C.red }, 언데드혈: {}, 핏빛: { eye: C.red }, 맹인: { blind: 1 },
    정령왕: { wings: C.green }, 불사조: { wings: C.orange }, 타락한: { eye: C.red }, 저주받은: { scar: 1 }, 백전노장: { scar: 1, beard: 1 },
    켄타우로스: { hairStyle: "long" }
  };

  function lookOf(job) {
    if (job._look) return job._look;
    const fam = F.FAMILY_LIST[job.fam];
    const h = hash(job.base);
    const hm = hash(job.name);
    const text = job.base;
    const outfitList = OUTFITS[fam.id] || OUTFITS.warrior;
    const outfit = outfitList[h % outfitList.length].slice();
    if (ROBE_FAMILIES.has(fam.id) && fam.id !== "arcane") outfit[0] = ELEMENT_ROBE[job.el] || outfit[0];
    if (fam.id === "elemental") outfit[1] = shade(outfit[0], 0.8);
    if (/흑기사|죽음의 기사|심연기사|배교기사|암흑군주|데스/.test(text)) outfit.splice(0, 3, C.slate, C.navy, C.red);
    if (/성기사|성전기사|성배기사|성당기사|은빛기사/.test(text)) outfit.splice(0, 3, C.white, C.lgrey, C.gold);

    let weapon = null;
    for (const [re, w] of WEAPON_RULES) { if (re.test(text)) { weapon = w; break; } }
    if (!weapon) weapon = pick(FAMILY_WEAPON[fam.id] || ["sword"], h, 3);

    let hat;
    let ruled = false;
    for (const [re, hatName] of HAT_RULES) { if (re.test(text)) { hat = hatName; ruled = true; break; } }
    if (!ruled) hat = pick(FAMILY_HAT[fam.id] || [null], h, 7);

    const look = {
      skin: pick(SKINS, h, 2), hair: pick(HAIRS, hm, 5), hairStyle: pick(HAIR_STYLES, hm, 9),
      a: outfit[0], b: outfit[1], c: outfit[2], boots: (h >> 4) % 2 ? C.dbrown : C.black,
      hat, hatColor: null, weapon, shield: fam.id === "knight" && !/마법기사|그리폰|페가수스|용기사/.test(text),
      eye: C.black, ears: null, beard: false, tusks: false, horns: null, hornColor: C.black, wings: null, halo: false,
      bald: /승$|무도승|수도사|금강|탁발/.test(text), ghost: false, gills: false, glasses: /학자|사서|교수|수학|물리|백과|필사|탐정|수사관|검시/.test(text),
      scar: false, eyepatch: /해적선장|사략|칠대양|무법자/.test(text), blind: false,
      aura: null, rarity: job.rarity, el: job.el
    };
    if (job.mod) {
      const r = RACE[job.mod];
      if (r) {
        if (r.skin) look.skin = r.skin;
        if (r.hair) look.hair = r.hair;
        if (r.hairStyle) look.hairStyle = r.hairStyle;
        if (r.ears) look.ears = r.ears === 1 ? "elf" : r.ears;
        if (r.beard) look.beard = true;
        if (r.tusks) look.tusks = true;
        if (r.horns) { look.horns = r.horns; look.hornColor = r.hornColor || C.black; }
        if (r.eye) look.eye = r.eye;
        if (r.wings) look.wings = r.wings;
        if (r.halo) look.halo = true;
        if (r.bald) look.bald = true;
        if (r.ghost) look.ghost = true;
        if (r.gills) look.gills = true;
        if (r.scar) look.scar = true;
        if (r.blind) look.blind = true;
        if (r.hat) { look.hat = r.hat; look.hatColor = r.hatColor; }
      }
      const modEl = F.MODIFIER_EL ? F.MODIFIER_EL[job.mod] : null;
      if (modEl) { look.c = EL_COLOR[modEl]; look.aura = modEl; }
    }
    if (job.rarity >= 4 && !look.aura) look.aura = job.el;
    look.hatColor = look.hatColor || hatColorFor(look, fam, h, text);
    job._look = look;
    return look;
  }

  function hatColorFor(look, fam, h, text) {
    switch (look.hat) {
      case "helm": case "plume": return /흑기사|죽음|심연|배교|암흑/.test(text) ? C.slate : /성기사|성전|성배|은빛/.test(text) ? C.white : C.lgrey;
      case "hornhelm": return C.lgrey;
      case "straw": return C.sand;
      case "hardhat": return C.yellow;
      case "lamphat": return C.gold;
      case "chef": return C.white;
      case "nurse": return C.white;
      case "maid": return C.white;
      case "crown": return C.gold;
      case "halo": return C.yellow;
      case "kasa": return C.sand;
      case "goggles": return C.brown;
      case "mitre": return C.white;
      case "leaves": return C.green;
      case "antlers": return C.brown;
      case "feathers": return C.white;
      case "tophat": return C.black;
      case "mortar": return C.black;
      case "tricorn": return C.black;
      case "cowboy": return C.leather;
      case "veil": return look.a === C.white ? C.white : C.black;
      default: return [look.a, look.c, look.b][h % 3];
    }
  }

  function heroPal(look) {
    const hair = look.bald ? look.skin : look.hair;
    const hatP = look.hatColor || look.a;
    return {
      h: hair, H: shade(hair), s: look.skin, S: shade(look.skin, 0.8), e: look.blind ? shade(look.skin, 0.6) : look.eye,
      a: look.a, A: shade(look.a), b: look.b, B: shade(look.b), c: look.c, f: look.boots, F: shade(look.boots),
      p: hatP, P: shade(hatP), q: hatP === look.c ? look.a : look.c, Q: shade(look.c), g: C.gold, G: C.orange, w: C.white,
      k: C.black, r: look.c === hatP ? C.red : look.c, y: C.yellow, x: C.white,
      m: C.lgrey, M: C.grey, l: C.brown, W: C.brown, s2: C.sand
    };
  }

  function stampHead(pix, look, view, hx, hy, pal, flip) {
    const headRows = HEAD[view];
    const style = HAIR[look.hairStyle];
    // 머리 뒤로 넘어가는 장식(긴 머리, 꼬리)은 머리보다 먼저
    if (style && (look.hairStyle === "long" || look.hairStyle === "tail") && !look.bald) {
      patchRunsFlip(pix, style[view] || [], pal, hx, hy, flip, 12);
    }
    stamp(pix, headRows, hx, hy, pal, flip);
    if (style && (look.hairStyle === "spiky" || look.hairStyle === "bun") && !look.bald && !hatCovers(look.hat)) {
      patchRunsFlip(pix, style[view] || [], pal, hx, hy, flip, 12);
    }
    const feats = [];
    if (look.ears === "elf") feats.push(FEATURES.elfEars);
    if (look.beard) feats.push(FEATURES.beard);
    if (look.tusks) feats.push(FEATURES.tusks);
    if (look.glasses) feats.push(FEATURES.glasses);
    if (look.eyepatch) feats.push(FEATURES.eyepatch);
    if (look.scar) feats.push(FEATURES.scar);
    if (look.gills) feats.push(FEATURES.gills);
    if (view !== "back") feats.forEach((ft) => patchRunsFlip(pix, ft[view] || [], pal, hx, hy, flip, 12));
    else if (look.ears === "elf") patchRunsFlip(pix, FEATURES.elfEars.front, pal, hx, hy, flip, 12);

    const hatList = [];
    if (look.ears === "animal") hatList.push("animalEars");
    if (look.ears === "cat") hatList.push("catEars");
    if (look.horns === "big") hatList.push("horns");
    if (look.horns === "small") hatList.push("smallhorns");
    if (look.hat) hatList.push(look.hat);
    if (look.halo && look.hat !== "halo") hatList.push("halo");
    hatList.forEach((name) => {
      const hat = HATS[name];
      if (!hat) return;
      const def = hat[view] || hat.front;
      const hp = name === "horns" || name === "smallhorns" ? Object.assign({}, pal, { k: look.hornColor, p: look.hornColor, P: shade(look.hornColor) }) : name === "halo" ? Object.assign({}, pal, { g: C.yellow }) : pal;
      stampAt(pix, def[2], hx + def[0], hy + def[1], hp, flip, hx, 12);
    });
  }

  function hatCovers(hat) {
    return !!hat && !["band", "halo", "goggles", "glasses", "smallhorns", "horns", "animalEars", "catEars", "skullmask", "maid", "nurse", "crown"].includes(hat);
  }

  /* 좌우 반전을 고려해 찍기: 반전 시 머리 폭(w) 기준으로 대칭 위치에 찍는다 */
  function stampAt(pix, rows, x, y, pal, flip, hx, w) {
    if (!flip) { stamp(pix, rows, x, y, pal); return; }
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const mx = hx + (w - 1) - (x - hx) - (width - 1);
    stamp(pix, rows.map((r) => r.padEnd(width, ".")), mx, y, pal, true);
  }
  function patchRunsFlip(pix, runs, pal, hx, hy, flip, w) {
    runs.forEach(([x, y, s]) => stampAt(pix, [s], hx + x, hy + y, pal, flip, hx, w));
  }

  const cache = new Map();

  /* 맵용 주인공: dir = down|up|left|right, frame 0/1 → 20×24 캔버스(발이 아래쪽 중앙) */
  function heroWalk(job, dir, frame) {
    const key = `w${job.id}${dir}${frame}`;
    if (cache.has(key)) return cache.get(key);
    const look = lookOf(job);
    const pal = heroPal(look);
    const pix = new Pix(20, 24);
    const ox = 2;
    const oy = 7;
    const view = dir === "down" ? "front" : dir === "up" ? "back" : "side";
    const bodyKey = dir === "down" ? "down" : dir === "up" ? "up" : "side";
    const flip = dir === "right";
    const bodyRows = BODY[bodyKey][frame % 2];
    if (look.wings && view !== "side") {
      stamp(pix, WINGS.front.rows, ox + WINGS.front.x, oy + 10 + WINGS.front.y, { q: look.wings });
    }
    if (look.wings && view === "side") {
      const wr = WINGS.side;
      stampAt(pix, wr.rows, ox + wr.x, oy + 10 + wr.y, { q: look.wings }, flip, ox, 16);
    }
    stamp(pix, bodyRows, ox, oy + 10, pal, flip);
    stampHead(pix, look, view, flip ? ox + 2 : ox + 2, oy + 1, pal, flip);
    const out = toCanvas(outline(pix), look.ghost ? 0.72 : 1);
    cache.set(key, out);
    return out;
  }

  /* 전투용 주인공: pose = idle|reach|cast → 44×40 캔버스, 발끝 기준점은 (anchorX, anchorY) */
  function heroBattle(job, pose) {
    const key = `b${job.id}${pose}`;
    if (cache.has(key)) return cache.get(key);
    const look = lookOf(job);
    const pal = heroPal(look);
    const pix = new Pix(44, 40);
    const ox = 18;
    const oy = 10;
    const frame = pose === "idle" ? BATTLE.idle : BATTLE.reach;
    const wpn = W[look.weapon] || W.sword;
    const wpal = Object.assign({}, pal, { r: EL_COLOR[look.el] || C.red, R: shade(EL_COLOR[look.el] || C.red), p: look.c, P: shade(look.c), w: C.leather, W: C.brown, l: C.brown, s: C.sand, x: C.white, k: C.black });

    if (look.wings) stamp(pix, WINGS.side.rows, ox + WINGS.side.x, oy + 10 + WINGS.side.y, { q: look.wings });
    // 기사는 등 뒤로 검을 차고 앞손에 방패
    if (look.shield) stamp(pix, W.sword.rows, ox + 11, oy + 5, wpal);
    stamp(pix, frame.rows, ox, oy + 10, pal);
    stampHead(pix, look, "side", ox + frame.head[0], oy + frame.head[1], pal, false);

    if (look.shield) {
      const sp = Object.assign({}, pal, { p: look.c === C.gold ? C.blue : look.c, P: shade(look.c), g: C.gold, w: C.white });
      const gx = frame.grip[0];
      const gy = frame.grip[1];
      stamp(pix, SHIELD.rows, ox + gx - 2, oy + gy - 4, sp);
    } else {
      let rows = wpn.rows;
      let grip = wpn.grip;
      if (pose === "reach" && wpn.melee) {
        rows = rotCCW(wpn.rows);
        grip = [grip[1], wpn.rows[0].length - 1 - grip[0]];
      } else if (pose === "idle" && wpn.melee && !wpn.up) {
        rows = flipV(wpn.rows);
        grip = [grip[0], wpn.rows.length - 1 - grip[1]];
      }
      stamp(pix, rows, ox + frame.grip[0] - grip[0], oy + frame.grip[1] - grip[1], wpal);
    }
    const cv = toCanvas(outline(pix), look.ghost ? 0.75 : 1);
    const res = { cv, ax: ox + 8, ay: oy + 20, w: 44, h: 40 };
    cache.set(key, res);
    return res;
  }

  /* ─────────────────────────── 몬스터 ─────────────────────────── */
  /* 24×24. half=true면 왼쪽 12칸만 그리고 좌우 대칭 */
  const MON = {
    slime: { half: 1, rows: [
      "............", "............", "............", "............", "............", "............", "............",
      "..........aa", "........aaaa", ".......aaaaa", "......aaaaaa", ".....aaaaaaa", "....aaaaaaaa", "....aaaaaaaa",
      "...aaaaakkaa", "..aaaaaakwaa", "..aaaaaakkaa", "..aaaaaaaaaa", ".aaaaaaaaakk", ".aaaaaaaaaaa", ".Aaaaaaaaaaa",
      "..AAaaaaaaaa", "...AAAAAAAAA", "............"],
      patch: [[6, 9, "ww"], [5, 10, "w"], [5, 11, "w"], [4, 12, "w"]] },
    goblin: { half: 1, rows: [
      "............", "............", "............", "............", "..........aa", "........aaaa", ".a.....aaaaa",
      ".aa...aaaaaa", "..aaaaaaaaaa", "...aaaawwaaa", "....aaawkaaa", ".....aaaaaAA", "......aakkkk", ".......aktkk",
      "........AAaa", ".......bbbbb", "......abbbbb", ".....aabbbbb", ".....aaccccc", ".......BBBBB", "........aaa.",
      "........aaa.", ".......AAAA.", "............"],
      patch: [[20, 8, "cc"], [19, 9, "ccc"], [19, 10, "ccc"], [20, 11, "cc"], [20, 12, "c"], [20, 13, "c"], [20, 14, "c"], [19, 15, "c"], [19, 16, "c"]] },
    rat: { rows: [
      "........................", "........................", "........................", "........................",
      "........................", "........................", "........................", "........................",
      "........................", "........................", "........................", "........................",
      "...............aa.......", "..............aAaa......", "............aaaaaaa.....", "..........aaaaaaaaaaa...",
      "........aaaaaaaaaakaaa..", "......aaaaaaaaaaaaaaaaak", ".....aaaaaaaaaaaaaaaaww.", "....aaaaaaaaaaaaaaaaa...",
      "...aaaaabbbbbbbbbaaa....", "..cAaaAAAAAAAAAAAAa.....", ".c..cc.cc.....cc.cc.....", "c......................."] },
    beast: { rows: [
      "........................", "........................", "........................", "........................",
      "........................", "...................a.a..", "..................aaaaa.", ".................aaaaaa.",
      "................aaaaeaa.", "...............aaaaaaaak", "...............aaaaaattt", ".aa............aaaaaa...",
      "..aa..........aaaaaaa...", "...aaaaaaaaaaaaaaaaa....", "...aaaaaaaaaaaaaaaaa....", "...aaaaaaaaaaaaaaaaa....",
      "...aaaaaaaaaaaaaaaaa....", "...aaAbbbbbbbbbbbbbb....", "...aaA.aa......aa.aa....", "...aa..aa......aa.aa....",
      "...aa..aa......aa.aa....", "..AAA.AAA.....AAA.AAA...", "........................", "........................"] },
    boar: { rows: [
      "........................", "........................", "........................", "........................",
      "........................", "........................", "........................", "..........A.A.A.........",
      "........AAaAaAaA........", "......AAaaaaaaaaaA.aa...", "....AAaaaaaaaaaaaaaaaa..", "...Aaaaaaaaaaaaaaaaaeaa.",
      "..Aaaaaaaaaaaaaaaaaaaaa.", ".kAaaaaaaaaaaaaaaaaaaccc", ".k.aaaaaaaaaaaaaaaaawckc", "...aaaaaaaaaaaaaaaaawccc",
      "...bbbbbbbbbbbbbbbbb.cc.", "...Abbbbbbbbbbbbbbb.....", "...AA.aa.......aa.aa....", "...AA.aa.......aa.aa....",
      "...kk.kk.......kk.kk....", "........................", "........................", "........................"] },
    bat: { half: 1, rows: [
      "............", "............", "............", "............", "............", "............", "............",
      "..a.........", ".aa.........", ".aaa......a.", "aaaa.....aaa", "aAaaa...aaaa", "aAAaaa.aawka", "aA.Aaaaaaaaa",
      "a..AAaaaaaat", "a...Aaaaaaaa", "....AAaaaaaa", "......Aaaaaa", ".......Aaaaa", "..........aa", "............",
      "............", "............", "............"] },
    mushroom: { half: 1, rows: [
      "............", "............", "............", ".......aaaaa", ".....aaaaaaa", "....aaccaaaa", "...aacccaaaa",
      "..aaaccaaaaa", "..aaaaaaaacc", ".aaaaaaaaccc", ".aaaaaaaaacc", "aaccaaaaaaaa", "aacccaaaaaaa", "AAAAAAAAAAAA",
      "....bbbbbbbb", "....bbbbbbbb", "....bbkkbbbb", "....bbkkbbbb", "....bbbbbbbb", "....bbbbbkkk", ".....bbbbbbb",
      ".....Bbbbbbb", "....BBBBBBBB", "............"] },
    skeleton: { half: 1, rows: [
      "............", "............", "........tttt", ".......ttttt", "......tttttt", "......tttttt", "......tkkttt",
      "......tkkttt", ".......ttttk", ".......tktkt", "........tttt", "...........t", ".....ttttttt", "....t..ttttt",
      "....t......t", "...t...ttttt", "...t.......t", "..t....ttttt", "..t.....tttt", ".......t....", ".......t....",
      ".......t....", "......tt....", "............"],
      patch: [[21, 5, "m"], [21, 6, "m"], [21, 7, "m"], [21, 8, "m"], [21, 9, "m"], [21, 10, "m"], [21, 11, "m"], [21, 12, "m"], [20, 13, "ggg"], [21, 14, "c"], [7, 6, "e"], [16, 6, "e"]] },
    bandit: { half: 1, rows: [
      "............", "............", "............", "..........bb", "........bbbb", ".......bbbbb", "......bbbbbb",
      "......bbkkkk", "......bkkekk", "......bkkkkk", "......bbaaaa", ".......baaaa", ".....bbbbbbb", "....bbbbbbbb",
      "....bbbbbbbb", "...bbbbbbbbb", "...bbbbbcccc", "...sbbbbbbbb", "....bbbbbbbb", ".....bbbbbbb", ".......kkk..",
      ".......kkk..", "......kkkk..", "............"],
      patch: [[20, 12, "m"], [20, 13, "m"], [20, 14, "m"], [19, 15, "gg"], [20, 16, "c"]] },
    brute: { half: 1, rows: [
      "............", "........aaaa", "......aaaaaa", ".....aaaaaaa", ".....aaaaaaa", ".....akkkaaa", ".....aawkaaa",
      ".....aaaaaAA", ".....aatkkkk", "......aaaaaa", "......AAaaaa", "..aaaaabbbbb", ".aaaaaabbbbb", "aaaaaabbbbbb",
      "aaa.aabbbbbb", "aaa..bbbbbbb", "aaa..bbbbbbb", "aa...ccccccc", "aa...BBBBBBB", ".....aaaa...", ".....aaaa...",
      ".....aaaa...", "....AAAAA...", "............"] },
    spider: { half: 1, rows: [
      "............", "............", "............", "............", ".........aaa", ".......aaaaa", "......aaaaaa",
      "......aacaaa", "......acccaa", "......aacaaa", "..aa...aaaaa", ".a..a...bbbb", "a....a.bbbbb", "a.....abbebb",
      "...aa..bbbbe", "..a..a.bbbbb", ".a....a.bbtt", "a......a..t.", "..aa....a...", ".a..a.......", "a....a......",
      "............", "............", "............"] },
    zombie: { half: 1, rows: [
      "............", "............", "........aaaa", ".......aaaaa", "......aaaaaa", "......aakkaa", "......awkaaa",
      "......aaaaaa", ".......akkkk", ".......akktk", "........aaaa", "....bbbbbbbb", "..aabbbbbbbb", ".aa.bbBbbbbb",
      "aa..bbbbbbbb", "....bbbBbbbb", "....bBbb.bbb", ".....cccccc.", ".....ccc.ccc", ".....ccc..cc", "......cc..cc",
      ".....aaa..aa", "....AAA...AA", "............"] },
    harpy: { half: 1, rows: [
      "............", "............", "........hhhh", ".......hhhhh", "......hhhhhh", "......hsssss", "......hskwss",
      "q.....hsssss", "qq....hhssss", "qqq...hhhsSS", ".qqq...h.bbb", "..qqqqqqbbbb", "...qqqqbbbbb", "....qqqbbbbb",
      ".....qqqbbbb", "......qqqbbb", ".......qqbbb", "........ttbb", "........t.tt", ".......t..t.", "............",
      "............", "............", "............"] },
    lizard: { half: 1, rows: [
      "............", "............", "........aaaa", ".......aaaaa", "......aaaaaa", "......ayaaaa", "......akaaaa",
      "......aaaaaa", ".......aakkk", "........aaaa", "......bbbbbb", ".....abbbbbb", "....aabbbbbb", "....aabbcccc",
      "....aabbbbbb", "....aabbbbbb", ".....bbbbbbb", "......aaaaaa", "......aa..aa", "......aa..aa", ".....AAA..AA",
      "........aa..", ".........aaa", "............"],
      patch: [[21, 2, "m"], [20, 3, "mmm"], [21, 4, "w"], [21, 5, "w"], [21, 6, "w"], [21, 7, "w"], [21, 8, "w"], [21, 9, "w"], [21, 10, "w"], [21, 11, "w"], [21, 12, "w"], [21, 13, "w"], [21, 14, "w"], [21, 15, "w"]] },
    wisp: { half: 1, rows: [
      "............", "............", "...........a", "..........aa", ".........aaa", ".....a...aaa", ".....aa.aaaa",
      "......aaaaba", ".....aaaabbb", "....aaaabbbb", "....aaabbbbb", "...aaabbbwww", "...aaabbbkkw", "...aaabbbkkw",
      "...aaabbbwww", "...aaabbbbbb", "....aaabbbbk", "....aaaabbbb", ".....aaaaabb", "......aaaaaa", ".......Aaaaa",
      ".........AAA", "............", "............"] },
    ghost: { half: 1, rows: [
      "............", "............", "............", "........aaaa", "......aaaaaa", ".....aaaaaaa", "....aaaaaaaa",
      "....aaakkaaa", "...aaaakkaaa", "...aaaaaaaaa", "...aaaaaakkk", "..aaaaaaakkk", "..aaaaaaaaaa", ".aaaaaaaaaaa",
      ".aaaaaaaaaaa", "aaaaaaaaaaaa", "aaaaaaaaaaaa", "Aaaaaaaaaaaa", "AAaaaaaaaaaa", "A.AAaaaaAAaa", "...AA..A..AA",
      "............", "............", "............"] },
    gargoyle: { half: 1, rows: [
      "............", ".......k....", ".......kk...", "..a.....kaaa", ".aa....aaaaa", "aaa...aaaaaa", "aaaa..aaeaaa",
      "aaaaa.aaaaaA", "aAaaaa.akkkk", "aAAaaaa.atat", "aA.Aaaaaaaaa", "a..AAaaabbbb", "a...Aaaabbbb", "....AAaabbbb",
      "......aabbbb", ".....aaabbbb", ".....aaaaaaa", "......aaaaaa", "......aa..aa", ".....aaa..aa", ".....AAA..AA",
      "....ttt...tt", "............", "............"] },
    dragon: { rows: [
      "........................", "........................", "...........a............", "..........aa.........aa.",
      ".........aaa........aaa.", "........aaaa.......aaaaa", ".......aaaaa......aaaeak", "......aaaaaa.....aaaaaaa",
      ".....aaaaaa.....aaaaatt.", "....aAaaaa.....aaaa.....", "...aAAaaa.....aaaa......", "..aA.Aaaaaaaaaaaaa......",
      ".a...aaaaaaaaaaaab......", "a...aaaaaaaaaaaabb......", "...aaaaaaaaaaaabbb......", "..aaaaaaaaaaaabbbb......",
      "..aaaaaaaaaaabbbb.......", "...aaaaaaaaabbbb........", "...aaa..aaaaaaa.........", "..aaa....aa..aa.........",
      ".aaa.....aa..aa.........", ".aa.....AAA.AAA.........", "aa......................", "........................"] },
    caped: { half: 1, rows: [
      "............", ".........hhh", ".......hhhhh", "......hhhhhh", "......hsssss", "......hssess", "......sskess",
      "......ssssss", ".......sskkt", "..bb....ssss", ".bbbb.ccbbbb", "bbbbbbccbbbb", "bbbbbbbbaaaa", "bbbbbbbaaaaa",
      "bbbbbbbaaaaa", "bbbbbbbaaaac", "bbbbbbbaaaaa", "Bbbbbbbaaaaa", "BBbbbbbbaaaa", ".BBbbbbbaa.a", "..BBBbbbaa.a",
      "....BBBBkk.k", "............", "............"] },
    golem: { half: 1, rows: [
      "............", "............", ".......aaaaa", "......aaaaaa", "......aAAAAA", "......aaawwa", "......aaawka",
      "......aaaaaa", ".......AAAAA", "..aaaaaaaaaa", ".aaaaaaaaaaa", ".aaaAaaacccc", ".aaaAaaaaaaa", ".aaaAaaaaaaa",
      ".aaa.aaaaaaa", ".aaa.AAaaaaa", "aaaa..aaaaaa", "AAAA..aaaaAA", "......aaaa..", "......aaaa..", ".....aaaaa..",
      ".....AAAAA..", "............", "............"],
      patch: [[8, 13, "c"], [9, 14, "c"], [10, 15, "cc"]] },
    witch: { half: 1, rows: [
      ".........aa.", "........aaa.", ".......aaaa.", "......aaaaa.", ".....aaaaaaa", "...cccccccca", "aaaaaaaaaaaa",
      "......hsssss", "......hsskss", "......hsssss", "......hhsskk", "......aaaaaa", ".....aaaaaaa", "....aaaaacca",
      "...saaaaaaaa", "....aaaaaaaa", "....aaaaaaaa", "...aaaaaaaaa", "...aaaaaaaaa", "..aaaaaaaaaa", "..AaaaaaaaaA",
      "..AAAAAAAAAA", "............", "............"],
      patch: [[20, 4, "rr"], [20, 5, "rr"], [20, 6, "w"], [20, 7, "w"], [20, 8, "w"], [20, 9, "w"], [20, 10, "w"], [20, 11, "w"], [20, 12, "w"], [20, 13, "w"], [20, 14, "w"], [20, 15, "w"], [20, 16, "w"]] },
    eye: { half: 1, rows: [
      "............", "............", "........aaaa", "......aaaaaa", ".....aaaaaaa", "....aawwwwww", "....awwwwwww",
      "...aawwwwkkk", "...awwwwkkkk", "...awwwwkkcc", "...awwwwkkcc", "...aawwwwkkk", "....awwwwwww", "....aaaawwww",
      ".....aaaaaaa", "....a.aaaaa.", "...a..a.a..a", "...a.a..a..a", "..a..a..a.a.", ".a...a...a..", ".a..a....a..",
      "....a.......", "............", "............"] },
    serpent: { half: 1, rows: [
      "............", "..........aa", "........aaaa", ".....bbaaaaa", "....bbbaaaaa", "...bbbbaawka", "...bbbbbaaaa",
      "...bbbbbaakk", "...bbbbbbaar", "....bbbbbbcc", ".....bbbbbcc", "......bbbbcc", "........aacc", "........aacc",
      "........aacc", ".......aaacc", "......aaaacc", "....aaaaaaaa", "...aaAAAAAaa", "..aaaaaaaaAA", "..aAAAAAAaaa",
      "...aaaaaaaaa", "....AAAAAAAA", "............"] },
    bird: { half: 1, rows: [
      "............", "............", "..........cc", ".........cc.", "........aaaa", ".......aaaaa", "......aaakwa",
      "b.....aaaaay", "bb....aaaayy", "bbb...aaaaay", ".bbb..aaaaaa", ".bbbbaaaaaaa", "..bbbbaaaaaa", "...bbbaaaaaa",
      "....bbbaaaaa", ".....bbaaaaa", "......baaaaa", "........aaaa", ".......bb.bb", "......bb..bb", ".....b..y..y",
      "............", "............", "............"] },
    knight: { half: 1, rows: [
      "............", "........aaaa", ".......aaaaa", "......aaaaaa", "......aakkkk", "......akkekk", "......aaaaaa",
      ".......aaaaa", "....bbbaaaaa", "...bbbaaaaaa", "..bbbaaaaaaa", "..bbaaAaacca", "..bbaaAaaaaa", "..bbaaAaaaaa",
      "..bb.aaaaaaa", "..bb.aaacccc", "..bb..aaaaaa", "..bb..aaaaaa", "..b...aaa.aa", "......aaa.aa", ".....AAAA.AA",
      "............", "............", "............"],
      patch: [[21, 1, "m"], [21, 2, "m"], [21, 3, "m"], [21, 4, "m"], [21, 5, "m"], [21, 6, "m"], [21, 7, "m"], [21, 8, "m"], [21, 9, "m"], [21, 10, "m"], [20, 11, "ggg"], [21, 12, "c"]] },
    /* 난이도별로 더한 몬스터의 모양: 토끼·임프·집게·식인 꽃·나무 정령·미믹·요정·대지렁이 */
    rabbit: { half: 1, rows: [
      "............", ".......aa...", "......abba..", "......abba..", "......abba..", "......abba..", "......abba..", ".......aa...",
      ".....aaaaaaa", "....aaaaaaaa", "....aaaaaaaa", "....aawkaaaa", "....aakkaaaa", "....aaaaaaab", "....bbaaaaaa", ".....aaaaaaa",
      "......aaaaaa", ".....aaaawww", "....aaaawwww", "....aaaawwww", "....aaaaawww", ".....aaaaaaa", ".....AAA....", "............"] },
    imp: { half: 1, rows: [
      "............", "............", ".....c......", ".....cc.....", "......cc....", "......caaaaa", ".....aaaaaaa", ".....aaaaaaa",
      ".....awwaaaa", ".....aweaaaa", ".....aaaaaaa", "......akkkkk", "q.....atkkkt", "qq.....aaaaa", "qqq...bbbbbb", ".qqqq.bbbbbb",
      "..qqqqbbbbbb", "...qq.bbbbbb", "......abbbbb", ".......aa...", ".......aa...", "......AAA...", "............", "............"] },
    crab: { half: 1, rows: [
      "............", "............", "............", ".bb.........", "bbbb........", "bb.bb.......", "bb..b.......", "bbbbb.......",
      ".bbb....k...", "..bb....k...", "...b...wkk..", "...bbaaaaaaa", "....baaaaaaa", "...aaaaaaaaa", "..aaaaaaaaaa", "..aaaaaaaakk",
      "..AaaaaaaaAA", "...AAAAAAAAA", "..b.b.b.....", ".b.b.b......", "b.b.b.......", "............", "............", "............"] },
    plant: { half: 1, rows: [
      "............", ".......bb...", ".....bbbb...", "...bbbbbbbbb", "..bbbaaaaaaa", ".bbbaaaaaaaa", ".bbaaawkaaaa", "bbbaaakkaaaa",
      "bbaaaaaaaaaa", "bbaarrrrrrrr", "bbaawrwrwrwr", ".bbarrrrrrrr", ".bbbaaaaaaaa", "..bbbbaaaaaa", "....bbbb..cc", "..........cc",
      "..cc......cc", ".cccc.....cc", "cccccc...ccc", ".ccccccccccc", "..........cc", "......MMMMMM", ".....MMMMMMM", "......MMMMMM"] },
    treant: { half: 1, rows: [
      "......bbbbbb", "....bbbbbbbb", "...bbbbbbbbb", "..bbbbbbbbbb", ".bbbbbbbbbbb", ".bbbbbbbbbbb", "..bbbbbbbbbb", "...bbbaaaaaa",
      "a....aaaaaaa", "aa...aaaaaaa", ".aa..aakkaaa", "..aaaaakeaaa", "...aaaaaaaaa", ".....aaAkkkk", ".....aaaAkka", ".....aaaaaaa",
      ".....aaAaaaa", ".....aaaaAaa", "....aaaaaaaa", "...aa.aaaaaa", "..aa..aa.aaa", ".aa..aa..aa.", "AA..AA...AA.", "............"] },
    mimic: { half: 1, rows: [
      "............", "............", "............", "....gggggggg", "...gaaaaaaaa", "...gaaaaaaaa", "...gaaaaaaaa", "...ggggggggg",
      "....wkwkwkwk", "....kkkkkkkk", "....kkeekkkk", "....kkeekkkk", "....kkkkkkrr", "....wkwkwkrr", "...gggggggrg", "...gaaaaaaaa",
      "...gaaaaaaaa", "...gaaaaaggg", "...gaaaaagkk", "...gaaaaaggg", "...gaaaaaaaa", "...ggggggggg", "....AAAAAAAA", "............"] },
    fairy: { half: 1, rows: [
      "............", "............", "............", "............", "q.......hhhh", "qq.....hhhhh", "qqq...hhssss", "qqqq..hsskss",
      "qqqqq.hsssss", ".qqqq..sssss", "..qqqq..bbbb", "...qqqqbbbbb", "....qqbbbbbb", ".....bbbbbbb", ".....bbbbbbb", "......bbbbbb",
      ".......BBBBB", ".........s..", ".........s..", "............", "............", "............", "............", "............"] },
    worm: { rows: [
      "........................", "........................", "..............aaaaa.....", ".............aaaaaaa....", "............aaaaaaaaa...", "...........aakkkkkkaaa..", "...........akwkwkwkkaa..", "...........akkkkkkkkaaa.",
      "...........akwkwkwkkaa..", "............aaaaaaaaaa..", "............AaaaaaaaaA..", "...........aaaaaaaaaa...", "...........AaaaaaaaaA...", "..........aaaaaaaaaa....", "..........AaaaaaaaaA....", ".........aaaaaaaaaa.....",
      ".........AaaaaaaaaA.....", "........aaaaaaaaaa......", "...aaa..AaaaaaaaaA......", "..aaaaa.aaaaaaaaaa......", ".bbbbbbbbbbbbbbbbbbbbb..", "bbbbbbbbbbbbbbbbbbbbbbbb", "........................", "........................"] }
  };

  /* 몬스터 이름 → 템플릿과 색 */
  const MON_LOOK = {
    "슬라임": ["slime", { a: C.green }],
    "고블린": ["goblin", { a: C.green, b: C.brown, c: C.leather }],
    "거대 쥐": ["rat", { a: C.grey, b: C.lgrey, c: C.pink }],
    "굶주린 늑대": ["beast", { a: C.grey, b: C.lgrey }],
    "흡혈 박쥐": ["bat", { a: C.purple }],
    "코볼트 광부": ["goblin", { a: C.leather, b: C.slate, c: C.lgrey }],
    "독버섯 괴물": ["mushroom", { a: C.red, c: C.white, b: C.sand }],
    "해골 병사": ["skeleton", { t: C.sand }],
    "성난 멧돼지": ["boar", { a: C.brown, b: C.leather, c: C.tan }],
    "산적": ["bandit", { a: C.dgrey, b: C.brown, s: C.skin1, c: C.leather }],
    "고블린 족장": ["goblin", { a: C.dgreen, b: C.red, c: C.gold }],
    "거대 슬라임 왕": ["slime", { a: C.lblue }],
    "오크 전사": ["brute", { a: C.dgreen, b: C.brown, c: C.grey }],
    "거대 거미": ["spider", { a: C.slate, b: C.navy, c: C.red }],
    "썩은 좀비": ["zombie", { a: "#8aa37a", b: C.brown, c: C.slate }],
    "하피": ["harpy", { h: C.purple, s: C.skin1, q: C.lgrey, b: C.dgrey, t: C.gold }],
    "리자드맨 전사": ["lizard", { a: C.green, b: C.leather, c: C.gold }],
    "그렘린": ["goblin", { a: C.teal, b: C.slate, c: C.yellow }],
    "늑대인간": ["beast", { a: C.brown, b: C.sand }],
    "화염 정령": ["wisp", { a: C.red, b: C.orange }],
    "얼음 정령": ["wisp", { a: C.lblue, b: C.cyan }],
    "원한의 망령": ["ghost", { a: C.lgrey }],
    "거미 여왕": ["spider", { a: C.purple, b: C.navy, c: C.yellow }],
    "오크 대족장": ["brute", { a: C.ddgreen, b: C.dred, c: C.gold }],
    "트롤": ["brute", { a: "#5f8fa3", b: C.brown, c: C.leather }],
    "미노타우로스": ["brute", { a: C.brown, b: C.dred, c: C.gold }, [[3, 1, "tt"], [2, 0, "t"], [19, 1, "tt"], [21, 0, "t"]]],
    "가고일": ["gargoyle", { a: C.grey, b: C.dgrey }],
    "와이번": ["dragon", { a: C.dgreen, b: C.sand }],
    "뱀파이어": ["caped", { h: C.black, s: C.lgrey, a: C.black, b: C.dred, c: C.gold }],
    "바위 골렘": ["golem", { a: C.leather, c: C.orange }],
    "나가": ["serpent", { a: C.teal, b: C.lblue, c: C.sand }],
    "켄타우로스 궁수": ["bandit", { a: C.dgreen, b: C.leather, s: C.skin1, c: C.gold }],
    "암흑 기사": ["knight", { a: C.slate, b: C.dred, c: C.red }],
    "늪지 마녀": ["witch", { a: C.dgreen, h: C.black, s: C.green, c: C.purple }],
    "리치": ["witch", { a: C.purple, h: C.navy, s: C.sand, c: C.gold }],
    "미궁의 황소왕": ["brute", { a: C.dred, b: C.black, c: C.gold }, [[3, 1, "tt"], [2, 0, "t"], [19, 1, "tt"], [21, 0, "t"]]],
    "오우거": ["brute", { a: C.skin1, b: C.brown, c: C.leather }],
    "키메라": ["beast", { a: C.gold, b: C.red }],
    "바실리스크": ["serpent", { a: C.dgreen, b: C.green, c: C.yellow }],
    "서큐버스": ["caped", { h: C.magenta, s: C.pink, a: C.purple, b: C.purple, c: C.magenta }],
    "만티코어": ["beast", { a: C.rust, b: C.tan }],
    "강철 골렘": ["golem", { a: C.lgrey, c: C.cyan }],
    "듀라한": ["knight", { a: C.black, b: C.purple, c: C.cyan }],
    "크라켄의 촉수": ["eye", { a: C.purple, c: C.red }],
    "화염 거인": ["brute", { a: C.orange, b: C.dred, c: C.yellow }],
    "서리 거인": ["brute", { a: C.lblue, b: C.blue, c: C.white }],
    "히드라": ["serpent", { a: C.green, b: C.dgreen, c: C.yellow }],
    "서리 여왕": ["witch", { a: C.lblue, h: C.white, s: C.lgrey, c: C.cyan }],
    "상급 악마": ["gargoyle", { a: C.red, b: C.black }],
    "베헤모스": ["beast", { a: C.purple, b: C.magenta }],
    "데스 나이트": ["knight", { a: C.black, b: C.slate, c: C.cyan }],
    "타락천사": ["harpy", { h: C.white, s: C.lgrey, q: C.black, b: C.purple, t: C.gold }],
    "심연의 촉수": ["eye", { a: C.navy, c: C.magenta }],
    "시간의 파수꾼": ["golem", { a: C.gold, c: C.cyan }],
    "혼돈의 마수": ["beast", { a: C.magenta, b: C.cyan }],
    "폭풍 거인": ["brute", { a: C.slate, b: C.navy, c: C.yellow }],
    "불사조": ["bird", { a: C.orange, b: C.yellow, c: C.red, y: C.gold }],
    "그림자 용": ["dragon", { a: C.navy, b: C.purple }],
    "고룡": ["dragon", { a: C.red, b: C.gold }],
    "마왕의 그림자": ["caped", { h: C.black, s: C.slate, a: C.black, b: C.purple, c: C.red }],
    "공허의 군주": ["eye", { a: C.black, c: C.magenta }],
    /* 쉬움에만 나오는 순한 몬스터, 어려움의 정예, 새 보스와 어려움의 중간 보스 */
    "아기 슬라임": ["slime", { a: "#9be37f" }],
    "솜털 토끼": ["rabbit", { a: C.white, b: C.pink }],
    "독침 임프": ["imp", { a: C.purple, b: C.magenta, c: C.lgrey, e: C.yellow, q: C.dbrown }],
    "그림자 늑대": ["beast", { a: C.navy, b: C.purple }],
    "칼날 고블린": ["goblin", { a: C.dred, b: C.black, c: C.lgrey }],
    "숲의 고목왕": ["treant", { a: C.brown, b: C.dgreen, e: C.yellow }],
    "늑대 우두머리": ["beast", { a: C.lgrey, b: C.white }, [[17, 4, "g.g.g"], [17, 5, "ggggg"]]],
    "꼬마 요정": ["fairy", { h: C.yellow, s: C.skin1, b: C.green, q: C.cyan }],
    "졸린 버섯돌이": ["mushroom", { a: C.lblue, c: C.white, b: C.sand }],
    "철갑 집게": ["crab", { a: C.rust, b: C.tan }],
    "피의 박쥐": ["bat", { a: C.dred }],
    "광기의 하피": ["harpy", { h: C.red, s: C.skin1, q: C.dred, b: C.black, t: C.gold }],
    "달빛 늑대왕": ["beast", { a: "#9fb4e6", b: C.white }, [[17, 4, "g.g.g"], [17, 5, "ggggg"]]],
    "식인 꽃의 여왕": ["plant", { a: C.yellow, b: C.magenta, c: C.dgreen }],
    "수줍은 미믹": ["mimic", { a: C.leather, e: C.yellow }],
    "촛불 도깨비": ["wisp", { a: C.gold, b: C.yellow }],
    "해골 마법사": ["witch", { a: C.navy, h: C.black, s: C.sand, c: C.cyan }],
    "저주받은 갑옷": ["knight", { a: C.dgreen, b: C.ddgreen, c: C.green }],
    "흡혈 귀족": ["caped", { h: C.lgrey, s: C.lgrey, a: C.dred, b: C.black, c: C.red }],
    "보물고의 미믹왕": ["mimic", { a: C.dred, e: C.cyan }],
    "망령 기사단장": ["knight", { a: C.lgrey, b: C.navy, c: C.cyan }],
    "눈덩이 슬라임": ["slime", { a: C.white }],
    "눈꽃 새": ["bird", { a: C.white, b: C.lblue, c: C.cyan, y: C.gold }],
    "얼음 집게": ["crab", { a: C.lblue, b: C.cyan }],
    "서리 늑대": ["beast", { a: C.white, b: C.cyan }],
    "눈보라 정령": ["wisp", { a: C.white, b: C.lgrey }],
    "빙하 대지렁이": ["worm", { a: C.lgrey, b: C.white }],
    "눈보라 마녀": ["witch", { a: C.blue, h: C.lblue, s: C.white, c: C.white }],
    "떠도는 별똥 정령": ["fairy", { h: C.gold, s: C.yellow, b: C.white, q: C.yellow }],
    "아기 촉수": ["eye", { a: C.pink, c: C.purple }],
    "공허 집게": ["crab", { a: C.purple, b: C.magenta }],
    "나락의 임프": ["imp", { a: C.black, b: C.dred, c: C.gold, e: C.red, q: C.dred }],
    "종말의 기사": ["knight", { a: C.gold, b: C.black, c: C.red }],
    "세계 포식자 웜": ["worm", { a: C.purple, b: C.navy }],
    "임프 대공": ["imp", { a: C.red, b: C.black, c: C.gold, e: C.yellow, q: C.black }]
  };

  function monsterPal(colors) {
    const a = colors.a || C.grey;
    const b = colors.b || shade(a, 0.85);
    return {
      a, A: shade(a), b, B: shade(b), c: colors.c || C.gold, e: colors.e || C.red, k: C.black, w: C.white,
      t: colors.t || C.sand, m: C.lgrey, M: C.grey, g: C.gold, s: colors.s || C.skin1, S: shade(colors.s || C.skin1),
      h: colors.h || C.black, q: colors.q || C.lgrey, y: colors.y || C.yellow, r: C.red
    };
  }

  function monsterSprite(name) {
    const base = MON_LOOK[name] ? name : name.replace(/^(광폭한|심연의) /, "");
    const key = "m" + name;
    if (cache.has(key)) return cache.get(key);
    const spec = MON_LOOK[base] || ["slime", { a: C.magenta }];
    const tpl = MON[spec[0]];
    const rows = tpl.half ? mirror(tpl.rows) : tpl.rows;
    const colors = Object.assign({}, spec[1]);
    if (base !== name && name.startsWith("광폭한")) colors.e = C.yellow;
    if (base !== name && name.startsWith("심연의")) { colors.a = shade(colors.a || C.grey, 0.7); colors.e = C.cyan; }
    const pal = monsterPal(colors);
    const pix = new Pix(26, 26);
    stamp(pix, rows, 1, 1, pal);
    patchRuns(pix, tpl.patch, pal, 1, 1);
    patchRuns(pix, spec[2], pal, 1, 1);
    const cv = toCanvas(outline(pix));
    cache.set(key, cv);
    cache.set("p" + name, toCanvas(pix));
    return cv;
  }
  /* 외곽선 없는 원본 — 확대 후 음영을 입히는 용도 */
  function monsterPlain(name) {
    if (!cache.has("p" + name)) monsterSprite(name);
    return cache.get("p" + name);
  }

  /* ─────────────────────────── 타일 ─────────────────────────── */
  const TILES = {
    grass: ["gggggggggggggggg", "ggggggGggggggggg", "gggggGgGgggggggg", "gggggggggggggggg", "gggggggggggGgggg", "gggggggggggggggg", "ggGggggggggggggg", "gGgGgggggggggggg",
      "ggggggggggggggGg", "gggggggggggggGgG", "gggggggggggggggg", "gggggggGgggggggg", "ggggggGgGggggggg", "gggggggggggggggg", "gggggggggggggggg", "gggggggggggggggg"],
    flowers: ["gggggggggggggggg", "ggwgggggggggyggg", "gwywggggggggyggg", "ggwggggggggggggg", "gggggggggggggggg", "gggggggggggggggg", "gggggggggggggggg", "ggggggggrggggggg",
      "gggggggrwrgggggg", "ggggggggrggggggg", "gggggggggggggggg", "ggggggggggggggwg", "ggyggggggggggwyw", "gggggggggggggggw", "gggggggggggggggg", "gggggggggggggggg"],
    path: ["pppppppppppppppp", "pppppPpppppppppp", "pppppppppppppppp", "ppppppppppPPpppp", "pppppppppppppppp", "pPPppppppppppppp", "pppppppppppppppp", "ppppppppppppppPp",
      "pppppppppppppppp", "ppppppPpppppppppp", "pppppppppppppppp", "pppppppppppppppp", "ppPppppppppPPppp", "pppppppppppppppp", "ppppppppPppppppp", "pppppppppppppppp"],
    water0: ["bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbbwwwbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbwwwbb", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bwwwbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb", "bbbbbbbbwwwbbbbb", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbbbbwwwbbbbbbbb", "bbbbbbbbbbbbbwww", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb"],
    water1: ["bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbbbwwwbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbwwwb", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbwwwbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb", "bbbbbbbbbwwwbbbb", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbbbbbwwwbbbbbbb", "wbbbbbbbbbbbbbww", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb"],
    tree: ["................", ".....LLLLLL.....", "...LLlllllLLL...", "..LlllllllllLL..", ".LllllwlllllllL.", ".Llllwwllllll.L.", "LllllllllllllllL", "LllllllllllllllL",
      "LLlllllllllllLLL", ".LLlllllllllLLL.", "..LLLllllLLLL...", "....LLLLLLLL....", "......tTTt......", "......tTTt......", ".....ttTTtt.....", "....dddddddd...."],
    wall: ["tttttttttttttttt", "tTTTTTTTTTTTTTTt", "tTttttttttttttTt", "tTTTTTTTTTTTTTTt", "bbbbbbbmbbbbbbbm", "bbbbbbbmbbbbbbbm", "mmmmmmmmmmmmmmmm", "bbbmbbbbbbbmbbbb",
      "bbbmbbbbbbbmbbbb", "mmmmmmmmmmmmmmmm", "bbbbbbbmbbbbbbbm", "bbbbbbbmbbbbbbbm", "mmmmmmmmmmmmmmmm", "bbbmbbbbbbbmbbbb", "BBBmBBBBBBBmBBBB", "kkkkkkkkkkkkkkkk"],
    walltop: ["tttttttttttttttt", "tTTTTTTTTTTTTTTt", "tTttttttttttttTt", "tTttttttttttttTt", "tTttttttttttttTt", "tTttttttttttttTt", "tTttttttttttttTt", "tTttttttttttttTt",
      "tTttttttttttttTt", "tTttttttttttttTt", "tTttttttttttttTt", "tTttttttttttttTt", "tTttttttttttttTt", "tTttttttttttttTt", "tTTTTTTTTTTTTTTt", "tttttttttttttttt"],
    stairs: ["kkkkkkkkkkkkkkkk", "kffffffffffffffk", "kFFFFFFFFFFFFFFk", "kkkkkkkkkkkkkkkk", "kkfffffffffffkkk", "kkFFFFFFFFFFFkkk", "kkkkkkkkkkkkkkkk", "kkkfffffffffkkkk",
      "kkkFFFFFFFFFkkkk", "kkkkkkkkkkkkkkkk", "kkkkfffffffkkkkk", "kkkkFFFFFFFkkkkk", "kkkkkkkkkkkkkkkk", "kkkkkfffffkkkkkk", "kkkkkkkkkkkkkkkk", "kkkkkkkkkkkkkkkk"],
    chest: ["................", "................", "................", "...kkkkkkkkkk...", "..kwwwwwwwwwwk..", "..kwWWWWWWWWwk..", "..kwwwwwwwwwwk..", "..kggggggggggk..",
      "..kwwwwgywwwwk..", "..kwWWWgyWWWwk..", "..kwwwwwwwwwwk..", "..kwWWWWWWWWwk..", "..kwwwwwwwwwwk..", "..kkkkkkkkkkkk..", "................", "................"],
    chestOpen: ["................", "................", "...kkkkkkkkkk...", "..kWWWWWWWWWWk..", "..kWkkkkkkkkWk..", "..kkkkkkkkkkkk..", "..kwyyyyyyyywk..", "..kggggggggggk..",
      "..kwwwwwwwwwwk..", "..kwWWWWWWWWwk..", "..kwwwwwwwwwwk..", "..kwWWWWWWWWwk..", "..kwwwwwwwwwwk..", "..kkkkkkkkkkkk..", "................", "................"]
  };

  /* 던전 단계별 색: 0 흙동굴 1 이끼 석굴 2 지하 묘지 3 얼음 동굴 4 심연 */
  const DUNGEON_PAL = [
    { f: "#8a5a44", F: "#6e4535", d: "#4e3127", t: "#5c3c2e", T: "#47302a", b: "#9c6a50", B: "#7a5240", m: "#4e3127", bg: "#2a1c18" },
    { f: "#5f6f5a", F: "#4d5b49", d: "#343f33", t: "#3e4a3b", T: "#2f3a2e", b: "#6f7f68", B: "#56644f", m: "#343f33", bg: "#161d16" },
    { f: "#5a5470", F: "#48435b", d: "#302c40", t: "#3a3550", T: "#2c2840", b: "#6b6488", B: "#544e6c", m: "#302c40", bg: "#14111f" },
    { f: "#7fa6c4", F: "#6688a6", d: "#41607c", t: "#4f7290", T: "#3d5a74", b: "#a6c8e0", B: "#7fa0bc", m: "#41607c", bg: "#0f1d2b" },
    { f: "#4a2a3e", F: "#3a1f30", d: "#22121c", t: "#2e1826", T: "#22121c", b: "#6a3048", B: "#4f2236", m: "#22121c", bg: "#0c0610" }
  ];
  const TOWN_PAL = {
    g: "#63c74d", G: "#3e8948", w: C.white, y: C.yellow, r: C.red, p: "#d4a36a", P: "#b8854f",
    b: "#2b7fd1", l: "#3e8948", L: "#265c42", t: C.brown, T: C.dbrown, d: "#2f6e3c", k: C.black, W: C.brown, g2: C.gold
  };

  /* 바닥은 무늬를 절차적으로: 옅은 얼룩 + 오른쪽·아래 이음매, floor2는 금 간 바닥 */
  function floorRows(variant) {
    let seed = 1234 + variant * 977;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const rows = [];
    for (let y = 0; y < 16; y++) {
      let line = "";
      for (let x = 0; x < 16; x++) {
        if (y === 15 || x === 15) line += "d";
        else if (rnd() < 0.07) line += "F";
        else line += "f";
      }
      rows.push(line);
    }
    if (variant === 1) {
      const crack = [[4, 3], [5, 4], [5, 5], [6, 6], [7, 6], [8, 7], [8, 8], [9, 9]];
      crack.forEach(([x, y]) => { rows[y] = rows[y].slice(0, x) + "d" + rows[y].slice(x + 1); });
    }
    return rows;
  }
  TILES.floor = floorRows(0);
  TILES.floor2 = floorRows(1);

  function tile(name, tier) {
    const key = `t${name}${tier === undefined ? "" : tier}`;
    if (cache.has(key)) return cache.get(key);
    const rows = TILES[name];
    let pal;
    if (tier === undefined) pal = TOWN_PAL;
    else pal = Object.assign({ k: "#120d10", w: C.leather, W: C.brown, g: C.gold, y: C.yellow }, DUNGEON_PAL[tier]);
    if (name === "tree" || name === "chest" || name === "chestOpen") pal = Object.assign({}, pal, { l: "#3e8948", L: "#265c42", t: C.brown, T: C.dbrown, d: "#2f6e3c", k: C.black, w: C.leather, W: C.brown, g: C.gold, y: C.yellow });
    const pix = new Pix(16, 16);
    stamp(pix, rows, 0, 0, pal);
    const cv = toCanvas(pix);
    cache.set(key, cv);
    return cv;
  }

  /* 작은 아이콘 (상점, 메뉴용) */
  const ICONS = {
    potion: { rows: ["...kk...", "...ww...", "..rrrr..", ".rrwrrr.", ".rwrrrr.", ".rrrrrr.", "..rrrr.."], pal: { k: C.brown, w: C.lgrey, r: C.red } },
    ether: { rows: ["...kk...", "...ww...", "..rrrr..", ".rrwrrr.", ".rwrrrr.", ".rrrrrr.", "..rrrr.."], pal: { k: C.brown, w: C.lgrey, r: C.lblue } },
    sword: { rows: [".....wm", "....wm.", "...wm..", "g.wm...", ".gm....", ".lg....", "l..g..."], pal: { w: C.white, m: C.lgrey, g: C.gold, l: C.brown } },
    shield: { rows: ["gggggg", "gbbbbg", "gbwwbg", "gbbbbg", ".gbbg.", "..gg.."], pal: { g: C.gold, b: C.blue, w: C.white } },
    scroll: { rows: ["ssssss.", "swwwwws", ".wkkkw.", ".wwwww.", ".wkkkw.", "swwwwws", "ssssss."], pal: { s: C.leather, w: C.sand, k: C.brown } },
    coin: { rows: [".ggg.", "gyygg", "gyggG", "gyggG", ".gGG."], pal: { g: C.gold, y: C.yellow, G: C.orange } },
    bed: { rows: ["w.......", "wwpppppp", "wwbbbbbb", "wbbbbbbb", "k......k"], pal: { w: C.white, p: C.lgrey, b: C.red, k: C.brown } },
    heart: { rows: [".rr.rr.", "rwrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."], pal: { r: C.red, w: C.pink } }
  };
  function icon(name, scale) {
    const key = `i${name}${scale}`;
    if (cache.has(key)) return cache.get(key);
    const def = ICONS[name];
    const w = def.rows[0].length + 2;
    const h = def.rows.length + 2;
    const pix = new Pix(w, h);
    stamp(pix, def.rows, 1, 1, def.pal);
    const small = toCanvas(outline(pix));
    const s = scale || 3;
    const big = makeCanvas(w * s, h * s);
    const ctx = big.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, w * s, h * s);
    const url = big.toDataURL();
    cache.set(key, url);
    return url;
  }

  /* 캔버스를 크게 키운 데이터 URL (도감 썸네일 등) */
  function scaledURL(cv, scale, key) {
    if (key && cache.has(key)) return cache.get(key);
    const big = makeCanvas(cv.width * scale, cv.height * scale);
    const ctx = big.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, 0, 0, big.width, big.height);
    const url = big.toDataURL();
    if (key) cache.set(key, url);
    return url;
  }

  /* 도트 확대: Scale2x(EPX)와 Scale3x(AdvMAME3x) — 계단 대각선을 매끈하게 다듬는다 */
  function readPixels(cv) {
    const w = cv.width;
    const h = cv.height;
    const d = cv.getContext("2d").getImageData(0, 0, w, h).data;
    const px = new Uint32Array(w * h);
    for (let i = 0; i < w * h; i++) px[i] = ((d[i * 4] << 24) | (d[i * 4 + 1] << 16) | (d[i * 4 + 2] << 8) | d[i * 4 + 3]) >>> 0;
    return { w, h, px };
  }
  function writePixels(w, h, px) {
    const out = makeCanvas(w, h);
    const ctx = out.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = px[i];
      img.data[i * 4] = (v >>> 24) & 255;
      img.data[i * 4 + 1] = (v >>> 16) & 255;
      img.data[i * 4 + 2] = (v >>> 8) & 255;
      img.data[i * 4 + 3] = v & 255;
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }
  function scale2x(cv) {
    const { w, h, px } = readPixels(cv);
    const g = (x, y) => px[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
    const W2 = w * 2;
    const out = new Uint32Array(W2 * h * 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const P = g(x, y); const A = g(x, y - 1); const B = g(x + 1, y); const L = g(x - 1, y); const Dn = g(x, y + 1);
      out[(2 * y) * W2 + 2 * x] = L === A && L !== Dn && A !== B ? A : P;
      out[(2 * y) * W2 + 2 * x + 1] = A === B && A !== L && B !== Dn ? B : P;
      out[(2 * y + 1) * W2 + 2 * x] = Dn === L && Dn !== B && L !== A ? L : P;
      out[(2 * y + 1) * W2 + 2 * x + 1] = B === Dn && B !== A && Dn !== L ? Dn : P;
    }
    return writePixels(W2, h * 2, out);
  }
  function scale3x(cv) {
    const { w, h, px } = readPixels(cv);
    const g = (x, y) => px[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
    const W3 = w * 3;
    const out = new Uint32Array(W3 * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const A = g(x - 1, y - 1); const B = g(x, y - 1); const Cc = g(x + 1, y - 1);
      const Dd = g(x - 1, y); const E = g(x, y); const Fv = g(x + 1, y);
      const G = g(x - 1, y + 1); const H = g(x, y + 1); const I = g(x + 1, y + 1);
      const e = new Array(9).fill(E);
      if (B !== H && Dd !== Fv) {
        e[0] = Dd === B ? Dd : E;
        e[1] = (Dd === B && E !== Cc) || (B === Fv && E !== A) ? B : E;
        e[2] = B === Fv ? Fv : E;
        e[3] = (Dd === B && E !== G) || (Dd === H && E !== A) ? Dd : E;
        e[5] = (B === Fv && E !== I) || (H === Fv && E !== Cc) ? Fv : E;
        e[6] = Dd === H ? Dd : E;
        e[7] = (Dd === H && E !== I) || (H === Fv && E !== G) ? H : E;
        e[8] = H === Fv ? Fv : E;
      }
      for (let k = 0; k < 9; k++) out[(3 * y + Math.floor(k / 3)) * W3 + 3 * x + (k % 3)] = e[k];
    }
    return writePixels(W3, h * 3, out);
  }
  /* 확대한 몬스터에 입체 음영 — 실루엣 거리장으로 높이를 만들고 도트 캐릭터와 같은 광원으로 4단 명암,
     부위 사이 안쪽 선, 1px 색 외곽선을 입힌다 */
  const LX = -0.55, LY = -0.62, LZ = 0.56;
  const SHADOW_TINT = [42, 28, 74];
  const LIGHT_TINT = [255, 244, 200];
  function rgbOf(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255]; }
  function packRGB(r, g, b) { return ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0; }
  function tone(v, t) {
    const [r, g, b] = rgbOf(v);
    if (t < 0) {
      const k = -t; const m = 1 - k * 0.55;
      return packRGB(Math.round(r * m * (1 - k * 0.25) + SHADOW_TINT[0] * k * 0.25),
        Math.round(g * m * (1 - k * 0.25) + SHADOW_TINT[1] * k * 0.25),
        Math.round(b * m * (1 - k * 0.25) + SHADOW_TINT[2] * k * 0.25));
    }
    return packRGB(Math.round(r + (LIGHT_TINT[0] - r) * t), Math.round(g + (LIGHT_TINT[1] - g) * t), Math.round(b + (LIGHT_TINT[2] - b) * t));
  }
  function lum(v) { const [r, g, b] = rgbOf(v); return r * 0.3 + g * 0.59 + b * 0.11; }
  function distField(w, h, solid) {
    const N = w * h;
    const D = new Float32Array(N);
    for (let i = 0; i < N; i++) D[i] = solid(i) ? 1e6 : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!D[i]) continue;
      D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.41, at(x + 1, y - 1) + 1.41);
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!D[i]) continue;
      D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.41, at(x - 1, y + 1) + 1.41);
    }
    return D;
  }
  function autoShade(cv, factor) {
    const { w, h, px } = readPixels(cv);
    const N = w * h;
    const op = i => (px[i] & 255) > 0;
    const sil = distField(w, h, op);
    /* 같은 색 덩어리 안쪽 거리 — 부위마다 살짝 둥글게 */
    const region = distField(w, h, i => {
      if (!op(i)) return false;
      const x = i % w; const y = (i / w) | 0; const c = px[i];
      return !((x > 0 && px[i - 1] !== c) || (x < w - 1 && px[i + 1] !== c) || (y > 0 && px[i - w] !== c) || (y < h - 1 && px[i + w] !== c));
    });
    const R = 3.4 * factor; const r2 = 1.6 * factor;
    const Z = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!op(i)) continue;
      const a = Math.min(sil[i], R) / R; const b = Math.min(region[i] + 1, r2) / r2;
      Z[i] = R * Math.sqrt(1 - (1 - a) * (1 - a)) + 0.45 * r2 * Math.sqrt(1 - (1 - b) * (1 - b));
    }
    const z = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : Z[y * w + x]);
    const out = new Uint32Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!op(i)) continue;
      const gx = (z(x + 1, y) - z(x - 1, y)) / 2; const gy = (z(x, y + 1) - z(x, y - 1)) / 2;
      const len = Math.hypot(gx, gy, 1);
      const I = (-gx * LX - gy * LY + LZ) / len;
      const base = px[i];
      /* 아주 어두운 색(눈·입)은 명암을 거의 받지 않는다 */
      const dark = lum(base) < 40;
      let t = I > 0.9 ? 0.26 : I > 0.5 ? 0 : I > 0.2 ? -0.42 : -0.72;
      if (dark) t = t > 0 ? 0.1 : 0;
      /* 그림자 쪽 가장자리에 반사광 한 줄 */
      if (t <= -0.42 && sil[i] <= 1.5 && gx < 0 && gy < 0) t = -0.2;
      out[i] = t ? tone(base, t) : base;
    }
    /* 부위 경계 안쪽 선 — 어두운 쪽 픽셀에 */
    const line = out.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!op(i)) continue;
      const c = px[i];
      const nb = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (const [dx, dy] of nb) {
        const xx = x + dx; const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!op(j) || px[j] === c) continue;
        if (Math.abs(lum(px[j]) - lum(c)) < 22) continue;
        if (lum(c) < lum(px[j])) { line[i] = tone(out[i], -0.5); break; }
      }
    }
    /* 1px 색 외곽선 */
    const res = line.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (op(i)) continue;
      let best = 0; let bl = 1e9;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const xx = x + dx; const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (op(j) && lum(px[j]) < bl) { bl = lum(px[j]); best = px[j]; }
      }
      if (best) {
        const [r, g, b] = rgbOf(best);
        res[i] = packRGB(Math.round(r * 0.22 + 14), Math.round(g * 0.2 + 8), Math.round(b * 0.24 + 20));
      }
    }
    return writePixels(w, h, res);
  }
  /* factor: 2, 3, 4, 6 */
  function monsterBig(name, factor) {
    /* 일러스트(monart.js)가 있는 몬스터는 그 그림을 쓴다 */
    if (F.monArt && F.monArt.has(name)) return F.monArt.render(name, 26 * factor);
    const key = `mb${name}|${factor}`;
    if (cache.has(key)) return cache.get(key);
    const base = monsterPlain(name);
    const up = factor === 3 ? scale3x(base) : factor === 4 ? scale2x(scale2x(base)) : factor === 6 ? scale3x(scale2x(base)) : factor === 8 ? scale2x(scale2x(scale2x(base))) : scale2x(base);
    const out = autoShade(up, factor);
    cache.set(key, out);
    return out;
  }

  F.sprites = {
    monsterBig, scale2x, scale3x,
    C, EL_COLOR, RARITY_COLOR, DUNGEON_PAL, shade, light, hash, lookOf, heroWalk, heroBattle, monsterSprite, tile, icon,
    scaledURL, silhouette, makeCanvas, MON_LOOK, MON, HATS, W
  };
})(typeof window !== "undefined" ? window : globalThis);
