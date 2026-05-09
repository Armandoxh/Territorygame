import { Graphics } from 'pixi.js';

const COLOR_GRASS = 0x4a7a3e;
const COLOR_SAND = 0xc9b070;
const COLOR_WATER = 0x3a6090;

function hash01(x: number, y: number): number {
  const h = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
  return h < 0 ? h + 1 : h;
}

function cellColor(x: number, y: number): number {
  const v = hash01(x, y);
  if (v < 0.10) return COLOR_WATER;
  if (v < 0.25) return COLOR_SAND;
  return COLOR_GRASS;
}

export interface PlaceholderOpts {
  cellsX: number;
  cellsY: number;
  cellSize: number;
}

export interface Placeholder {
  strategicLayer: Graphics;
  detailLayer: Graphics;
}

export function createPlaceholder(opts: PlaceholderOpts): Placeholder {
  const { cellsX, cellsY, cellSize } = opts;
  const w = cellsX * cellSize;
  const h = cellsY * cellSize;

  // Strategic layer: flat color cells. Always visible.
  const strategic = new Graphics();
  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      strategic.rect(x * cellSize, y * cellSize, cellSize, cellSize).fill(cellColor(x, y));
    }
  }

  // Detail layer: grid lines + center dots. Alpha is driven by the camera
  // zoom in main.ts (0 when zoomed out, 1 when zoomed in).
  const detail = new Graphics();
  for (let x = 0; x <= cellsX; x++) {
    detail.moveTo(x * cellSize, 0).lineTo(x * cellSize, h).stroke({ width: 1, color: 0x000000, alpha: 0.45 });
  }
  for (let y = 0; y <= cellsY; y++) {
    detail.moveTo(0, y * cellSize).lineTo(w, y * cellSize).stroke({ width: 1, color: 0x000000, alpha: 0.45 });
  }
  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      detail.circle(x * cellSize + cellSize / 2, y * cellSize + cellSize / 2, 2).fill({ color: 0x000000, alpha: 0.6 });
    }
  }
  detail.alpha = 0;

  return { strategicLayer: strategic, detailLayer: detail };
}
