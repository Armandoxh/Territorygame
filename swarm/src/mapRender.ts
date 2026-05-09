// Turns a World into Pixi Graphics layers. Pure rendering, no game logic.
//
// Layers (back-to-front):
//   terrain  — base terrain colors. Always alpha 1.
//   tint     — region owner color tints. Player region full alpha; others dim.
//   borders  — vector lines along boundaries (region-vs-region, land-vs-water).
//   player   — extra-thick bright outline along the player's region only.

import { Graphics } from 'pixi.js';
import { type World, TERRAIN_WATER, TERRAIN_SAND } from './world';

const COLOR_WATER = 0x3a6090;
const COLOR_SAND = 0xc9b070;
const COLOR_GRASS = 0x4a7a3e;

const TINT_ALPHA_PLAYER = 0.55;
const TINT_ALPHA_OTHER = 0.28;

const BORDER_COLOR = 0x111111;
const BORDER_WIDTH = 1.5;
const BORDER_ALPHA = 0.7;

const PLAYER_BORDER_COLOR = 0xffffff;
const PLAYER_BORDER_WIDTH = 3;
const PLAYER_BORDER_ALPHA = 0.95;

export interface MapLayers {
  terrainLayer: Graphics;
  tintLayer: Graphics;
  borderLayer: Graphics;
  playerLayer: Graphics;
}

export function buildMapLayers(world: World, tileSize: number): MapLayers {
  const { width, height, terrain, regionOf, regions, playerRegionId } = world;

  // 1. Terrain.
  const terrainLayer = new Graphics();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = terrain[y * width + x];
      const color = t === TERRAIN_WATER ? COLOR_WATER : t === TERRAIN_SAND ? COLOR_SAND : COLOR_GRASS;
      terrainLayer.rect(x * tileSize, y * tileSize, tileSize, tileSize).fill(color);
    }
  }

  // 2. Region tints. Player region gets full alpha; others dim so the
  //    player's territory pops at any zoom.
  const tintLayer = new Graphics();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = regionOf[y * width + x]!;
      if (r < 0) continue;
      const alpha = r === playerRegionId ? TINT_ALPHA_PLAYER : TINT_ALPHA_OTHER;
      tintLayer.rect(x * tileSize, y * tileSize, tileSize, tileSize).fill({ color: regions[r]!.color, alpha });
    }
  }

  // 3. Standard borders between any two differing region ids (covers
  //    region-vs-region AND land-vs-water).
  const borderLayer = new Graphics();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const myR = regionOf[i]!;
      if (x < width - 1) {
        const nR = regionOf[i + 1]!;
        if (nR !== myR) {
          borderLayer.moveTo((x + 1) * tileSize, y * tileSize).lineTo((x + 1) * tileSize, (y + 1) * tileSize);
        }
      }
      if (y < height - 1) {
        const nR = regionOf[i + width]!;
        if (nR !== myR) {
          borderLayer.moveTo(x * tileSize, (y + 1) * tileSize).lineTo((x + 1) * tileSize, (y + 1) * tileSize);
        }
      }
    }
  }
  borderLayer.stroke({ width: BORDER_WIDTH, color: BORDER_COLOR, alpha: BORDER_ALPHA });

  // 4. Player highlight: thicker bright stroke along the player's region
  //    boundary only. Drawn over the standard borders.
  const playerLayer = new Graphics();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const myR = regionOf[i]!;
      const meIsPlayer = myR === playerRegionId;
      if (x < width - 1) {
        const nR = regionOf[i + 1]!;
        const otherIsPlayer = nR === playerRegionId;
        if (meIsPlayer !== otherIsPlayer) {
          playerLayer.moveTo((x + 1) * tileSize, y * tileSize).lineTo((x + 1) * tileSize, (y + 1) * tileSize);
        }
      }
      if (y < height - 1) {
        const nR = regionOf[i + width]!;
        const otherIsPlayer = nR === playerRegionId;
        if (meIsPlayer !== otherIsPlayer) {
          playerLayer.moveTo(x * tileSize, (y + 1) * tileSize).lineTo((x + 1) * tileSize, (y + 1) * tileSize);
        }
      }
    }
  }
  playerLayer.stroke({ width: PLAYER_BORDER_WIDTH, color: PLAYER_BORDER_COLOR, alpha: PLAYER_BORDER_ALPHA });

  return { terrainLayer, tintLayer, borderLayer, playerLayer };
}
