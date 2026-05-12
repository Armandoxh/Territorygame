// The player's single placeholder army.
//
// Position-only — moving the army does not claim, conquer, or otherwise
// touch territory. Combat / claim semantics are future nails.
//
// Movement is a continuous "march" at a fixed world-units-per-second
// speed; the army is never teleported. A march can be a single point
// (legacy AI usage, straight-line) or a list of waypoints (player
// pathfinding, multi-hop through the region graph). Mid-march re-
// grabbing is supported: the march pauses on touch, and the next
// valid drop replaces the destination starting from the army's
// current paused position. An invalid drop preserves the in-flight
// march (the army resumes toward its previous destination).
//
// Drop validation lives in the optional `pathfind` callback: given the
// source region and the drop region it returns a list of regions to
// traverse (or null to reject). Endrag converts that into waypoints.
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
  // Where the army starts. Each nation has its own home; this used to
  // hardcode world.playerRegionId but is now per-nation for multi-AI.
  homeRegionId: number;
  // Glyph color. Was derived from world.regions[playerRegionId].color;
  // now passed explicitly so AI armies can wear their nation's color.
  color: number;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  // Optional drop-validator. Given a source region (where the army is
  // standing) and a drop region (where the player released), return a
  // list of region IDs forming a passable path (inclusive of source +
  // destination), or null to reject the drop. AIs don't pass this and
  // fall back to straight-line marchTo; the player passes a function
  // that BFSes the region graph with the current ownership rules.
  pathfind?: (fromRegion: number, toRegion: number) => number[] | null;
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
  // setRegiments / future recruitment APIs.
  getRegiments(): readonly Regiment[];
  // Replace the army's regiment list. Used by combat resolution to apply
  // casualties. Empty / zero-count regiments are dropped.
  setRegiments(next: readonly Regiment[]): void;
  hitTest(sx: number, sy: number): boolean;
  startDrag(sx: number, sy: number): void;
  updateDrag(sx: number, sy: number): void;
  // Returns true if the drop committed a new march, false if cancelled.
  // A cancelled drop preserves any pre-existing march.
  endDrag(sx: number, sy: number): boolean;
  // Programmatic march. Used by AI nations (no drag handler). Sets the
  // destination directly with no neighbor-region validation; the caller
  // is responsible for picking a sensible target.
  marchTo(toX: number, toY: number): void;
  // True if the army is currently mid-march. Used by AI to gate
  // expansion decisions on "is this army idle right now."
  isMarching(): boolean;
  // Reset position and clear any in-flight march. Used when a wiped
  // army is being rebuilt by recruitment — the empty container has
  // been hanging out at the death site, and new recruits should
  // appear at the capital instead.
  respawnAt(wx: number, wy: number): void;
  destroy(): void;
}

export function createArmy(deps: ArmyDeps): Army {
  const { world, tileSize, homeRegionId, color, screenToWorld, worldToScreen, pathfind } = deps;
  const playerColor = color;

  const home = world.regions[homeRegionId]!;
  const pos = {
    x: home.centroidX * tileSize + tileSize / 2 + ARMY_HOME_OFFSET_X,
    y: home.centroidY * tileSize + tileSize / 2,
  };
  // Active march. Waypoints visited in order from index 0. Final
  // waypoint is the drop point (or the single point for AI marchTo).
  // targetRegionId caches the region containing the final waypoint
  // so getStatus / readout can report it without recomputing.
  type March = {
    waypoints: { x: number; y: number }[];
    idx: number;
    targetRegionId: number;
  };
  let march: March | null = null;
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
    let prevX = pos.x;
    let prevY = pos.y;
    for (let i = march.idx; i < march.waypoints.length; i++) {
      const w = march.waypoints[i]!;
      marchLine
        .moveTo(prevX, prevY)
        .lineTo(w.x, w.y)
        .stroke({ width: MARCH_LINE_WIDTH, color: MARCH_LINE_COLOR, alpha: MARCH_LINE_ALPHA });
      prevX = w.x;
      prevY = w.y;
    }
  }

  function tick(dtSec: number) {
    if (dragging || !march) {
      redrawMarchLine();
      return;
    }
    const target = march.waypoints[march.idx]!;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      march.idx++;
      if (march.idx >= march.waypoints.length) march = null;
      redrawMarchLine();
      return;
    }
    const step = MARCH_SPEED * dtSec;
    if (step >= dist) {
      pos.x = target.x;
      pos.y = target.y;
      march.idx++;
      if (march.idx >= march.waypoints.length) march = null;
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
      targetRegionId: march ? march.targetRegionId : -1,
    };
  }

  function hitTest(sx: number, sy: number): boolean {
    // No soldiers left → not hittable. Container is also hidden in
    // setRegiments, so this is belt-and-suspenders.
    if (regiments.length === 0) return false;
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
    if (dropRegion === sourceRegion) {
      // Same region — no pathfinding needed. Single-waypoint march to
      // the drop point.
      march = { waypoints: [{ x: drop.x, y: drop.y }], idx: 0, targetRegionId: dropRegion };
      redrawMarchLine();
      return true;
    }
    if (!pathfind) {
      redrawMarchLine();
      return false;
    }
    const path = pathfind(sourceRegion, dropRegion);
    if (!path || path.length < 2) {
      redrawMarchLine();
      return false;
    }
    // path[0] is sourceRegion (skip it — already standing there).
    // Intermediate regions: aim for the centroid. Final region: aim
    // for the actual drop point so the player can pick a precise
    // landing spot.
    const waypoints: { x: number; y: number }[] = [];
    for (let i = 1; i < path.length - 1; i++) {
      const r = world.regions[path[i]!]!;
      waypoints.push({
        x: r.centroidX * tileSize + tileSize / 2,
        y: r.centroidY * tileSize + tileSize / 2,
      });
    }
    waypoints.push({ x: drop.x, y: drop.y });
    march = { waypoints, idx: 0, targetRegionId: dropRegion };
    redrawMarchLine();
    return true;
  }

  function marchTo(toX: number, toY: number) {
    march = {
      waypoints: [{ x: toX, y: toY }],
      idx: 0,
      targetRegionId: regionAt(toX, toY),
    };
    redrawMarchLine();
  }

  function isMarching() {
    return march !== null;
  }

  function respawnAt(wx: number, wy: number) {
    pos.x = wx;
    pos.y = wy;
    sprite.position.set(pos.x, pos.y);
    march = null;
    dragging = false;
    redrawMarchLine();
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
    setRegiments: (next) => {
      regiments.length = 0;
      for (const r of next) {
        if (r.count > 0) regiments.push({ type: r.type, count: r.count });
      }
      // Hide the strategic glyph if the army is wiped out. The army
      // object stays around (so loadMap can tear it down cleanly) but
      // it's not visible or interactive anymore.
      container.visible = regiments.length > 0;
    },
    hitTest,
    startDrag,
    updateDrag,
    endDrag,
    marchTo,
    isMarching,
    respawnAt,
    destroy,
  };
}
