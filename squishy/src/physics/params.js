// User-facing softness settings and how each maps onto a physical parameter of
// the solver. Every slider position t ∈ [0, 1] maps to one SI quantity; the
// panel shows that quantity with its unit.

const lerp = (a, b, t) => a + (b - a) * t;
const logMap = (a, b, t) => a * Math.pow(b / a, t);
const invLog = (a, b, v) => Math.log(v / a) / Math.log(b / a);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export const BODY_MASS_KG = 0.25; // ~5.9 units³ at 650 kg/m³, 1 unit = 4 cm

export const SLIDERS = [
  {
    key: 'softness',
    label: '말랑함',
    phys: 'E',
    hint: '영률 E · 낮을수록 같은 힘에 더 깊이 들어가요',
    to: (t) => logMap(40000, 2500, t),
    from: (E) => invLog(40000, 2500, E),
    show: (p) => `E ${(p.E / 1000).toFixed(p.E < 10000 ? 1 : 0)} kPa`,
  },
  {
    key: 'elasticity',
    label: '탄성 계수',
    phys: 'smFreq',
    hint: '형상 기억 스프링 k = mω² · 몸 전체를 원래 모양으로 끌어당겨요',
    to: (t) => 3.5 * t,
    from: (f) => f / 3.5,
    show: (p) => {
      const w = 2 * Math.PI * p.smFreq;
      return `k ${(BODY_MASS_KG * w * w).toFixed(p.smFreq < 0.5 ? 1 : 0)} N/m`;
    },
  },
  {
    key: 'viscosity',
    label: '점성 계수',
    phys: 'g1',
    hint: '맥스웰 가지 점성 η = g·E·τ · 눌린 모양을 오래 기억해요',
    to: (t) => 3 * Math.pow(t, 1.3),
    from: (g) => Math.pow(g / 3, 1 / 1.3),
    show: (p) => {
      const eta = p.g1 * p.E * p.tau;
      return `η ${eta >= 1000 ? (eta / 1000).toFixed(1) + ' kPa·s' : eta.toFixed(0) + ' Pa·s'}`;
    },
  },
  {
    key: 'damping',
    label: '감쇠 계수',
    phys: 'beta',
    hint: '켈빈–포크트 감쇠 β · 놓은 뒤 출렁임이 잦아드는 빠르기',
    to: (t) => logMap(0.0004, 0.03, t),
    from: (b) => invLog(0.0004, 0.03, b),
    show: (p) => `β ${(p.beta * 1000).toFixed(p.beta < 0.01 ? 1 : 0)} ms`,
  },
  {
    key: 'recovery',
    label: '복원 속도',
    phys: 'tau',
    hint: '점탄성 이완 시간 τ · 짧을수록 빨리 부풀어 올라요',
    to: (t) => logMap(4, 0.12, t),
    from: (tau) => invLog(4, 0.12, tau),
    show: (p) => `τ ${p.tau.toFixed(p.tau < 1 ? 2 : 1)} s`,
  },
  {
    key: 'radius',
    label: '변형 반경',
    phys: 'radius',
    hint: '손끝 접촉 반경 a · 힘이 퍼지는 넓이',
    to: (t) => lerp(0.14, 0.42, t),
    from: (a) => (a - 0.14) / 0.28,
    show: (p) => `a ${(p.radius * 40).toFixed(1)} mm`,
  },
  {
    key: 'compression',
    label: '압축 강도',
    phys: 'nu',
    hint: '푸아송 비 ν · 높을수록 부피를 지키며 옆으로 불룩해져요',
    to: (t) => lerp(0.25, 0.49, t),
    from: (nu) => (nu - 0.25) / 0.24,
    show: (p) => {
      const K = p.E / (3 * (1 - 2 * p.nu));
      return `ν ${p.nu.toFixed(2)} · K ${(K / 1000).toFixed(K < 10000 ? 1 : 0)} kPa`;
    },
  },
  {
    key: 'surface',
    label: '표면 반응 강도',
    phys: 'skin',
    hint: '피막 장력 Y와 굽힘 강성 · 높을수록 눌림이 넓고 매끈하게 퍼져요',
    to: (t) => 150 * Math.pow(t, 1.5),
    from: (y) => Math.pow(y / 150, 1 / 1.5),
    show: (p) => `Y ${p.skin.toFixed(0)} N/m`,
  },
];

export const PRESETS = {
  soft: {
    name: '말랑',
    desc: '꾹 누르면 천천히 부풀어 올라요',
    params: { E: 6500, nu: 0.36, g1: 3.0, tau: 0.7, beta: 0.012, smFreq: 0.4, skin: 18, radius: 0.27 },
  },
  bouncy: {
    name: '탱글',
    desc: '통통 튀고 출렁출렁 흔들려요',
    params: { E: 16000, nu: 0.47, g1: 0.12, tau: 0.25, beta: 0.0012, smFreq: 1.6, skin: 30, radius: 0.24 },
  },
  chewy: {
    name: '쫀득',
    desc: '쭈우욱 늘어났다가 돌아와요',
    params: { E: 5000, nu: 0.48, g1: 0.7, tau: 0.7, beta: 0.005, smFreq: 0.5, skin: 45, radius: 0.26 },
  },
};

export function sliderValue(slider, params) {
  return clamp01(slider.from(params[slider.phys]));
}

export function applySlider(slider, t, params) {
  return { ...params, [slider.phys]: slider.to(clamp01(t)) };
}
