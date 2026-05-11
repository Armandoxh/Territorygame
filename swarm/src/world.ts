// World generation. Pure data, no Pixi imports.
//
// The world is a width*height tile grid. Each tile has:
//   - a terrain type (water, sand, grass)
//   - a region id (or -1 if water)
// Regions are organic blobs grown by multi-source BFS from random
// seeds. Each region gets a placeholder owner color.

export const TERRAIN_WATER = 0;
export const TERRAIN_SAND = 1;
export const TERRAIN_GRASS = 2;

export interface Region {
  id: number;
  color: number;     // 0xRRGGBB
  centroidX: number;
  centroidY: number;
  tileCount: number;
  neighbors: number[];  // sorted, unique region ids that share a tile-edge with this one
}

export interface World {
  width: number;
  height: number;
  terrain: Uint8Array;     // length = width*height
  regionOf: Int16Array;    // length = width*height; -1 = water
  regions: Region[];
  playerRegionId: number;  // index into regions; the human player's home
}

export interface GenerateOpts {
  width: number;
  height: number;
  regionCount: number;
  seed: number;
}

// Mulberry32 — small fast deterministic RNG.
// Mulberry32-style seeded RNG. Exported so other systems (e.g.
// per-map composition rolls) can derive their own deterministic
// streams from the same world seed without coupling to map gen.
export function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bilinear-interp value noise on a coarse grid.
function makeValueNoise(width: number, height: number, freq: number, rng: () => number) {
  const cellsX = Math.ceil(width / freq) + 2;
  const cellsY = Math.ceil(height / freq) + 2;
  const grid = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return (x: number, y: number): number => {
    const fx = x / freq;
    const fy = y / freq;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = grid[y0 * cellsX + x0]!;
    const b = grid[y0 * cellsX + x0 + 1]!;
    const c = grid[(y0 + 1) * cellsX + x0]!;
    const d = grid[(y0 + 1) * cellsX + x0 + 1]!;
    const ab = a + (b - a) * tx;
    const cd = c + (d - c) * tx;
    return ab + (cd - ab) * ty;
  };
}

function hslToRgb(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const ri = Math.round((r + m) * 255);
  const gi = Math.round((g + m) * 255);
  const bi = Math.round((b + m) * 255);
  return (ri << 16) | (gi << 8) | bi;
}

