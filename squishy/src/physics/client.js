// Main-thread side of the physics: owns the worker (or a local fallback), sends
// input with each step request, and interpolates between the two most recent
// physics states so rendering runs at the display's rate while physics runs at
// a fixed 60 Hz. Physics and rendering are fully decoupled.

import { SoftBody } from './softbody.js';
import { createRunner } from './runner.js';

const FRAME = 1 / 60;

export class PhysicsClient {
  constructor(mesh, params, { substeps = 10, minSubsteps = 5, budgetMs = 8, useWorker = true, drop = 0 } = {}) {
    this.mesh = mesh;
    this.N = mesh.nP;
    this.params = params;
    this.cfg = { substeps, minSubsteps, budgetMs, drop };
    this.useWorker = useWorker;
    this.queue = [];
    this.busy = false;
    this.acc = 0;
    this.clock = 0;
    this.prevTime = 0;
    this.simTime = 0;
    const N = this.N;
    this.prev = { affine: new Float32Array(N * 16), pos: new Float32Array(N * 3), plate: [0, 0], fingers: [] };
    this.curr = { affine: new Float32Array(N * 16), pos: new Float32Array(N * 3), plate: [0, 0], fingers: [] };
    this.affine = new Float32Array(N * 16);
    this.pos = new Float32Array(N * 3);
    this.plate = [0, 0];
    this.fingers = [];
    this.events = [];
    this.stats = { ms: 0, substeps, ke: 0, N, T: mesh.nT, mode: 'worker' };
    this.frame = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], cm: [0, 0.7, 0], contacts: 0 };
    this.recycle = null;
    this.hasState = false;
    // rest pose until the first state arrives
    for (let i = 0; i < N; i++) {
      for (const A of [this.prev.affine, this.curr.affine, this.affine]) {
        A[i * 16] = 1; A[i * 16 + 5] = 1; A[i * 16 + 10] = 1;
        A[i * 16 + 7] = drop;
      }
      for (let k = 0; k < 3; k++) {
        const v = mesh.restPos[i * 3 + k] + (k === 1 ? drop : 0);
        this.prev.pos[i * 3 + k] = this.curr.pos[i * 3 + k] = this.pos[i * 3 + k] = v;
      }
    }
  }

  start() {
    const init = {
      type: 'init',
      restPos: this.mesh.restPos,
      tets: this.mesh.tets,
      tier: this.mesh.tier,
      params: this.params,
      substeps: this.cfg.substeps,
      minSubsteps: this.cfg.minSubsteps,
      budgetMs: this.cfg.budgetMs,
      drop: this.cfg.drop,
    };
    return new Promise((resolve) => {
      if (this.useWorker && typeof Worker !== 'undefined') {
        try {
          this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
          let settled = false;
          const fallback = () => {
            if (settled) return;
            settled = true;
            this.worker?.terminate();
            this.worker = null;
            this._startLocal(init);
            resolve(this.stats.mode);
          };
          this.worker.onerror = fallback;
          this.worker.onmessage = (e) => {
            if (e.data.type === 'ready') {
              settled = true;
              this.worker.onmessage = (ev) => this._onState(ev.data);
              resolve('worker');
            }
          };
          setTimeout(fallback, 8000);
          this.worker.postMessage(init);
          return;
        } catch {
          /* fall through to local */
        }
      }
      this._startLocal(init);
      resolve(this.stats.mode);
    });
  }

  _startLocal(init) {
    const sb = new SoftBody(this.mesh, init.params, { substeps: init.substeps, dropHeight: init.drop });
    this.runner = createRunner(sb, { minSubsteps: init.minSubsteps, maxSubsteps: init.substeps, budgetMs: init.budgetMs });
    this.stats.mode = 'main';
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.runner = null;
  }

  // Input goes to the worker right away (it applies it at its next frame); the
  // local fallback applies it at the next tick.
  send(input) {
    if (this.worker) this.worker.postMessage({ type: 'input', inputs: [input] });
    else this.queue.push(input);
  }

  setParams(params) {
    this.params = params;
    this.send({ t: 'params', params });
  }

  _onState(s) {
    this.busy = false;
    // keep the old "current" as "previous" and copy the new state in
    const p = this.prev;
    this.prev = this.curr;
    this.curr = p;
    this.curr.affine.set(s.affine);
    this.curr.pos.set(s.pos);
    this.curr.plate = s.plate;
    this.curr.fingers = s.fingers;
    this.prevTime = this.simTime;
    this.simTime = s.simTime ?? this.simTime + s.frames * FRAME;
    if (!this.hasState) {
      this.prev.affine.set(s.affine);
      this.prev.pos.set(s.pos);
      this.prevTime = this.simTime - FRAME;
      this.clock = this.prevTime;
      this.hasState = true;
    }
    for (const e of s.events) this.events.push(e);
    this.frame = s.frame;
    Object.assign(this.stats, s.stats);
    // hand the buffers back: the worker may now send the next state
    if (this.worker) this.worker.postMessage({ type: 'ack', recycle: { affine: s.affine, pos: s.pos } }, [s.affine.buffer, s.pos.buffer]);
    else this.recycle = { affine: s.affine, pos: s.pos };
  }

  pause(on) {
    this.worker?.postMessage({ type: 'pause', on });
  }

  // Called once per rendered frame.
  tick(dt) {
    // (the worker runs on its own clock; only the local fallback is stepped here)
    if (this.runner) this.acc += Math.min(dt, 0.25);
    if (this.runner && this.acc >= FRAME) {
      let frames = Math.floor(this.acc / FRAME);
      if (frames > 3) frames = 3; // never spiral: drop time instead (slow motion)
      this.acc -= frames * FRAME;
      if (this.acc > 2 * FRAME) this.acc = 0;
      const msg = { type: 'step', frames, inputs: this.queue.splice(0), recycle: this.recycle };
      this.recycle = null;
      this._onState(this.runner.step(msg));
    }
    // interpolate between the last two states (one physics frame of latency)
    this.clock = Math.min(this.simTime, Math.max(this.prevTime, this.clock + dt));
    const span = this.simTime - this.prevTime;
    const a = span > 1e-6 ? (this.clock - this.prevTime) / span : 1;
    const A0 = this.prev.affine, A1 = this.curr.affine, A = this.affine;
    for (let i = 0; i < A.length; i++) A[i] = A0[i] + (A1[i] - A0[i]) * a;
    const P0 = this.prev.pos, P1 = this.curr.pos, P = this.pos;
    for (let i = 0; i < P.length; i++) P[i] = P0[i] + (P1[i] - P0[i]) * a;
    this.plate[0] = this.prev.plate[0] + (this.curr.plate[0] - this.prev.plate[0]) * a;
    this.plate[1] = this.prev.plate[1] + (this.curr.plate[1] - this.prev.plate[1]) * a;
    const before = new Map(this.prev.fingers.map((f) => [f.id, f]));
    this.fingers = this.curr.fingers.map((f) => {
      const b = before.get(f.id);
      if (!b) return f;
      return {
        ...f,
        xf: [b.xf[0] + (f.xf[0] - b.xf[0]) * a, b.xf[1] + (f.xf[1] - b.xf[1]) * a, b.xf[2] + (f.xf[2] - b.xf[2]) * a],
        depth: b.depth + (f.depth - b.depth) * a,
      };
    });
    return a;
  }

  drainEvents() {
    return this.events.splice(0);
  }
}
