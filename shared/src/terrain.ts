import type { GameConfig } from './config.js';
import { TERRAIN_LAND, TERRAIN_WATER, TERRAIN_DEEP } from './types.js';

// Procedural terrain generation: value-noise FBM thresholded into land/water.
// Returns a Uint8Array of length width*height.
export function generateTerrain(width: number, height: number, config: GameConfig, seed?: number): Uint8Array {
  const t = new Uint8Array(width * height);
  const s = (seed ?? config.TERRAIN_SEED) || ((Math.random() * 0xFFFFFFFF) | 0);
  const scale = config.TERRAIN_NOISE_SCALE;
  const octaves = config.TERRAIN_OCTAVES;
  const persistence = config.TERRAIN_PERSISTENCE;
  const waterT = config.TERRAIN_WATER_THRESHOLD;
  const deepT  = config.TERRAIN_DEEP_THRESHOLD;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Slight radial bias: the further from center, the more likely water.
      const cx = (x - width / 2) / (width / 2);
      const cy = (y - height / 2) / (height / 2);
      const edgeBias = Math.max(0, Math.hypot(cx, cy) - 0.85) * 1.2;
      const v = fbm(s, x * scale, y * scale, octaves, persistence) - edgeBias;
      if (v < deepT)  t[y * width + x] = TERRAIN_DEEP;
      else if (v < waterT) t[y * width + x] = TERRAIN_WATER;
      else t[y * width + x] = TERRAIN_LAND;
    }
  }
  return t;
}

// Force a circular region to LAND. Used to guarantee spawn blobs fit.
export function carveLand(terrain: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      if (x < 0 || x >= width) continue;
      terrain[y * width + x] = TERRAIN_LAND;
    }
  }
}

// --- Private noise impl ---

function hash(seed: number, x: number, y: number): number {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  h ^= h >>> 13;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 16;
  return ((h >>> 0) / 0xFFFFFFFF);
}

function fade(t: number): number { return t * t * (3 - 2 * t); }

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash(seed, xi,     yi);
  const b = hash(seed, xi + 1, yi);
  const c = hash(seed, xi,     yi + 1);
  const d = hash(seed, xi + 1, yi + 1);
  const u = fade(xf), v = fade(yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(seed: number, x: number, y: number, octaves: number, persistence: number): number {
  let total = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise(seed + i * 1013, x * freq, y * freq) * amp;
    max += amp;
    amp *= persistence;
    freq *= 2;
  }
  return total / max;
}
