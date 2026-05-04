import { Container, Graphics } from 'pixi.js';
import type { Game, Ship, ShipKind } from '@territorygame/shared';
import type { Renderer } from './Renderer.js';

interface ShipNode {
  hull: Graphics;
  ring: Graphics;
}

// Renders ships as small colored shapes on top of the territory layer.
// Selection ring drawn around the player's currently-controlled ship.
export class ShipsLayer {
  readonly container: Container;
  private readonly game: Game;
  private readonly renderer: Renderer;
  private readonly nodes = new Map<number, ShipNode>();
  private _selectedId = 0;

  constructor(game: Game, renderer: Renderer) {
    this.game = game;
    this.renderer = renderer;
    this.container = new Container();
    this.container.eventMode = 'none';
  }

  setSelected(id: number): void { this._selectedId = id; }
  selected(): number { return this._selectedId; }

  update(now: number): void {
    const seen = new Set<number>();
    for (const s of this.game.ships) {
      seen.add(s.id);
      let node = this.nodes.get(s.id);
      if (!node) {
        node = this._mkNode(s);
        this.nodes.set(s.id, node);
        this.container.addChild(node.ring);
        this.container.addChild(node.hull);
      }
      const sp = this.renderer.worldToScreen(s.x + 0.5, s.y + 0.5);
      node.hull.position.set(sp.x, sp.y);
      node.ring.position.set(sp.x, sp.y);
      const z = Math.max(0.6, Math.min(2.2, this.renderer.zoom * 0.18));
      node.hull.scale.set(z);
      node.ring.scale.set(z);
      const isSel = s.id === this._selectedId;
      node.ring.visible = isSel;
      if (isSel) {
        // Pulse the selection ring.
        const t = (Math.sin(now * 0.008) + 1) * 0.5;
        node.ring.alpha = 0.5 + t * 0.5;
      }
    }
    // Drop nodes for ships that no longer exist.
    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.hull.destroy();
        node.ring.destroy();
        this.nodes.delete(id);
        if (id === this._selectedId) this._selectedId = 0;
      }
    }
  }

  private _mkNode(s: Ship): ShipNode {
    const palette = this.game.config.PLAYER_COLORS;
    const c = palette[s.owner] ?? [255, 255, 255, 255];
    const tint = (c[0] << 16) | (c[1] << 8) | c[2];
    const hull = new Graphics();
    drawHull(hull, s.kind, tint);
    const ring = new Graphics();
    const ringR = s.kind === 'warship' ? 14 : s.kind === 'skirmisher' ? 11 : 9;
    ring.circle(0, 0, ringR).stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    ring.visible = false;
    return { hull, ring };
  }
}

// Local style constants — match the inky look of the building sprites.
const INK = 0x1a0f08;
const DECK = 0x4a3826;
const STEEL = 0x2a1c12;

function drawHull(g: Graphics, kind: ShipKind, tint: number): void {
  g.clear();
  // Bow points UP (negative Y). The ShipsLayer doesn't rotate sprites
  // currently, so the silhouette reads regardless of facing.
  if (kind === 'scout') {
    drawScout(g, tint);
  } else if (kind === 'skirmisher') {
    drawSkirmisher(g, tint);
  } else {
    drawWarship(g, tint);
  }
}

function drawScout(g: Graphics, tint: number): void {
  // Lean cutter — sleek hull, single triangular sail, small flag.
  // Wake hint
  g.poly([-3, 5, 0, 6, 3, 5]).fill({ color: 0xffffff, alpha: 0.18 });
  // Hull (pointed prow up)
  g.poly([
    0, -7,
    3, -2,
    3, 4,
    1, 5.5,
   -1, 5.5,
   -3, 4,
   -3, -2,
  ]).fill({ color: tint, alpha: 0.95 }).stroke({ color: INK, width: 1, alpha: 0.85 });
  // Deck stripe
  g.rect(-2.2, -1, 4.4, 1).fill({ color: DECK });
  // Mast
  g.rect(-0.3, -6, 0.6, 7).fill({ color: INK });
  // Sail (triangular, leaning back)
  g.poly([0, -6, 3, -1, 0, -1]).fill({ color: 0xeae0c2, alpha: 0.95 }).stroke({ color: INK, width: 0.6 });
  // Pennant
  g.poly([0, -6.5, 2, -6.0, 0, -5.5]).fill({ color: tint });
}

