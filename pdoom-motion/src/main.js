import { W, H, AF } from './core.js';
import { VFont } from './type.js';
import { Pipeline, BG_DEFAULT, POST_DEFAULT } from './gl.js';
import { SCENES } from './scenes/index.js';

const S = { fonts: {}, bg: null, post: null };
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
  AF.data = await (await fetch('data/features.json')).json();
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
    if (t >= sc.start && t < sc.end) { ctx.save(); sc.draw(ctx, t, S); ctx.restore(); }
  }
}

window.renderFrame = async (frame, opts = {}) => {
  const { fps = 60, sub = 1, shutter = 0.5 } = opts;
  const t = frame / fps;
  const P = S.pipe;
  P.beginAccum();
  for (let i = 0; i < sub; i++) {
    const ts = Math.max(0, t + ((i + 0.5) / sub - 0.5) * (shutter / fps));
    drawAt(ts);
    P.addSub(S.canvas, bgUniforms(S.bg), 1 / sub, ts);
  }
  S.post = POST_DEFAULT();
  for (const sc of SCENES) if (t >= sc.start && t < sc.end && sc.post) sc.post(t, S);
  const p = S.post;
  p.uRippleC = [p.uRippleC[0], 1 - p.uRippleC[1]];
  p.uZoomC = [p.uZoomC[0], 1 - p.uZoomC[1]];
  P.finish(p, frame, t);
  const px = P.read();
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
  const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(new Blob([rgb])); });
  return url.slice(url.indexOf(',') + 1);
};
window.ready = true;
