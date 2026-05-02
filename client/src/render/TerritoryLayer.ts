import { Sprite, Texture } from 'pixi.js';
import { Territory, TERRAIN_LAND, TERRAIN_WATER, TERRAIN_DEEP } from '@territorygame/shared';
import type { GameConfig, RGBA } from '@territorygame/shared';

// Renders the territory grid into a canvas-backed texture at 2x the native
// grid resolution. Each tile becomes a 2x2 block and each sub-pixel gets its
// own baked shade offset, so what used to be flat squares of color now reads
// as a painted, textured surface even before linear filtering smooths it on
// upscale.
//
//   - Sub-pixel noise table: baked once at boot. Water tiles get a sin/cos
//     wave pattern at 2x resolution; land tiles get hash-based grain.
//
//   - Frontier glow: owned tiles touching an enemy/unclaimed tile paint
//     ~32 luminance brighter than interior tiles. Drives the "active push
//     edge" feel.
//
//   - Dirty flush only repaints the 4 sub-pixels of each changed tile.

const FRONTIER_GLOW = 32;
const FRONTIER_SUB  = -8;
const LAND_NOISE_AMP  = 14;
const WATER_NOISE_AMP = 20;
/** How much of the baked sub-pixel shade applies to owned tiles. Lower
 *  values keep player territories more uniform. */
const OWNED_SHADE_DAMPEN = 0.45;

export class TerritoryLayer {
  readonly sprite: Sprite;
  private readonly territory: Territory;
  private readonly config: GameConfig;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private readonly texture: Texture;
  /** Per-sub-pixel baked shade offset (Int8). Length = (2W * 2H). */
  private readonly subShade: Int8Array;
  /** 2W (cached). */
  private readonly W2: number;

  constructor(territory: Territory, config: GameConfig) {
    this.territory = territory;
    this.config = config;
    const W2 = territory.width * 2;
    const H2 = territory.height * 2;
    this.W2 = W2;

    this.canvas = document.createElement('canvas');
    this.canvas.width = W2;
    this.canvas.height = H2;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.imageData = this.ctx.createImageData(W2, H2);
    this.subShade = this._bakeShadeTable();

    this._fillFromGrid();
    this.ctx.putImageData(this.imageData, 0, 0);

    this.texture = Texture.from(this.canvas);
    // Linear filtering smooths the owner boundaries when zoomed in. At zoom 1
    // the 2x texture is already 2x finer than 1:1, so the result is
    // noticeably crisper than the previous nearest-neighbour version.
    this.texture.source.scaleMode = 'linear';
    this.sprite = new Sprite(this.texture);
    // The sprite is sized in tile-space (W x H), Pixi handles the upscale.
    this.sprite.width = territory.width;
    this.sprite.height = territory.height;
  }

  flushDirty(): void {
    const dirty = this.territory.dirty;
    if (dirty.size === 0) return;
    const data = this.imageData.data;
    const W = this.territory.width;
    const W2 = this.W2;
    for (const i of dirty) {
      const x = i % W;
      const y = (i - x) / W;
      this._writeTileBlock(data, x, y);
    }
    void W2;
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
    dirty.clear();
  }

  private _fillFromGrid(): void {
    const data = this.imageData.data;
    const W = this.territory.width;
    const H = this.territory.height;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        this._writeTileBlock(data, x, y);
      }
    }
  }

  // Writes the 4 sub-pixels of one tile into the imageData buffer, applying
  // the per-sub-pixel shade and the owner / terrain base colour.
  private _writeTileBlock(data: Uint8ClampedArray, x: number, y: number): void {
    const W = this.territory.width;
    const W2 = this.W2;
    const i = y * W + x;
    const base = this._baseColorFor(i);
    const owned = this.territory.owners[i] !== 0;
    const dampen = owned ? OWNED_SHADE_DAMPEN : 1;

    for (let py = 0; py < 2; py++) {
      for (let px = 0; px < 2; px++) {
        const sx = x * 2 + px;
        const sy = y * 2 + py;
        const subIdx = sy * W2 + sx;
        const shade = (this.subShade[subIdx]! * dampen) | 0;
        const o = subIdx * 4;
        data[o]     = clamp(base[0] + shade);
        data[o + 1] = clamp(base[1] + shade);
        data[o + 2] = clamp(base[2] + shade);
        data[o + 3] = 255;
      }
    }
  }

  // Owner color (with frontier glow) or terrain color. Per-tile, not per
  // sub-pixel — sub-pixel shade is added later in _writeTileBlock.
  private _baseColorFor(i: number): RGBA {
    const owner = this.territory.owners[i]!;
    if (owner !== 0) {
      const c = this.config.PLAYER_COLORS[owner];
      if (c) {
        const isFrontier = this.territory.getFrontier(owner).has(i);
        const adj = isFrontier ? FRONTIER_GLOW : FRONTIER_SUB;
        return [
          clamp(c[0] + adj),
          clamp(c[1] + adj),
          clamp(c[2] + adj),
          255,
        ];
      }
    }
    const t = this.territory.terrain[i];
    if (t === TERRAIN_WATER)     return this.config.WATER_COLOR;
    if (t === TERRAIN_DEEP)      return this.config.WATER_COLOR_DEEP;
    return this.config.PLAYER_COLORS[0]!;
  }

  // Per-sub-pixel shade table, baked once at boot. Dimensions are 2W x 2H.
  private _bakeShadeTable(): Int8Array {
    const W = this.territory.width;
    const H = this.territory.height;
    const W2 = W * 2;
    const H2 = H * 2;
    const out = new Int8Array(W2 * H2);
    const terrain = this.territory.terrain;
    for (let sy = 0; sy < H2; sy++) {
      for (let sx = 0; sx < W2; sx++) {
        const tx = sx >> 1;
        const ty = sy >> 1;
        const tt = terrain[ty * W + tx];
        if (tt === TERRAIN_WATER || tt === TERRAIN_DEEP) {
          // Wave pattern; sample at sub-pixel coords for finer ripples.
          const fx = sx * 0.5, fy = sy * 0.5;
          const v =
            Math.sin(fx * 0.55 + fy * 0.41) * 0.55 +
            Math.cos(fx * 0.81 - fy * 0.27) * 0.45;
          out[sy * W2 + sx] = Math.round(v * WATER_NOISE_AMP);
        } else {
          const h = ((sx * 1597) ^ (sy * 2503)) >>> 0;
          const n01 = ((h * 9301 + 49297) % 233280) / 233280;
          out[sy * W2 + sx] = Math.round((n01 - 0.5) * 2 * LAND_NOISE_AMP);
        }
      }
    }
    void TERRAIN_LAND;
    return out;
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : (v > 255 ? 255 : v);
}
