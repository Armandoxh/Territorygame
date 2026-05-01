// HUD: top bar (title for now) + debug overlay (toggled by triple-tap top-right).
class UI {
  constructor(territory, renderer) {
    this.territory = territory;
    this.renderer = renderer;
    this.debugVisible = false;
    this.lastTap = null;

    this.debugEl = document.getElementById('debug');
    this.toastEl = document.getElementById('toast');

    this._tickCount = 0;
    this._lastTickSample = performance.now();
    this.tickRate = 0;

    this._toastTimer = null;
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugEl.style.display = this.debugVisible ? 'block' : 'none';
    this.toast(this.debugVisible ? 'Debug HUD on' : 'Debug HUD off');
  }

  noteTick() {
    this._tickCount++;
    const now = performance.now();
    const dt = now - this._lastTickSample;
    if (dt >= 1000) {
      this.tickRate = (this._tickCount * 1000 / dt).toFixed(1);
      this._tickCount = 0;
      this._lastTickSample = now;
    }
  }

  setLastTap(x, y) {
    this.lastTap = { x, y };
  }

  toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 1400);
  }

  update() {
    if (!this.debugVisible) return;
    const counts = this.territory.countByOwner();
    const total = this.territory.width * this.territory.height;
    const owned = total - counts[0];
    this.debugEl.innerHTML = [
      `<b>FPS</b> ${this.renderer.fps}`,
      `<b>Tick/s</b> ${this.tickRate}`,
      `<b>Zoom</b> ${this.renderer.zoom.toFixed(2)}x`,
      `<b>Cam</b> ${this.renderer.cameraX.toFixed(0)}, ${this.renderer.cameraY.toFixed(0)}`,
      `<b>Owned</b> ${owned} / ${total}`,
      this.lastTap ? `<b>Tap</b> ${this.lastTap.x}, ${this.lastTap.y}` : '',
    ].filter(Boolean).join('<br>');
  }
}
