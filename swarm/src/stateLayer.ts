// State (sub-region) overlay layer. Drawn under the camera transform
// and visible only when zoomed into a specific region. Renders:
//   - state borders (thin lines at tile-edges between adjacent states
//     within the same region)
//   - a resource icon at each state centroid (color-coded circle + letter)
//   - a stack of building icons (one per non-zero building line)
//
// One sub-container per region. Region-zoom shows just the active
// region's container; the rest stay hidden. Borders are baked once
// on world load; building icons get refreshed on-demand via
// refreshRegionBuildings(regionId).

import { Container, Graphics, Text } from 'pixi.js';
import type { World } from './world';
import { getResourceDef, matchingLineFor } from './resources';
import { getBuildings, BUILDING_LINES, type BuildingLine } from './buildings';

const STATE_BORDER_COLOR = 0x111111;
const STATE_BORDER_ALPHA = 0.65;
const STATE_BORDER_WIDTH = 0.8;

const RESOURCE_ICON_RADIUS = 8;

const BUILDING_ICON_RADIUS = 5;
const BUILDING_SETTLEMENT_COLOR = 0xe9b87a;  // straw
const BUILDING_FARMLAND_COLOR = 0xf2c11f;    // wheat (matches map tint)
const BUILDING_FORESTRY_COLOR = 0x7e5230;    // wood brown
const BUILDING_MINING_COLOR = 0x4a4540;      // slate (matches map tint)
const BUILDING_MERCHANT_COLOR = 0xc9b03e;    // brass

// Light highlight when a built line matches the state's resource —
// the "production boost in a future nail" gets a visual handle now
// so the player feels the matching rule.
const MATCH_HIGHLIGHT_COLOR = 0xffffff;
const MATCH_HIGHLIGHT_ALPHA = 0.9;

export interface StateLayer {
  container: Container;
  setVisibleRegion(regionId: number | null): void;
  refreshRegionBuildings(regionId: number): void;
  destroy(): void;
}

