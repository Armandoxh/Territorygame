import { Container, Graphics } from 'pixi.js';
import type { Game } from '@territorygame/shared';
import type { Renderer } from './Renderer.js';

// Things drawn on top of the world in screen space (or world space with a
// known scale strategy): capitals, buildings, target marker, tap flash.
// All rgb tuples come from the shared palette so player colors stay consistent.
export class OverlayLayer {
  readonly container: Container;
  private readonly capitals: Graphics;
  private readonly buildings: Graphics;
  private readonly target: Graphics;
  private readonly tapFlash: Graphics;
  private readonly game: Game;
  private readonly renderer: Renderer;

  // Tap flash: a fading expanding ring at the most-recent tap (screen coords).
  private flashSx = 0;
  private flashSy = 0;
  private flashStart = -1;
  private static FLASH_MS = 600;

  constructor(game: Game, renderer: Renderer) {
    this.game = game;
    this.renderer = renderer;
    this.container = new Container();
    this.capitals = new Graphics();
    this.buildings = new Graphics();
    this.target = new Graphics();
    this.tapFlash = new Graphics();
    this.container.addChild(this.capitals, this.buildings, this.target, this.tapFlash);
  }

  flashTap(sx: number, sy: number): void {
    this.flashSx = sx;
    this.flashSy = sy;
    this.flashStart = performance.now();
  }

  update(now: number): void {
    this._drawCapitals(now);
    this._drawBuildings(now);
    this._drawTarget(now);
    this._drawTapFlash(now);
  }

  private _toScreen(wx: number, wy: number): { x: number; y: number } {
    return this.renderer.worldToScreen(wx, wy);
  }

  private _drawCapitals(now: number): void {
    const g = this.capitals;
    g.clear();
    const t = (now / 900) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const palette = this.game.config.PLAYER_COLORS;
    for (const cap of this.game.capitals) {
      const s = this._toScreen(cap.x + 0.5, cap.y + 0.5);
      const c = palette[cap.owner];
      if (!c) continue;
      const r = Math.max(7, Math.min(22, this.renderer.zoom * 1.6));
      const color = (c[0] << 16) | (c[1] << 8) | c[2];
      g.circle(s.x, s.y, r * 1.55).stroke({ color: 0xffffff, alpha: 0.35 + 0.4 * pulse, width: 1.5 });
      // Diamond
      g.poly([s.x, s.y - r, s.x + r, s.y, s.x, s.y + r, s.x - r, s.y]);
      g.fill({ color });
      g.stroke({ color: 0xffffff, alpha: 0.95, width: 1.4 });
    }
  }

  private _drawBuildings(_now: number): void {
    const g = this.buildings;
    g.clear();
    const palette = this.game.config.PLAYER_COLORS;
    const wonderTime = this.game.config.WONDER_BUILD_TIME_TICKS;
    for (const b of this.game.buildings) {
      const s = this._toScreen(b.x + 0.5, b.y + 0.5);
      const c = palette[b.owner];
      if (!c) continue;
      const color = (c[0] << 16) | (c[1] << 8) | c[2];
      const r = Math.max(6, Math.min(18, this.renderer.zoom * 1.1));
      const cx = s.x, cy = s.y;
      const fillStroke = (): void => {
        g.fill({ color });
        g.stroke({ color: 0xffffff, alpha: 0.95, width: 1.2 });
      };

      if (b.type === 'settlement') {
        g.poly([cx - r, cy + r, cx - r, cy - r * 0.25, cx, cy - r, cx + r, cy - r * 0.25, cx + r, cy + r]);
        fillStroke();
      } else if (b.type === 'turret') {
        g.poly([cx, cy - r, cx + r, cy + r * 0.7, cx - r, cy + r * 0.7]);
        fillStroke();
      } else if (b.type === 'airstrip') {
        const t = r * 0.4;
        g.poly([
          cx - r, cy - t, cx - t, cy - t, cx - t, cy - r,
          cx + t, cy - r, cx + t, cy - t, cx + r, cy - t,
          cx + r, cy + t, cx + t, cy + t, cx + t, cy + r,
          cx - t, cy + r, cx - t, cy + t, cx - r, cy + t,
        ]);
        fillStroke();
      } else if (b.type === 'wonder') {
        const wr = r * 1.4;
        g.poly([cx, cy - wr, cx + wr, cy, cx, cy + wr, cx - wr, cy]);
        fillStroke();
        const prog = (b.progress ?? 0) / wonderTime;
        const ringR = wr * 1.65;
        g.circle(cx, cy, ringR).stroke({ color: 0xffffff, alpha: 0.25, width: 1.6 });
        g.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        g.stroke({ color: 0xffffff, alpha: 0.95, width: 2 });
      }
    }
  }

  private _drawTarget(now: number): void {
    const g = this.target;
    g.clear();
    const me = this.game.human();
    if (!me.target || !me.expanding) return;
    const s = this._toScreen(me.target.x + 0.5, me.target.y + 0.5);
    const t = (now / 700) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const baseR = Math.max(10, this.renderer.zoom * 2.5);
    const r = baseR + pulse * 6;
    g.circle(s.x, s.y, r).stroke({ color: 0xffffff, alpha: 0.5 + 0.4 * pulse, width: 2 });
    // Crosshair gap arms
    const gap = r * 0.35;
    g.moveTo(s.x - r,    s.y).lineTo(s.x - gap, s.y);
    g.moveTo(s.x + gap,  s.y).lineTo(s.x + r,   s.y);
    g.moveTo(s.x, s.y - r).lineTo(s.x, s.y - gap);
    g.moveTo(s.x, s.y + gap).lineTo(s.x, s.y + r);
    g.stroke({ color: 0xffffff, alpha: 0.5 + 0.4 * pulse, width: 2 });
  }

  private _drawTapFlash(now: number): void {
    const g = this.tapFlash;
    g.clear();
    if (this.flashStart < 0) return;
    const elapsed = now - this.flashStart;
    if (elapsed > OverlayLayer.FLASH_MS) return;
    const t = elapsed / OverlayLayer.FLASH_MS;
    const r = 14 + 32 * t;
    g.circle(this.flashSx, this.flashSy, r).stroke({
      color: 0xffffff,
      alpha: 0.85 * (1 - t),
      width: 2.5,
    });
  }
}
