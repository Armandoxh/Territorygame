import { Container, Graphics } from 'pixi.js';
import type { Game } from '@territorygame/shared';

// Phase 2 visualization for internal trade routes. Draws a gold line
// between the centroids of every active route plus an animated dot that
// travels along it to suggest cargo flow.
//
// World-space: lives inside renderer.world so it pans/zooms with the
// camera. Lines are rebuilt only when the route set changes (signature
// gate); per-frame work is just redrawing the dots, which is cheap.

const LINE_COLOR_OWN   = 0xeac768; // warm gold for the human's routes
const LINE_COLOR_OTHER = 0xc0a060; // muted for everyone else's
const DOT_COLOR        = 0xffd66b;

export class TradeLayer {
  readonly container: Container;
  private readonly game: Game;
  private readonly lines: Graphics;
  private readonly dots: Graphics;
  private _lastSig = '';

  constructor(game: Game) {
    this.game = game;
    this.container = new Container();
    this.container.eventMode = 'none';
    this.lines = new Graphics();
    this.dots = new Graphics();
    this.container.addChild(this.lines);
    this.container.addChild(this.dots);
  }

  update(now: number): void {
    // Rebuild lines if the route set changed. The dots redraw every
    // frame because they animate along the line.
    let sig = '';
    for (const r of this.game.tradeRoutes) sig += `${r.ownerId}.${r.regionA}-${r.regionB},`;
    if (sig !== this._lastSig) {
      this._lastSig = sig;
      this._rebuildLines();
    }
    this._updateDots(now);
  }

  private _rebuildLines(): void {
    const g = this.lines;
    g.clear();
    const humanId = 1;
    for (const r of this.game.tradeRoutes) {
      const isHuman = r.ownerId === humanId;
      const color = isHuman ? LINE_COLOR_OWN : LINE_COLOR_OTHER;
      const alpha = isHuman ? 0.65 : 0.30;
      g.moveTo(r.ax, r.ay).lineTo(r.bx, r.by);
      g.stroke({ color, width: isHuman ? 0.5 : 0.35, alpha });
    }
  }

  private _updateDots(now: number): void {
    const g = this.dots;
    g.clear();
    // Each route has its own phase offset so dots are spread across
    // their lines rather than all at the same fraction.
    const phase = (now * 0.0003);
    for (const r of this.game.tradeRoutes) {
      const t = (phase + (r.regionA * 0.137 + r.regionB * 0.071)) % 1.0;
      const dx = r.ax + (r.bx - r.ax) * t;
      const dy = r.ay + (r.by - r.ay) * t;
      const isHuman = r.ownerId === 1;
      const alpha = isHuman ? 0.95 : 0.45;
      g.circle(dx, dy, isHuman ? 1.0 : 0.7)
       .fill({ color: DOT_COLOR, alpha });
    }
  }
}
