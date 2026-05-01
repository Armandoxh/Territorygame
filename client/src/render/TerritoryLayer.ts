import { Sprite, Texture } from 'pixi.js';
import { Territory, TERRAIN_LAND, TERRAIN_WATER, TERRAIN_DEEP } from '@territorygame/shared';
import type { GameConfig, RGBA } from '@territorygame/shared';

// The territory grid is rendered as a single sprite backed by an HTMLCanvasElement.
// Per tick we update only the dirty pixels in the canvas's ImageData and call
// texture.source.update() so Pixi re-uploads the modified region. drawImage in
// the GPU pipeline scales it cleanly to whatever zoom the world container is at.
export class TerritoryLayer {
  readonly sprite: Sprite;
  private readonly territory: Territory;
  private readonly config: GameConfig;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private readonly texture: Texture;

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

    this._fillFromGrid();
    this.ctx.putImageData(this.imageData, 0, 0);

    this.texture = Texture.from(this.canvas);
    // Linear filtering blurs the tile-edge jaggies into a smooth gradient when
    // scaled up. Borders between owners read as soft transitions rather than
    // staircase steps. Region outlines (drawn on a separate sprite) keep the
    // structure visible.
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
    if (owner !== 0) {
      const c = this.config.PLAYER_COLORS[owner];
      if (c) return c;
    }
    const t = this.territory.terrain[i];
    if (t === TERRAIN_WATER) return this.config.WATER_COLOR;
    if (t === TERRAIN_DEEP)  return this.config.WATER_COLOR_DEEP;
    return this.config.PLAYER_COLORS[0]!; // unclaimed land
  }
}
