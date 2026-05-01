// HUD: top bar (player stats), debug overlay (toggled by triple-tap top-right),
// transient toast, and a STOP button shown while the human is expanding.
class UI {
  constructor(territory, renderer, game) {
    this.territory = territory;
    this.renderer = renderer;
    this.game = game;
    this.debugVisible = false;
    this.lastTap = null;

    this.debugEl   = document.getElementById('debug');
    this.toastEl   = document.getElementById('toast');
    this.tilesEl   = document.getElementById('my-tiles');
    this.goldEl    = document.getElementById('my-gold');
    this.dotEl     = document.getElementById('my-dot');
    this.stopBtn   = document.getElementById('stop-btn');
    this.hintEl    = document.getElementById('hint');

    if (this.dotEl) {
      const c = CONFIG.PLAYER_COLORS[1];
      this.dotEl.style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
    if (this.stopBtn) {
      this.stopBtn.addEventListener('click', () => {
        this.game.haltHuman();
        this.toast('Halted');
      });
    }

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

  setLastTap(x, y) { this.lastTap = { x, y }; }

  toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 1400);
  }

  hideHint() {
    if (this.hintEl) this.hintEl.style.display = 'none';
  }

  update() {
    const me = this.game.human();
    const owned = this.territory.counts[me.id];
    if (this.tilesEl) this.tilesEl.textContent = owned;
    if (this.goldEl)  this.goldEl.textContent  = Math.floor(me.gold);
    if (this.stopBtn) {
      this.stopBtn.classList.toggle('hidden', !me.expanding);
    }

    if (!this.debugVisible) return;
    const total = this.territory.width * this.territory.height;
    const totalOwned = total - this.territory.counts[0];
    const frontier = this.territory.getFrontier(me.id).size;
    this.debugEl.innerHTML = [
      `<b>FPS</b> ${this.renderer.fps}`,
      `<b>Tick/s</b> ${this.tickRate}`,
      `<b>Zoom</b> ${this.renderer.zoom.toFixed(2)}x`,
      `<b>Cam</b> ${this.renderer.cameraX.toFixed(0)}, ${this.renderer.cameraY.toFixed(0)}`,
      `<b>Mine</b> ${owned} (frontier ${frontier})`,
      `<b>Owned</b> ${totalOwned} / ${total}`,
      `<b>Gold</b> ${me.gold.toFixed(1)}`,
      me.target ? `<b>Target</b> ${me.target.x}, ${me.target.y}` : '<b>Target</b> none',
      this.lastTap ? `<b>Tap</b> ${this.lastTap.x}, ${this.lastTap.y}` : '',
    ].filter(Boolean).join('<br>');
  }
}
