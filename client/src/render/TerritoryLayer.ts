import { Sprite, Texture } from 'pixi.js';
import { Territory, TERRAIN_LAND, TERRAIN_WATER, TERRAIN_DEEP } from '@territorygame/shared';
import type { GameConfig, RGBA } from '@territorygame/shared';

// Renders the territory grid. The strategy is:
//
//   - At boot, pre-bake a per-tile shade offset table so each unowned tile has
//     subtle natural variation (water ripples, paper grain on land). One-time
//     cost; we never recompute the noise.
//
//   - Per dirty-tile flush we look up the tile's owner. Unowned tiles use the
//     pre-baked terrain colors. Owned tiles use the player's color, brightened
//     when the tile is on the player's frontier so a push edge visibly glows.
//
//   - The whole thing is one canvas-backed texture; Pixi linear-filters it on
//     scale-up so the in-tile detail blends instead of looking pixelated.
const FRONTIER_GLOW   = 32;   // brightness bump (0-255) for owned frontier tiles
const FRONTIER_SUB    = -8;   // gentle darken for owned interior tiles
const LAND_NOISE_AMP  = 12;   // ± amplitude for land-tile shading
const WATER_NOISE_AMP = 18;   // ± amplitude for water-tile shading

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
    this.texture.source.scaleMode = 'linear';
    this.sprite = new Sprite(this.texture);
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
    const shade = this.shade[i]!;
    if (owner !== 0) {
      const c = this.config.PLAYER_COLORS[owner];
      if (c) {
        // Frontier tiles glow; interior tiles sit a touch darker for depth.
        const isFrontier = this.territory.getFrontier(owner).has(i);
        const adj = (isFrontier ? FRONTIER_GLOW : FRONTIER_SUB) + (shade >> 1);
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
      clamp(base[0] + shade),
      clamp(base[1] + shade),
      clamp(base[2] + shade),
      255,
    ];
  }

  // Pre-bake a shade-offset Int8 per tile. Land gets gentle paper-grain noise;
  // water gets a higher-amplitude wave pattern (sin/cos blend) so it reads as
  // a moving body rather than a flat fill.
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
          // Hash-based pseudo-noise gives crunchy paper grain rather than
          // smooth waves. Two integer multiplies + xor keeps it cheap.
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
