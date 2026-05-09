export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
  zoomAt(factor: number, screenX: number, screenY: number, viewportW: number, viewportH: number): void;
  panBy(dxScreen: number, dyScreen: number): void;
}

export interface CameraOpts {
  initialZoom: number;
  initialPanX: number;
  initialPanY: number;
  minZoom: number;
  maxZoom: number;
}

export function createCamera(opts: CameraOpts): Camera {
  const cam: Camera = {
    zoom: opts.initialZoom,
    panX: opts.initialPanX,
    panY: opts.initialPanY,
    zoomAt(factor, sx, sy, vw, vh) {
      const newZoom = Math.max(opts.minZoom, Math.min(opts.maxZoom, this.zoom * factor));
      // World point currently under (sx, sy)
      const wfx = this.panX + (sx - vw / 2) / this.zoom;
      const wfy = this.panY + (sy - vh / 2) / this.zoom;
      // Adjust pan so the same world point stays under (sx, sy) at the new zoom
      this.panX = wfx - (sx - vw / 2) / newZoom;
      this.panY = wfy - (sy - vh / 2) / newZoom;
      this.zoom = newZoom;
    },
    panBy(dxScreen, dyScreen) {
      this.panX -= dxScreen / this.zoom;
      this.panY -= dyScreen / this.zoom;
    },
  };
  return cam;
}
