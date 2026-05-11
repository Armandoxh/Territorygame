// Turns a World + nation ownership state into Pixi Graphics layers.
//
// Layers (back-to-front):
//   terrain  — base terrain colors. Always alpha 1. Static after build.
//   tint     — region OWNER color tints. Owned regions get their
//              nation's color; neutral regions get a muted gray.
//              Rebuilt on ownership change.
//   borders  — vector lines along boundaries (region-vs-region,
//              land-vs-water). Static after build (topology doesn't
//              change at runtime).
//   player   — extra-thick bright outline along the player's owned
//              regions only. Rebuilt on ownership change.
//   capital  — per-nation capital markers (one per nation, not per
//              region). Color follows the current owner of that
//              region — so if the player captures an AI's capital,
//              the marker turns player-colored. Player's main
//              starting capital gets a bigger glyph with a white
//              ring. Rebuilt on ownership change.

import { Graphics } from 'pixi.js';
import { type World, TERRAIN_WATER, TERRAIN_SAND } from './world';
import type { Nation } from './nation';

const COLOR_WATER = 0x3a6090;
const COLOR_SAND = 0xc9b070;
const COLOR_GRASS = 0x4a7a3e;

// Neutral (unowned) region: very faint cool-gray tint. Distinct from
// owned regions without overwhelming the terrain underneath.
const NEUTRAL_COLOR = 0x8b8d92;
const NEUTRAL_TINT_ALPHA = 0.18;
const PLAYER_TINT_ALPHA = 0.55;
const AI_TINT_ALPHA = 0.38;

const BORDER_COLOR = 0x111111;
const BORDER_WIDTH = 1.5;
const BORDER_ALPHA = 0.7;

const PLAYER_BORDER_COLOR = 0xffffff;
const PLAYER_BORDER_WIDTH = 3;
const PLAYER_BORDER_ALPHA = 0.95;

const CAPITAL_RADIUS_PLAYER_MAIN = 10;
const CAPITAL_RADIUS_OTHER = 6;
const CAPITAL_OUTLINE_WIDTH = 1.5;
const CAPITAL_OUTLINE_COLOR = 0x111111;
const CAPITAL_PLAYER_RING_COLOR = 0xffffff;
const CAPITAL_PLAYER_RING_WIDTH = 2.5;

export interface MapLayers {
  terrainLayer: Graphics;
  tintLayer: Graphics;
  borderLayer: Graphics;
  playerLayer: Graphics;
  capitalLayer: Graphics;
}

function ownerColor(regionId: number, regionOwner: Int16Array, nations: Nation[]): { color: number; alpha: number } {
  const ownerId = regionOwner[regionId]!;
  if (ownerId < 0) return { color: NEUTRAL_COLOR, alpha: NEUTRAL_TINT_ALPHA };
  const n = nations[ownerId]!;
  return { color: n.color, alpha: n.isPlayer ? PLAYER_TINT_ALPHA : AI_TINT_ALPHA };
}

export function buildMapLayers(
  world: World,
  tileSize: number,
  regionOwner: Int16Array,
  nations: Nation[],
): MapLayers {
  const { width, height, terrain } = world;

  // 1. Terrain — static.
  const terrainLayer = new Graphics();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = terrain[y * width + x];
      const color = t === TERRAIN_WATER ? COLOR_WATER : t === TERRAIN_SAND ? COLOR_SAND : COLOR_GRASS;
      terrainLayer.rect(x * tileSize, y * tileSize, tileSize, tileSize).fill(color);
    }
  }

  // 2-5: dynamic layers initialized empty, populated by rebuildOwnerLayers.
  const tintLayer = new Graphics();
  const borderLayer = new Graphics();
  const playerLayer = new Graphics();
  const capitalLayer = new Graphics();

  // Borders are static — based on world topology only. Draw once.
  drawBorders(borderLayer, world, tileSize);

  rebuildOwnerLayers({ tintLayer, playerLayer, capitalLayer }, world, tileSize, regionOwner, nations);

  return { terrainLayer, tintLayer, borderLayer, playerLayer, capitalLayer };
}

