import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Game, PlayerId } from '@territorygame/shared';
import type { Renderer } from './Renderer.js';

// Things drawn on top of the world in screen space (or world space with a
// known scale strategy): capitals, buildings, target marker, tap flash.
// All rgb tuples come from the shared palette so player colors stay consistent.
export class OverlayLayer {
  /** Screen-space overlays (capitals, buildings, labels, tap flash). */
  readonly container: Container;
  /** World-space overlays (target-region highlight). Attached inside renderer.world by the Renderer. */
  readonly worldContainer: Container;
  private readonly capitals: Graphics;
  private readonly buildings: Graphics;
  private readonly target: Graphics; // unused screen-space target (kept for legacy)
  private readonly tapFlash: Graphics;
  private readonly labelLayer: Container;
  private readonly labels = new Map<PlayerId, Text>();
  private readonly game: Game;
  private readonly renderer: Renderer;
  // Target-region highlight: a canvas-backed sprite at the grid's native
  // resolution. White tiles for the target region, transparent elsewhere.
  // Lives inside renderer.world so it pans/zooms with the camera.
  private readonly targetSprite: Sprite;
  private readonly targetCanvas: HTMLCanvasElement;
  private readonly targetCtx: CanvasRenderingContext2D | null;
  private readonly targetTexture: Texture;
  private targetDrawnRegion: number = -1;

  // Tap flash: a fading expanding ring at the most-recent tap (screen coords).
  private flashSx = 0;
  private flashSy = 0;
  private flashStart = -1;
  private static FLASH_MS = 600;

  // Bomb explosions: world-space circles that expand and fade. A short queue
  // so multiple explosions can play simultaneously.
  private explosions: Array<{ wx: number; wy: number; worldR: number; start: number }> = [];
  private static EXPLOSION_MS = 900;

  constructor(game: Game, renderer: Renderer) {
    this.game = game;
    this.renderer = renderer;
    this.container = new Container();
    this.worldContainer = new Container();
    this.capitals = new Graphics();
    this.buildings = new Graphics();
    this.target = new Graphics();
    this.tapFlash = new Graphics();
    this.labelLayer = new Container();
    this.container.addChild(this.capitals, this.buildings, this.target, this.tapFlash, this.labelLayer);

    // Target-region highlight: native-resolution canvas, sprite scales with world.
    const W = game.territory.width;
    const H = game.territory.height;
    this.targetCanvas = document.createElement('canvas');
    this.targetCanvas.width = W;
    this.targetCanvas.height = H;
    this.targetCtx = this.targetCanvas.getContext('2d');
    this.targetTexture = Texture.from(this.targetCanvas);
    // Match the territory layer: crisp pixel rendering, no blur on upscale.
    this.targetTexture.source.scaleMode = 'nearest';
    this.targetSprite = new Sprite(this.targetTexture);
    this.targetSprite.roundPixels = true;
    this.targetSprite.alpha = 0;
    this.worldContainer.addChild(this.targetSprite);
  }

  flashTap(sx: number, sy: number): void {
    this.flashSx = sx;
    this.flashSy = sy;
    this.flashStart = performance.now();
  }

  pushExplosion(wx: number, wy: number, worldR: number): void {
    this.explosions.push({ wx, wy, worldR, start: performance.now() });
    if (this.explosions.length > 16) this.explosions.shift();
  }

  update(now: number): void {
    this._drawCapitals(now);
    this._drawBuildings(now);
    this._drawTroopLabels();
    this._drawTarget(now);
    this._drawExplosions(now);
  }

  private _drawTroopLabels(): void {
    // Show labels only for the top-N players by tile count + always the human.
    // Without this, a 254-AI game becomes a wall of floating numbers.
    const MAX_LABELS = 12;
    const MIN_TILES = 8;
    const counts = this.game.territory.counts;
    const palette = this.game.config.PLAYER_COLORS;

    // Rank alive players by owned tile count, descending.
    const ranked: { id: PlayerId; owned: number }[] = [];
    for (let id = 1; id < this.game.players.length; id++) {
      const p = this.game.players[id];
      if (!p || !p.alive) continue;
      const owned = counts[id]!;
      if (owned < MIN_TILES) continue;
      ranked.push({ id, owned });
    }
    ranked.sort((a, b) => b.owned - a.owned);

    // Always show the human if they're alive (even if not top-N).
    const visible = new Set<PlayerId>();
    const human = this.game.human();
    if (human.alive && counts[human.id]! >= MIN_TILES) visible.add(human.id);
    for (let i = 0; i < ranked.length && visible.size < MAX_LABELS; i++) {
      visible.add(ranked[i]!.id);
    }

    for (const id of visible) {
      const p = this.game.players[id];
      if (!p) continue;
      const c = this.game.territory.centroid(id);
      const s = this.renderer.worldToScreen(c.x, c.y);
      let label = this.labels.get(id);
      if (!label) {
        const palc = palette[id];
        const tint = palc ? (palc[0] << 16) | (palc[1] << 8) | palc[2] : 0xffffff;
        label = new Text({
          text: '',
          style: {
            fill: 0xffffff,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
            fontWeight: '800',
            fontSize: 14,
            stroke: { color: 0x000000, width: 4, alpha: 0.85 },
          },
        });
        label.tint = tint;
        label.anchor.set(0.5, 0.5);
        this.labels.set(id, label);
        this.labelLayer.addChild(label);
      }
      label.text = formatTroops(p.troops);
      label.position.set(s.x, s.y);
    }
    // Drop labels for players that fell out of the visible set.
    for (const [id, label] of this.labels) {
      if (!visible.has(id)) {
        this.labelLayer.removeChild(label);
        label.destroy();
        this.labels.delete(id);
      }
    }
  }

