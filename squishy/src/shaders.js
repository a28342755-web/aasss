// Body shader for 찹쌀이.
// The face is not a texture: it is drawn procedurally from the *rest* position of
// each vertex, so it stays printed on the skin and stretches with every squish.

export const BODY_VERT = /* glsl */ `
attribute vec3 rest;
attribute float dent;

varying vec3 vRest;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vDent;
varying float vWorldY;

void main() {
  vRest = rest;
  vDent = dent;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldY = wp.y;
  vec4 mv = viewMatrix * wp;
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

export const BODY_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uDeep;
uniform vec3 uRimCol;
uniform vec3 uInk;
uniform vec3 uBlushCol;
uniform vec3 uMouthCol;
uniform vec3 uTongueCol;
uniform vec3 uLightV;
uniform vec3 uUpV;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec2 uLook;
uniform float uBlink;
uniform float uSqueeze;
uniform float uHappy;
uniform float uSleep;
uniform float uSurprise;
uniform float uMouth;
uniform float uBlush;

varying vec3 vRest;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vDent;
varying float vWorldY;

// Face layout, in body units on the front of the rest shape.
#define FACE_Y 0.80
#define EYE_X 0.28
#define EYE_Y 0.07
#define EYE_R 0.071
#define LW 0.0135
#define MOUTH_Y -0.045
#define BLUSH_X 0.475
#define BLUSH_Y -0.03

float fillAA(float d) {
  float w = max(fwidth(d), 1e-4) * 0.8;
  return 1.0 - smoothstep(-w, w, d);
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Ellipse distance (approximate, good enough for small features).
float sdEll(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}

// Arc around +y with half-aperture given as (sin, cos), radius ra, thickness rb.
float sdArc(vec2 p, vec2 sc, float ra, float rb) {
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec2 f = vec2(vRest.x, vRest.y - FACE_Y);
  float front = smoothstep(0.25, 0.55, vRest.z);

  // ---- eyes ----------------------------------------------------------
  float eyeA = 0.0;
  float hlA = 0.0;
  float open = clamp(1.0 - uBlink, 0.0, 1.0);
  float r = EYE_R * (1.0 + 0.3 * uSurprise);
  float shut = max(max(uHappy, uSleep), uSqueeze);
  for (int i = 0; i < 2; i++) {
    float sx = i == 0 ? -1.0 : 1.0;
    vec2 q = f - vec2(sx * EYE_X, EYE_Y) - uLook;

    float dOpen = sdEll(q, vec2(r, r * mix(0.12, 1.1, open)));
    float dLine = sdSeg(q, vec2(-r * 0.9, 0.0), vec2(r * 0.9, 0.0)) - LW * 0.9;
    float d = mix(dOpen, dLine, smoothstep(0.7, 0.95, uBlink));

    // ^ ^ happy
    float dHappy = sdArc(q + vec2(0.0, r * 0.55), vec2(0.82, 0.57), r * 1.05, LW);
    // u u asleep
    vec2 qs = vec2(q.x, -q.y) + vec2(0.0, r * 0.35);
    float dSleep = sdArc(qs, vec2(0.82, 0.57), r * 0.95, LW);
    // > < squeezed
    vec2 qq = vec2(-sx * q.x, q.y);
    float dSq = min(
      sdSeg(qq, vec2(-r * 0.85, r * 0.9), vec2(r * 0.85, 0.0)),
      sdSeg(qq, vec2(r * 0.85, 0.0), vec2(-r * 0.85, -r * 0.9))
    ) - LW;

    d = mix(d, dHappy, uHappy);
    d = mix(d, dSleep, uSleep);
    d = mix(d, dSq, uSqueeze);
    eyeA = max(eyeA, fillAA(d));

    float hv = open * (1.0 - shut);
    float h1 = length((q - vec2(-r * 0.3, r * 0.38 * open)) / vec2(1.0, max(open, 0.2))) - r * 0.36;
    float h2 = length(q - vec2(r * 0.34, -r * 0.34 * open)) - r * 0.15;
    hlA = max(hlA, max(fillAA(h1), fillAA(h2)) * hv);
  }

  // ---- mouth: ω, opens into a little "o" when squeezed --------------
  vec2 m = f - vec2(0.0, MOUTH_Y) - uLook * 0.5;
  float mr = 0.029;
  vec2 m1 = m + vec2(mr, 0.0);
  vec2 m2 = m - vec2(mr, 0.0);
  float dW = min(
    sdArc(vec2(m1.x, -m1.y), vec2(1.0, 0.0), mr, LW * 0.8),
    sdArc(vec2(m2.x, -m2.y), vec2(1.0, 0.0), mr, LW * 0.8)
  );
  float mo = smoothstep(0.05, 0.35, uMouth);
  vec2 mrad = vec2(0.046, 0.054) * (0.45 + 0.55 * uMouth);
  float dO = sdEll(m + vec2(0.0, 0.012), mrad);
  float mouthIn = fillAA(dO) * mo;
  float tongue = fillAA(length((m + vec2(0.0, 0.012 + mrad.y * 0.78)) / vec2(1.0, 0.8)) - mrad.x * 0.8) * mouthIn;
  float mouthLine = fillAA(abs(dO) - LW * 0.55) * mo;
  float wA = fillAA(dW) * (1.0 - mo);

  // ---- blush with little /// marks when flustered -------------------
  float blA = 0.0;
  float hatch = 0.0;
  for (int i = 0; i < 2; i++) {
    float sx = i == 0 ? -1.0 : 1.0;
    vec2 b = f - vec2(sx * BLUSH_X, BLUSH_Y);
    float e = length(b / vec2(0.115, 0.068));
    blA = max(blA, 1.0 - smoothstep(0.25, 1.0, e));
    for (int k = 0; k < 3; k++) {
      float ox = (float(k) - 1.0) * 0.036;
      float dh = sdSeg(b - vec2(ox, 0.0), vec2(-0.01, -0.019), vec2(0.011, 0.019)) - 0.0052;
      hatch = max(hatch, fillAA(dh));
    }
  }
  blA *= (0.35 + 0.65 * uBlush) * front;
  hatch *= smoothstep(0.62, 0.95, uBlush) * front;

  // ---- albedo --------------------------------------------------------
  vec3 alb = uBase;
  alb = mix(alb, uBlushCol, blA * 0.82);
  alb = mix(alb, uBlushCol * 0.72, hatch * 0.85);
  alb = mix(alb, uMouthCol, mouthIn * front);
  alb = mix(alb, uTongueCol, tongue * front);
  float ink = max(max(eyeA, wA), mouthLine) * front;
  alb = mix(alb, uInk, ink);
  alb = mix(alb, vec3(1.0), hlA * front);

  // ---- soft "rice cake" lighting ---------------------------------------
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(uLightV);
  float ndl = dot(N, L);
  float wrap = clamp((ndl + 0.5) / 1.5, 0.0, 1.0);
  float hemi = dot(N, normalize(uUpV)) * 0.5 + 0.5;
  vec3 amb = mix(uGround, uSky, hemi);
  vec3 col = alb * (amb + uSun * wrap);

  // light soaking through the dough: warm tint in the shade and at the terminator
  float band = smoothstep(0.12, 0.45, wrap) * (1.0 - smoothstep(0.45, 0.8, wrap));
  col += uDeep * alb * ((1.0 - wrap) * 0.2 + band * 0.12);

  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  col += uSun * (pow(nh, 48.0) * 0.14 + pow(nh, 9.0) * 0.04) * (1.0 - ink * 0.4);

  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uRimCol * fr * 0.22;

  // pressed dimples blush a little deeper; the spot where it sits gets a soft contact shade
  float dentK = 0.6 * smoothstep(0.03, 0.3, vDent);
  col *= mix(vec3(1.0), mix(vec3(0.82), uDeep, 0.5), dentK);
  col *= mix(0.74, 1.0, smoothstep(0.0, 0.22, vWorldY));

  gl_FragColor = vec4(toSRGB(col), 1.0);
}
`;