export function generateWorld(opts: GenerateOpts): World {
  const { width, height, regionCount, seed } = opts;
  const rng = makeRng(seed);
  const N = width * height;
  const cx = width / 2;
  const cy = height / 2;

  // 1. Terrain via continent-falloff + low-freq noise.
  const terrain = new Uint8Array(N);
  const noiseLarge = makeValueNoise(width, height, 14, rng);
  const noiseMed = makeValueNoise(width, height, 6, rng);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const falloff = 1 - dist;
      const n = noiseLarge(x, y) * 0.6 + noiseMed(x, y) * 0.4;
      const elev = falloff + (n - 0.5) * 0.85;
      terrain[y * width + x] = elev > 0.18 ? TERRAIN_GRASS : TERRAIN_WATER;
    }
  }

  // 2. Sand pass — any grass tile cardinally adjacent to water becomes sand.
  const sandMark: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (terrain[i] !== TERRAIN_GRASS) continue;
      const adj = [
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
      ];
      for (const ni of adj) {
        if (ni >= 0 && terrain[ni] === TERRAIN_WATER) { sandMark.push(i); break; }
      }
    }
  }
  for (const i of sandMark) terrain[i] = TERRAIN_SAND;

  // 3. Pick region seeds on land with a min spacing.
  const seeds: number[] = [];
  const spacing = Math.sqrt((width * height) / regionCount) * 0.6;
  const spacingSq = spacing * spacing;
  let attempts = 0;
  const maxAttempts = regionCount * 400;
  while (seeds.length < regionCount && attempts < maxAttempts) {
    attempts++;
    const sx = Math.floor(rng() * width);
    const sy = Math.floor(rng() * height);
    const si = sy * width + sx;
    if (terrain[si] === TERRAIN_WATER) continue;
    let ok = true;
    for (const s of seeds) {
      const ex = s % width;
      const ey = (s / width) | 0;
      const ddx = ex - sx;
      const ddy = ey - sy;
      if (ddx * ddx + ddy * ddy < spacingSq) { ok = false; break; }
    }
    if (ok) seeds.push(si);
  }

  // 4. Multi-source BFS to grow regions across all land. Shuffle neighbor
  //    order each pop so boundaries get a bit of organic noise instead of
  //    perfectly equidistant from the seed.
  const regionOf = new Int16Array(N);
  regionOf.fill(-1);
  for (let i = 0; i < N; i++) if (terrain[i] === TERRAIN_WATER) regionOf[i] = -1;
  const queue: number[] = [];
  for (let r = 0; r < seeds.length; r++) {
    regionOf[seeds[r]!] = r;
    queue.push(seeds[r]!);
  }
  const order = [0, 1, 2, 3];
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++]!;
    const x = i % width;
    const y = (i / width) | 0;
    const myR = regionOf[i]!;
    // Shuffle neighbor order.
    for (let k = 3; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      const tmp = order[k]!; order[k] = order[j]!; order[j] = tmp;
    }
    for (const dir of order) {
      let ni = -1;
      if (dir === 0 && x > 0) ni = i - 1;
      else if (dir === 1 && x < width - 1) ni = i + 1;
      else if (dir === 2 && y > 0) ni = i - width;
      else if (dir === 3 && y < height - 1) ni = i + width;
      if (ni < 0) continue;
      if (terrain[ni] === TERRAIN_WATER) continue;
      if (regionOf[ni] !== -1) continue;
      regionOf[ni] = myR;
      queue.push(ni);
    }
  }

  // 5. Centroids, tile counts, placeholder owner colors.
  const tileCount = new Int32Array(seeds.length);
  const sumX = new Int32Array(seeds.length);
  const sumY = new Int32Array(seeds.length);
  for (let i = 0; i < N; i++) {
    const r = regionOf[i]!;
    if (r < 0) continue;
    tileCount[r]! += 1;
    sumX[r]! += i % width;
    sumY[r]! += (i / width) | 0;
  }
  const golden = 0.61803398875;
  const regions: Region[] = seeds.map((_seed, idx) => ({
    id: idx,
    color: hslToRgb((idx * golden) % 1, 0.55, 0.55),
    centroidX: sumX[idx]! / Math.max(1, tileCount[idx]!),
    centroidY: sumY[idx]! / Math.max(1, tileCount[idx]!),
    tileCount: tileCount[idx]!,
    neighbors: [],
  }));

  // 6. Adjacency graph: for each pair of differing region ids meeting at a
  //    tile-edge (4-way), record the edge once in each region's neighbor set.
  //    Water tiles (regionOf = -1) are skipped. Single O(N) sweep checking
  //    only the +x and +y neighbor avoids double-counting.
  const neighborSets: Set<number>[] = regions.map(() => new Set<number>());
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const myR = regionOf[i]!;
      if (myR < 0) continue;
      if (x < width - 1) {
        const nR = regionOf[i + 1]!;
        if (nR >= 0 && nR !== myR) {
          neighborSets[myR]!.add(nR);
          neighborSets[nR]!.add(myR);
        }
      }
      if (y < height - 1) {
        const nR = regionOf[i + width]!;
        if (nR >= 0 && nR !== myR) {
          neighborSets[myR]!.add(nR);
          neighborSets[nR]!.add(myR);
        }
      }
    }
  }
  for (let r = 0; r < regions.length; r++) {
    regions[r]!.neighbors = [...neighborSets[r]!].sort((a, b) => a - b);
  }

  // 7. Player nation = the largest region (most tiles). Stable across reloads
  //    while seed is fixed; gives the human a sensible starting power base.
  let playerRegionId = 0;
  let bestCount = -1;
  for (let r = 0; r < regions.length; r++) {
    if (regions[r]!.tileCount > bestCount) {
      bestCount = regions[r]!.tileCount;
      playerRegionId = r;
    }
  }

  return { width, height, terrain, regionOf, regions, playerRegionId };
}
