import { W, H, AF } from './core.js';
import { VFont } from './type.js';
import { Pipeline, BG_DEFAULT, POST_DEFAULT } from './gl.js';
import { scenesFor } from './scenes/index.js';

const S = { fonts: {}, bg: null, post: null };
let SCENES = [];
window.S = S;

async function bytes(p) { return new Uint8Array(await (await fetch(p)).arrayBuffer()); }

window.setup = async () => {
  S.fonts.flex = new VFont('flex', await bytes('fonts/flex.ttf'), { wdth: 100, wght: 400, opsz: 144 });
  S.fonts.archivo = new VFont('archivo', await bytes('fonts/archivo.ttf'), { wdth: 100, wght: 600 });
  S.fonts.mono = new VFont('mono', await bytes('fonts/mono.ttf'), { wght: 500 });
  S.fonts.serif = new VFont('serif', await bytes('fonts/serif.ttf'));
  S.fonts.grotesk = new VFont('grotesk', await bytes('fonts/grotesk.ttf'), { wght: 500 });
  S.fonts.cjk = new VFont('cjk', await bytes('fonts/cjk900.ttf'));
  S.fonts.cjkLight = new VFont('cjkLight', await bytes('fonts/cjk300.ttf'));
  AF.data = await (await fetch(window.FEATURES || 'data/features_full.json')).json();
  // window.CUT = 'chorus' renders the original 20 s chorus cut (song 16.571 → 36.571); default is the full song
  S.full = window.CUT !== 'chorus'; S.songStart = S.full ? 0 : 16.571;
  SCENES = scenesFor(S.full);
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  S.canvas = c2; S.ctx = c2.getContext('2d', { alpha: true });
  S.pipe = new Pipeline(document.getElementById('gl'));
  for (const sc of SCENES) if (sc.init) await sc.init(S);
  return true;
};

function bgUniforms(b) {
  const o = { ...b };
  o.uGlowPos = [b.uGlowPos[0], H - b.uGlowPos[1]];
  o.uRingC = [b.uRingC[0], H - b.uRingC[1]];
  return o;
}

function drawAt(t) {
  const ctx = S.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  S.bg = BG_DEFAULT();
  for (const sc of SCENES) {
    const off = sc.off || 0, lt = t - off;
    if (lt >= sc.start && lt < sc.end) { AF.off = off; ctx.save(); sc.draw(ctx, lt, S); ctx.restore(); }
  }
  AF.off = 0;
}

window.renderFrame = async (frame, opts = {}) => {
  const { fps = 60, sub = 1, shutter = 0.5 } = opts;
  const t = frame / fps + (S.songStart || 0);
  const P = S.pipe;
  P.beginAccum();
  for (let i = 0; i < sub; i++) {
    const ts = Math.max(0, t + ((i + 0.5) / sub - 0.5) * (shutter / fps));
    drawAt(ts);
    P.addSub(S.canvas, bgUniforms(S.bg), 1 / sub, ts);
  }
  S.post = POST_DEFAULT();
  for (const sc of SCENES) {
    const off = sc.off || 0, lt = t - off;
    if (lt >= sc.start && lt < sc.end && sc.post) { AF.off = off; sc.post(lt, S); }
  }
  AF.off = 0;
  const p = S.post;
  p.uRippleC = [p.uRippleC[0], 1 - p.uRippleC[1]];
  p.uZoomC = [p.uZoomC[0], 1 - p.uZoomC[1]];
  P.finish(p, Math.round(t * fps), t);
  const px = P.read();
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
  const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(new Blob([rgb])); });
  return url.slice(url.indexOf(',') + 1);
};
window.ready = true;
