// Renders the territory grid to a canvas with pan/zoom.
// Strategy: keep an offscreen canvas at the grid's native resolution, write
// dirty tiles into its ImageData each frame, then drawImage scaled into the
// visible canvas. drawImage is one call per frame regardless of grid size.
class Renderer {
  constructor(canvas, territory) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.territory = territory;

    this.gridCanvas = document.createElement('canvas');
    this.gridCanvas.width = territory.width;
    this.gridCanvas.height = territory.height;
    this.gridCtx = this.gridCanvas.getContext('2d');
    this.imageData = this.gridCtx.createImageData(territory.width, territory.height);
    this._fillImageDataFromGrid();
    this.gridCtx.putImageData(this.imageData, 0, 0);

    this.cameraX = territory.width / 2;
    this.cameraY = territory.height / 2;
    this.zoom = CONFIG.DEFAULT_ZOOM;

    this.fps = 0;
    this._frameCount = 0;
    this._lastFpsTime = performance.now();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this.dpr = dpr;
    this.viewportW = w;
    this.viewportH = h;
  }

  _fillImageDataFromGrid() {
    const data = this.imageData.data;
    const owners = this.territory.owners;
    for (let i = 0; i < owners.length; i++) {
      const c = CONFIG.PLAYER_COLORS[owners[i]] || CONFIG.PLAYER_COLORS[0];
      const di = i * 4;
      data[di]     = c[0];
      data[di + 1] = c[1];
      data[di + 2] = c[2];
      data[di + 3] = c[3];
    }
  }

  flushDirty() {
    const dirty = this.territory.dirty;
    if (dirty.size === 0) return;
    const data = this.imageData.data;
    const owners = this.territory.owners;
    for (const i of dirty) {
      const c = CONFIG.PLAYER_COLORS[owners[i]] || CONFIG.PLAYER_COLORS[0];
      const di = i * 4;
      data[di]     = c[0];
      data[di + 1] = c[1];
      data[di + 2] = c[2];
      data[di + 3] = c[3];
    }
    // Whole-buffer put is fast enough for 384x384; tighten bbox in M9 if needed.
    this.gridCtx.putImageData(this.imageData, 0, 0);
    dirty.clear();
  }

  screenToWorld(sx, sy) {
    const wx = (sx - this.viewportW / 2) / this.zoom + this.cameraX;
    const wy = (sy - this.viewportH / 2) / this.zoom + this.cameraY;
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  pan(dxScreen, dyScreen) {
    this.cameraX -= dxScreen / this.zoom;
    this.cameraY -= dyScreen / this.zoom;
    this._clampCamera();
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    const newZoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, this.zoom * factor));
    if (newZoom === this.zoom) return;
    this.zoom = newZoom;
    const after = this.screenToWorld(sx, sy);
    this.cameraX += before.x - after.x;
    this.cameraY += before.y - after.y;
    this._clampCamera();
  }

  _clampCamera() {
    const margin = 0.2;
    const W = this.territory.width;
    const H = this.territory.height;
    this.cameraX = Math.max(-W * margin, Math.min(W * (1 + margin), this.cameraX));
    this.cameraY = Math.max(-H * margin, Math.min(H * (1 + margin), this.cameraY));
  }

  draw() {
    this.flushDirty();
    const ctx = this.ctx;
    const dpr = this.dpr;

    ctx.fillStyle = CONFIG.BG_COLOR;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const screenLeft = (0 - this.cameraX) * this.zoom + this.viewportW / 2;
    const screenTop  = (0 - this.cameraY) * this.zoom + this.viewportH / 2;
    const screenW = this.territory.width * this.zoom;
    const screenH = this.territory.height * this.zoom;

    ctx.drawImage(
      this.gridCanvas,
      0, 0, this.territory.width, this.territory.height,
      Math.round(screenLeft * dpr), Math.round(screenTop * dpr),
      Math.round(screenW * dpr), Math.round(screenH * dpr)
    );

    // Decorative gridlines (only when zoomed in enough to be useful)
    if (this.zoom >= CONFIG.GRIDLINE_MIN_ZOOM) {
      ctx.strokeStyle = CONFIG.GRIDLINE_COLOR;
      ctx.lineWidth = Math.max(1, dpr * 0.5);
      ctx.beginPath();
      const step = CONFIG.GRIDLINE_INTERVAL;
      for (let x = 0; x <= this.territory.width; x += step) {
        const sx = Math.round((screenLeft + x * this.zoom) * dpr);
        ctx.moveTo(sx, Math.round(screenTop * dpr));
        ctx.lineTo(sx, Math.round((screenTop + screenH) * dpr));
      }
      for (let y = 0; y <= this.territory.height; y += step) {
        const sy = Math.round((screenTop + y * this.zoom) * dpr);
        ctx.moveTo(Math.round(screenLeft * dpr), sy);
        ctx.lineTo(Math.round((screenLeft + screenW) * dpr), sy);
      }
      ctx.stroke();
    }

    // Map border so the play area is always identifiable
    ctx.strokeStyle = CONFIG.MAP_BORDER_COLOR;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(
      Math.round(screenLeft * dpr) - 1,
      Math.round(screenTop * dpr) - 1,
      Math.round(screenW * dpr) + 2,
      Math.round(screenH * dpr) + 2
    );

    this._frameCount++;
    const now = performance.now();
    const dt = now - this._lastFpsTime;
    if (dt >= 500) {
      this.fps = Math.round((this._frameCount * 1000) / dt);
      this._frameCount = 0;
      this._lastFpsTime = now;
    }
  }
}
