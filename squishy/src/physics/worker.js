// Physics Web Worker. It keeps its own real-time clock and advances the soft body
// in fixed 60 Hz frames (each split into adaptive XPBD substeps), whatever the
// main thread's frame rate is. Input arrives as messages at any time and is
// applied at the start of the next frame. A packed state is posted whenever the
// main thread has taken the previous one (ping-pong with transferable buffers),
// so a slow renderer never piles up messages or slows the physics down.

import { finishMesh } from './mesher.js';
import { SoftBody } from './softbody.js';
import { createRunner } from './runner.js';

const FRAME = 1 / 60;
let runner = null;
let inputs = [];
let canSend = true;
let pendingFrames = 0;
let simTime = 0;
let last = 0;
let acc = 0;
let paused = false;

function loop() {
  if (!runner) return;
  const now = performance.now();
  if (!paused) acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  let frames = Math.floor(acc / FRAME);
  if (frames > 4) {
    frames = 4; // too slow to keep up: drop time rather than spiral
    acc = 0;
  } else acc -= frames * FRAME;
  if (frames > 0) {
    const out = runner.step({ frames, inputs: inputs.splice(0) }, !canSend);
    simTime += frames * FRAME;
    pendingFrames += frames;
    if (canSend && out) {
      out.frames = pendingFrames;
      out.simTime = simTime;
      pendingFrames = 0;
      canSend = false;
      self.postMessage(out, [out.affine.buffer, out.pos.buffer]);
    }
  }
  const spent = performance.now() - now;
  setTimeout(loop, Math.max(1, FRAME * 1000 - spent - 1));
}

self.onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init': {
      const mesh = finishMesh(m.restPos, m.tets, m.tier);
      const sb = new SoftBody(mesh, m.params, { substeps: m.substeps, dropHeight: m.drop || 0 });
      runner = createRunner(sb, { minSubsteps: m.minSubsteps, maxSubsteps: m.substeps, budgetMs: m.budgetMs });
      self.postMessage({ type: 'ready', N: sb.N });
      last = performance.now();
      setTimeout(loop, 0);
      break;
    }
    case 'input':
      inputs.push(...m.inputs);
      break;
    case 'ack':
      if (m.recycle) runner?.recycle(m.recycle);
      canSend = true;
      break;
    case 'pause':
      paused = !!m.on;
      break;
    default:
      break;
  }
};
