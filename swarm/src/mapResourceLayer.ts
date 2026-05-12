// Grand-map resource overlay. Top-down "satellite" view: every tile
// that has a resource gets a flat colored fill of that resource's
// color. Patches grow as BFS blobs in world gen, so the rendered
// shape is a natural organic mass — a green forest, a gray mountain
// range, a yellow field — not a grid of repeated icons.
//
// Slight per-tile shade variation keeps the fill from looking dead-
// flat: each tile's color is perturbed by a deterministic hash on
// its grid coords. Same seed → same look.
//
// Sits UNDER the ownership-tint layer (see main.ts layer order) so
// the player's territory color blends with the terrain color
// rather than hiding it.
//
// One Graphics per resource id (batched rects) so the entire world's
// worth of fills is a handful of draw calls.

import { Container, Graphics } from 'pixi.js';
import type { World } from './world';
import { getResourceDef } from './resources';

export interface MapResourceLayer {
  container: Container;
  destroy(): void;
}

// ±SHADE_RANGE applied to the v channel of the resource color per
// tile. Subtle texture without crossing into "noisy speckle" — the
// patch should still read as one solid color from any zoom level.
const SHADE_RANGE = 0.04;

export function createMapResourceLayer(world: World, tileSize: number): MapResourceLayer {
  const container = new Container();

  // One Graphics per resource id. Pushed into a stable z-order
  // (lower id = drawn first = visually below). The order doesn't
  // matter much for this layer since patches are non-overlapping
  // by construction (the BFS scatter never paints over a tile that
  // already has a resource).
  const graphicsByResource = new Map<number, Graphics>();

  for (let i = 0; i < world.resourceOf.length; i++) {
    const rid = world.resourceOf[i]!;
    if (rid < 0) continue;
    let g = graphicsByResource.get(rid);
    if (!g) {
      g = new Graphics();
      graphicsByResource.set(rid, g);
    }
    const def = getResourceDef(rid);
    const tx = i % world.width;
    const ty = (i / world.width) | 0;
    const x = tx * tileSize;
    const y = ty * tileSize;
    const shade = tileShade(tx, ty);  // -1..+1
    const color = jitterBrightness(def.color, shade * SHADE_RANGE);
    // alpha < 1 lets the ownership tint underneath bleed through
    // just enough that a player can still tell which territory is
    // theirs even on resource tiles. Tweak in concert with main.ts
    // layer order (resource sits ABOVE tint).
    g.rect(x, y, tileSize, tileSize).fill({ color, alpha: 0.92 });
  }

  for (const g of graphicsByResource.values()) {
    container.addChild(g);
  }

  return {
    container,
    destroy: () => container.destroy({ children: true }),
  };
}

// Deterministic hash-driven shade per tile. Output in [-1, +1].
// Mulberry-style 32-bit mix on the packed (tx, ty) pair so adjacent
// tiles get visually-uncorrelated shade values (no obvious streaks).
function tileShade(tx: number, ty: number): number {
  let s = ((tx * 73856093) ^ (ty * 19349663)) | 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return u * 2 - 1;
}

// Multiplicatively brightens/darkens an RGB color. delta in
// [-1, +1] -> the color's brightness shifts by up to that fraction.
// Cheaper than full HSV: just scale RGB channels and clamp.
function jitterBrightness(color: number, delta: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const factor = 1 + delta;
  const r2 = Math.max(0, Math.min(255, Math.round(r * factor)));
  const g2 = Math.max(0, Math.min(255, Math.round(g * factor)));
  const b2 = Math.max(0, Math.min(255, Math.round(b * factor)));
  return (r2 << 16) | (g2 << 8) | b2;
}
