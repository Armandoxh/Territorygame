import type { GameMap } from './map';

export interface Pt { x: number; y: number }

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Axis-aligned tile rect (inclusive min, exclusive max). */
export interface Rect { x: number; y: number; w: number; h: number }

/** True if tile (x,y) touches `r` (8-neighbourhood) without being inside it. */
export function adjacentTo(r: Rect, x: number, y: number): boolean {
  const inside = x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  return !inside && x >= r.x - 1 && y >= r.y - 1 && x <= r.x + r.w && y <= r.y + r.h;
}

/**
 * 8-directional A* from (sx,sy) to the nearest tile satisfying `isGoal`.
 * `target` steers the heuristic. Diagonals can't cut blocked corners.
 * Returns the tiles to walk (start excluded), [] if already at goal, or
 * null if unreachable.
 */
export function findPath(map: GameMap, sx: number, sy: number, isGoal: (x: number, y: number) => boolean, target: Rect): Pt[] | null {
  if (isGoal(sx, sy)) return [];
  const n = map.w * map.h;
  const g = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const tcx = target.x + target.w / 2 - 0.5;
  const tcy = target.y + target.h / 2 - 0.5;
  const slack = Math.max(target.w, target.h) / 2;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tcx);
    const dy = Math.abs(y - tcy);
    return Math.max(0, Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) - slack);
  };

  // Binary min-heap of [f, index].
  const heapF: number[] = [];
  const heapI: number[] = [];
  const push = (f: number, i: number) => {
    let k = heapF.length;
    heapF.push(f);
    heapI.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p]! <= f) break;
      heapF[k] = heapF[p]!;
      heapI[k] = heapI[p]!;
      k = p;
    }
    heapF[k] = f;
    heapI[k] = i;
  };
  const pop = (): number => {
    const top = heapI[0]!;
    const lf = heapF.pop()!;
    const li = heapI.pop()!;
    if (heapF.length > 0) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= heapF.length) break;
        const c = l + 1 < heapF.length && heapF[l + 1]! < heapF[l]! ? l + 1 : l;
        if (heapF[c]! >= lf) break;
        heapF[k] = heapF[c]!;
        heapI[k] = heapI[c]!;
        k = c;
      }
      heapF[k] = lf;
      heapI[k] = li;
    }
    return top;
  };

  const s = map.idx(sx, sy);
  g[s] = 0;
  push(h(sx, sy), s);
  while (heapF.length > 0) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % map.w;
    const cy = (cur - cx) / map.w;
    if (cur !== s && isGoal(cx, cy)) {
      const out: Pt[] = [];
      for (let i = cur; i !== s; i = from[i]!) out.push({ x: i % map.w, y: Math.floor(i / map.w) });
      return out.reverse();
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!map.passable(cx + dx, cy) || !map.passable(cx, cy + dy))) continue;
      const ni = map.idx(nx, ny);
      const ng = g[cur]! + cost;
      if (ng < g[ni]!) {
        g[ni] = ng;
        from[ni] = cur;
        push(ng + h(nx, ny), ni);
      }
    }
  }
  return null;
}
