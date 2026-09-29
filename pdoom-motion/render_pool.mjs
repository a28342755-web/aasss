// Full-song render: 10 s chunks, N concurrent workers, resumable (.done markers), then concat + mux.
import { spawn } from 'child_process'; import fs from 'fs';
const N = +(process.env.WORKERS || 4), SUB = process.env.SUB || '3', DUR = 156.65, STEP = 10;
const chunks = []; for (let a = 0, i = 0; a < DUR - 1e-6; a += STEP, i++) chunks.push({ i, a, b: Math.min(DUR, a + STEP) });
const todo = chunks.filter((c) => !fs.existsSync(`out/full/chunk_${String(c.i).padStart(2, '0')}.done`));
console.log(`chunks ${chunks.length}, todo ${todo.length}, workers ${N}, sub ${SUB}`);
let next = 0, active = 0; const T = Date.now();
await new Promise((resolve) => {
  const launch = () => {
    while (active < N && next < todo.length) {
      const c = todo[next++]; active++;
      const id = String(c.i).padStart(2, '0');
      const p = spawn('node', ['render.mjs', `--from=${c.a}`, `--to=${c.b}`, `--sub=${SUB}`, '--crf=14', '--preset=medium', `--out=out/full/chunk_${id}.mp4`], { stdio: ['ignore', 'pipe', 'pipe'] });
      const log = fs.createWriteStream(`out/full/chunk_${id}.log`); p.stdout.pipe(log); p.stderr.pipe(log);
      p.on('close', (code) => {
        active--;
        if (code === 0) fs.writeFileSync(`out/full/chunk_${id}.done`, ''); 
        console.log(`chunk ${id} [${c.a}-${c.b}] exit ${code} after ${((Date.now() - T) / 60000).toFixed(1)} min`);
        if (next >= todo.length && active === 0) resolve(); else launch();
      });
    }
  };
  launch();
});
const all = chunks.every((c) => fs.existsSync(`out/full/chunk_${String(c.i).padStart(2, '0')}.done`));
console.log(all ? 'ALL CHUNKS DONE' : 'SOME CHUNKS FAILED');
