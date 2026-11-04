// GLSL for 찹쌀이's skin, injected into three's MeshPhysicalMaterial (lighting,
// shadows, sheen, clearcoat) and MeshDepthMaterial (shadow casting).
//
// GPU vertex displacement: the CPU only uploads one small float texture with the
// simulated particles (4 texels each: the rows of a per-particle affine map
// [F | c] plus dent/volume data). Every render vertex blends the affine maps of
// its 8 nearest particles with precomputed smooth weights:
//
//     A = Σ wₖ [Fₖ | cₖ],   p = A · [r; 1],   F = A₃ₓ₃
//
// so the 10–20k vertex skin follows the ~400–1000 particle simulation smoothly,
// and the deformed normal comes straight from the deformation gradient
// (n ∝ F·t₁ × F·t₂), with no CPU mesh update and no normal recomputation.
// On top of that, each fingertip leaves an exact spherical imprint, and the
// fragment shader adds compression wrinkles, pressure shading and translucency.

export const MAX_FINGERS = 6;

const SKIN_COMMON = /* glsl */ `
uniform highp sampler2D uParticles;
uniform int uTexW;
uniform vec4 uFingers[${MAX_FINGERS}];   // xyz centre of the fingertip sphere, w radius (0 = none)
attribute vec4 skinIdx0;
attribute vec4 skinIdx1;
attribute vec4 skinW0;
attribute vec4 skinW1;

ivec2 ptx(int i, int j) {
  int t = i * 4 + j;
  return ivec2(t - (t / uTexW) * uTexW, t / uTexW);
}

void skinAcc(float fi, float w, inout vec4 r0, inout vec4 r1, inout vec4 r2, inout vec4 ex) {
  if (w <= 0.0) return;
  int i = int(fi + 0.5);
  r0 += w * texelFetch(uParticles, ptx(i, 0), 0);
  r1 += w * texelFetch(uParticles, ptx(i, 1), 0);
  r2 += w * texelFetch(uParticles, ptx(i, 2), 0);
  ex += w * texelFetch(uParticles, ptx(i, 3), 0);
}

// Tangent field on the unit sphere that is smooth everywhere except at the
// bottom pole (hidden on the plate): (1 - n·b)e + (n·e)(b - n), b = -y, e = +x.
vec3 skinTangent(vec3 n) {
  vec3 b = vec3(0.0, -1.0, 0.0);
  vec3 e = vec3(1.0, 0.0, 0.0);
  vec3 t = (1.0 - dot(n, b)) * e + dot(n, e) * (b - n);
  float l = length(t);
  return l > 1e-5 ? t / l : vec3(0.0, 0.0, 1.0);
}
`;

// Shared skinning body: defines sp (position), sn (normal), sTa/sTb (deformed
// tangents), sDent, sJ, sImprint.
const SKIN_BODY = /* glsl */ `
  vec4 sr0 = vec4(0.0), sr1 = vec4(0.0), sr2 = vec4(0.0), sex = vec4(0.0);
  skinAcc(skinIdx0.x, skinW0.x, sr0, sr1, sr2, sex);
  skinAcc(skinIdx0.y, skinW0.y, sr0, sr1, sr2, sex);
  skinAcc(skinIdx0.z, skinW0.z, sr0, sr1, sr2, sex);
  skinAcc(skinIdx0.w, skinW0.w, sr0, sr1, sr2, sex);
  skinAcc(skinIdx1.x, skinW1.x, sr0, sr1, sr2, sex);
  skinAcc(skinIdx1.y, skinW1.y, sr0, sr1, sr2, sex);
  skinAcc(skinIdx1.z, skinW1.z, sr0, sr1, sr2, sex);
  skinAcc(skinIdx1.w, skinW1.w, sr0, sr1, sr2, sex);
  vec3 sRest = position;
  vec3 sp = vec3(dot(sr0.xyz, sRest) + sr0.w, dot(sr1.xyz, sRest) + sr1.w, dot(sr2.xyz, sRest) + sr2.w);
  mat3 sF = mat3(sr0.x, sr1.x, sr2.x, sr0.y, sr1.y, sr2.y, sr0.z, sr1.z, sr2.z);
  vec3 sN0 = normalize(normal);
  vec3 sT1 = skinTangent(sN0);
  vec3 sT2 = cross(sN0, sT1);
  vec3 sTa = sF * sT1;
  vec3 sTb = sF * sT2;
  vec3 sn = cross(sTa, sTb);
  sn = dot(sn, sn) > 1e-12 ? normalize(sn) : sN0;
  float sDent = sex.x;
  float sJ = sex.y;
  float sImprint = 0.0;
  // fingertip imprints: the skin wraps exactly around each fingertip sphere
  for (int k = 0; k < ${MAX_FINGERS}; k++) {
    vec4 fg = uFingers[k];
    if (fg.w <= 0.0) continue;
    vec3 q = sp - fg.xyz;
    float d = length(q);
    float e = fg.w * 0.22;
    float pen = fg.w - d;
    if (pen <= -e || d < 1e-5) continue;
    float amt = pen >= e ? pen : (pen + e) * (pen + e) / (4.0 * e);
    vec3 dir = q / d;
    sp += dir * amt;
    float b = smoothstep(-e, e, pen);
    sn = normalize(mix(sn, -dir, b));
    sImprint = max(sImprint, amt);
  }
`;

