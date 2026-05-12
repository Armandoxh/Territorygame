// Grand-map resource overlay. Renders a small terrain-feature glyph
// on every tile that has a resource — mountains for ore, trees for
// forest, fields for farmland, fallback circle-with-letter for any
// resource that hasn't gotten a custom glyph yet.
//
// Each glyph kind is batched into one Graphics object so the entire
// world's worth of resource decoration is just a handful of draw
// calls. Adding a new glyph: add the enum value in resources.ts and
// a matching draw function below; the renderer dispatches on
// def.glyph automatically.

import { Container, Graphics, Text } from 'pixi.js';
import type { World } from './world';
import { getResourceDef, type ResourceGlyph, type ResourceDef } from './resources';

export interface MapResourceLayer {
  container: Container;
  destroy(): void;
}

export function createMapResourceLayer(world: World, tileSize: number): MapResourceLayer {
  const container = new Container();

  // One Graphics per glyph kind — keeps draw count tiny even with
  // thousands of resource tiles.
  const graphicsByGlyph: Record<ResourceGlyph, Graphics> = {
    mountain: new Graphics(),
    tree: new Graphics(),
    farm: new Graphics(),
    circle: new Graphics(),
  };
  // Fallback-circle resources also need text labels; collect them
  // and add as a Container so the Graphics can stay path-only.
  const circleLabels = new Container();

  // Pre-resolve def per resource id for the hot loop.
  const defById = new Map<number, ResourceDef>();
  for (let i = 0; i < world.resourceOf.length; i++) {
    const rid = world.resourceOf[i]!;
    if (rid < 0) continue;
    if (!defById.has(rid)) defById.set(rid, getResourceDef(rid));
  }

  for (let i = 0; i < world.resourceOf.length; i++) {
    const rid = world.resourceOf[i]!;
    if (rid < 0) continue;
    const def = defById.get(rid)!;
    const tx = i % world.width;
    const ty = (i / world.width) | 0;
    const cx = tx * tileSize + tileSize / 2;
    const cy = ty * tileSize + tileSize / 2;
    drawGlyph(graphicsByGlyph[def.glyph], def, cx, cy, tileSize);
    if (def.glyph === 'circle') {
      const t = new Text({
        text: def.letter,
        style: {
          fontFamily: 'monospace',
          fontSize: 7,
          fontWeight: '700',
          fill: 0x111111,
        },
      });
      t.anchor.set(0.5, 0.5);
      t.position.set(cx, cy);
      circleLabels.addChild(t);
    }
  }

  // Z-order: trees over fields (forest reads through farmland edge),
  // mountains over both (silhouettes pop most).
  container.addChild(graphicsByGlyph.farm);
  container.addChild(graphicsByGlyph.tree);
  container.addChild(graphicsByGlyph.mountain);
  container.addChild(graphicsByGlyph.circle);
  container.addChild(circleLabels);

  return {
    container,
    destroy: () => container.destroy({ children: true }),
  };
}

function drawGlyph(g: Graphics, def: ResourceDef, cx: number, cy: number, tile: number) {
  switch (def.glyph) {
    case 'mountain':
      drawMountain(g, cx, cy, tile);
      break;
    case 'tree':
      drawTree(g, cx, cy, tile);
      break;
    case 'farm':
      drawFarm(g, cx, cy, tile);
      break;
    case 'circle':
      drawCircleFallback(g, def, cx, cy);
      break;
  }
}

// All glyphs target ~0.4-0.6 of the tile so adjacent tiles in a patch
// merge visually into a mass (forest looks like a forest, range like
// a range). Tweak the magic factors here to taste — never edit
// individual fill calls in the world-render loop.

function drawMountain(g: Graphics, cx: number, cy: number, tile: number) {
  // Two-tone silhouette peak: light side + shadow side.
  const w = tile * 0.42;
  const h = tile * 0.42;
  const baseY = cy + h * 0.45;
  const peakX = cx;
  const peakY = cy - h * 0.55;
  // Light side (left).
  g.moveTo(peakX, peakY).lineTo(cx - w, baseY).lineTo(cx, baseY).closePath();
  g.fill({ color: 0x9c948b });
  // Shadow side (right).
  g.moveTo(peakX, peakY).lineTo(cx + w, baseY).lineTo(cx, baseY).closePath();
  g.fill({ color: 0x5e5852 });
  // Tiny snow cap for readability when peaks are small.
  g.moveTo(peakX, peakY).lineTo(cx - w * 0.25, peakY + h * 0.22).lineTo(cx + w * 0.25, peakY + h * 0.22).closePath();
  g.fill({ color: 0xefe9df });
  // Dark outline for crisp pop.
  g.moveTo(cx - w, baseY).lineTo(peakX, peakY).lineTo(cx + w, baseY).stroke({
    width: 0.6,
    color: 0x2a2622,
    alpha: 0.85,
  });
}

function drawTree(g: Graphics, cx: number, cy: number, tile: number) {
  // Small evergreen-ish silhouette: trunk + canopy triangle.
  const trunkW = Math.max(1, tile * 0.08);
  const trunkH = tile * 0.18;
  const canopyW = tile * 0.34;
  const canopyH = tile * 0.42;
  g.rect(cx - trunkW / 2, cy + canopyH * 0.1, trunkW, trunkH).fill({ color: 0x4a3520 });
  // Two-tone canopy: dark base + lighter top for a hint of depth.
  g.moveTo(cx, cy - canopyH * 0.55)
    .lineTo(cx - canopyW, cy + canopyH * 0.15)
    .lineTo(cx + canopyW, cy + canopyH * 0.15)
    .closePath();
  g.fill({ color: 0x244e1c });
  g.moveTo(cx, cy - canopyH * 0.55)
    .lineTo(cx - canopyW * 0.5, cy - canopyH * 0.15)
    .lineTo(cx + canopyW * 0.5, cy - canopyH * 0.15)
    .closePath();
  g.fill({ color: 0x3a7a2c });
}

function drawFarm(g: Graphics, cx: number, cy: number, tile: number) {
  // Plowed-field square with a cross of furrows. Soft warm fill so
  // farmland reads against the green grass underneath.
  const s = tile * 0.6;
  const half = s / 2;
  g.rect(cx - half, cy - half, s, s).fill({ color: 0xd9b14a });
  g.rect(cx - half, cy - half, s, s).stroke({ width: 0.5, color: 0x6e4f12, alpha: 0.8 });
  // Furrow cross.
  g.moveTo(cx - half, cy).lineTo(cx + half, cy).stroke({
    width: 0.5,
    color: 0x6e4f12,
    alpha: 0.7,
  });
  g.moveTo(cx, cy - half).lineTo(cx, cy + half).stroke({
    width: 0.5,
    color: 0x6e4f12,
    alpha: 0.7,
  });
}

function drawCircleFallback(g: Graphics, def: ResourceDef, cx: number, cy: number) {
  // The "you added a new resource without a custom glyph yet" path.
  // Still visible on the grand map; replace with a real drawing
  // function when you settle on the visual.
  const r = 4;
  g.circle(cx, cy, r).fill({ color: def.color, alpha: 0.92 });
  g.circle(cx, cy, r).stroke({ width: 0.8, color: 0x111111, alpha: 0.7 });
}
