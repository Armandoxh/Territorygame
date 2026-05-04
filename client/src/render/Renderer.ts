import { Application, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Game, GameConfig } from '@territorygame/shared';
import { TerritoryShaderLayer } from './TerritoryShaderLayer.js';
import { OverlayLayer } from './OverlayLayer.js';
import { ShipsLayer } from './ShipsLayer.js';
import { StageGradeFilter } from './StageGradeFilter.js';

export interface RendererOptions {
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;
}

const DEFAULT_OPTS: RendererOptions = {
  minZoom: 0.5,
  maxZoom: 24,
  defaultZoom: 1.6,
};

// Owns the PixiJS Application and the world container. The world container
// holds the territory sprite (in world coords); pan/zoom is implemented as
// scale + position on it. The overlay layer is a separate child of the stage
// (screen-space coords) for capitals/buildings/markers — they're drawn via
// renderer.worldToScreen so they always stay on top crisp.
export class Renderer {
  readonly app: Application;
  readonly world: Container;
  readonly territoryLayer: TerritoryShaderLayer;
  readonly overlay: OverlayLayer;
  readonly ships!: ShipsLayer;
  private readonly _stageGrade: StageGradeFilter;
  readonly opts: RendererOptions;

  // Camera in WORLD (tile) coordinates. Zoom is screen-pixels-per-tile.
  cameraX: number;
  cameraY: number;
  zoom: number;

  // Visual map border so the play area is identifiable at any zoom.
  private readonly border: Graphics;
  // Crisp vector outline around every player's owned region. Rebuilt
  // incrementally each tick so we get clean borders without rendering
  // thousands of individual rectangles per frame.
  private territoryOutlines!: Graphics;
  private _outlinesDirtyAtTick = -1;
  // Thicker player-colored walls around regions a player has fully
  // conquered (the "fortified" visual reward).
  private fortifiedWalls!: Graphics;
  private _fortifiedAtTick = -1;

  private readonly _config: GameConfig;
  private readonly game: Game;

