// The player's single placeholder army. Position-only — moving it does not
// claim, conquer, or otherwise touch territory. Combat/claim semantics are
// future nails. The army demonstrates the adjacency graph (nail #4) end-to-
// end: you can only drop it on a region that borders your current region.
//
// Visual: small square in the player's color, sitting next to the capital
// dot. While dragging, the source army stays put; a translucent ghost
// follows the touch and a line connects them.

import { Container, Graphics } from 'pixi.js';
import type { World } from './world';

const ARMY_SIZE = 12;
const ARMY_OUTLINE_WIDTH = 1.5;
const ARMY_OUTLINE_COLOR = 0x111111;
// Offset from the capital centroid so both glyphs are visible at strategic
// zoom. 14 world units ≈ just past the player capital's 10px radius.
const ARMY_OFFSET_X = 14;
const ARMY_GHOST_ALPHA = 0.6;
const DRAG_LINE_COLOR = 0xffffff;
const DRAG_LINE_WIDTH = 2;
const DRAG_LINE_ALPHA = 0.85;

// Generous screen-space touch radius. Independent of zoom — at strategic
// zoom the army is tiny on screen but the hit area must stay finger-sized
// (~44px wide). Mobile-first.
const ARMY_HIT_RADIUS = 22;

export interface ArmyDeps {
  world: World;
  tileSize: number;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
}

export interface Army {
  container: Container;
  getRegionId(): number;
  hitTest(sx: number, sy: number): boolean;
  startDrag(sx: number, sy: number): void;
  updateDrag(sx: number, sy: number): void;
  // Returns the new region id on commit, or null if cancelled.
  endDrag(sx: number, sy: number): number | null;
  destroy(): void;
}

export function createArmy(deps: ArmyDeps): Army {
  const { world, tileSize, screenToWorld, worldToScreen } = deps;
  const playerColor = world.regions[world.playerRegionId]!.color;
  let regionId = world.playerRegionId;

  const container = new Container();
  const line = new Graphics();
  const sprite = new Graphics();
  const ghost = new Graphics();

  drawSquare(sprite, playerColor, 1);
  drawSquare(ghost, playerColor, ARMY_GHOST_ALPHA);
  ghost.visible = false;

  container.addChild(line);
  container.addChild(sprite);
  container.addChild(ghost);

  positionAt(regionId);

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

  function worldPosFor(rid: number): { x: number; y: number } {
    const r = world.regions[rid]!;
    const cx = r.centroidX * tileSize + tileSize / 2;
    const cy = r.centroidY * tileSize + tileSize / 2;
    return { x: cx + ARMY_OFFSET_X, y: cy };
  }

  function positionAt(rid: number) {
    const p = worldPosFor(rid);
    sprite.position.set(p.x, p.y);
  }

  function hitTest(sx: number, sy: number): boolean {
    const screen = worldToScreen(sprite.position.x, sprite.position.y);
    return (
      Math.abs(sx - screen.x) <= ARMY_HIT_RADIUS &&
      Math.abs(sy - screen.y) <= ARMY_HIT_RADIUS
    );
  }

  function startDrag(sx: number, sy: number) {
    ghost.visible = true;
    updateDrag(sx, sy);
  }

  function updateDrag(sx: number, sy: number) {
    const w = screenToWorld(sx, sy);
    ghost.position.set(w.x, w.y);
    const src = sprite.position;
    line.clear();
    line.moveTo(src.x, src.y).lineTo(w.x, w.y).stroke({
      width: DRAG_LINE_WIDTH,
      color: DRAG_LINE_COLOR,
      alpha: DRAG_LINE_ALPHA,
    });
  }

  function endDrag(sx: number, sy: number): number | null {
    ghost.visible = false;
    line.clear();

    const w = screenToWorld(sx, sy);
    const tx = Math.floor(w.x / tileSize);
    const ty = Math.floor(w.y / tileSize);
    if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return null;
    const target = world.regionOf[ty * world.width + tx]!;
    if (target < 0 || target === regionId) return null;
    if (!world.regions[regionId]!.neighbors.includes(target)) return null;

    regionId = target;
    positionAt(regionId);
    return regionId;
  }

  function destroy() {
    container.destroy({ children: true });
  }

  return {
    container,
    getRegionId: () => regionId,
    hitTest,
    startDrag,
    updateDrag,
    endDrag,
    destroy,
  };
}
