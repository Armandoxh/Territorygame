// Procedural terrain generation: value-noise FBM thresholded into land/water.
// Returns a Uint8Array of length width*height where:
//   0 = LAND        (passable, claimable)
//   1 = WATER       (impassable, never claimable)
//   2 = DEEP_WATER  (visual variant of water, otherwise identical to WATER)
const TERRAIN_LAND = 0;
const TERRAIN_WATER = 1;
const TERRAIN_DEEP = 2;

const Terrain = {
  generate(width, height, seed) {
    const t = new Uint8Array(width * height);
    const s = seed || ((Math.random() * 0xFFFFFFFF) | 0);
    const scale = CONFIG.TERRAIN_NOISE_SCALE;
    const octaves = CONFIG.TERRAIN_OCTAVES;
    const persistence = CONFIG.TERRAIN_PERSISTENCE;
    const waterT = CONFIG.TERRAIN_WATER_THRESHOLD;
    const deepT  = CONFIG.TERRAIN_DEEP_THRESHOLD;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Slight radial bias: pull edges of the map slightly toward water
        // so the map has natural coastlines instead of slamming into the
        // grid edge on every game.
        const cx = (x - width / 2) / (width / 2);
        const cy = (y - height / 2) / (height / 2);
        const edgeBias = Math.max(0, Math.hypot(cx, cy) - 0.85) * 1.2;

        const v = Terrain._fbm(s, x * scale, y * scale, octaves, persistence) - edgeBias;
        if (v < deepT)  t[y * width + x] = TERRAIN_DEEP;
        else if (v < waterT) t[y * width + x] = TERRAIN_WATER;
        else t[y * width + x] = TERRAIN_LAND;
      }
    }
    return t;
  },

  // Force a circular region to LAND. Used to guarantee spawn blobs fit.
  carveLand(terrain, width, height, cx, cy, radius) {
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
  },

  isPassable(terrain, width, x, y) {
    return terrain[y * width + x] === TERRAIN_LAND;
  },

  // --- Private noise impl ---

  _hash(seed, x, y) {
    let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d);
    h = Math.imul(h ^ (y | 0), 0x165667b1);
    h ^= h >>> 13;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 16;
    return ((h >>> 0) / 0xFFFFFFFF);
  },

  _fade(t) { return t * t * (3 - 2 * t); },

  _lerp(a, b, t) { return a + (b - a) * t; },

  _valueNoise(seed, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = Terrain._hash(seed, xi,     yi);
    const b = Terrain._hash(seed, xi + 1, yi);
    const c = Terrain._hash(seed, xi,     yi + 1);
    const d = Terrain._hash(seed, xi + 1, yi + 1);
    const u = Terrain._fade(xf), v = Terrain._fade(yf);
    return Terrain._lerp(
      Terrain._lerp(a, b, u),
      Terrain._lerp(c, d, u),
      v
    );
  },

  _fbm(seed, x, y, octaves, persistence) {
    let total = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      total += Terrain._valueNoise(seed + i * 1013, x * freq, y * freq) * amp;
      max += amp;
      amp *= persistence;
      freq *= 2;
    }
    return total / max;
  },
};