function drawSkirmisher(g: Graphics, tint: number): void {
  // Compact gunboat — wider hull, bridge, single deck gun, smokestack.
  // Wake
  g.poly([-4, 6, 0, 7.5, 4, 6]).fill({ color: 0xffffff, alpha: 0.20 });
  // Hull
  g.poly([
    0, -8,
    4, -3,
    4.4, 5,
    2,  6.5,
   -2,  6.5,
   -4.4, 5,
   -4, -3,
  ]).fill({ color: tint, alpha: 0.95 }).stroke({ color: INK, width: 1.1, alpha: 0.9 });
  // Deck
  g.rect(-3, -2, 6, 7).fill({ color: DECK });
  // Bridge (aft superstructure)
  g.rect(-2, 1.5, 4, 2.5).fill({ color: STEEL }).stroke({ color: INK, width: 0.6 });
  // Bridge window
  g.rect(-1.6, 2.0, 3.2, 0.8).fill({ color: 0xffd66b, alpha: 0.85 });
  // Forward gun ring
  g.circle(0, -2.5, 1.6).fill({ color: STEEL }).stroke({ color: INK, width: 0.6 });
  // Forward barrel
  g.rect(-0.4, -6, 0.8, 4).fill({ color: STEEL }).stroke({ color: INK, width: 0.5 });
  // Smokestack
  g.rect(-0.7, 0, 1.4, 1.6).fill({ color: STEEL }).stroke({ color: INK, width: 0.5 });
  // Smoke puff
  g.circle(0, -1.0, 1.0).fill({ color: 0x6a5a4a, alpha: 0.45 });
}

function drawWarship(g: Graphics, tint: number): void {
  // Dreadnought silhouette — long hull, three turrets, twin stacks,
  // bridge tower. The biggest sprite by far so it reads at distance.
  // Wake
  g.poly([-6, 8, 0, 10, 6, 8]).fill({ color: 0xffffff, alpha: 0.22 });
  // Hull (longer, narrow prow)
  g.poly([
    0, -11,
    4, -7,
    5, -2,
    5,  6,
    3,  8.5,
   -3,  8.5,
   -5,  6,
   -5, -2,
   -4, -7,
  ]).fill({ color: tint, alpha: 0.97 }).stroke({ color: INK, width: 1.3, alpha: 0.92 });
  // Deck
  g.rect(-4, -6, 8, 13).fill({ color: DECK });
  // Forward turret 1
  g.circle(0, -4, 2.0).fill({ color: STEEL }).stroke({ color: INK, width: 0.7 });
  g.poly([-0.8, -5.0, 0.8, -5.0, 0.6, -8.5, -0.6, -8.5]).fill({ color: STEEL }).stroke({ color: INK, width: 0.5 });
  // Bridge tower (central superstructure)
  g.rect(-2, -1, 4, 4).fill({ color: STEEL }).stroke({ color: INK, width: 0.8 });
  g.rect(-1.5, -0.5, 3, 0.9).fill({ color: 0xffd66b, alpha: 0.85 });
  // Mast
  g.rect(-0.25, -3.5, 0.5, 2.5).fill({ color: INK });
  // Twin smokestacks
  g.rect(-1.6, 2.5, 1.2, 1.7).fill({ color: STEEL }).stroke({ color: INK, width: 0.5 });
  g.rect( 0.4, 2.5, 1.2, 1.7).fill({ color: STEEL }).stroke({ color: INK, width: 0.5 });
  // Smoke puffs
  g.circle(-1.0, 1.6, 0.9).fill({ color: 0x4a3a2c, alpha: 0.5 });
  g.circle( 1.0, 1.4, 0.9).fill({ color: 0x4a3a2c, alpha: 0.5 });
  // Aft turret
  g.circle(0, 6, 1.8).fill({ color: STEEL }).stroke({ color: INK, width: 0.7 });
  g.poly([-0.7, 5.5, 0.7, 5.5, 0.55, 8.0, -0.55, 8.0]).fill({ color: STEEL }).stroke({ color: INK, width: 0.5 });
}
