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
  private targetDrawnSig: string = '';

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

    // Region-name labels: one Pixi Text per region, anchored at the region's
    // centroid. Color tracks the dominant owner so each "country" reads as
    // a small flag on the map.
    this._regionLabelLayer = new Container();
    this.container.addChild(this._regionLabelLayer);
    this._regionLabels = new Map();
    this._regionCentroids = new Float32Array((game.regionCount + 1) * 2);
    for (let r = 1; r <= game.regionCount; r++) {
      const c = game.regionCentroidOf(r);
      if (!c) continue;
      this._regionCentroids[r * 2]     = c.x;
      this._regionCentroids[r * 2 + 1] = c.y;
    }
    // Empire labels: one Pixi Text per player, drawn at the player's overall
    // territory centroid. Visible at low zoom; hidden when zoomed in. The
    // region labels swap in at high zoom.
    this._empireLabelLayer = new Container();
    this.container.addChild(this._empireLabelLayer);
    this._empireLabels = new Map();
  }

  private readonly _empireLabelLayer: Container;
  private readonly _empireLabels: Map<PlayerId, Text>;

  private readonly _regionLabelLayer: Container;
  private readonly _regionLabels: Map<number, Text>;
  private readonly _regionCentroids: Float32Array;

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
    this._drawEmpireLabels();
    this._drawRegionNames();
    this._drawTarget(now);
    this._drawExplosions(now);
  }

  // Big italic "Empire of X" label per alive player, positioned at their
  // territory centroid. Visible at low zoom (when individual region names
  // would be unreadable noise) and hidden once the player zooms in enough
  // for region labels to take over.
  private _drawEmpireLabels(): void {
    const showEmpires = this.renderer.zoom < OverlayLayer.REGION_LABEL_ZOOM;
    if (!showEmpires) {
      for (const t of this._empireLabels.values()) t.visible = false;
      return;
    }
    const palette = this.game.config.PLAYER_COLORS;
    const seen = new Set<PlayerId>();
    for (let id = 1; id < this.game.players.length; id++) {
      const p = this.game.players[id];
      if (!p || !p.alive) continue;
      const owned = this.game.territory.counts[id]!;
      if (owned < 12) continue; // tiny dots aren't worth a banner
      seen.add(id);
      const centroid = this.game.territory.centroid(id);
      const s = this.renderer.worldToScreen(centroid.x, centroid.y);
      let label = this._empireLabels.get(id);
      if (!label) {
        const name = p.isHuman
          ? `${this.game.playerEmpireNameOf(id)}`
          : this.game.playerEmpireNameOf(id);
        label = new Text({
          text: name || `Empire ${id}`,
          style: {
            fill: 0xffffff,
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic',
            fontSize: 18,
            fontWeight: '700',
            stroke: { color: 0x000000, width: 5, alpha: 0.9 },
          },
        });
        label.anchor.set(0.5, 0.5);
        this._empireLabels.set(id, label);
        this._empireLabelLayer.addChild(label);
      }
      const c = palette[id];
      if (c) label.tint = (c[0] << 16) | (c[1] << 8) | c[2];
      label.position.set(s.x, s.y);
      label.visible = true;
    }
    for (const [id, label] of this._empireLabels) {
      if (!seen.has(id)) label.visible = false;
    }
  }

  // Zoom threshold: above this zoom we show individual country names per
  // region; below we show one big empire label per player so the screen
  // doesn't drown in text when the camera's pulled out.
  private static REGION_LABEL_ZOOM = 2.6;

  // One italic country-name label per region. Hidden at low zoom; the
  // empire labels take over there.
  private _drawRegionNames(): void {
    const showRegions = this.renderer.zoom >= OverlayLayer.REGION_LABEL_ZOOM;
    if (!showRegions) {
      for (const t of this._regionLabels.values()) t.visible = false;
      return;
    }
    const palette = this.game.config.PLAYER_COLORS;
    for (let r = 1; r <= this.game.regionCount; r++) {
      const cx = this._regionCentroids[r * 2]!;
      const cy = this._regionCentroids[r * 2 + 1]!;
      let label = this._regionLabels.get(r);
      if (!label) {
        const name = this.game.regionNameOf(r);
        if (!name) continue;
        label = new Text({
          text: name,
          style: {
            fill: 0xffffff,
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic',
            fontSize: 11,
            stroke: { color: 0x000000, width: 3, alpha: 0.85 },
          },
        });
        label.anchor.set(0.5, 0.5);
        this._regionLabels.set(r, label);
        this._regionLabelLayer.addChild(label);
      }
      const dominant = this.game.regionDominantOwnerOf(r);
      // Append vassal gold when this region is a vassal of the dominant
      // player. Reads as "Kingdom of Bhutan · 240" for human-owned regions.
      const baseName = this.game.regionNameOf(r);
      if (dominant > 0 && palette[dominant]) {
        const c = palette[dominant]!;
        label.tint = (c[0] << 16) | (c[1] << 8) | c[2];
        label.alpha = 0.95;
        const player = this.game.players[dominant];
        if (player && player.isHuman) {
          const gold = this.game.vassalGoldOf(r);
          label.text = `${baseName} · ${formatGold(gold)}g`;
        } else {
          label.text = baseName;
        }
      } else {
        label.tint = 0xb0b8c0;
        label.alpha = 0.65;
        label.text = baseName;
      }
      const s = this.renderer.worldToScreen(cx, cy);
      label.position.set(s.x, s.y);
      label.visible = true;
    }
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

    // Pass 2: the icons themselves with a soft drop shadow. Higher tier
    // buildings render slightly larger and get gold dots above them so the
    // upgrade tier reads at a glance.
    for (const b of this.game.buildings) {
      const s = this._toScreen(b.x + 0.5, b.y + 0.5);
      const c = palette[b.owner];
      if (!c) continue;
      const color = (c[0] << 16) | (c[1] << 8) | c[2];
      const lvl = b.level ?? 1;
      const tierScale = 1 + 0.25 * (lvl - 1);
      const r = Math.max(6, Math.min(18, this.renderer.zoom * 1.1)) * tierScale;
      const cx = s.x, cy = s.y;
      // Drop shadow ellipse beneath every building.
      g.ellipse(cx + 1, cy + r * 0.55, r * 0.85, r * 0.35).fill({ color: 0x000000, alpha: 0.32 });

      if (b.type === 'settlement') {
        drawSettlementSprite(g, cx, cy, r, color);
      } else if (b.type === 'turret') {
        drawTurretSprite(g, cx, cy, r, color);
      } else if (b.type === 'airstrip') {
        drawAirstripSprite(g, cx, cy, r, color);
      }
      // Tier dots: small gold pips above the icon — one per tier above L1.
      // L2 = 1 dot, L3 = 2 dots. Skipped at L1 to keep low-tier buildings clean.
      const dots = lvl - 1;
      if (dots > 0) {
        const spacing = 4;
        const startX = cx - ((dots - 1) * spacing) / 2;
        const dotY = cy - r - 4;
        for (let d = 0; d < dots; d++) {
          g.circle(startX + d * spacing, dotY, 1.8).fill({ color: 0xffd66b });
        }
      }
    }
  }

  // Highlight EVERY one of the human's active manual targets with a soft
  // pulsing white tint. Multiple targets = multiple regions glowing in
  // parallel (parallel attacks). Repainted only when the target set
  // changes (cheap signature compare); per-frame work is just an alpha
  // pulse on the single sprite.
  private _drawTarget(now: number): void {
    const me = this.game.human();
    const targets = me.targetRegions;
    if (!targets || targets.length === 0) {
      this.targetSprite.alpha = 0;
      this.targetDrawnSig = '';
      return;
    }
    const sig = targets.slice().sort((a, b) => a - b).join(',');
    if (sig !== this.targetDrawnSig) {
      this._repaintTargetRegions(targets);
      this.targetDrawnSig = sig;
    }
    const t = (now / 900) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    this.targetSprite.alpha = 0.22 + 0.18 * pulse;
  }

  private _repaintTargetRegions(regionIds: readonly number[]): void {
    if (!this.targetCtx) return;
    const W = this.game.territory.width;
    const H = this.game.territory.height;
    const regions = this.game.regions;
    const set = new Set<number>(regionIds);
    const data = this.targetCtx.createImageData(W, H);
    const buf = data.data;
    for (let i = 0; i < regions.length; i++) {
      if (set.has(regions[i]!)) {
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

// Compact gold number for region labels — same formatting as troops but
// floored small values for the on-map readout (no decimals when small).
export function formatGold(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  if (n < 10000) return (n / 1000).toFixed(1) + 'k';
  return Math.floor(n / 1000) + 'k';
}

// Compact troop number for HUD + labels: 1234 → 1.2k, 1234567 → 1.2M.
export function formatTroops(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  if (n < 10000) return (n / 1000).toFixed(1) + 'k';
  if (n < 1_000_000) return Math.floor(n / 1000) + 'k';
  if (n < 10_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  return Math.floor(n / 1_000_000) + 'M';
}

// --- Building sprite drawers ---
//
// All shapes are painted into the shared `buildings` Graphics each frame.
// Coordinates are screen-space. `r` is the sprite half-size (it already
// includes zoom + tier scaling). `color` is the player tint as 0xRRGGBB.
//
// Style: ink outlines (deep brown) + player-tinted body + small detail
// hits in dark + a single white highlight to suggest depth. Built for
// readability at zooms ranging from r≈8 (cramped) to r≈22 (close-up).

const INK = 0x1a0f08;
const STONE_DARK = 0x2a1c12;

function drawSettlementSprite(g: Graphics, cx: number, cy: number, r: number, color: number): void {
  // Crenellated keep — a stocky castle silhouette that reads as
  // "settlement / fortified town" rather than a generic house.
  // Base wall
  g.rect(cx - r * 0.95, cy - r * 0.15, r * 1.9, r * 0.95)
    .fill({ color }).stroke({ color: INK, width: 1.4 });
  // Crenellations along the top of the wall
  const battlementCount = 5;
  const bw = (r * 1.9) / (battlementCount * 2 - 1);
  const baseY = cy - r * 0.15;
  for (let i = 0; i < battlementCount; i++) {
    const bx = cx - r * 0.95 + i * bw * 2;
    g.rect(bx, baseY - r * 0.32, bw, r * 0.32)
      .fill({ color }).stroke({ color: INK, width: 1 });
  }
  // Central tower
  g.rect(cx - r * 0.28, cy - r * 0.85, r * 0.56, r * 0.7)
    .fill({ color }).stroke({ color: INK, width: 1.2 });
  // Tower crenellation cap
  g.rect(cx - r * 0.36, cy - r * 0.95, r * 0.18, r * 0.18)
    .fill({ color }).stroke({ color: INK, width: 0.9 });
  g.rect(cx + r * 0.18, cy - r * 0.95, r * 0.18, r * 0.18)
    .fill({ color }).stroke({ color: INK, width: 0.9 });
  // Door (dark slot)
  g.rect(cx - r * 0.13, cy + r * 0.4, r * 0.26, r * 0.4)
    .fill({ color: INK, alpha: 0.85 });
  // Pennant on the central tower
  g.rect(cx - r * 0.02, cy - r * 1.18, r * 0.04, r * 0.28)
    .fill({ color: INK });
  g.poly([
    cx + r * 0.02, cy - r * 1.16,
    cx + r * 0.32, cy - r * 1.04,
    cx + r * 0.02, cy - r * 0.94,
  ]).fill({ color }).stroke({ color: INK, width: 0.8 });
  // Subtle inner highlight (left-side wall)
  g.rect(cx - r * 0.93, cy - r * 0.05, r * 0.18, r * 0.85)
    .fill({ color: 0xffffff, alpha: 0.08 });
}

function drawTurretSprite(g: Graphics, cx: number, cy: number, r: number, color: number): void {
  // Cannon emplacement — octagonal stone base + gun barrel + ring mount.
  const w = r * 0.95;
  const h = r * 0.95;
  // Octagonal stone base
  g.poly([
    cx - w * 0.55, cy + h,
    cx + w * 0.55, cy + h,
    cx + w,        cy + h * 0.4,
    cx + w,        cy - h * 0.1,
    cx + w * 0.55, cy - h * 0.55,
    cx - w * 0.55, cy - h * 0.55,
    cx - w,        cy - h * 0.1,
    cx - w,        cy + h * 0.4,
  ]).fill({ color }).stroke({ color: INK, width: 1.4 });
  // Cannon barrel (pointing up-right)
  g.poly([
    cx - r * 0.10, cy - r * 0.45,
    cx + r * 0.42, cy - r * 1.10,
    cx + r * 0.62, cy - r * 0.95,
    cx + r * 0.10, cy - r * 0.30,
  ]).fill({ color: STONE_DARK }).stroke({ color: INK, width: 1.1 });
  // Barrel muzzle
  g.circle(cx + r * 0.50, cy - r * 1.02, r * 0.10)
    .fill({ color: INK });
  // Ring mount (where the barrel pivots)
  g.circle(cx, cy - r * 0.20, r * 0.30)
    .fill({ color: STONE_DARK }).stroke({ color: INK, width: 1 });
  g.circle(cx, cy - r * 0.20, r * 0.13)
    .fill({ color: INK });
  // Highlight on the base
  g.poly([
    cx - w, cy - h * 0.1,
    cx - w * 0.55, cy - h * 0.55,
    cx - w * 0.30, cy - h * 0.50,
    cx - w * 0.85, cy - h * 0.05,
  ]).fill({ color: 0xffffff, alpha: 0.10 });
}

function drawAirstripSprite(g: Graphics, cx: number, cy: number, r: number, color: number): void {
  // Diagonal runway with center-line dashes + control tower at one end.
  // Drawn axis-aligned for legibility at small sizes; the dashes give it
  // motion and the tower gives it scale.
  const runW = r * 2.1;
  const runH = r * 0.55;
  // Tarmac
  g.rect(cx - runW * 0.5, cy - runH * 0.5, runW, runH)
    .fill({ color: STONE_DARK }).stroke({ color: INK, width: 1.4 });
  // Center-line dashes (yellow)
  for (let i = -2; i <= 2; i++) {
    g.rect(cx + i * r * 0.42 - r * 0.13, cy - r * 0.05, r * 0.26, r * 0.10)
      .fill({ color: 0xeacc7a });
  }
  // Threshold markings at each end
  const thrW = r * 0.10;
  for (let i = 0; i < 3; i++) {
    g.rect(cx - runW * 0.5 + r * 0.08, cy - runH * 0.4 + i * r * 0.18, thrW, r * 0.10)
      .fill({ color: 0xeacc7a });
    g.rect(cx + runW * 0.5 - r * 0.18, cy - runH * 0.4 + i * r * 0.18, thrW, r * 0.10)
      .fill({ color: 0xeacc7a });
  }
  // Control tower at right end
  const tx = cx + runW * 0.5 - r * 0.15;
  const ty = cy - r * 0.30;
  g.rect(tx, ty - r * 0.85, r * 0.35, r * 0.85)
    .fill({ color }).stroke({ color: INK, width: 1.2 });
  // Tower cab (slightly wider top)
  g.rect(tx - r * 0.05, ty - r * 1.05, r * 0.45, r * 0.25)
    .fill({ color }).stroke({ color: INK, width: 1 });
  // Tower window
  g.rect(tx + r * 0.02, ty - r * 1.0, r * 0.31, r * 0.10)
    .fill({ color: 0xffd66b, alpha: 0.85 });
  // Antenna
  g.rect(tx + r * 0.155, ty - r * 1.32, r * 0.04, r * 0.32)
    .fill({ color: INK });
}
