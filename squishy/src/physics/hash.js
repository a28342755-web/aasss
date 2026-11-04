// Spatial hashing (Teschner et al. 2003, in the dense-array form popularised by
// Müller's "Ten Minute Physics"). Points are bucketed into a hashed uniform grid;
// a query visits the 27 cells around a position. Rebuilding is O(n) and needs no
// allocation, so the solver can rebuild it every substep for self-collision.

export class SpatialHash {
  constructor(spacing, maxPoints) {
    this.spacing = spacing;
    this.inv = 1 / spacing;
    this.tableSize = 2 * maxPoints + 1;
    this.cellStart = new Int32Array(this.tableSize + 1);
    this.cellEntries = new Int32Array(maxPoints);
    this.queryIds = new Int32Array(maxPoints);
    this.querySize = 0;
  }

  _hash(xi, yi, zi) {
    const h = (Math.imul(xi, 92837111) ^ Math.imul(yi, 689287499) ^ Math.imul(zi, 283923481));
    return Math.abs(h) % this.tableSize;
  }

  // pos: flat xyz array; ids (optional): subset of point indices to insert.
  create(pos, ids, count) {
    const n = ids ? count : pos.length / 3;
    const inv = this.inv;
    this.cellStart.fill(0);
    for (let k = 0; k < n; k++) {
      const i = ids ? ids[k] : k;
      const h = this._hash(Math.floor(pos[i * 3] * inv), Math.floor(pos[i * 3 + 1] * inv), Math.floor(pos[i * 3 + 2] * inv));
      this.cellStart[h]++;
    }
    let start = 0;
    for (let i = 0; i < this.tableSize; i++) {
      start += this.cellStart[i];
      this.cellStart[i] = start;
    }
    this.cellStart[this.tableSize] = start;
    for (let k = 0; k < n; k++) {
      const i = ids ? ids[k] : k;
      const h = this._hash(Math.floor(pos[i * 3] * inv), Math.floor(pos[i * 3 + 1] * inv), Math.floor(pos[i * 3 + 2] * inv));
      this.cellStart[h]--;
      this.cellEntries[this.cellStart[h]] = i;
    }
  }

  // Collects candidate ids within maxDist (cell-granular) of (x, y, z) into
  // this.queryIds[0 .. this.querySize).
  query(x, y, z, maxDist) {
    const inv = this.inv;
    const x0 = Math.floor((x - maxDist) * inv), x1 = Math.floor((x + maxDist) * inv);
    const y0 = Math.floor((y - maxDist) * inv), y1 = Math.floor((y + maxDist) * inv);
    const z0 = Math.floor((z - maxDist) * inv), z1 = Math.floor((z + maxDist) * inv);
    let q = 0;
    const cap = this.queryIds.length;
    for (let xi = x0; xi <= x1; xi++) {
      for (let yi = y0; yi <= y1; yi++) {
        for (let zi = z0; zi <= z1; zi++) {
          const h = this._hash(xi, yi, zi);
          const s = this.cellStart[h], e = this.cellStart[h + 1];
          for (let i = s; i < e && q < cap; i++) this.queryIds[q++] = this.cellEntries[i];
        }
      }
    }
    this.querySize = q;
    return q;
  }
}

// Growable grid for build-time neighbour searches (mesher, embedding). Exact
// cells (Map keyed by cell coordinates), so no hash collisions to filter.
export class PointGrid {
  constructor(cell) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.map = new Map();
    this.pts = [];
  }

  _key(xi, yi, zi) {
    return (xi + 512) * 1048576 + (yi + 512) * 1024 + (zi + 512);
  }

  add(x, y, z, id = this.pts.length / 3) {
    const k = this._key(Math.floor(x * this.inv), Math.floor(y * this.inv), Math.floor(z * this.inv));
    let b = this.map.get(k);
    if (!b) this.map.set(k, (b = []));
    b.push(id);
    this.pts.push(x, y, z);
    return id;
  }

  // Calls fn(id, d2) for each stored point within radius r.
  forEachNear(x, y, z, r, fn) {
    const inv = this.inv, P = this.pts, r2 = r * r;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
    const z0 = Math.floor((z - r) * inv), z1 = Math.floor((z + r) * inv);
    for (let xi = x0; xi <= x1; xi++) {
      for (let yi = y0; yi <= y1; yi++) {
        for (let zi = z0; zi <= z1; zi++) {
          const b = this.map.get(this._key(xi, yi, zi));
          if (!b) continue;
          for (const id of b) {
            const dx = P[id * 3] - x, dy = P[id * 3 + 1] - y, dz = P[id * 3 + 2] - z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 <= r2 && fn(id, d2) === false) return;
          }
        }
      }
    }
  }

  anyWithin(x, y, z, r) {
    let found = false;
    this.forEachNear(x, y, z, r, () => {
      found = true;
      return false;
    });
    return found;
  }

  nearestDist(x, y, z, rMax) {
    let best = rMax * rMax;
    this.forEachNear(x, y, z, rMax, (id, d2) => {
      if (d2 < best) best = d2;
    });
    return Math.sqrt(best);
  }
}
