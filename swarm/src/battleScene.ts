// Battle scene placeholder. Holds the tactical-zoom backdrop (and later
// soldier sprites, formation grids, HUD). For #6.2 it's just a dirt-
// colored rectangle large enough that you don't immediately see edges
// while panning around inside battle. Real pixel-textured ground arrives
// alongside the sprite atlas in #6.5.

import { Container, Graphics } from 'pixi.js';

const DIRT_COLOR = 0xb29060;
// World units. ~50 tiles square at TILE_SIZE=16. Engagement is centered
// inside this patch so default tactical pan stays well within bounds.
const DIRT_SIZE = 800;

export interface BattleScene {
  container: Container;
  // Anchor the dirt patch in world coordinates — typically the midpoint
  // of the engagement.
  setCenter(x: number, y: number): void;
}

export function createBattleScene(): BattleScene {
  const container = new Container();
  const dirt = new Graphics();
  const half = DIRT_SIZE / 2;
  dirt.rect(-half, -half, DIRT_SIZE, DIRT_SIZE).fill(DIRT_COLOR);
  container.addChild(dirt);

  return {
    container,
    setCenter: (x, y) => container.position.set(x, y),
  };
}