// Repaints the three ownership-driven layers (tint, player highlight,
// capital markers). Call this after any region changes hands.
export function rebuildOwnerLayers(
  layers: { tintLayer: Graphics; playerLayer: Graphics; capitalLayer: Graphics },
  world: World,
  tileSize: number,
  regionOwner: Int16Array,
  nations: Nation[],
) {
  const { width, height, regionOf } = world;
  const playerNation = nations.find((n) => n.isPlayer);
  const playerId = playerNation ? playerNation.id : -1;

  // ---- Tint ----
  layers.tintLayer.clear();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = regionOf[y * width + x]!;
      if (r < 0) continue;
      const { color, alpha } = ownerColor(r, regionOwner, nations);
      layers.tintLayer.rect(x * tileSize, y * tileSize, tileSize, tileSize).fill({ color, alpha });
    }
  }

  // ---- Player highlight (thick white outline around player-owned region
  //      boundaries). Same algorithm as before, just keyed on regionOwner
  //      === playerId instead of the static playerRegionId. ----
  layers.playerLayer.clear();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const myR = regionOf[i]!;
      const meIsPlayer = myR >= 0 && regionOwner[myR] === playerId;
      if (x < width - 1) {
        const nR = regionOf[i + 1]!;
        const otherIsPlayer = nR >= 0 && regionOwner[nR] === playerId;
        if (meIsPlayer !== otherIsPlayer) {
          layers.playerLayer.moveTo((x + 1) * tileSize, y * tileSize).lineTo((x + 1) * tileSize, (y + 1) * tileSize);
        }
      }
      if (y < height - 1) {
        const nR = regionOf[i + width]!;
        const otherIsPlayer = nR >= 0 && regionOwner[nR] === playerId;
        if (meIsPlayer !== otherIsPlayer) {
          layers.playerLayer.moveTo(x * tileSize, (y + 1) * tileSize).lineTo((x + 1) * tileSize, (y + 1) * tileSize);
        }
      }
    }
  }
  layers.playerLayer.stroke({ width: PLAYER_BORDER_WIDTH, color: PLAYER_BORDER_COLOR, alpha: PLAYER_BORDER_ALPHA });

  // ---- Capital markers — one per nation. Color follows current owner
  //      of that region (so captured capitals show in the captor's color).
  //      Player's main starting capital gets the bigger glyph + ring. ----
  layers.capitalLayer.clear();
  for (const n of nations) {
    const region = world.regions[n.capitalRegionId]!;
    const cx = region.centroidX * tileSize + tileSize / 2;
    const cy = region.centroidY * tileSize + tileSize / 2;
    const ownerId = regionOwner[n.capitalRegionId]!;
    const owner = ownerId >= 0 ? nations[ownerId]! : null;
    const fillColor = owner ? owner.color : NEUTRAL_COLOR;
    const isPlayerHome = n.isPlayer;  // only player's main capital gets the ring
    const radius = isPlayerHome ? CAPITAL_RADIUS_PLAYER_MAIN : CAPITAL_RADIUS_OTHER;
    layers.capitalLayer.circle(cx, cy, radius).fill(fillColor);
    layers.capitalLayer.circle(cx, cy, radius).stroke({
      width: CAPITAL_OUTLINE_WIDTH,
      color: CAPITAL_OUTLINE_COLOR,
      alpha: 1,
    });
    if (isPlayerHome) {
      layers.capitalLayer.circle(cx, cy, radius + CAPITAL_PLAYER_RING_WIDTH).stroke({
        width: CAPITAL_PLAYER_RING_WIDTH,
        color: CAPITAL_PLAYER_RING_COLOR,
        alpha: 1,
      });
    }
  }
}

function drawBorders(borderLayer: Graphics, world: World, tileSize: number) {
  const { width, height, regionOf } = world;
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
}
