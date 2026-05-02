import { TERRAIN_LAND } from './types.js';
import type { PlayerId } from './types.js';

// Territory grid: Uint8Array where each byte is the owner ID of that tile.
// Maintains, in step with each claim:
//   dirty       — indices changed since last render flush
//   counts      — tile count per owner
//   sumX, sumY  — coord sums per owner (for centroid in O(1))
//   frontiers   — per-owner Set<index> of tiles bordering a non-same owner
//   terrain     — parallel array (0=land, 1=water, 2=deep water); water is
//                 never claimable
export class Territory {
  readonly width: number;
  readonly height: number;
  readonly owners: Uint8Array;
  readonly terrain: Uint8Array;
  readonly counts: Uint32Array;
  readonly sumX: Float64Array;
  readonly sumY: Float64Array;
  readonly dirty: Set<number>;
  private readonly frontiers: Map<PlayerId, Set<number>>;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.owners = new Uint8Array(width * height);
    this.terrain = new Uint8Array(width * height); // all land by default
    this.counts = new Uint32Array(256);
    this.counts[0] = width * height;
    this.sumX = new Float64Array(256);
    this.sumY = new Float64Array(256);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.sumX[0]! += x;
        this.sumY[0]! += y;
      }
    }
    this.dirty = new Set();
    this.frontiers = new Map();
  }

  idx(x: number, y: number): number { return y * this.width + x; }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** Returns owner ID, or -1 if out of bounds. */
  getOwner(x: number, y: number): number {
    if (!this.inBounds(x, y)) return -1;
    return this.owners[this.idx(x, y)]!;
  }

  isPassable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.terrain[this.idx(x, y)] === TERRAIN_LAND;
  }

  centroid(owner: PlayerId): { x: number; y: number } {
    const c = this.counts[owner]!;
    if (c === 0) return { x: 0, y: 0 };
    return { x: this.sumX[owner]! / c, y: this.sumY[owner]! / c };
  }

  getFrontier(owner: PlayerId): Set<number> {
    let s = this.frontiers.get(owner);
    if (!s) { s = new Set(); this.frontiers.set(owner, s); }
    return s;
  }

  /** Replace the whole terrain array; marks every tile dirty. */
  setTerrain(arr: Uint8Array): void {
    if (arr.length !== this.terrain.length) return;
    this.terrain.set(arr);
    for (let i = 0; i < this.terrain.length; i++) this.dirty.add(i);
  }

  /** Force a circular region to LAND. Marks affected tiles dirty. */
  carveLand(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= this.height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        if (x < 0 || x >= this.width) continue;
        const i = this.idx(x, y);
        if (this.terrain[i] !== TERRAIN_LAND) {
          this.terrain[i] = TERRAIN_LAND;
          this.dirty.add(i);
        }
      }
    }
  }

  /** Returns true if the tile flipped to a new owner. */
  claim(x: number, y: number, owner: PlayerId): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    // Water tiles can never be claimed by a player.
    if (owner !== 0 && this.terrain[i] !== TERRAIN_LAND) return false;
    const old = this.owners[i]!;
    if (old === owner) return false;

    this.owners[i] = owner;
    this.counts[old]!--;
    this.counts[owner]!++;
    this.sumX[old]! -= x;
    this.sumY[old]! -= y;
    this.sumX[owner]! += x;
    this.sumY[owner]! += y;
    this.dirty.add(i);

    if (old !== 0) this.getFrontier(old).delete(i);
    if (owner !== 0 && this._isFrontierFor(x, y, owner)) {
      this.getFrontier(owner).add(i);
    }
    // Re-evaluate the four neighbors' frontier membership for THEIR owner.
    // Anytime a neighbor's frontier status flips we also mark them dirty, so
    // the renderer can repaint with the new shading (frontier tiles glow).
    const ns: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of ns) {
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.idx(nx, ny);
      const no = this.owners[ni]!;
      if (no === 0) continue;
      const set = this.getFrontier(no);
      const wasFrontier = set.has(ni);
      const isFrontier = this._isFrontierFor(nx, ny, no);
      if (isFrontier) set.add(ni);
      else set.delete(ni);
      if (wasFrontier !== isFrontier) this.dirty.add(ni);
    }
    return true;
  }

  private _isFrontierFor(x: number, y: number, owner: PlayerId): boolean {
    if (owner === 0) return false;
    return (
      this.getOwner(x - 1, y) !== owner ||
      this.getOwner(x + 1, y) !== owner ||
      this.getOwner(x, y - 1) !== owner ||
      this.getOwner(x, y + 1) !== owner
    );
  }
}
