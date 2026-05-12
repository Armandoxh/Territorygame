// Grand-map resource overlay. Renders one icon per resource patch
// at the patch centroid: a small colored circle with the resource's
// letter inside. Always visible in strategic view; fades along with
// the rest of the strategic layer during region-zoom.
//
// Patches come from world.ts step 9. Each patch knows its resource
// id; we look up the def in resources.ts for color/letter. Adding
// a new resource is a one-line edit to RESOURCE_DEFS — this layer
// picks it up automatically.

import { Container, Graphics, Text } from 'pixi.js';
import type { World } from './world';
import { getResourceDef } from './resources';

const PATCH_ICON_RADIUS = 6;
const PATCH_LETTER_FONT_SIZE = 8;

export interface MapResourceLayer {
  container: Container;
  destroy(): void;
}

export function createMapResourceLayer(world: World, tileSize: number): MapResourceLayer {
  const container = new Container();
  for (const patch of world.patches) {
    const def = getResourceDef(patch.resourceId);
    const cx = patch.centroidX * tileSize + tileSize / 2;
    const cy = patch.centroidY * tileSize + tileSize / 2;
    const g = new Graphics();
    g.circle(0, 0, PATCH_ICON_RADIUS).fill({ color: def.color, alpha: 0.92 });
    g.circle(0, 0, PATCH_ICON_RADIUS).stroke({
      width: 1,
      color: 0x111111,
      alpha: 0.7,
    });
    g.position.set(cx, cy);
    const t = new Text({
      text: def.letter,
      style: {
        fontFamily: 'monospace',
        fontSize: PATCH_LETTER_FONT_SIZE,
        fontWeight: '700',
        fill: 0x111111,
      },
    });
    t.anchor.set(0.5, 0.5);
    t.position.set(cx, cy);
    container.addChild(g);
    container.addChild(t);
  }
  return {
    container,
    destroy: () => container.destroy({ children: true }),
  };
}
