import { TILE } from './config';

/**
 * Isometric projection. The simulation stays on a square grid in "world px"
 * (tile * TILE); only rendering and tap-picking go through here.
 * Iso space: tile (tx,ty)'s top corner is at ((tx-ty)*ISO_W/2, (tx+ty)*ISO_H/2).
 */
export const ISO_W = 64; // screen px width of one tile diamond at zoom 1
export const ISO_H = 32;

/** Fractional tile coords → iso px. */
export function isoOfTile(fx: number, fy: number): { x: number; y: number } {
  return { x: (fx - fy) * (ISO_W / 2), y: (fx + fy) * (ISO_H / 2) };
}

/** Simulation world px → iso px. */
export function isoOfWorld(wx: number, wy: number): { x: number; y: number } {
  return isoOfTile(wx / TILE, wy / TILE);
}

/** Iso px → fractional tile coords. */
export function tileOfIso(ix: number, iy: number): { x: number; y: number } {
  const a = ix / (ISO_W / 2);
  const b = iy / (ISO_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Draw order: things further down-screen draw on top. Uses the footprint centre. */
export function depthOf(fx: number, fy: number): number {
  return fx + fy;
}
