import { Container, Graphics } from 'pixi.js';
import type { Game } from '@territorygame/shared';

// Phase 2 visualization for internal trade routes. Draws a gold line
// between the centroids of every active route plus an animated dot that
// travels along it to suggest cargo flow.
//
// World-space: lives inside renderer.world so it pans/zooms with the
// camera. Lines are rebuilt only when the route set changes (signature
// gate); per-frame work is just redrawing the dots, which is cheap.

const LINE_COLOR_OWN     = 0xeac768; // warm gold for the human's routes
const LINE_COLOR_OTHER   = 0xc0a060; // muted for everyone else's
const DOT_COLOR          = 0xffd66b;
// External (cross-player) trade routes — distinct cyan-gold so they
// read as "diplomatic deal" rather than "internal supply line".
const EXTERNAL_LINE_COLOR = 0x9bd9ea;
const EXTERNAL_DOT_COLOR  = 0xc8eef5;

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
    sig += '|';
    for (const r of this.game.externalTradeRoutes) sig += `${r.a}.${r.b},`;
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
    // External routes — dashed line, distinct from internal solid lines
    // so the player can tell at a glance "this is a deal between two
    // empires" vs "this is one empire's internal trade".
    for (const r of this.game.externalTradeRoutes) {
      const involvesHuman = r.a === humanId || r.b === humanId;
      const alpha = involvesHuman ? 0.85 : 0.45;
      const width = involvesHuman ? 0.7 : 0.5;
      this._drawDashed(g, r.ax, r.ay, r.bx, r.by, EXTERNAL_LINE_COLOR, alpha, width);
    }
  }

  /** Draw a dashed line by chopping the segment into segments. Dash and
   *  gap measured in world (tile) space so the pattern stays consistent
   *  as the player zooms. */
  private _drawDashed(
    g: Graphics, x0: number, y0: number, x1: number, y1: number,
    color: number, alpha: number, width: number,
  ): void {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;
    const nx = dx / len, ny = dy / len;
    const dash = 4, gap = 3;
    const stride = dash + gap;
    let t = 0;
    while (t < len) {
      const t0 = t;
      const t1 = Math.min(len, t + dash);
      g.moveTo(x0 + nx * t0, y0 + ny * t0)
       .lineTo(x0 + nx * t1, y0 + ny * t1)
       .stroke({ color, width, alpha });
      t += stride;
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
    // External routes get TWO dots running in opposite directions so
    // the mutual-flow nature is visible — gold flows both ways.
    for (const r of this.game.externalTradeRoutes) {
      const involvesHuman = r.a === 1 || r.b === 1;
      const alpha = involvesHuman ? 1.0 : 0.55;
      const radius = involvesHuman ? 1.2 : 0.8;
      const t1 = (phase + (r.a * 0.137 + r.b * 0.071)) % 1.0;
      const t2 = 1 - ((phase + (r.a * 0.071 + r.b * 0.137)) % 1.0);
      for (const tt of [t1, t2]) {
        const dx = r.ax + (r.bx - r.ax) * tt;
        const dy = r.ay + (r.by - r.ay) * tt;
        g.circle(dx, dy, radius).fill({ color: EXTERNAL_DOT_COLOR, alpha });
      }
    }
  }
}
