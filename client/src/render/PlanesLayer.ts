import { Container, Graphics } from 'pixi.js';
import type { Game, Plane } from '@territorygame/shared';
import type { Renderer } from './Renderer.js';

interface PlaneNode {
  body: Graphics;
}

// Renders bombers in flight. Small chevron tinted by owner color, with
// a faint trailing line that suggests motion. Updated each frame; new
// planes get a node lazily, removed planes drop their nodes.
export class PlanesLayer {
  readonly container: Container;
  private readonly game: Game;
  private readonly renderer: Renderer;
  private readonly nodes = new Map<number, PlaneNode>();

  constructor(game: Game, renderer: Renderer) {
    this.game = game;
    this.renderer = renderer;
    this.container = new Container();
    this.container.eventMode = 'none';
  }

  update(_now: number): void {
    const seen = new Set<number>();
    for (const p of this.game.planes) {
      seen.add(p.id);
      let node = this.nodes.get(p.id);
      if (!node) {
        node = this._mkNode(p);
        this.nodes.set(p.id, node);
        this.container.addChild(node.body);
      }
      const sp = this.renderer.worldToScreen(p.x, p.y);
      node.body.position.set(sp.x, sp.y);
      // Heading: rotate so the nose points along velocity vector.
      const heading = Math.atan2(p.destY - p.y, p.destX - p.x);
      node.body.rotation = heading + Math.PI / 2; // sprite drawn nose-up
      const z = Math.max(0.7, Math.min(2.0, this.renderer.zoom * 0.16));
      node.body.scale.set(z);
    }
    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.body.destroy();
        this.nodes.delete(id);
      }
    }
  }

  private _mkNode(p: Plane): PlaneNode {
    const palette = this.game.config.PLAYER_COLORS;
    const c = palette[p.owner] ?? [255, 255, 255, 255];
    const tint = (c[0] << 16) | (c[1] << 8) | c[2];
    const body = new Graphics();
    drawPlane(body, p.bombType, tint);
    return { body };
  }
}

function drawPlane(g: Graphics, bombType: 'small' | 'large' | 'ac130', tint: number): void {
  g.clear();
  // Trail (drawn first so the body sits on top)
  g.poly([-0.5, 6, 0.5, 6, 0, 12]).fill({ color: 0xffffff, alpha: 0.20 });

  if (bombType === 'small') {
    // Small bomber: compact dart with two stub wings.
    g.poly([
      0, -7,
      4, 2,
      1.2, 2,
      1.2, 5,
     -1.2, 5,
     -1.2, 2,
     -4, 2,
    ]).fill({ color: tint, alpha: 0.95 }).stroke({ color: 0x1a0f08, width: 0.9 });
    // Cockpit dot
    g.circle(0, -3, 0.7).fill({ color: 0x1a0f08 });
  } else if (bombType === 'large') {
    // Heavy bomber: longer fuselage, four-engine look (two visible).
    g.poly([
      0, -10,
      6, 1,
      6, 3,
      1.5, 3,
      1.5, 6,
     -1.5, 6,
     -1.5, 3,
     -6, 3,
     -6, 1,
    ]).fill({ color: tint, alpha: 0.95 }).stroke({ color: 0x1a0f08, width: 1 });
    // Engines
    g.circle(-3.4, 1.5, 0.8).fill({ color: 0x1a0f08 });
    g.circle( 3.4, 1.5, 0.8).fill({ color: 0x1a0f08 });
    // Cockpit
    g.circle(0, -5, 0.9).fill({ color: 0x1a0f08 });
  } else {
    // AC-130 gunship: longer fuselage, swept wings, side gun bulge,
    // four engines on the wings. Reads as "this thing hangs around".
    g.poly([
      0, -11,
      4, -3,
      8, 1,
      8, 3,
      2, 3,
      2, 7,
     -2, 7,
     -2, 3,
     -8, 3,
     -8, 1,
     -4, -3,
    ]).fill({ color: tint, alpha: 0.95 }).stroke({ color: 0x1a0f08, width: 1 });
    // Side gun bulge (left-side howitzer)
    g.circle(-3, 0, 1.4).fill({ color: 0x222426 }).stroke({ color: 0x1a0f08, width: 0.6 });
    g.rect(-5.0, -0.4, 1.6, 0.8).fill({ color: 0x222426 });
    // Four engines along the wings
    g.circle(-5.5, 1.5, 0.7).fill({ color: 0x1a0f08 });
    g.circle(-2.5, 1.5, 0.7).fill({ color: 0x1a0f08 });
    g.circle( 2.5, 1.5, 0.7).fill({ color: 0x1a0f08 });
    g.circle( 5.5, 1.5, 0.7).fill({ color: 0x1a0f08 });
    // Cockpit
    g.circle(0, -7, 0.9).fill({ color: 0x1a0f08 });
  }
}
