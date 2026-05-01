// Pre-partitioning of land into "districts" — purely visual, doesn't affect
// game logic. Helps the player see where one chunk of land ends and another
// begins, so the territory they hold feels concrete rather than amorphous.
//
// Algorithm: pick K seeds on land tiles, run multi-source BFS so every land
// tile inherits the region ID of its nearest seed (graph distance). Output
// is a Uint8Array of region IDs (1..K). 0 = water / unassigned.

import { TERRAIN_LAND } from './types.js';

export function generateRegions(
  terrain: Uint8Array,
  width: number,
  height: number,
  seedCount: number,
): Uint8Array {
  const N = width * height;
  const regions = new Uint8Array(N);
  // Collect candidate land indices.
  const land: number[] = [];
  for (let i = 0; i < N; i++) {
    if (terrain[i] === TERRAIN_LAND) land.push(i);
  }
  if (land.length === 0) return regions;

  // Random sample of K seeds without replacement (Fisher-Yates partial shuffle).
  const k = Math.min(seedCount, land.length, 254);
  for (let i = 0; i < k; i++) {
    const j = i + ((Math.random() * (land.length - i)) | 0);
    const tmp = land[i]!;
    land[i] = land[j]!;
    land[j] = tmp;
  }

  // Seed each region.
  const queue: number[] = new Array(N);
  let qHead = 0, qTail = 0;
  for (let s = 0; s < k; s++) {
    const seedIdx = land[s]!;
    regions[seedIdx] = s + 1;
    queue[qTail++] = seedIdx;
  }

  // Multi-source BFS.
  while (qHead < qTail) {
    const i = queue[qHead++]!;
    const r = regions[i]!;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) {
      const ni = i - 1;
      if (regions[ni] === 0 && terrain[ni] === TERRAIN_LAND) {
        regions[ni] = r;
        queue[qTail++] = ni;
      }
    }
    if (x < width - 1) {
      const ni = i + 1;
      if (regions[ni] === 0 && terrain[ni] === TERRAIN_LAND) {
        regions[ni] = r;
        queue[qTail++] = ni;
      }
    }
    if (y > 0) {
      const ni = i - width;
      if (regions[ni] === 0 && terrain[ni] === TERRAIN_LAND) {
        regions[ni] = r;
        queue[qTail++] = ni;
      }
    }
    if (y < height - 1) {
      const ni = i + width;
      if (regions[ni] === 0 && terrain[ni] === TERRAIN_LAND) {
        regions[ni] = r;
        queue[qTail++] = ni;
      }
    }
  }
  return regions;
}

/**
 * Returns an RGBA Uint8ClampedArray suitable for new ImageData(buf, w, h).
 * Border tiles (any 4-neighbor in a different region) are filled with the
 * given color; everywhere else is fully transparent.
 */
export function computeBorderRGBA(
  regions: Uint8Array,
  width: number,
  height: number,
  rgba: readonly [number, number, number, number] = [0, 0, 0, 130],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = regions[i];
      if (!r) continue;
      let isBorder = false;
      if (x > 0) {
        const v = regions[i - 1];
        if (v && v !== r) isBorder = true;
      }
      if (!isBorder && x < width - 1) {
        const v = regions[i + 1];
        if (v && v !== r) isBorder = true;
      }
      if (!isBorder && y > 0) {
        const v = regions[i - width];
        if (v && v !== r) isBorder = true;
      }
      if (!isBorder && y < height - 1) {
        const v = regions[i + width];
        if (v && v !== r) isBorder = true;
      }
      if (isBorder) {
        const o = i * 4;
        out[o]     = rgba[0];
        out[o + 1] = rgba[1];
        out[o + 2] = rgba[2];
        out[o + 3] = rgba[3];
      }
    }
  }
  return out;
}
