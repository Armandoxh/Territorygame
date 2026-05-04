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
    ring.circle(0, 0, 11).stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    ring.visible = false;
    return { hull, ring };
  }
}

function drawHull(g: Graphics, kind: ShipKind, tint: number): void {
  g.clear();
  if (kind === 'scout') {
    // Small triangle
    g.poly([0, -5, 4, 4, -4, 4]).fill({ color: tint, alpha: 0.95 }).stroke({ color: 0x000000, width: 1, alpha: 0.6 });
  } else if (kind === 'skirmisher') {
    // Larger triangle with a notch
    g.poly([0, -7, 6, 5, 0, 3, -6, 5]).fill({ color: tint, alpha: 0.95 }).stroke({ color: 0x000000, width: 1, alpha: 0.6 });
  } else {
    // Warship: rectangle with prow
    g.poly([-7, -4, 7, -4, 9, 0, 7, 4, -7, 4]).fill({ color: tint, alpha: 0.95 }).stroke({ color: 0x000000, width: 1.2, alpha: 0.7 });
  }
}
