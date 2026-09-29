// Deterministic frame renderer: drives headless Chromium, pipes raw RGB frames into ffmpeg.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { spawn } from 'child_process';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const FPS = +(args.fps || 60), SUB = +(args.sub || 1), SHUT = +(args.shutter || 0.5);
const root = path.resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf' };
const srv = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => window.ready === true);
await page.evaluate(() => window.setup());
const ff = (outArgs) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1920x1080', '-r', String(FPS), '-i', '-', ...outArgs], { stdio: ['pipe', 'inherit', 'inherit'] });
async function frame(i) { const b64 = await page.evaluate(([i, o]) => window.renderFrame(i, o), [i, { fps: FPS, sub: SUB, shutter: SHUT }]); return Buffer.from(b64, 'base64'); }
if (args.stills) {
  // --stills=t1,t2,...  (seconds) -> out/still_<t>.png
  for (const ts of String(args.stills).split(',')) {
    const i = Math.round(parseFloat(ts) * FPS); const t0 = Date.now();
    const buf = await frame(i);
    const p = ff(['-frames:v', '1', `out/still_${(+ts).toFixed(2)}.png`]); p.stdin.end(buf);
    await new Promise((r) => p.on('close', r)); console.log('still', ts, Date.now() - t0, 'ms');
  }
} else {
  const from = +(args.from || 0), to = +(args.to || 20);
  const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
  const out = args.out || 'out/video.mp4';
  const enc = ff(['-c:v', 'libx264', '-preset', args.preset || 'slow', '-crf', String(args.crf || 12), '-pix_fmt', 'yuv420p', '-x264-params', 'aq-mode=3', out]);
  const T = Date.now();
  for (let i = f0; i < f1; i++) {
    const buf = await frame(i);
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    if ((i - f0) % 30 === 0) console.log(`frame ${i}/${f1} ${((Date.now() - T) / (i - f0 + 1)).toFixed(0)} ms/f`);
  }
  enc.stdin.end(); await new Promise((r) => enc.on('close', r));
  console.log('done', out, ((Date.now() - T) / 1000).toFixed(1), 's');
}
await browser.close(); srv.close();
