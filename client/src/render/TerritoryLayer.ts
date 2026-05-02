import { Sprite, Texture } from 'pixi.js';
import { Territory, TERRAIN_LAND, TERRAIN_WATER, TERRAIN_DEEP } from '@territorygame/shared';
import type { GameConfig, RGBA } from '@territorygame/shared';

// Renders the territory grid into a canvas-backed texture at the grid's
// native resolution (one pixel per tile). The texture uses nearest-neighbour
// sampling so tile boundaries stay crisp when scaled up — no blur.
//
//   - Per-tile baked shade table: every tile picks up small natural variation
//     (water-wave shading, paper-grain on land). One-time bake at boot.
//
//   - Frontier glow: tiles on the owner's frontier paint ~32 luminance
//     brighter than interior tiles, so the active border of every empire
//     reads like an outlined push edge.
//
//   - Dirty flush only repaints changed tiles.

const FRONTIER_GLOW   = 28;
const FRONTIER_SUB    = -10;
const LAND_NOISE_AMP  = 12;
const WATER_NOISE_AMP = 18;
const OWNED_SHADE_DAMPEN = 0.5;

export class TerritoryLayer {
  readonly sprite: Sprite;
  private readonly territory: Territory;
  private readonly config: GameConfig;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private readonly texture: Texture;
  /** Per-tile baked shade offset for unowned terrain (Int8 in roughly ±20). */
  private readonly shade: Int8Array;

  constructor(territory: Territory, config: GameConfig) {
    this.territory = territory;
    this.config = config;

    this.canvas = document.createElement('canvas');
    this.canvas.width = territory.width;
    this.canvas.height = territory.height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.imageData = this.ctx.createImageData(territory.width, territory.height);
    this.shade = this._bakeShadeTable();

    this._fillFromGrid();
    this.ctx.putImageData(this.imageData, 0, 0);

    this.texture = Texture.from(this.canvas);
    // Crisp pixels — no blur on upscale. The nearest filter keeps every tile
    // boundary as a hard edge no matter how far you zoom in. The map looks
    // pixelated by design, never smudged.
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
    // Snap to integer screen pixels so adjacent tiles never get a half-pixel
    // gap or smear from sub-pixel positioning.
    this.sprite.roundPixels = true;
  }

  flushDirty(): void {
    const dirty = this.territory.dirty;
    if (dirty.size === 0) return;
    const data = this.imageData.data;
    for (const i of dirty) {
      const c = this._colorFor(i);
      const di = i * 4;
      data[di]     = c[0];
      data[di + 1] = c[1];
      data[di + 2] = c[2];
      data[di + 3] = c[3];
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
    dirty.clear();
  }

  private _fillFromGrid(): void {
    const data = this.imageData.data;
    const N = this.territory.owners.length;
    for (let i = 0; i < N; i++) {
      const c = this._colorFor(i);
      const di = i * 4;
      data[di]     = c[0];
      data[di + 1] = c[1];
      data[di + 2] = c[2];
      data[di + 3] = c[3];
    }
  }

  private _colorFor(i: number): RGBA {
    const owner = this.territory.owners[i]!;
    const rawShade = this.shade[i]!;
    if (owner !== 0) {
      const c = this.config.PLAYER_COLORS[owner];
      if (c) {
        const isFrontier = this.territory.getFrontier(owner).has(i);
        const shade = (rawShade * OWNED_SHADE_DAMPEN) | 0;
        const adj = (isFrontier ? FRONTIER_GLOW : FRONTIER_SUB) + shade;
        return [
          clamp(c[0] + adj),
          clamp(c[1] + adj),
          clamp(c[2] + adj),
          255,
        ];
      }
    }
    const t = this.territory.terrain[i];
    let base: RGBA;
    if (t === TERRAIN_WATER)      base = this.config.WATER_COLOR;
    else if (t === TERRAIN_DEEP)  base = this.config.WATER_COLOR_DEEP;
    else                          base = this.config.PLAYER_COLORS[0]!;
    return [
      clamp(base[0] + rawShade),
      clamp(base[1] + rawShade),
      clamp(base[2] + rawShade),
      255,
    ];
  }

  private _bakeShadeTable(): Int8Array {
    const W = this.territory.width;
    const H = this.territory.height;
    const N = W * H;
    const out = new Int8Array(N);
    const terrain = this.territory.terrain;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const tt = terrain[i];
        if (tt === TERRAIN_WATER || tt === TERRAIN_DEEP) {
          const v =
            Math.sin(x * 0.25 + y * 0.32) * 0.6 +
            Math.cos(x * 0.41 - y * 0.18) * 0.4;
          out[i] = Math.round(v * WATER_NOISE_AMP);
        } else {
          const h = ((x * 1597) ^ (y * 2503)) >>> 0;
          const n01 = ((h * 9301 + 49297) % 233280) / 233280;
          out[i] = Math.round((n01 - 0.5) * 2 * LAND_NOISE_AMP);
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
