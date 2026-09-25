import { MAP_H, MAP_W, TREE_WOOD } from './config';

export const GRASS = 0;
export const WATER = 1;

/** Tile grid: terrain, trees, and which entity (building / mine) sits on each tile. */
export class GameMap {
  readonly w = MAP_W;
  readonly h = MAP_H;
  readonly terrain = new Uint8Array(MAP_W * MAP_H);
  /** Wood left in the tree on this tile; 0 = no tree. */
  readonly tree = new Uint16Array(MAP_W * MAP_H);
  /** Entity id (building or mine) occupying the tile; 0 = none. */
  readonly occupant = new Int32Array(MAP_W * MAP_H);
  /** Bumped whenever a tree disappears so the renderer knows to redraw. */
  treeVersion = 0;

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  passable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return this.terrain[i] === GRASS && this.tree[i] === 0 && this.occupant[i] === 0;
  }
  hasTree(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.tree[this.idx(x, y)]! > 0;
  }
  occupantAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.occupant[this.idx(x, y)]! : 0;
  }
  setOccupant(tx: number, ty: number, size: number, id: number): void {
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) this.occupant[this.idx(x, y)] = id;
  }
  /** True if a size×size footprint at (tx,ty) is all open grass. */
  areaFree(tx: number, ty: number, size: number): boolean {
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) if (!this.passable(x, y)) return false;
    return true;
  }
  clearArea(cx: number, cy: number, r: number): void {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        this.terrain[i] = GRASS;
        this.tree[i] = 0;
      }
  }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blob(map: GameMap, rng: () => number, cx: number, cy: number, steps: number, paint: (i: number) => void): void {
  let x = cx;
  let y = cy;
  for (let s = 0; s < steps; s++) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (map.inBounds(x + dx, y + dy) && rng() < 0.6) paint(map.idx(x + dx, y + dy));
    x += Math.floor(rng() * 3) - 1;
    y += Math.floor(rng() * 3) - 1;
  }
}

/**
 * Lakes + forests. Guarantees a forest a short walk from `start` so the
 * opening build always has wood nearby. Caller clears the start area after.
 */
export function generateTerrain(map: GameMap, rng: () => number, startX: number, startY: number): void {
  const farFromStart = (x: number, y: number, d: number) => Math.hypot(x - startX, y - startY) > d;
  const randomSpot = (minDist: number) => {
    for (let tries = 0; tries < 100; tries++) {
      const x = 2 + Math.floor(rng() * (map.w - 4));
      const y = 2 + Math.floor(rng() * (map.h - 4));
      if (farFromStart(x, y, minDist)) return { x, y };
    }
    return { x: 2, y: 2 };
  };

  for (let i = 0; i < 4; i++) {
    const p = randomSpot(12);
    blob(map, rng, p.x, p.y, 18 + Math.floor(rng() * 20), (idx) => { map.terrain[idx] = WATER; });
  }
  const plantTree = (idx: number) => {
    if (map.terrain[idx] === GRASS) map.tree[idx] = TREE_WOOD;
  };
  for (let i = 0; i < 14; i++) {
    const p = randomSpot(9);
    blob(map, rng, p.x, p.y, 25 + Math.floor(rng() * 35), plantTree);
  }
  // Starter forest: 7-9 tiles away in a random direction.
  const a = rng() * Math.PI * 2;
  const fx = Math.round(startX + Math.cos(a) * 8);
  const fy = Math.round(startY + Math.sin(a) * 8);
  blob(map, rng, fx, fy, 30, plantTree);
  // Map edge is always forest: soft visual border, blocks walking off-map.
  for (let x = 0; x < map.w; x++) {
    plantTree(map.idx(x, 0));
    plantTree(map.idx(x, map.h - 1));
  }
  for (let y = 0; y < map.h; y++) {
    plantTree(map.idx(0, y));
    plantTree(map.idx(map.w - 1, y));
  }
}
