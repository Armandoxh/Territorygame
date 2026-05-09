// The player's single placeholder army.
//
// Position-only — moving the army does not claim, conquer, or otherwise
// touch territory. Combat / claim semantics are future nails. The army
// demonstrates the adjacency graph (nail #4) end-to-end: the drop region
// must be the army's current region or a graph-neighbor of it.
//
// Movement is a continuous "march" at a fixed world-units-per-second
// speed; the army is never teleported. Mid-march re-grabbing is supported:
// the march pauses on touch, and the next valid drop replaces the
// destination starting from the army's current paused position. An
// invalid drop preserves the in-flight march (the army resumes toward
// its previous destination).
//
// Visual: small player-colored square, with a translucent ghost following
// the finger during drag and a thin trailing line to the active march
// destination while in motion.

import { Container, Graphics } from 'pixi.js';
import type { World } from './world';
import type { UnitType } from './units';

// One homogeneous block of soldiers of a single unit type. An army holds
// an array of these. Per-regiment combat state (HP, morale, facing) lands
// in later combat nails; for now we only track type + headcount.
export interface Regiment {
  type: UnitType;
  count: number;
}

// Default starting composition for a fresh army (player or enemy).
// User picked: identical comps both sides, 2 unit types this nail.
const DEFAULT_REGIMENTS: Readonly<Regiment[]> = [
  { type: 'infantry', count: 50 },
  { type: 'cavalry', count: 20 },
];

const ARMY_SIZE = 12;
const ARMY_OUTLINE_WIDTH = 1.5;
const ARMY_OUTLINE_COLOR = 0x111111;
// Initial offset from the capital centroid so the army glyph doesn't sit
// directly on top of the capital marker.
const ARMY_HOME_OFFSET_X = 14;
const ARMY_GHOST_ALPHA = 0.6;

const DRAG_LINE_COLOR = 0xffffff;
const DRAG_LINE_WIDTH = 2;
const DRAG_LINE_ALPHA = 0.85;

const MARCH_LINE_COLOR = 0xffffff;
const MARCH_LINE_WIDTH = 1.5;
const MARCH_LINE_ALPHA = 0.35;

// "Slow march" — 30 world units / sec. A typical neighbor hop (~200 units)
// reads as a real journey at ~6 seconds.
const MARCH_SPEED = 30;

// Generous fixed screen-space hit radius. Independent of zoom so the
// finger target stays usable at strategic zoom where the army is tiny.
const ARMY_HIT_RADIUS = 22;

export interface ArmyDeps {
  world: World;
  tileSize: number;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
}

export interface ArmyStatus {
  marching: boolean;
  // Region containing the army's current position. -1 if over water (only
  // possible transiently, e.g. mid-march clipping a coastal pixel).
  regionId: number;
  // Region containing the active march destination, or -1 if stationary.
  targetRegionId: number;
}

export interface Army {
  container: Container;
  // Advance any in-flight march. Caller passes elapsed seconds.
  tick(dtSec: number): void;
  getStatus(): ArmyStatus;
  getPos(): { x: number; y: number };
  // Returns the army's regiments. Read-only snapshot — mutate only via
  // future combat / recruitment APIs.
  getRegiments(): readonly Regiment[];
  hitTest(sx: number, sy: number): boolean;
  startDrag(sx: number, sy: number): void;
  updateDrag(sx: number, sy: number): void;
  // Returns true if the drop committed a new march, false if cancelled.
  // A cancelled drop preserves any pre-existing march.
  endDrag(sx: number, sy: number): boolean;
  destroy(): void;
}

