// Small geometry helpers shared by the solver, the main thread and the tests.

// Möller–Trumbore ray/triangle test against triangles indexed into a flat
// position array. Returns the nearest hit or null.
export function raycastTriangles(pos, faces, ox, oy, oz, dx, dy, dz, faceList = null, faceCount = 0) {
  let bestT = Infinity, bestF = -1, bu = 0, bv = 0;
  const n = faceList ? faceCount : faces.length / 3;
  for (let k = 0; k < n; k++) {
    const f = faceList ? faceList[k] : k;
    const a = faces[f * 3] * 3, b = faces[f * 3 + 1] * 3, c = faces[f * 3 + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
    const e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t < bestT) {
      bestT = t; bestF = f; bu = u; bv = v;
    }
  }
  if (bestF < 0) return null;
  const a = faces[bestF * 3] * 3, b = faces[bestF * 3 + 1] * 3, c = faces[bestF * 3 + 2] * 3;
  const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
  const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
  let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  return {
    t: bestT,
    face: bestF,
    u: bu,
    v: bv,
    point: [ox + dx * bestT, oy + dy * bestT, oz + dz * bestT],
    normal: [nx, ny, nz],
  };
}

// Rotation part of a 3x3 matrix A (row-major, 9 numbers) by the iterative method
// of Müller et al. 2016, "A Robust Method to Extract the Rotational Part of
// Deformations". q is a warm-start quaternion [x, y, z, w], updated in place.
export function extractRotation(A, q, maxIter = 8) {
  for (let it = 0; it < maxIter; it++) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    // rotation matrix columns of q
    const r00 = 1 - 2 * (y * y + z * z), r10 = 2 * (x * y + z * w), r20 = 2 * (x * z - y * w);
    const r01 = 2 * (x * y - z * w), r11 = 1 - 2 * (x * x + z * z), r21 = 2 * (y * z + x * w);
    const r02 = 2 * (x * z + y * w), r12 = 2 * (y * z - x * w), r22 = 1 - 2 * (x * x + y * y);
    // A columns
    const a00 = A[0], a10 = A[3], a20 = A[6];
    const a01 = A[1], a11 = A[4], a21 = A[7];
    const a02 = A[2], a12 = A[5], a22 = A[8];
    // omega = sum_i r_i x a_i / |sum_i r_i . a_i|
    let ox = r10 * a20 - r20 * a10 + r11 * a21 - r21 * a11 + r12 * a22 - r22 * a12;
    let oy = r20 * a00 - r00 * a20 + r21 * a01 - r01 * a21 + r22 * a02 - r02 * a22;
    let oz = r00 * a10 - r10 * a00 + r01 * a11 - r11 * a01 + r02 * a12 - r12 * a02;
    const den = Math.abs(r00 * a00 + r10 * a10 + r20 * a20 + r01 * a01 + r11 * a11 + r21 * a21 + r02 * a02 + r12 * a12 + r22 * a22) + 1e-9;
    ox /= den; oy /= den; oz /= den;
    const ang = Math.hypot(ox, oy, oz);
    if (ang < 1e-9) break;
    const s = Math.sin(ang / 2) / ang, c = Math.cos(ang / 2);
    const qx = ox * s, qy = oy * s, qz = oz * s, qw = c;
    // q = dq * q
    const nx = qw * x + qx * w + qy * z - qz * y;
    const ny = qw * y - qx * z + qy * w + qz * x;
    const nz = qw * z + qx * y - qy * x + qz * w;
    const nw = qw * w - qx * x - qy * y - qz * z;
    const l = Math.hypot(nx, ny, nz, nw) || 1;
    q[0] = nx / l; q[1] = ny / l; q[2] = nz / l; q[3] = nw / l;
  }
  return q;
}

export function quatToMat(q, out) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y - z * w); out[2] = 2 * (x * z + y * w);
  out[3] = 2 * (x * y + z * w); out[4] = 1 - 2 * (x * x + z * z); out[5] = 2 * (y * z - x * w);
  out[6] = 2 * (x * z - y * w); out[7] = 2 * (y * z + x * w); out[8] = 1 - 2 * (x * x + y * y);
  return out;
}
