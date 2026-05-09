// Turns a World into Pixi Graphics layers. Pure rendering, no game logic.
//
// Three layers:
//   terrain  — base terrain colors (water / sand / grass). Always alpha 1.
//   tint     — region owner color tints over land. Fades out at tactical zoom.
//   borders  — vector lines along boundaries (region-vs-region and land-vs-water).
//              Fades out at tactical zoom too.

import { Graphics } from 'pixi.js';
import { type World, TERRAIN_WATER, TERRAIN_SAND } from './world';

const COLOR_WATER = 0x3a6090;
const COLOR_SAND = 0xc9b070;
const COLOR_GRASS = 0x4a7a3e;

const TINT_ALPHA = 0.55;
const BORDER_COLOR = 0x111111;
const BORDER_WIDTH = 1.5;
const BORDER_ALPHA = 0.85;

export interface MapLayers {
  terrainLayer: Graphics;
  tintLayer: Graphics;
  borderLayer: Graphics;
}

export function buildMapLayers(world: World, tileSize: number): MapLayers {
  const { width, height, terrain, regionOf, regions } = world;

  // 1. Terrain.
  const terrainLayer = new Graphics();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = terrain[y * width + x];
      const color = t === TERRAIN_WATER ? COLOR_WATER : t === TERRAIN_SAND ? COLOR_SAND : COLOR_GRASS;
      terrainLayer.rect(x * tileSize, y * tileSize, tileSize, tileSize).fill(color);
    }
  }

  // 2. Region tints (land only).
  const tintLayer = new Graphics();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = regionOf[y * width + x]!;
      if (r < 0) continue;
      tintLayer.rect(x * tileSize, y * tileSize, tileSize, tileSize).fill({ color: regions[r]!.color, alpha: TINT_ALPHA });
    }
  }

  // 3. Borders. For each tile, if right/bottom neighbor has a different
  //    "region or water" identity, stroke the shared edge.
  const borderLayer = new Graphics();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const myR = regionOf[i]!;
      // Right edge.
      if (x < width - 1) {
        const nR = regionOf[i + 1]!;
        if (nR !== myR) {
          borderLayer.moveTo((x + 1) * tileSize, y * tileSize).lineTo((x + 1) * tileSize, (y + 1) * tileSize);
        }
      }
      // Bottom edge.
      if (y < height - 1) {
        const nR = regionOf[i + width]!;
        if (nR !== myR) {
          borderLayer.moveTo(x * tileSize, (y + 1) * tileSize).lineTo((x + 1) * tileSize, (y + 1) * tileSize);
        }
      }
    }
  }
  borderLayer.stroke({ width: BORDER_WIDTH, color: BORDER_COLOR, alpha: BORDER_ALPHA });

  return { terrainLayer, tintLayer, borderLayer };
}