export function patchSkinMaterial(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${SKIN_COMMON}
attribute float thick;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vTa;
varying vec3 vTb;
varying float vDent;
varying float vJ;
varying float vThick;
varying float vImprint;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `${SKIN_BODY}
  vRest = sRest;
  vRestN = sN0;
  vTa = sTa;
  vTb = sTb;
  vDent = sDent;
  vJ = sJ;
  vThick = thick;
  vImprint = sImprint;
  vec3 objectNormal = sn;`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = sp;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_ALBEDO}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${FRAG_NORMAL}`)
      .replace('#include <opaque_fragment>', `${FRAG_SSS}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'chapssal-skin-v2';
}

export function patchDepthMaterial(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SKIN_COMMON}`)
      .replace('#include <begin_vertex>', `${SKIN_BODY}\nvec3 transformed = sp;`);
  };
  material.customProgramCacheKey = () => 'chapssal-depth-v2';
}

// ---- fragment --------------------------------------------------------------
const FRAG_PARS = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uRimCol;
uniform vec3 uInk;
uniform vec3 uBlushCol;
uniform vec3 uMouthCol;
uniform vec3 uTongueCol;
uniform vec3 uLightV;
uniform vec3 uSunCol;
uniform vec2 uLook;
uniform float uBlink;
uniform float uSqueeze;
uniform float uHappy;
uniform float uSleep;
uniform float uSurprise;
uniform float uMouth;
uniform float uBlush;
uniform float uWrinkle;
uniform float uWrinkleK;
uniform float uSurface;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vTa;
varying vec3 vTb;
varying float vDent;
varying float vJ;
varying float vThick;
varying float vImprint;

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
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdEll(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
float sdArc(vec2 p, vec2 sc, float ra, float rb) {
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 skinTangentF(vec3 n) {
  vec3 b = vec3(0.0, -1.0, 0.0);
  vec3 e = vec3(1.0, 0.0, 0.0);
  vec3 t = (1.0 - dot(n, b)) * e + dot(n, e) * (b - n);
  float l = length(t);
  return l > 1e-5 ? t / l : vec3(0.0, 0.0, 1.0);
}
`;

// Face (drawn from rest coordinates, so it stretches with the dough), pressure
// shading and stretch paling.
const FRAG_ALBEDO = /* glsl */ `
{
  vec2 f = vec2(vRest.x, vRest.y - FACE_Y);
  float front = smoothstep(0.25, 0.55, vRest.z);
  float eyeA = 0.0, hlA = 0.0;
  float open = clamp(1.0 - uBlink, 0.0, 1.0);
  float r = EYE_R * (1.0 + 0.3 * uSurprise);
  float shut = max(max(uHappy, uSleep), uSqueeze);
  for (int i = 0; i < 2; i++) {
    float sx = i == 0 ? -1.0 : 1.0;
    vec2 q = f - vec2(sx * EYE_X, EYE_Y) - uLook;
    float dOpen = sdEll(q, vec2(r, r * mix(0.12, 1.1, open)));
    float dLine = sdSeg(q, vec2(-r * 0.9, 0.0), vec2(r * 0.9, 0.0)) - LW * 0.9;
    float d = mix(dOpen, dLine, smoothstep(0.7, 0.95, uBlink));
    float dHappy = sdArc(q + vec2(0.0, r * 0.55), vec2(0.82, 0.57), r * 1.05, LW);
    vec2 qs = vec2(q.x, -q.y) + vec2(0.0, r * 0.35);
    float dSleep = sdArc(qs, vec2(0.82, 0.57), r * 0.95, LW);
    vec2 qq = vec2(-sx * q.x, q.y);
    float dSq = min(sdSeg(qq, vec2(-r * 0.85, r * 0.9), vec2(r * 0.85, 0.0)), sdSeg(qq, vec2(r * 0.85, 0.0), vec2(-r * 0.85, -r * 0.9))) - LW;
    d = mix(d, dHappy, uHappy);
    d = mix(d, dSleep, uSleep);
    d = mix(d, dSq, uSqueeze);
    eyeA = max(eyeA, fillAA(d));
    float hv = open * (1.0 - shut);
    float h1 = length((q - vec2(-r * 0.3, r * 0.38 * open)) / vec2(1.0, max(open, 0.2))) - r * 0.36;
    float h2 = length(q - vec2(r * 0.34, -r * 0.34 * open)) - r * 0.15;
    hlA = max(hlA, max(fillAA(h1), fillAA(h2)) * hv);
  }
  vec2 m = f - vec2(0.0, MOUTH_Y) - uLook * 0.5;
  float mr = 0.029;
  vec2 m1 = m + vec2(mr, 0.0), m2 = m - vec2(mr, 0.0);
  float dW = min(sdArc(vec2(m1.x, -m1.y), vec2(1.0, 0.0), mr, LW * 0.8), sdArc(vec2(m2.x, -m2.y), vec2(1.0, 0.0), mr, LW * 0.8));
  float mo = smoothstep(0.05, 0.35, uMouth);
  vec2 mrad = vec2(0.046, 0.054) * (0.45 + 0.55 * uMouth);
  float dO = sdEll(m + vec2(0.0, 0.012), mrad);
  float mouthIn = fillAA(dO) * mo;
  float tongue = fillAA(length((m + vec2(0.0, 0.012 + mrad.y * 0.78)) / vec2(1.0, 0.8)) - mrad.x * 0.8) * mouthIn;
  float mouthLine = fillAA(abs(dO) - LW * 0.55) * mo;
  float wA = fillAA(dW) * (1.0 - mo);
  float blA = 0.0, hatch = 0.0;
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

  vec3 alb = diffuseColor.rgb;
  // stretched dough thins out and pales; pressed dough deepens in colour
  float area = length(cross(vTa, vTb));
  alb = mix(alb, uRimCol, clamp((area - 1.0) * 0.55, 0.0, 0.35));
  // pressed hollows: occluded (darker) with a faint deepening of the colour
  float press = smoothstep(0.01, 0.3, vDent + vImprint * 0.9);
  float squash = clamp((1.0 - vJ) * 1.6, 0.0, 1.0);
  alb *= 1.0 - 0.34 * press;
  alb = mix(alb, alb * mix(vec3(1.0), uDeep, 0.45), clamp(press * 0.35 + squash * 0.25, 0.0, 0.6));
  alb = mix(alb, uBlushCol, blA * 0.82);
  alb = mix(alb, uBlushCol * 0.72, hatch * 0.85);
  alb = mix(alb, uMouthCol, mouthIn * front);
  alb = mix(alb, uTongueCol, tongue * front);
  float ink = max(max(eyeA, wA), mouthLine) * front;
  alb = mix(alb, uInk, ink);
  alb = mix(alb, vec3(1.0), hlA * front);
  diffuseColor.rgb = alb;
}
`;

