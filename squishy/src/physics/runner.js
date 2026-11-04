// Shared step loop used by the worker and by the main-thread fallback: applies
// queued input, advances whole 60 Hz frames, adapts the substep count to the
// time budget, and packs the state for the renderer.

export function createRunner(sb, { minSubsteps = 5, maxSubsteps = 10, budgetMs = 8 } = {}) {
  const pool = [];
  let slow = 0, fast = 0;
  sb.minSubsteps = minSubsteps;
  sb.maxSubsteps = maxSubsteps;
  const releases = [];

  function apply(inp) {
    switch (inp.t || inp.type) {
      case 'down':
        sb.fingerDown(inp.id, inp);
        break;
      case 'move':
        sb.fingerMove(inp.id, inp);
        break;
      case 'up': {
        const info = sb.fingerUp(inp.id);
        if (info) releases.push({ type: 'release', ...info });
        break;
      }
      case 'plate':
        sb.setPlate(inp.x, inp.z, inp.held);
        break;
      case 'hop':
        sb.hop(inp.power || 1, inp.dir || null, inp.speed || 0);
        break;
      case 'puff':
        sb.puff();
        break;
      case 'sleep':
        sb.setSleep(!!inp.on);
        break;
      case 'params':
        sb.setParams(inp.params);
        break;
      case 'quality':
        sb.maxSubsteps = inp.maxSubsteps;
        sb.substeps = Math.min(sb.substeps, inp.maxSubsteps);
        break;
      default:
        break;
    }
  }

  // skipPack: advance only (the main thread has not taken the last state yet)
  function step(msg, skipPack = false) {
    if (msg.recycle) pool.push(msg.recycle);
    if (msg.inputs) for (const inp of msg.inputs) apply(inp);
    const frames = Math.max(1, msg.frames | 0);
    const t0 = performance.now();
    for (let k = 0; k < frames; k++) sb.step(1 / 60);
    const ms = (performance.now() - t0) / frames;

    // Frame-drop guard: fewer substeps when a frame costs too much, more again
    // once there is plenty of headroom.
    if (ms > budgetMs) {
      if (++slow >= 3 && sb.substeps > sb.minSubsteps) { sb.substeps--; slow = 0; }
      fast = 0;
    } else if (ms < budgetMs * 0.45) {
      if (++fast >= 90 && sb.substeps < sb.maxSubsteps) { sb.substeps++; fast = 0; }
      slow = 0;
    } else {
      slow = 0;
      fast = 0;
    }

    if (skipPack) return null;
    const buf = pool.pop();
    const affine = buf && buf.affine.length === sb.N * 16 ? buf.affine : new Float32Array(sb.N * 16);
    const pos = buf && buf.pos.length === sb.N * 3 ? buf.pos : new Float32Array(sb.N * 3);
    sb.writeAffine(affine);
    const x = sb.x;
    for (let i = 0; i < pos.length; i++) pos[i] = x[i];
    const events = releases.splice(0).concat(sb.events.splice(0));
    sb.events.length = 0;
    return {
      type: 'state',
      frames,
      affine,
      pos,
      plate: [sb.plate.x, sb.plate.z],
      fingers: sb.fingerInfo(),
      events,
      frame: { R: Array.from(sb.R), cm: sb.cm.slice(), contacts: sb.contacts },
      stats: { ms, substeps: sb.substeps, ke: sb.stats.ke, N: sb.N, T: sb.nT },
    };
  }

  return { step, apply, sb, recycle: (buf) => pool.push(buf) };
}
