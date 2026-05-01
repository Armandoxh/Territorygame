import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Game, GameConfig } from '@territorygame/shared';
import { computeBorderRGBA } from '@territorygame/shared';
import { TerritoryLayer } from './TerritoryLayer.js';
import { OverlayLayer } from './OverlayLayer.js';

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
  readonly territoryLayer: TerritoryLayer;
  readonly overlay: OverlayLayer;
  readonly opts: RendererOptions;

  // Camera in WORLD (tile) coordinates. Zoom is screen-pixels-per-tile.
  cameraX: number;
  cameraY: number;
  zoom: number;

  // Visual map border so the play area is identifiable at any zoom.
  private readonly border: Graphics;

  private readonly _config: GameConfig;
  private readonly game: Game;

  constructor(app: Application, game: Game, opts: Partial<RendererOptions> = {}) {
    this.app = app;
    this.game = game;
    this._config = game.config;
    this.opts = { ...DEFAULT_OPTS, ...opts };

    this.world = new Container();
    this.app.stage.addChild(this.world);

    this.territoryLayer = new TerritoryLayer(game.territory, game.config);
    this.world.addChild(this.territoryLayer.sprite);

    // Region overlay sprite: dark outline along every region border. Regions
    // themselves are computed inside Game.spawnAll so the simulation can
    // consult them (region-bounded expansion). We just consume game.regions
    // here to produce the visual layer.
    const W = game.territory.width;
    const H = game.territory.height;
    const borderRGBA = computeBorderRGBA(game.regions, W, H);
    const borderCanvas = document.createElement('canvas');
    borderCanvas.width = W;
    borderCanvas.height = H;
    const bctx = borderCanvas.getContext('2d');
    if (bctx) {
      const data = bctx.createImageData(W, H);
      data.data.set(borderRGBA);
      bctx.putImageData(data, 0, 0);
    }
    const borderTexture = Texture.from(borderCanvas);
    // Linear filtering smooths the border edges as the world is scaled up,
    // turning chunky 1-pixel jaggies into a softer hairline.
    borderTexture.source.scaleMode = 'linear';
    const borderSprite = new Sprite(borderTexture);
    this.world.addChild(borderSprite);

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

    this.applyViewport();
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
    this.overlay.update(now);
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
