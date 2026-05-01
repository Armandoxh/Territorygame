// Territory grid: Uint8Array where each byte is the owner ID of that tile.
// 0 = unclaimed; 1..N = players. Maintains:
//  - dirty: indices changed since last render flush
//  - counts: tile count per owner (cached, updated on each claim)
//  - frontiers: per-owner Set of tile indices that have at least one
//    non-same-owner neighbor (the candidates for expansion)
class Territory {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.owners = new Uint8Array(width * height);
    // Terrain (parallel array): 0 = land, 1 = water, 2 = deep water.
    // Initially all land; main.js calls setTerrain() with a generated map.
    this.terrain = new Uint8Array(width * height);
    this.dirty = new Set();
    this.counts = new Uint32Array(256);
    this.counts[0] = width * height;
    // Sum of X/Y coords per owner, maintained incrementally so we can ask
    // for an owner's centroid in O(1) — used to bias expansion direction.
    this.sumX = new Float64Array(256);
    this.sumY = new Float64Array(256);
    // Seed owner 0 (unclaimed) sums so that decrementing on claim stays
    // consistent. Centroid for owner 0 is never queried, but the bookkeeping
    // has to balance.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.sumX[0] += x;
        this.sumY[0] += y;
      }
    }
    this.frontiers = new Map();
  }

  centroid(owner) {
    const c = this.counts[owner];
    if (c === 0) return { x: 0, y: 0 };
    return { x: this.sumX[owner] / c, y: this.sumY[owner] / c };
  }

  setTerrain(arr) {
    if (arr.length !== this.terrain.length) return;
    this.terrain.set(arr);
    // Mark every tile dirty so the renderer paints terrain colors on next flush.
    for (let i = 0; i < this.terrain.length; i++) this.dirty.add(i);
  }

  isPassable(x, y) {
    if (!this.inBounds(x, y)) return false;
    return this.terrain[this.idx(x, y)] === 0; // 0 = land
  }

  idx(x, y) { return y * this.width + x; }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getOwner(x, y) {
    if (!this.inBounds(x, y)) return -1;
    return this.owners[this.idx(x, y)];
  }

  getFrontier(owner) {
    let s = this.frontiers.get(owner);
    if (!s) { s = new Set(); this.frontiers.set(owner, s); }
    return s;
  }

  _isFrontierFor(x, y, owner) {
    if (owner === 0) return false;
    if (this.getOwner(x - 1, y) !== owner) return true;
    if (this.getOwner(x + 1, y) !== owner) return true;
    if (this.getOwner(x, y - 1) !== owner) return true;
    if (this.getOwner(x, y + 1) !== owner) return true;
    return false;
  }

  claim(x, y, owner) {
    if (!this.inBounds(x, y)) return false;
    // Water tiles can never be claimed by a player (owner != 0).
    if (owner !== 0 && this.terrain[this.idx(x, y)] !== 0) return false;
    const i = this.idx(x, y);
    const old = this.owners[i];
    if (old === owner) return false;

    this.owners[i] = owner;
    this.counts[old]--;
    this.counts[owner]++;
    this.sumX[old] -= x;
    this.sumY[old] -= y;
    this.sumX[owner] += x;
    this.sumY[owner] += y;
    this.dirty.add(i);

    if (old !== 0) this.getFrontier(old).delete(i);
    if (owner !== 0 && this._isFrontierFor(x, y, owner)) {
      this.getFrontier(owner).add(i);
    }

    // Re-evaluate the 4 neighbors' frontier membership for THEIR owner.
    const ns = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of ns) {
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.idx(nx, ny);
      const no = this.owners[ni];
      if (no === 0) continue;
      const set = this.getFrontier(no);
      if (this._isFrontierFor(nx, ny, no)) set.add(ni);
      else set.delete(ni);
    }
    return true;
  }

  countByOwner() {
    return Array.from(this.counts);
  }
}
