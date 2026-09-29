// WebGL2 pipeline: procedural background + 2D scene composite (accumulated for motion blur),
// distortion pass (kaleidoscope / liquid warp / zoom blur / glitch / chromatic aberration),
// multi-level bloom and a filmic finishing pass.
import { W, H } from './core.js';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform vec2 uRes; uniform float uTime;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float h11(float p){ return fract(sin(p*127.1)*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=.5;} return s; }
vec3 pal(float t){ return .5+.5*cos(6.28318*(vec3(1.0,1.0,1.0)*t+vec3(0.0,0.33,0.67))); }
`;

const BG_FS = COMMON + `
uniform sampler2D uScene; uniform float uWeight;
uniform vec3 uBase; uniform vec3 uBase2; uniform float uInv;
uniform float uGrid; uniform float uGridScale; uniform vec2 uGridOff; uniform float uGridPersp;
uniform float uPsy; uniform float uPsyHue;
uniform float uGlow; uniform vec2 uGlowPos; uniform vec3 uGlowCol; uniform float uGlowR;
uniform float uRings; uniform float uRingPhase; uniform vec2 uRingC;
uniform float uDust; uniform float uLines; uniform float uLinesAng;
void main(){
  vec2 fc = uv*uRes; vec2 q = (fc - .5*uRes)/uRes.y;
  vec3 base = mix(uBase, uBase2, smoothstep(1.2, 0.0, length(q)));
  vec3 col = base;
  // dot grid
  if(uGrid>0.001){
    vec2 g = fc; if(uGridPersp>0.){ g = vec2((fc.x-.5*uRes.x)/(1.0+uGridPersp*(1.-uv.y)), fc.y) ; }
    vec2 gp = (g + uGridOff)/uGridScale; vec2 gf = fract(gp)-.5; float d = length(gf)*uGridScale;
    float dotm = smoothstep(2.2, 1.0, d);
    float fall = smoothstep(1.25, 0.1, length(q));
    col += vec3(0.93,0.91,0.88) * dotm * uGrid * (0.35+0.65*fall);
  }
  // diagonal hairlines field
  if(uLines>0.001){
    float a = uLinesAng; vec2 r = mat2(cos(a),-sin(a),sin(a),cos(a))*fc;
    float l = abs(fract(r.x/38.)-.5)*38.; col += vec3(.93,.91,.88)*smoothstep(1.2,0.,l)*uLines*smoothstep(1.3,.2,length(q));
  }
  // psychedelic domain-warped field
  if(uPsy>0.001){
    vec2 p = q*2.2; float t = uTime*0.55;
    vec2 w1 = vec2(fbm(p+vec2(0.,t)), fbm(p+vec2(5.2,-t)));
    vec2 w2 = vec2(fbm(p+3.5*w1+vec2(1.7,9.2)+t*.6), fbm(p+3.5*w1+vec2(8.3,2.8)-t*.4));
    float f = fbm(p+4.*w2);
    float ff = f*1.5 + length(w2)*.6 + uPsyHue;
    float band = floor(ff*9.);
    int bi = int(mod(band, 5.));
    vec3 P0 = vec3(1.00,0.17,0.84), P1 = vec3(0.42,0.17,1.00), P2 = vec3(0.78,1.00,0.18), P3 = vec3(1.00,0.42,0.17), P4 = vec3(0.17,0.89,1.00);
    vec3 pc = bi==0?P0: bi==1?P1: bi==2?P2: bi==3?P3: P4;
    pc *= 0.62 + 0.18*sin(band*1.7);
    float fr = fract(ff*9.);
    float edge = smoothstep(0.0, 0.05, fr) * smoothstep(1.0, 0.95, fr);
    pc *= 0.18 + 0.82*edge;
    col = mix(col, pc, uPsy);
  }
  // concentric pulse rings
  if(uRings>0.001){
    vec2 rc = (fc - uRingC)/uRes.y; float r = length(rc);
    float ring = pow(.5+.5*cos(r*55. - uRingPhase), 18.) * smoothstep(1.4, .05, r);
    col += vec3(1.,.17,.1)*ring*uRings;
  }
  // soft glow
  if(uGlow>0.001){
    vec2 gp = (fc - uGlowPos)/uRes.y; float g = exp(-dot(gp,gp)/(uGlowR*uGlowR));
    col += uGlowCol*g*uGlow;
  }
  // drifting dust
  if(uDust>0.001){
    vec2 p = fc/7.; vec2 i = floor(p); float r = h21(i + floor(uTime*0.0));
    float s = step(.9965, r) * (0.4+0.6*sin(uTime*3.+r*90.));
    col += vec3(.95)*s*uDust;
  }
  col = mix(col, vec3(0.933,0.918,0.882) - (col-base)*0.6, uInv);
  vec4 sc = texture(uScene, vec2(uv.x, 1.-uv.y));
  vec3 outc = col*(1.-sc.a) + sc.rgb;
  o = vec4(outc*uWeight, uWeight);
}`;

const DISTORT_FS = COMMON + `
uniform sampler2D uTex;
uniform float uKal; uniform float uKalN; uniform float uKalRot; uniform float uKalZoom;
uniform float uWarp; uniform float uZoomBlur; uniform vec2 uZoomC; uniform float uGlitch; uniform float uGlitchSeed;
uniform float uCA; uniform float uBarrel; uniform float uRipple; uniform vec2 uRippleC; uniform float uRippleT;
vec2 kal(vec2 u){
  vec2 p = (u-.5)*vec2(uRes.x/uRes.y,1.);
  float r = length(p)/uKalZoom; float a = atan(p.y,p.x) + uKalRot;
  float seg = 6.28318/uKalN; a = mod(a, seg); a = abs(a - seg*.5);
  vec2 k = vec2(cos(a),sin(a))*r;
  return k/vec2(uRes.x/uRes.y,1.)+.5;
}
vec3 samp(vec2 u){ return texture(uTex, u).rgb; }
void main(){
  vec2 u = uv;
  // barrel / lens
  if(abs(uBarrel)>0.0001){ vec2 p=u-.5; float r2=dot(p,p); u = .5 + p*(1.+uBarrel*r2); }
  // shock ripple
  if(uRipple>0.001){
    vec2 p=(u-uRippleC)*vec2(uRes.x/uRes.y,1.); float r=length(p);
    float w = exp(-pow((r-uRippleT)*9.,2.)); u -= normalize(p+1e-5)*w*uRipple*0.05/vec2(uRes.x/uRes.y,1.);
  }
  if(uWarp>0.001){
    vec2 w = vec2(fbm(u*3.1+vec2(uTime*.4,0.)), fbm(u*3.1+vec2(0.,-uTime*.37)+7.3))-.5;
    u += w*uWarp*0.12;
  }
  // glitch slices
  float gshift = 0.;
  if(uGlitch>0.001){
    float band = floor(u.y*uRes.y/ (8.+ 60.*h11(floor(u.y*14.)+uGlitchSeed)));
    float r = h11(band*1.37 + uGlitchSeed*3.1);
    if(r < uGlitch*0.55){ gshift = (h11(band+uGlitchSeed*7.7)-.5)*0.18*uGlitch; }
    float blk = step(1.-uGlitch*.25, h21(floor(u*vec2(24.,13.))+uGlitchSeed));
    gshift += blk*(h11(uGlitchSeed+floor(u.y*13.))-.5)*.08;
    u.x += gshift;
  }
  vec2 uk = u;
  vec3 c;
  if(uZoomBlur>0.001){
    vec3 acc=vec3(0.); float tw=0.;
    for(int i=0;i<24;i++){ float t=float(i)/23.; float s = 1. - uZoomBlur*t*0.35;
      vec2 su = uZoomC + (u-uZoomC)*s; if(uKal>0.) su = mix(su, kal(su), uKal);
      float wgt = 1.-t*.6; acc += samp(su)*wgt; tw+=wgt; }
    c = acc/tw;
  } else {
    vec2 su = u; if(uKal>0.) su = mix(su, kal(su), uKal);
    c = samp(su);
    if(uCA>0.0005){
      vec2 d = (su-.5); float l = length(d);
      vec2 off = d*uCA*(0.4+l*1.6);
      c.r = samp(su+off + vec2(gshift*.25,0.)).r; c.b = samp(su-off - vec2(gshift*.25,0.)).b;
    }
  }
  if(uZoomBlur>0.001 && uCA>0.0005){
    vec2 su=u; vec2 d=(su-.5); vec2 off=d*uCA; c.r = mix(c.r, samp(su+off).r, .5); c.b = mix(c.b, samp(su-off).b, .5);
  }
  o = vec4(c,1.);
}`;

const BRIGHT_FS = COMMON + `
uniform sampler2D uTex; uniform float uThr; uniform vec2 uTexel;
void main(){
  vec3 c = vec3(0.);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) c += texture(uTex, uv+vec2(x,y)*uTexel).rgb;
  c/=9.;
  float l = max(c.r,max(c.g,c.b)); float mn = min(c.r,min(c.g,c.b));
  float sat = (l-mn)/max(l,1e-4);
  float k = clamp((l-uThr)/(1.-uThr+1e-4),0.,1.)*0.55 + sat*smoothstep(0.35,1.0,l)*0.95;
  o = vec4(c*k,1.);
}`;

const DOWN_FS = COMMON + `
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec3 a = texture(uTex, uv+uTexel*vec2(-1,-1)).rgb + texture(uTex, uv+uTexel*vec2(1,-1)).rgb
         + texture(uTex, uv+uTexel*vec2(-1,1)).rgb + texture(uTex, uv+uTexel*vec2(1,1)).rgb;
  vec3 b = texture(uTex, uv).rgb;
  vec3 c = texture(uTex, uv+uTexel*vec2(-2,0)).rgb + texture(uTex, uv+uTexel*vec2(2,0)).rgb
         + texture(uTex, uv+uTexel*vec2(0,-2)).rgb + texture(uTex, uv+uTexel*vec2(0,2)).rgb;
  o = vec4(b*.25 + a*.125 + c*.0625, 1.);
}`;

const UP_FS = COMMON + `
uniform sampler2D uTex; uniform sampler2D uBase; uniform vec2 uTexel; uniform float uMix;
void main(){
  vec3 s = vec3(0.);
  s += texture(uTex, uv+uTexel*vec2(-1,-1)).rgb*1.; s += texture(uTex, uv+uTexel*vec2(0,-1)).rgb*2.; s += texture(uTex, uv+uTexel*vec2(1,-1)).rgb*1.;
  s += texture(uTex, uv+uTexel*vec2(-1,0)).rgb*2.;  s += texture(uTex, uv).rgb*4.;                  s += texture(uTex, uv+uTexel*vec2(1,0)).rgb*2.;
  s += texture(uTex, uv+uTexel*vec2(-1,1)).rgb*1.;  s += texture(uTex, uv+uTexel*vec2(0,1)).rgb*2.;  s += texture(uTex, uv+uTexel*vec2(1,1)).rgb*1.;
  s/=16.;
  o = vec4(texture(uBase, uv).rgb + s*uMix, 1.);
}`;

const FINAL_FS = COMMON + `
uniform sampler2D uTex; uniform sampler2D uBloom; uniform float uBloomAmt; uniform vec3 uBloomTint;
uniform float uFlash; uniform vec3 uFlashCol; uniform float uInvert; uniform float uVig; uniform float uGrain;
uniform float uFrame; uniform float uExposure; uniform float uSat; uniform float uFade; uniform float uScanl;
void main(){
  vec2 u = vec2(uv.x, 1.-uv.y); // flip so readPixels returns top-down rows
  vec3 c = texture(uTex, u).rgb;
  vec3 b = texture(uBloom, u).rgb;
  c += b*uBloomAmt*0.2*uBloomTint;
  c *= uExposure;
  float L = dot(c, vec3(.299,.587,.114)); c = mix(vec3(L), c, uSat);
  c = mix(c, 1.-clamp(c,0.,1.), uInvert);
  c = mix(c, uFlashCol, uFlash);
  // soft shoulder to keep design colors exact but tame highlights
  vec3 sh = .82 + .18*(1.-exp(-(c-.82)/.18)); c = mix(c, sh, step(.82, c));
  vec2 q = u-.5; q.x*=uRes.x/uRes.y; float v = smoothstep(1.15, .25, length(q)); c *= mix(1., v, uVig);
  if(uScanl>0.) c *= 1. - uScanl*(.5+.5*sin(u.y*uRes.y*3.14159));
  float g = h21(u*uRes + fract(uFrame*.6180339)*vec2(113.,71.)) - .5;
  float g2 = h21(u*uRes*.5 + fract(uFrame*.3819)*vec2(37.,91.)) - .5;
  c += (g*.7+g2*.3)*uGrain*(0.35+0.65*(1.-L));
  c *= 1.-uFade;
  c += (h21(u*uRes+uFrame)-.5)/255.;
  o = vec4(clamp(c,0.,1.),1.);
}`;

export class Pipeline {
  constructor(canvas) {
    this.cv = canvas; canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: false });
    this.gl = gl;
    gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear');
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this._qb = buf;
    this.progs = {
      bg: this.prog(BG_FS), distort: this.prog(DISTORT_FS), bright: this.prog(BRIGHT_FS),
      down: this.prog(DOWN_FS), up: this.prog(UP_FS), final: this.prog(FINAL_FS),
    };
    this.sceneTex = this.tex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.accum = this.rt(W, H);
    this.dist = this.rt(W, H);
    this.mips = [];
    let w = W >> 1, h = H >> 1;
    for (let i = 0; i < 6; i++) { this.mips.push({ a: this.rt(w, h), b: this.rt(w, h), w, h }); w >>= 1; h >>= 1; }
    this.pix = new Uint8Array(W * H * 4);
  }
  prog(fs) {
    const gl = this.gl;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) + '\n' + s.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n')); return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = { loc: gl.getUniformLocation(p, info.name), type: info.type }; }
    return { p, u };
  }
  tex(w, h, ifmt, fmt, type) {
    const gl = this.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    return t;
  }
  rt(w, h) {
    const gl = this.gl; const t = this.tex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  }
  use(name, target, uniforms, texs = {}) {
    const gl = this.gl; const P = this.progs[name];
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
    gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
    let unit = 0;
    for (const [k, t] of Object.entries(texs)) {
      if (!P.u[k]) continue; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[k].loc, unit); unit++;
    }
    for (const [k, v] of Object.entries(uniforms)) {
      const U = P.u[k]; if (!U) continue;
      if (typeof v === 'number') gl.uniform1f(U.loc, v);
      else if (v.length === 2) gl.uniform2fv(U.loc, v);
      else if (v.length === 3) gl.uniform3fv(U.loc, v);
      else if (v.length === 4) gl.uniform4fv(U.loc, v);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this._qb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  beginAccum() {
    const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, this.accum.f); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  // composite one subframe: bg params + current 2D scene canvas
  addSub(sceneCanvas, bg, weight, time) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    this.use('bg', this.accum, { ...bg, uWeight: weight, uTime: time, uRes: [W, H] }, { uScene: this.sceneTex });
    gl.disable(gl.BLEND);
  }
  finish(post, frame, time) {
    const gl = this.gl;
    this.use('distort', this.dist, { ...post, uTime: time, uRes: [W, H] }, { uTex: this.accum.t });
    // bloom
    const m = this.mips;
    this.use('bright', m[0].a, { uThr: post.uBloomThr ?? 0.72, uTexel: [1 / W, 1 / H], uRes: [m[0].w, m[0].h] }, { uTex: this.dist.t });
    for (let i = 1; i < m.length; i++) this.use('down', m[i].a, { uTexel: [1 / m[i - 1].w, 1 / m[i - 1].h], uRes: [m[i].w, m[i].h] }, { uTex: m[i - 1].a.t });
    // upsample chain: b[i] = a[i] + up(b[i+1])
    const last = m.length - 1;
    this.use('down', m[last].b, { uTexel: [0.5 / m[last].w, 0.5 / m[last].h], uRes: [m[last].w, m[last].h] }, { uTex: m[last].a.t });
    for (let i = last - 1; i >= 0; i--) this.use('up', m[i].b, { uTexel: [1 / m[i + 1].w, 1 / m[i + 1].h], uMix: 1.0, uRes: [m[i].w, m[i].h] }, { uTex: m[i + 1].b.t, uBase: m[i].a.t });
    this.use('final', null, { ...post, uFrame: frame, uTime: time, uRes: [W, H] }, { uTex: this.dist.t, uBloom: m[0].b.t });
  }
  read() {
    const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this.pix);
    return this.pix;
  }
}

export const BG_DEFAULT = () => ({
  uBase: [0.018, 0.018, 0.022], uBase2: [0.045, 0.043, 0.05], uInv: 0,
  uGrid: 0, uGridScale: 48, uGridOff: [0, 0], uGridPersp: 0,
  uPsy: 0, uPsyHue: 0, uGlow: 0, uGlowPos: [960, 540], uGlowCol: [1, 0.17, 0.1], uGlowR: 0.35,
  uRings: 0, uRingPhase: 0, uRingC: [960, 540], uDust: 0, uLines: 0, uLinesAng: 0.6,
});
export const POST_DEFAULT = () => ({
  uKal: 0, uKalN: 6, uKalRot: 0, uKalZoom: 1, uWarp: 0, uZoomBlur: 0, uZoomC: [0.5, 0.5], uGlitch: 0, uGlitchSeed: 0,
  uCA: 0.0015, uBarrel: 0, uRipple: 0, uRippleC: [0.5, 0.5], uRippleT: 0,
  uBloomAmt: 0.55, uBloomThr: 0.88, uBloomTint: [1, 1, 1], uFlash: 0, uFlashCol: [1, 1, 1], uInvert: 0, uVig: 0.55,
  uGrain: 0.045, uExposure: 1, uSat: 1, uFade: 0, uScanl: 0,
});
