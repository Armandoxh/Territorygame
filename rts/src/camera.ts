export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/** screen = world * zoom + (x, y). "World" here is whatever space the renderer draws in. */
export class Camera {
  zoom = 1;
  x = 0;
  y = 0;
  minZoom = 0.3;
  maxZoom = 2.5;

  constructor(private bounds: Bounds) {}

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom };
  }

  centerOn(wx: number, wy: number, screenW: number, screenH: number): void {
    this.x = screenW / 2 - wx * this.zoom;
    this.y = screenH / 2 - wy * this.zoom;
  }

  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /** Zoom keeping the world point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const z = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const w = this.toWorld(sx, sy);
    this.zoom = z;
    this.x = sx - w.x * z;
    this.y = sy - w.y * z;
  }

  /** Keep the screen centre over the map so you can't lose it. */
  clamp(screenW: number, screenH: number): void {
    const b = this.bounds;
    const z = this.zoom;
    this.x = Math.min(screenW / 2 - b.minX * z, Math.max(screenW / 2 - b.maxX * z, this.x));
    this.y = Math.min(screenH / 2 - b.minY * z, Math.max(screenH / 2 - b.maxY * z, this.y));
  }
}