export function createArmy(deps: ArmyDeps): Army {
  const { world, tileSize, screenToWorld, worldToScreen } = deps;
  const playerColor = world.regions[world.playerRegionId]!.color;

  const home = world.regions[world.playerRegionId]!;
  const pos = {
    x: home.centroidX * tileSize + tileSize / 2 + ARMY_HOME_OFFSET_X,
    y: home.centroidY * tileSize + tileSize / 2,
  };
  let march: { toX: number; toY: number } | null = null;
  let dragging = false;
  const regiments: Regiment[] = DEFAULT_REGIMENTS.map((r) => ({ ...r }));

  const container = new Container();
  const marchLine = new Graphics();
  const dragLine = new Graphics();
  const sprite = new Graphics();
  const ghost = new Graphics();

  drawSquare(sprite, playerColor, 1);
  drawSquare(ghost, playerColor, ARMY_GHOST_ALPHA);
  ghost.visible = false;

  container.addChild(marchLine);
  container.addChild(dragLine);
  container.addChild(sprite);
  container.addChild(ghost);

  sprite.position.set(pos.x, pos.y);

  function drawSquare(g: Graphics, color: number, alpha: number) {
    const half = ARMY_SIZE / 2;
    g.clear();
    g.rect(-half, -half, ARMY_SIZE, ARMY_SIZE).fill({ color, alpha });
    g.rect(-half, -half, ARMY_SIZE, ARMY_SIZE).stroke({
      width: ARMY_OUTLINE_WIDTH,
      color: ARMY_OUTLINE_COLOR,
      alpha,
    });
  }

  function regionAt(wx: number, wy: number): number {
    const tx = Math.floor(wx / tileSize);
    const ty = Math.floor(wy / tileSize);
    if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return -1;
    return world.regionOf[ty * world.width + tx]!;
  }

  function redrawMarchLine() {
    marchLine.clear();
    if (!march || dragging) return;
    marchLine
      .moveTo(pos.x, pos.y)
      .lineTo(march.toX, march.toY)
      .stroke({ width: MARCH_LINE_WIDTH, color: MARCH_LINE_COLOR, alpha: MARCH_LINE_ALPHA });
  }

  function tick(dtSec: number) {
    if (dragging || !march) {
      redrawMarchLine();
      return;
    }
    const dx = march.toX - pos.x;
    const dy = march.toY - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      march = null;
      redrawMarchLine();
      return;
    }
    const step = MARCH_SPEED * dtSec;
    if (step >= dist) {
      pos.x = march.toX;
      pos.y = march.toY;
      march = null;
    } else {
      pos.x += (dx / dist) * step;
      pos.y += (dy / dist) * step;
    }
    sprite.position.set(pos.x, pos.y);
    redrawMarchLine();
  }

  function getStatus(): ArmyStatus {
    return {
      marching: march !== null,
      regionId: regionAt(pos.x, pos.y),
      targetRegionId: march ? regionAt(march.toX, march.toY) : -1,
    };
  }

  function hitTest(sx: number, sy: number): boolean {
    const screen = worldToScreen(pos.x, pos.y);
    return (
      Math.abs(sx - screen.x) <= ARMY_HIT_RADIUS &&
      Math.abs(sy - screen.y) <= ARMY_HIT_RADIUS
    );
  }

  function startDrag(sx: number, sy: number) {
    dragging = true;
    ghost.visible = true;
    marchLine.clear();
    updateDrag(sx, sy);
  }

  function updateDrag(sx: number, sy: number) {
    const w = screenToWorld(sx, sy);
    ghost.position.set(w.x, w.y);
    dragLine.clear();
    dragLine
      .moveTo(pos.x, pos.y)
      .lineTo(w.x, w.y)
      .stroke({ width: DRAG_LINE_WIDTH, color: DRAG_LINE_COLOR, alpha: DRAG_LINE_ALPHA });
  }

  function endDrag(sx: number, sy: number): boolean {
    dragging = false;
    ghost.visible = false;
    dragLine.clear();

    const drop = screenToWorld(sx, sy);
    const dropRegion = regionAt(drop.x, drop.y);
    const sourceRegion = regionAt(pos.x, pos.y);
    if (dropRegion < 0 || sourceRegion < 0) {
      redrawMarchLine();
      return false;
    }
    const sameRegion = dropRegion === sourceRegion;
    const isNeighbor = world.regions[sourceRegion]!.neighbors.includes(dropRegion);
    if (!sameRegion && !isNeighbor) {
      redrawMarchLine();
      return false;
    }

    march = { toX: drop.x, toY: drop.y };
    redrawMarchLine();
    return true;
  }

  function destroy() {
    container.destroy({ children: true });
  }

  return {
    container,
    tick,
    getStatus,
    getPos: () => ({ x: pos.x, y: pos.y }),
    getRegiments: () => regiments,
    hitTest,
    startDrag,
    updateDrag,
    endDrag,
    destroy,
  };
}