// Fine wrinkles where the skin is compressed: the principal compression of the
// surface metric (from the deformed tangents) gives the direction and strength;
// ridges run across the compression. cos() of a phase is used so the pattern is
// independent of the sign of the eigenvector.
const FRAG_NORMAL = /* glsl */ `
{
  float g11 = dot(vTa, vTa), g12 = dot(vTa, vTb), g22 = dot(vTb, vTb);
  float tr = 0.5 * (g11 + g22);
  float dis = sqrt(max(0.25 * (g11 - g22) * (g11 - g22) + g12 * g12, 0.0));
  float lmin = max(tr - dis, 0.0);
  float lmax = tr + dis;
  float sMin = sqrt(lmin), sMax = sqrt(lmax);
  // compressed in one direction more than the other (or overall)
  float amt = smoothstep(0.9, 0.68, sMin) * (0.45 + 0.55 * smoothstep(1.0, 1.35, sMax / max(sMin, 1e-3)));
  // no creases in the band that rests on the plate (it is squashed by the weight)
  amt *= uWrinkle * smoothstep(0.1, 0.4, vRest.y);
  if (amt > 0.002) {
    vec2 ev = abs(g12) > 1e-6 ? normalize(vec2(g12, lmin - g11)) : (g11 < g22 ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    vec3 n0 = normalize(vRestN);
    vec3 t1 = skinTangentF(n0);
    vec3 t2 = cross(n0, t1);
    vec3 dRest = ev.x * t1 + ev.y * t2;
    vec3 eRest = cross(n0, dRest);
    vec3 dDef = normalize(ev.x * vTa + ev.y * vTb);
    float k = uWrinkleK;
    // creases run across the compression; noise warps and breaks them up so
    // they read as soft folds, not stripes
    float u = dot(vRest, dRest) * k;
    float v = dot(vRest, eRest) * k * 0.2;
    float ph = u + 2.4 * vnoise(vec3(v, u * 0.12, 1.7)) + 1.6 * vnoise(vRest * 7.0);
    float slope = -sin(ph) * smoothstep(0.15, 0.75, vnoise(vec3(v * 1.7, u * 0.2, 5.3)));
    vec3 dView = normalize((viewMatrix * vec4(dDef, 0.0)).xyz);
    normal = normalize(normal + dView * slope * amt * 0.32);
  }
}
`;

// Translucent silicone: light soaking through thin parts (ears, arms, a pressed
// dent) and a warm tint in the shade.
const FRAG_SSS = /* glsl */ `
{
  vec3 Vd = normalize(vViewPosition);
  vec3 L = normalize(uLightV);
  float wrap = clamp((dot(normal, L) + 0.6) / 1.6, 0.0, 1.0);
  float thin = clamp(1.0 - vThick / 0.6, 0.0, 1.0);
  float back = pow(clamp(-dot(Vd, L) * 0.5 + 0.5, 0.0, 1.0), 3.0); // lit from behind
  vec3 sss = uDeep * diffuseColor.rgb * ((1.0 - wrap) * 0.16 + thin * (0.12 + 0.55 * back));
  outgoingLight += sss * uSunCol * (0.7 + 0.3 * uSurface);
}
`;