  private _drawExplosions(now: number): void {
    // Single Graphics handles both bomb explosions and the tap flash.
    const g = this.tapFlash;
    g.clear();
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i]!;
      const elapsed = now - e.start;
      if (elapsed > OverlayLayer.EXPLOSION_MS) {
        this.explosions.splice(i, 1);
        continue;
      }
      const t = elapsed / OverlayLayer.EXPLOSION_MS;
      const s = this._toScreen(e.wx + 0.5, e.wy + 0.5);
      const targetR = e.worldR * this.renderer.zoom;
      const r = targetR * (0.4 + 0.7 * t);
      const alpha = 1 - t;
      g.circle(s.x, s.y, r).stroke({ color: 0xe84a4a, alpha: alpha * 0.85, width: 3 });
      g.circle(s.x, s.y, r * 0.7).fill({ color: 0xe8c04a, alpha: alpha * 0.18 });
    }
    // Tap flash overlay
    if (this.flashStart >= 0) {
      const fe = now - this.flashStart;
      if (fe <= OverlayLayer.FLASH_MS) {
        const tt = fe / OverlayLayer.FLASH_MS;
        const r = 14 + 32 * tt;
        g.circle(this.flashSx, this.flashSy, r).stroke({
          color: 0xffffff,
          alpha: 0.85 * (1 - tt),
          width: 2.5,
        });
      }
    }
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
      // Offset shadow blob behind, so capitals "lift" off the map.
      g.circle(s.x + 1.5, s.y + 2, r * 1.05).fill({ color: 0x000000, alpha: 0.35 });
      // Outer pulse ring
      g.circle(s.x, s.y, r * 1.55).stroke({ color: 0xffffff, alpha: 0.35 + 0.4 * pulse, width: 1.5 });
      // Diamond body
      g.poly([s.x, s.y - r, s.x + r, s.y, s.x, s.y + r, s.x - r, s.y]);
      g.fill({ color });
      g.stroke({ color: 0xffffff, alpha: 0.95, width: 1.4 });
    }
  }

  private _drawBuildings(_now: number): void {
    const g = this.buildings;
    g.clear();
    const palette = this.game.config.PLAYER_COLORS;
    const settleR = this.game.config.SETTLEMENT_RADIUS;
    const turretR = this.game.config.TURRET_RADIUS;

    // Pass 1: faint coverage rings under the icons so players see what
    // their settlements / turrets actually affect.
    for (const b of this.game.buildings) {
      const s = this._toScreen(b.x + 0.5, b.y + 0.5);
      const c = palette[b.owner];
      if (!c) continue;
      const color = (c[0] << 16) | (c[1] << 8) | c[2];
      if (b.type === 'settlement') {
        g.circle(s.x, s.y, settleR * this.renderer.zoom)
         .fill({ color, alpha: 0.06 })
         .stroke({ color, alpha: 0.28, width: 1 });
      } else if (b.type === 'turret') {
        g.circle(s.x, s.y, turretR * this.renderer.zoom)
         .fill({ color, alpha: 0.05 })
         .stroke({ color, alpha: 0.32, width: 1 });
      }
    }

    // Pass 2: the icons themselves with a soft drop shadow.
    for (const b of this.game.buildings) {
      const s = this._toScreen(b.x + 0.5, b.y + 0.5);
      const c = palette[b.owner];
      if (!c) continue;
      const color = (c[0] << 16) | (c[1] << 8) | c[2];
      const r = Math.max(6, Math.min(18, this.renderer.zoom * 1.1));
      const cx = s.x, cy = s.y;
      // Drop shadow ellipse beneath every building.
      g.ellipse(cx + 1, cy + r * 0.55, r * 0.85, r * 0.35).fill({ color: 0x000000, alpha: 0.32 });
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
      }
    }
  }

  // Highlight the human's currently-targeted region by tinting its tiles on a
  // native-resolution canvas-backed sprite that lives inside renderer.world.
  // The sprite pans/zooms with the camera. We only repaint when the targeted
  // region changes; per-frame work is just a sin-wave alpha pulse.
  private _drawTarget(now: number): void {
    const me = this.game.human();
    const tr = me.targetRegion;
    if (tr == null) {
      this.targetSprite.alpha = 0;
      this.targetDrawnRegion = -1;
      return;
    }
    if (this.targetDrawnRegion !== tr) {
      this._repaintTargetRegion(tr);
      this.targetDrawnRegion = tr;
    }
    const t = (now / 900) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    this.targetSprite.alpha = 0.22 + 0.18 * pulse;
  }

  private _repaintTargetRegion(regionId: number): void {
    if (!this.targetCtx) return;
    const W = this.game.territory.width;
    const H = this.game.territory.height;
    const regions = this.game.regions;
    const data = this.targetCtx.createImageData(W, H);
    const buf = data.data;
    for (let i = 0; i < regions.length; i++) {
      if (regions[i] === regionId) {
        const o = i * 4;
        buf[o]     = 255;
        buf[o + 1] = 255;
        buf[o + 2] = 255;
        buf[o + 3] = 255;
      }
    }
    this.targetCtx.putImageData(data, 0, 0);
    this.targetTexture.source.update();
  }
}

// Compact troop number for HUD + labels: 1234 → 1.2k, 1234567 → 1.2M.
export function formatTroops(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  if (n < 10000) return (n / 1000).toFixed(1) + 'k';
  if (n < 1_000_000) return Math.floor(n / 1000) + 'k';
  if (n < 10_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  return Math.floor(n / 1_000_000) + 'M';
}