  constructor(app: Application, game: Game, opts: Partial<RendererOptions> = {}) {
    this.app = app;
    this.game = game;
    this._config = game.config;
    this.opts = { ...DEFAULT_OPTS, ...opts };

    this.world = new Container();
    this.app.stage.addChild(this.world);

    this.territoryLayer = new TerritoryShaderLayer(game.territory, game.config);
    this.world.addChild(this.territoryLayer.sprite);

    // Region outlines as VECTOR polylines instead of a pixel sprite. Each
    // grid edge between two different region IDs becomes a Pixi line segment
    // in world coordinates. Pixi rasterises crisply at any zoom level, so
    // borders no longer jaggy or fuzz out as you scale in.
    const W = game.territory.width;
    const H = game.territory.height;
    const regionLines = new Graphics();
    const regions = game.regions;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const r = regions[row + x];
        if (!r) continue;
        if (x + 1 < W) {
          const nr = regions[row + x + 1];
          if (nr && nr !== r) {
            regionLines.moveTo(x + 1, y).lineTo(x + 1, y + 1);
          }
        }
        if (y + 1 < H) {
          const nr = regions[row + W + x];
          if (nr && nr !== r) {
            regionLines.moveTo(x, y + 1).lineTo(x + 1, y + 1);
          }
        }
      }
    }
    regionLines.stroke({ color: 0x0a0d10, alpha: 0.7, width: 0.25 });
    this.world.addChild(regionLines);

    // Player-territory outlines: a crisp dark vector line drawn along every
    // edge between an owned tile and a non-same-owned (or out-of-bounds /
    // water) tile. Sits above the pixel territory so each empire reads as
    // a defined continent on a map. Rebuilt on demand from the territory
    // grid; we re-stroke once per tick from the render loop.
    this.territoryOutlines = new Graphics();
    this.world.addChild(this.territoryOutlines);
    this._outlinesDirtyAtTick = -1;

    // Player-colored fortress walls drawn around every fully-owned region.
    // Sit above the territory outline so they read as a clear "this region
    // is locked down" cue.
    this.fortifiedWalls = new Graphics();
    this.world.addChild(this.fortifiedWalls);
    this._fortifiedAtTick = -1;

    this.border = new Graphics();
    this.border.rect(0, 0, W, H);
    this.border.stroke({ color: 0xffffff, alpha: 0.18, width: 1 });
    this.world.addChild(this.border);

    this.cameraX = game.territory.width / 2;
    this.cameraY = game.territory.height / 2;
    this.zoom = this.opts.defaultZoom;

    this.overlay = new OverlayLayer(game, this);
    // World-space layers (target-region highlight) pan + zoom with the camera.
    this.world.addChild(this.overlay.worldContainer);
    // Screen-space layers (capitals, buildings, labels, tap flash).
    this.app.stage.addChild(this.overlay.container);

    // Ships render in screen space on top of buildings.
    (this as { ships: ShipsLayer }).ships = new ShipsLayer(game, this);
    this.app.stage.addChild(this.ships.container);

    // Stage-level look pass (vignette + sepia tint + film grain).
    // HTML HUD elements sit above the canvas and are unaffected.
    this._stageGrade = new StageGradeFilter();
    this.app.stage.filters = [this._stageGrade];
    // The stage's filterArea must cover the screen so the grade shader
    // sees the full rendered framebuffer, not the local bounds of the
    // children (which would shrink as content moves around).
    this._refreshStageFilterArea();
    this.app.renderer.on('resize', () => this._refreshStageFilterArea());

    this.applyViewport();
  }

  private _refreshStageFilterArea(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.app.stage.filterArea = new Rectangle(0, 0, w, h);
  }

  // --- viewport math ---

  applyViewport(): void {
    this.world.scale.set(this.zoom);
    this.world.position.set(
      this.app.screen.width / 2 - this.cameraX * this.zoom,
      this.app.screen.height / 2 - this.cameraY * this.zoom,
    );
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.cameraX -= dxScreen / this.zoom;
    this.cameraY -= dyScreen / this.zoom;
    this._clampCamera();
    this.applyViewport();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    const newZoom = Math.max(this.opts.minZoom, Math.min(this.opts.maxZoom, this.zoom * factor));
    if (newZoom === this.zoom) return;
    this.zoom = newZoom;
    const after = this.screenToWorld(sx, sy);
    this.cameraX += before.x - after.x;
    this.cameraY += before.y - after.y;
    this._clampCamera();
    this.applyViewport();
  }

  centerOn(wx: number, wy: number): void {
    this.cameraX = wx;
    this.cameraY = wy;
    this._clampCamera();
    this.applyViewport();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const wx = (sx - this.app.screen.width / 2) / this.zoom + this.cameraX;
    const wy = (sy - this.app.screen.height / 2) / this.zoom + this.cameraY;
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.cameraX) * this.zoom + this.app.screen.width / 2,
      y: (wy - this.cameraY) * this.zoom + this.app.screen.height / 2,
    };
  }

  // Called every frame from the host loop. Pixi's auto-render after this draws.
  draw(now: number): void {
    this.territoryLayer.flushDirty();
    this.territoryLayer.tickTime(now);
    this._stageGrade.tickTime(now);
    this._maybeRebuildOutlines();
    this._maybeRebuildFortifications();
    this.overlay.update(now);
    this.ships.update(now);
  }

  // Rebuild the fortified-region walls if the simulation has advanced. Each
  // segment is grouped by owner and stroked once per color so all walls of a
  // given player are batched into a single GPU draw call.
  private _maybeRebuildFortifications(): void {
    if (this._fortifiedAtTick === this.game.tickCount) return;
    this._fortifiedAtTick = this.game.tickCount;
    const g = this.fortifiedWalls;
    g.clear();
    const W = this.game.territory.width;
    const H = this.game.territory.height;
    const regions = this.game.regions;
    const palette = this.game.config.PLAYER_COLORS;
    // owner -> flat array of segment endpoints [x1, y1, x2, y2, ...]
    const byOwner = new Map<number, number[]>();
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const r = regions[row + x];
        if (!r) continue;
        const owner = this.game.regionOwnerOf(r);
        if (!owner) continue;
        let arr = byOwner.get(owner);
        if (!arr) { arr = []; byOwner.set(owner, arr); }
        // Wall along edges where the next tile is in a DIFFERENT region (or
        // out of bounds). Region-internal edges between same-region tiles
        // don't get a wall — only the outer perimeter does.
        if (x === 0 || regions[row + x - 1] !== r) arr.push(x, y, x, y + 1);
        if (x === W - 1 || regions[row + x + 1] !== r) arr.push(x + 1, y, x + 1, y + 1);
        if (y === 0 || regions[row - W + x] !== r) arr.push(x, y, x + 1, y);
        if (y === H - 1 || regions[row + W + x] !== r) arr.push(x, y + 1, x + 1, y + 1);
      }
    }
    for (const [ownerId, arr] of byOwner) {
      const c = palette[ownerId];
      if (!c) continue;
      const color = (c[0] << 16) | (c[1] << 8) | c[2];
      for (let i = 0; i < arr.length; i += 4) {
        g.moveTo(arr[i]!, arr[i + 1]!).lineTo(arr[i + 2]!, arr[i + 3]!);
      }
      g.stroke({ color, alpha: 1, width: 0.55 });
    }
  }

  // Rebuild the territory-outline graphics if the simulation has advanced
  // since the last build. Cheap enough to do every tick (~150K tile reads).
  private _maybeRebuildOutlines(): void {
    if (this._outlinesDirtyAtTick === this.game.tickCount) return;
    this._outlinesDirtyAtTick = this.game.tickCount;
    const g = this.territoryOutlines;
    g.clear();
    const territory = this.game.territory;
    const owners = territory.owners;
    const W = territory.width;
    const H = territory.height;
    // For each owned tile, emit a line segment for each side that borders a
    // tile of a different owner (or the map edge). Pixi batches everything
    // into one stroke call at the end.
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const o = owners[row + x]!;
        if (o === 0) continue;
        // Left edge (x | y) -- (x | y+1)
        if (x === 0 || owners[row + x - 1] !== o) {
          g.moveTo(x, y).lineTo(x, y + 1);
        }
        // Right edge (x+1 | y) -- (x+1 | y+1)
        if (x === W - 1 || owners[row + x + 1] !== o) {
          g.moveTo(x + 1, y).lineTo(x + 1, y + 1);
        }
        // Top edge (x | y) -- (x+1 | y)
        if (y === 0 || owners[row - W + x] !== o) {
          g.moveTo(x, y).lineTo(x + 1, y);
        }
        // Bottom edge (x | y+1) -- (x+1 | y+1)
        if (y === H - 1 || owners[row + W + x] !== o) {
          g.moveTo(x, y + 1).lineTo(x + 1, y + 1);
        }
      }
    }
    g.stroke({ color: 0x05080b, alpha: 0.85, width: 0.18 });
  }

  // --- private ---

  private _clampCamera(): void {
    const margin = 0.2;
    const W = this.game.territory.width;
    const H = this.game.territory.height;
    this.cameraX = Math.max(-W * margin, Math.min(W * (1 + margin), this.cameraX));
    this.cameraY = Math.max(-H * margin, Math.min(H * (1 + margin), this.cameraY));
  }
}
