/*
 * 삼천의 운명 — 몬스터 그림
 * 몬스터 도감 시트(96종)에서 오려 배경을 지운 그림을 쓴다(assets/monsters/NN.webp → js/data-monsters.js의 FATES.MON_ART).
 * 모든 그림은 100×100 칸 기준으로 시트의 크기 그대로라 슬라임은 작고 용은 크다. 땅은 y=97.
 * 전투에서는 뒤집어 그려 주인공 쪽을 보게 하므로, 시트에서 왼쪽을 보는 그림은 미리 뒤집어 둔다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;

  /* 이름: [도감 번호, 성질]. 성질 글자: f = 날아다님(그림자를 띄움) · s = 마법·원거리형(마력탄을 쏨) · l = 시트에서 왼쪽을 봄 */
  const ART = {
    "슬라임": [1, ""], "고블린": [2, ""], "오크": [3, ""], "스켈레톤": [4, ""], "좀비": [5, ""], "늑대": [6, ""],
    "곰": [7, ""], "멧돼지": [8, ""], "늑대인간": [9, ""], "그리핀": [10, "f"], "하피": [11, "f"], "미노타우로스": [12, ""],
    "사이클롭스": [13, ""], "고블린 창병": [14, ""], "트롤": [15, ""], "거미": [16, ""], "거미 여왕": [17, ""], "맨티스": [18, ""],
    "전갈": [19, ""], "뱀파이어": [20, "s"], "엘프 궁수": [21, "s"], "드래곤": [22, ""], "화염 골렘": [23, ""], "얼음 골렘": [24, ""],
    "바위 골렘": [25, ""], "번개 정령": [26, "fs"], "물의 정령": [27, "fs"], "바람의 정령": [28, "fs"], "대지의 정령": [29, "s"], "나무 정령": [30, ""],
    "해골 기사": [31, ""], "흑기사": [32, ""], "마법사": [33, "s"], "흑마법사": [34, "s"], "궁수": [35, "s"], "도적": [36, ""],
    "성기사": [37, ""], "사제": [38, "s"], "사냥꾼": [39, "s"], "마도사": [40, "s"], "불사조": [41, "fs"], "용": [42, "l"],
    "지옥견": [43, ""], "케르베로스": [44, ""], "리치": [45, "s"], "흑암 골렘": [46, ""], "크라켄": [47, ""], "바다뱀": [48, ""],
    "모래의 괴물": [49, ""], "크리스탈 골렘": [50, ""], "사이렌": [51, "s"], "뱀파이어 로드": [52, "s"], "악마": [53, "s"], "타락한 천사": [54, "fs"],
    "요정": [55, "fs"], "유니콘": [56, ""], "페가수스": [57, ""], "키메라": [58, ""], "다크 그리핀": [59, "f"], "스핑크스": [60, "s"],
    "미믹": [61, ""], "해골 마법사": [62, "s"], "정령의 나무": [63, "s"], "폭풍의 정령": [64, "fs"], "화산의 정령": [65, "s"], "빙하의 정령": [66, "fs"],
    "그림 리퍼": [67, ""], "요정의 기사": [68, ""], "거대 지네": [69, ""], "독거미": [70, ""], "해치 괴물": [71, ""], "심해어": [72, "l"],
    "크랩": [73, ""], "문어": [74, ""], "상어": [75, ""], "문어 괴물": [76, ""], "거대 달팽이": [77, "l"], "우주 괴물": [78, "s"],
    "차원 포식자": [79, "s"], "마계 군주": [80, ""], "고요의 사신": [81, "fs"], "사막의 용": [82, ""], "화이트 드래곤": [83, "l"], "블랙 드래곤": [84, "l"],
    "레드 드래곤": [85, ""], "골든 드래곤": [86, ""], "스카이 드래곤": [87, ""], "다크 드래곤": [88, ""], "아이스 드래곤": [89, ""], "스톰 드래곤": [90, ""],
    "시간의 수호자": [91, "s"], "공간의 수호자": [92, "s"], "기억의 수호자": [93, "s"], "생명의 수호자": [94, "s"], "파멸의 수호자": [95, ""], "창조의 수호자": [96, "s"]
  };
  /* 51층부터 '광폭한', 101층부터 '심연의'가 붙은 강화판: 같은 그림에 붉은빛 · 짙은 보랏빛을 입힌다 */
  const base = (name) => (ART[name] ? name : name.replace(/^(광폭한|심연의) /, ""));
  const specOf = (name) => ART[base(name)] || null;
  const TINT = { 광폭한: "rgba(255,40,30,0.2)", 심연의: "rgba(40,10,90,0.38)" };

  /* 그림은 스크립트에 data URI로 들어 있어 시작하자마자 거의 바로 읽힌다 */
  const imgs = {};
  function image(no) {
    const key = String(no).padStart(2, "0");
    if (!imgs[key]) {
      const img = new Image();
      img.src = (F.MON_ART && F.MON_ART[key]) || `assets/monsters/${key}.webp`;
      imgs[key] = img;
    }
    return imgs[key];
  }
  const loaded = (img) => img.complete && img.naturalWidth > 0;
  if (typeof Image !== "undefined") Object.values(ART).forEach(([no]) => image(no));
  /* 전투 시작 전에 그 몬스터 그림이 읽힐 때까지 기다린다 */
  function load(name) {
    const spec = specOf(name);
    if (!spec) return Promise.resolve(false);
    const img = image(spec[0]);
    if (loaded(img)) return Promise.resolve(true);
    return new Promise((res) => {
      img.addEventListener("load", () => res(true), { once: true });
      img.addEventListener("error", () => res(false), { once: true });
    });
  }

  /* size×size 칸에 시트 크기 비율 그대로(100칸 = size). 아직 못 읽었으면 null */
  const cache = new Map();
  function render(name, size) {
    const spec = specOf(name);
    if (!spec) return null;
    const img = image(spec[0]);
    if (!loaded(img)) return null;
    const key = `${name}|${size}`;
    if (cache.has(key)) return cache.get(key);
    const L = Math.max(24, Math.round(size));
    const k = L / 100;
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    const cv = F.sprites.makeCanvas(L, L);
    const g = cv.getContext("2d");
    /* 크게 그릴 때는 정수 배로 픽셀 그대로 키운 뒤 남은 만큼만 부드럽게 */
    let src = img;
    const n = Math.floor(k);
    if (n >= 2) {
      src = F.sprites.makeCanvas(img.naturalWidth * n, img.naturalHeight * n);
      const gs = src.getContext("2d");
      gs.imageSmoothingEnabled = false;
      gs.drawImage(img, 0, 0, src.width, src.height);
    }
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.save();
    g.translate(L / 2, 0);
    if (spec[1].includes("l")) g.scale(-1, 1);
    g.drawImage(src, Math.round(-w / 2), Math.round(L * 0.97 - h), Math.round(w), Math.round(h));
    g.restore();
    const pre = name.split(" ")[0];
    if (base(name) !== name && TINT[pre]) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = TINT[pre];
      g.fillRect(0, 0, L, L);
      g.globalCompositeOperation = "source-over";
    }
    if (cache.size > 200) cache.clear();
    cache.set(key, cv);
    return cv;
  }
  /* 전투에서 쓰는 정보: 나는가(그림자를 띄움) · 마법·원거리형인가(마력탄을 쏨) */
  function info(name) {
    const spec = specOf(name);
    return spec ? { no: spec[0], fly: spec[1].includes("f"), shooter: spec[1].includes("s") } : null;
  }

  F.monArt = { render, info, load, ART, has: (name) => !!specOf(name) };
})(typeof window !== "undefined" ? window : globalThis);
