/** screen = world * zoom + (x, y). */
export class Camera {
  zoom = 1;
  x = 0;
  y = 0;
  minZoom = 0.35;
  maxZoom = 3;

  constructor(private worldW: number, private worldH: number) {}

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

  /** Keep at least half the screen over the map so you can't lose it. */
  clamp(screenW: number, screenH: number): void {
    const mw = this.worldW * this.zoom;
    const mh = this.worldH * this.zoom;
    this.x = Math.min(screenW / 2, Math.max(screenW / 2 - mw, this.x));
    this.y = Math.min(screenH / 2, Math.max(screenH / 2 - mh, this.y));
  }
}
