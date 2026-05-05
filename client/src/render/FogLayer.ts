import { Sprite, Texture } from 'pixi.js';
import type { Game } from '@territorygame/shared';
import type { Renderer } from './Renderer.js';

// Fog of war overlay. Lives inside the world container so it pans/zooms
// with the territory. A canvas-backed sprite at grid resolution paints
// per-tile alpha based on the per-region visibility level for the human:
//   level 2 (full): clear
//   level 1 (partial): half-dark
//   level 0 (hidden): full-dark
// Repainted only when the visibility set actually changes (signature
// over the visibility byte array). Cheap because regions change owner
// rarely compared to per-frame work.
//
// Water tiles never get fog — the ocean is always known terrain — only
// land tiles tint. This keeps coastlines readable.

const ALPHA_HIDDEN  = 0.78;
const ALPHA_PARTIAL = 0.40;
const TINT_R = 4, TINT_G = 6, TINT_B = 12;

export class FogLayer {
  readonly sprite: Sprite;
  private readonly game: Game;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private readonly texture: Texture;
  private _lastSig = '';

  constructor(game: Game, _renderer: Renderer) {
    this.game = game;
    const W = game.territory.width;
    const H = game.territory.height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.imageData = this.ctx.createImageData(W, H);
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
    this.sprite.eventMode = 'none';
  }

  /** Recompute fog if needed and bump the texture. Called once per frame. */
  update(): void {
    const vis = this.game.visibilityForPlayer(1);
    // Cheap signature: byte sequence joined as a key. Recompute fog
    // only when this changes — usually rare, gated by region ownership
    // changes, not per-frame.
    let sig = '';
    for (let r = 1; r <= this.game.regionCount; r++) sig += vis[r];
    if (sig === this._lastSig) return;
    this._lastSig = sig;
    this._repaint(vis);
  }

  private _repaint(vis: Uint8Array): void {
    const W = this.game.territory.width;
    const H = this.game.territory.height;
    const data = this.imageData.data;
    const regions = this.game.regions;
    const terrain = this.game.territory.terrain;
    for (let i = 0; i < W * H; i++) {
      const di = i * 4;
      // Water never gets fog — ocean is always known.
      if (terrain[i] !== 0) {
        data[di] = 0; data[di + 1] = 0; data[di + 2] = 0; data[di + 3] = 0;
        continue;
      }
      const r = regions[i]!;
      const v = r > 0 ? vis[r]! : 0;
      let a = 0;
      if (v === 0) a = ALPHA_HIDDEN;
      else if (v === 1) a = ALPHA_PARTIAL;
      else a = 0;
      data[di]     = TINT_R;
      data[di + 1] = TINT_G;
      data[di + 2] = TINT_B;
      data[di + 3] = (a * 255) | 0;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
  }
}
