import { Container, Graphics, Text } from 'pixi.js';
import type { Game, Army } from '@territorygame/shared';
import type { Renderer } from './Renderer.js';

interface ArmyNode {
  hull: Graphics;
  ring: Graphics;
  label: Text;
  /** Last value rendered into `label.text`. Strength changes every
   *  tick (regen + aura attrition) and Pixi Text re-rasterizes on
   *  every text mutation, which is brutal on mobile when there are
   *  many armies. We coarsen to multiples of 5 so the rasterizer
   *  fires ~5× less often without hiding meaningful changes. */
  lastShown: number;
  /** Last veteran tier rendered (0 = recruit, 1+ = chevrons). Avoids
   *  redrawing the hull every frame. */
  lastTier: number;
  /** Last fortified state rendered (0 = mobile, 1 = dug in). */
  lastFortified: number;
}

// Renders battlefield army stacks as Risk-style icons on top of the
// territory layer. Each (owner, tile) gets one icon with a strength
// number badge. Selection ring pulses on the player's current pick.
//
// Mirrors ShipsLayer.ts's node-map pattern: lazy create nodes on
// spawn, reposition every frame, destroy nodes for dead armies.
export class ArmiesLayer {
  readonly container: Container;
  private readonly game: Game;
  private readonly renderer: Renderer;
  private readonly nodes = new Map<number, ArmyNode>();
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
    for (const a of this.game.armies) {
      seen.add(a.id);
      let node = this.nodes.get(a.id);
      if (!node) {
        node = this._mkNode(a);
        this.nodes.set(a.id, node);
        this.container.addChild(node.ring);
        this.container.addChild(node.hull);
        this.container.addChild(node.label);
      }
      const sp = this.renderer.worldToScreen(a.x + 0.5, a.y + 0.5);
      node.hull.position.set(sp.x, sp.y);
      node.ring.position.set(sp.x, sp.y);
      node.label.position.set(sp.x, sp.y + 1);
      // Throttle label rasterization: only update when the rounded-to-5
      // value changes. Avoids per-tick text relayout on mobile.
      const shown = Math.round(a.strength / 5) * 5;
      if (shown !== node.lastShown) {
        node.label.text = String(shown);
        node.lastShown = shown;
      }
      // Veteran chevrons + fortify outline. Cheap redraws when state
      // crosses a threshold; the hull is tiny so re-rendering costs
      // are bounded.
      const tier = Math.min(5, Math.floor(a.kills / 2));
      const fortified = a.fortifyTicks >= 50 ? 1 : 0;
      if (tier !== node.lastTier || fortified !== node.lastFortified) {
        node.lastTier = tier;
        node.lastFortified = fortified;
        const palette = this.game.config.PLAYER_COLORS;
        const c = palette[a.owner] ?? [255, 255, 255, 255];
        const tint = (c[0] << 16) | (c[1] << 8) | c[2];
        drawHull(node.hull, tint, tier, fortified === 1);
      }
      const z = Math.max(0.7, Math.min(2.2, this.renderer.zoom * 0.18));
      node.hull.scale.set(z);
      node.ring.scale.set(z);
      // Label scales conservatively so big zooms don't dwarf the icon.
      node.label.scale.set(Math.max(0.7, Math.min(1.2, z)));
      const isSel = a.id === this._selectedId;
      node.ring.visible = isSel;
      if (isSel) {
        const t = (Math.sin(now * 0.008) + 1) * 0.5;
        node.ring.alpha = 0.5 + t * 0.5;
      }
    }
    // Drop nodes for armies that no longer exist (killed / merged).
    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.hull.destroy();
        node.ring.destroy();
        node.label.destroy();
        this.nodes.delete(id);
        if (id === this._selectedId) this._selectedId = 0;
      }
    }
  }

  private _mkNode(a: Army): ArmyNode {
    const palette = this.game.config.PLAYER_COLORS;
    const c = palette[a.owner] ?? [255, 255, 255, 255];
    const tint = (c[0] << 16) | (c[1] << 8) | c[2];
    const tier = Math.min(5, Math.floor(a.kills / 2));
    const fortified = a.fortifyTicks >= 50;
    const hull = new Graphics();
    drawHull(hull, tint, tier, fortified);
    // Selection ring (hidden unless selected).
    const ring = new Graphics();
    ring.circle(0, 0, 13).stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    ring.visible = false;
    // Strength badge — short white-on-dark text below the icon.
    const label = new Text({
      text: String(a.strength | 0),
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 9,
        fontWeight: '700',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3, alpha: 0.85 },
        align: 'center',
      },
    });
    label.anchor.set(0.5, -0.55);
    return {
      hull, ring, label,
      lastShown: Math.round(a.strength / 5) * 5,
      lastTier: Math.min(5, Math.floor(a.kills / 2)),
      lastFortified: a.fortifyTicks >= 50 ? 1 : 0,
    };
  }
}

/** Draw the army icon. Veteran tier adds gold chevrons inside the
 *  hull (1 chevron per tier, up to 3 visible). Fortified adds a
 *  gold border so dug-in defenders are obvious at a glance. */
function drawHull(g: Graphics, tint: number, tier: number, fortified: boolean): void {
  g.clear();
  const borderColor = fortified ? 0xf6c447 : 0x000000;
  const borderWidth = fortified ? 2 : 1.2;
  const borderAlpha = fortified ? 0.95 : 0.7;
  g.roundRect(-7, -7, 14, 14, 2)
    .fill({ color: tint, alpha: 0.95 })
    .stroke({ color: borderColor, width: borderWidth, alpha: borderAlpha });
  // Two horizontal stripes (stack reading).
  g.rect(-5, -3, 10, 1.4).fill({ color: 0x000000, alpha: 0.5 });
  g.rect(-5,  1.6, 10, 1.4).fill({ color: 0x000000, alpha: 0.5 });
  // Veteran chevrons (gold). 1-3 visible; 4-5 turn the second row red.
  const chevTint = tier >= 4 ? 0xff8c2a : 0xf6c447;
  const drawChev = (cy: number) => {
    g.poly([-3, cy + 1, 0, cy - 1, 3, cy + 1])
      .stroke({ color: chevTint, width: 1.0, alpha: 0.95 });
  };
  if (tier >= 1) drawChev(-3);
  if (tier >= 2) drawChev(1.6);
  if (tier >= 3) drawChev(5.0);
}
