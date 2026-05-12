// World generation. Pure data, no Pixi imports.
//
// The world is a width*height tile grid. Each tile has:
//   - a terrain type (water, sand, grass)
//   - a region id (or -1 if water)
//   - a state id (sub-partition within its region, or -1 if water)
// Regions are organic blobs grown by multi-source BFS from random
// seeds. Each region gets a placeholder owner color. Within each
// region, tiles are further sub-partitioned into "states" (3-6 per
// region depending on size) — each state has a resource type that
// will match exactly one of the building lines (settlement / forestry
// / merchant). Matching = production boost in a future nail.

export const TERRAIN_WATER = 0;
export const TERRAIN_SAND = 1;
export const TERRAIN_GRASS = 2;

// Resource types map 1:1 to building lines. A state's resource is
// procgen-fixed at world gen and doesn't change. The matching line
// gets a production boost when built there (future nail).
export const RESOURCE_FARMLAND = 0;  // matches Settlement line (tent/house/town)
export const RESOURCE_WOODS = 1;     // matches Forestry line (mill/processing/refinement)
export const RESOURCE_TRADE = 2;     // matches Merchant line (stall/bazaar/exchange)
export type ResourceType = 0 | 1 | 2;

export interface Region {
  id: number;
  color: number;     // 0xRRGGBB
  centroidX: number;
  centroidY: number;
  tileCount: number;
  neighbors: number[];  // sorted, unique region ids that share a tile-edge with this one
  // Indices into World.states for the sub-partitions of this region.
  // Ordered by local id (state.localId).
  stateIds: number[];
}

export interface State {
  id: number;          // global, unique across all states in the world
  regionId: number;    // parent region
  localId: number;     // index within parent region (0..K-1)
  centroidX: number;   // float world tile-coords
  centroidY: number;
  tileCount: number;
  resource: ResourceType;
}

export interface World {
  width: number;
  height: number;
  terrain: Uint8Array;     // length = width*height
  regionOf: Int16Array;    // length = width*height; -1 = water
  // Parallel to regionOf; index into World.states (global). -1 if water.
  // A tile's state is always within its region; stateOf is just the
  // pre-computed mapping so tile→state is one array lookup.
  stateOf: Int16Array;
  regions: Region[];
  states: State[];
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
    stateIds: [],  // filled in step 8
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

  // 8. States: sub-partition each region into 3-6 "states" via a
  //    Voronoi-style BFS within that region. Each state gets a
  //    resource type for the matching-building-line system.
  const stateOf = new Int16Array(N);
  stateOf.fill(-1);
  const states: State[] = [];
  // Collect tile indices per region in a single pass — much faster
  // than re-scanning the full grid per region.
  const tilesByRegion: number[][] = regions.map(() => []);
  for (let i = 0; i < N; i++) {
    const r = regionOf[i]!;
    if (r >= 0) tilesByRegion[r]!.push(i);
  }
  for (let r = 0; r < regions.length; r++) {
    const tiles = tilesByRegion[r]!;
    if (tiles.length === 0) {
      regions[r]!.stateIds = [];
      continue;
    }
    // K scales with region size; clamp 3..6. Tiny regions still get
    // 3 states (visually meaningful sub-divisions even in small
    // territory). Very large regions cap at 6 to keep the build UI
    // manageable.
    const K = Math.max(3, Math.min(6, Math.round(tiles.length / 60)));
    // Pick K seeds within the region with min-spacing. Use the
    // shared rng so seed → world is deterministic.
    const seedTiles: number[] = [];
    const minSpacing = Math.max(2, Math.sqrt(tiles.length / K) * 0.5);
    const minSpacingSq = minSpacing * minSpacing;
    let stateAttempts = 0;
    const maxStateAttempts = K * 200;
    while (seedTiles.length < K && stateAttempts < maxStateAttempts) {
      stateAttempts++;
      const cand = tiles[Math.floor(rng() * tiles.length)]!;
      const cx2 = cand % width;
      const cy2 = (cand / width) | 0;
      let ok = true;
      for (const s of seedTiles) {
        const sxs = s % width;
        const sys = (s / width) | 0;
        const ddx = sxs - cx2;
        const ddy = sys - cy2;
        if (ddx * ddx + ddy * ddy < minSpacingSq) { ok = false; break; }
      }
      if (ok) seedTiles.push(cand);
    }
    // If spacing was too tight (small regions can't fit K seeds),
    // fall back to taking the first K random tiles. Ensures every
    // region has at least 1 state.
    if (seedTiles.length === 0) seedTiles.push(tiles[0]!);
    const actualK = seedTiles.length;
    // Allocate global state ids contiguous per region.
    const startId = states.length;
    const stateIds: number[] = [];
    for (let k = 0; k < actualK; k++) {
      const id = startId + k;
      stateIds.push(id);
      // Random resource pick (uniform). Future polish: bias by
      // terrain (woods inland, trade on coasts, etc.).
      const resource = Math.floor(rng() * 3) as ResourceType;
      states.push({
        id,
        regionId: r,
        localId: k,
        centroidX: 0,  // filled in after BFS
        centroidY: 0,
        tileCount: 0,
        resource,
      });
    }
    regions[r]!.stateIds = stateIds;
    // Multi-source BFS: each tile gets assigned the state of the
    // nearest seed (in BFS hop distance, which is roughly Voronoi).
    const stateQ: number[] = [];
    for (let k = 0; k < actualK; k++) {
      stateOf[seedTiles[k]!] = startId + k;
      stateQ.push(seedTiles[k]!);
    }
    let stateHead = 0;
    while (stateHead < stateQ.length) {
      const i = stateQ[stateHead++]!;
      const x = i % width;
      const y = (i / width) | 0;
      const myS = stateOf[i]!;
      // 4-way; only walk into same-region tiles. No order shuffle
      // here — region boundaries are already organic; state borders
      // can be a bit straighter without hurting the look.
      if (x > 0) {
        const ni = i - 1;
        if (regionOf[ni] === r && stateOf[ni] === -1) {
          stateOf[ni] = myS;
          stateQ.push(ni);
        }
      }
      if (x < width - 1) {
        const ni = i + 1;
        if (regionOf[ni] === r && stateOf[ni] === -1) {
          stateOf[ni] = myS;
          stateQ.push(ni);
        }
      }
      if (y > 0) {
        const ni = i - width;
        if (regionOf[ni] === r && stateOf[ni] === -1) {
          stateOf[ni] = myS;
          stateQ.push(ni);
        }
      }
      if (y < height - 1) {
        const ni = i + width;
        if (regionOf[ni] === r && stateOf[ni] === -1) {
          stateOf[ni] = myS;
          stateQ.push(ni);
        }
      }
    }
    // State centroids + tile counts.
    for (let k = 0; k < actualK; k++) {
      const sid = startId + k;
      let sx = 0;
      let sy = 0;
      let count = 0;
      for (const i of tiles) {
        if (stateOf[i] === sid) {
          sx += i % width;
          sy += (i / width) | 0;
          count++;
        }
      }
      const st = states[sid]!;
      st.tileCount = count;
      st.centroidX = count > 0 ? sx / count : 0;
      st.centroidY = count > 0 ? sy / count : 0;
    }
  }

  return { width, height, terrain, regionOf, stateOf, regions, states, playerRegionId };
}