export function createStateLayer(world: World, tileSize: number): StateLayer {
  const container = new Container();
  container.visible = false;

  // One child container per region. Holds borders + icons for that region.
  const regionContainers: Container[] = world.regions.map(() => {
    const c = new Container();
    c.visible = false;
    container.addChild(c);
    return c;
  });

  // Per-region "buildings" sub-container so refresh can clear and redraw
  // just the icons without touching the static border/resource layer.
  const regionBuildingLayers: Container[] = world.regions.map((_r, i) => {
    const c = new Container();
    regionContainers[i]!.addChild(c);
    return c;
  });

  drawBorders();
  drawResourceIcons();
  for (let r = 0; r < world.regions.length; r++) {
    refreshRegionBuildings(r);
  }

  function drawBorders() {
    // For each tile, look at right + down neighbor; if same region but
    // different state, draw the shared edge. Edges go into the region's
    // border graphics.
    const borderG: Graphics[] = world.regions.map(() => {
      const g = new Graphics();
      return g;
    });
    const { width, height, regionOf, stateOf } = world;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const r = regionOf[i]!;
        if (r < 0) continue;
        const s = stateOf[i]!;
        if (x < width - 1) {
          const ni = i + 1;
          const nr = regionOf[ni]!;
          const ns = stateOf[ni]!;
          if (nr === r && ns !== s) {
            const ex = (x + 1) * tileSize;
            borderG[r]!
              .moveTo(ex, y * tileSize)
              .lineTo(ex, (y + 1) * tileSize);
          }
        }
        if (y < height - 1) {
          const ni = i + width;
          const nr = regionOf[ni]!;
          const ns = stateOf[ni]!;
          if (nr === r && ns !== s) {
            const ey = (y + 1) * tileSize;
            borderG[r]!
              .moveTo(x * tileSize, ey)
              .lineTo((x + 1) * tileSize, ey);
          }
        }
      }
    }
    for (let r = 0; r < borderG.length; r++) {
      borderG[r]!.stroke({
        width: STATE_BORDER_WIDTH,
        color: STATE_BORDER_COLOR,
        alpha: STATE_BORDER_ALPHA,
      });
      regionContainers[r]!.addChild(borderG[r]!);
    }
  }

  function drawResourceIcons() {
    for (const st of world.states) {
      const cx = st.centroidX * tileSize + tileSize / 2;
      const cy = st.centroidY * tileSize + tileSize / 2;
      const def = getResourceDef(st.resource);
      const color = def.color;
      const letter = def.letter;
      const g = new Graphics();
      g.circle(0, 0, RESOURCE_ICON_RADIUS).fill({ color, alpha: 0.92 });
      g.circle(0, 0, RESOURCE_ICON_RADIUS).stroke({
        width: 1.2,
        color: 0x111111,
        alpha: 0.85,
      });
      g.position.set(cx, cy);
      const txt = new Text({
        text: letter,
        style: {
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: '700',
          fill: 0x111111,
          align: 'center',
        },
      });
      txt.anchor.set(0.5, 0.5);
      txt.position.set(cx, cy);
      regionContainers[st.regionId]!.addChild(g);
      regionContainers[st.regionId]!.addChild(txt);
    }
  }

  function refreshRegionBuildings(regionId: number) {
    const layer = regionBuildingLayers[regionId]!;
    layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const region = world.regions[regionId]!;
    for (const sid of region.stateIds) {
      const st = world.states[sid]!;
      const b = getBuildings(sid);
      // Five slots per state: settlement, farmland, forestry, mining,
      // merchant. Render a small badge for each that has tier >= 1.
      // Stack them centered in a row below the resource icon — the
      // row width is computed from how many tiers are actually built
      // so it auto-centers regardless of count.
      const lines: BuildingLine[] = BUILDING_LINES;
      let drawn = 0;
      const builtCount = lines.reduce((n, ln) => n + (b[ln] > 0 ? 1 : 0), 0);
      const matchLine = matchingLineFor(st.resource);
      const cx = st.centroidX * tileSize + tileSize / 2;
      const cy = st.centroidY * tileSize + tileSize / 2;
      // Offset the row downward from resource icon.
      const rowY = cy + RESOURCE_ICON_RADIUS + BUILDING_ICON_RADIUS + 2;
      // Center the row around cx by starting at -(n-1)/2 * step.
      const step = BUILDING_ICON_RADIUS * 2 + 2;
      const startOff = -((builtCount - 1) / 2) * step;
      for (const line of lines) {
        const tier = b[line];
        if (tier === 0) continue;
        const isMatch = line === matchLine;
        const offX = startOff + drawn * step;
        const g = new Graphics();
        g.circle(0, 0, BUILDING_ICON_RADIUS).fill({
          color: buildingColor(line),
          alpha: 0.95,
        });
        if (isMatch) {
          g.circle(0, 0, BUILDING_ICON_RADIUS + 1.2).stroke({
            width: 1.4,
            color: MATCH_HIGHLIGHT_COLOR,
            alpha: MATCH_HIGHLIGHT_ALPHA,
          });
        } else {
          g.circle(0, 0, BUILDING_ICON_RADIUS).stroke({
            width: 0.8,
            color: 0x111111,
            alpha: 0.75,
          });
        }
        g.position.set(cx + offX, rowY);
        // Tier number on the badge so player sees progression.
        const t = new Text({
          text: String(tier),
          style: {
            fontFamily: 'monospace',
            fontSize: 7,
            fontWeight: '700',
            fill: 0x111111,
            align: 'center',
          },
        });
        t.anchor.set(0.5, 0.5);
        t.position.set(cx + offX, rowY);
        layer.addChild(g);
        layer.addChild(t);
        drawn++;
      }
    }
  }

  function setVisibleRegion(regionId: number | null) {
    if (regionId === null) {
      container.visible = false;
      for (const c of regionContainers) c.visible = false;
      return;
    }
    container.visible = true;
    for (let r = 0; r < regionContainers.length; r++) {
      regionContainers[r]!.visible = r === regionId;
    }
  }

  return {
    container,
    setVisibleRegion,
    refreshRegionBuildings,
    destroy: () => container.destroy({ children: true }),
  };
}

function buildingColor(line: BuildingLine): number {
  if (line === 'settlement') return BUILDING_SETTLEMENT_COLOR;
  if (line === 'farmland') return BUILDING_FARMLAND_COLOR;
  if (line === 'forestry') return BUILDING_FORESTRY_COLOR;
  if (line === 'mining') return BUILDING_MINING_COLOR;
  if (line === 'merchant') return BUILDING_MERCHANT_COLOR;
  return 0xffffff;
}
