// HUD: top bar (you + enemy badges), debug overlay (triple-tap top-right),
// transient toast, STOP button, game-over overlay.
class UI {
  constructor(territory, renderer, game) {
    this.territory = territory;
    this.renderer = renderer;
    this.game = game;
    this.debugVisible = false;
    this.lastTap = null;

    this.debugEl     = document.getElementById('debug');
    this.toastEl     = document.getElementById('toast');
    this.tilesEl     = document.getElementById('my-tiles');
    this.goldEl      = document.getElementById('my-gold');
    this.dotEl       = document.getElementById('my-dot');
    this.stopBtn     = document.getElementById('stop-btn');
    this.hintEl      = document.getElementById('hint');
    this.enemiesEl   = document.getElementById('enemies');
    this.gameOverEl  = document.getElementById('gameover');
    this.gameOverTitleEl = document.getElementById('gameover-title');
    this.gameOverSubEl   = document.getElementById('gameover-sub');
    this.playAgainBtn    = document.getElementById('play-again');

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
    if (this.playAgainBtn) {
      this.playAgainBtn.addEventListener('click', () => location.reload());
    }
    this._buildEnemyBadges();

    this._tickCount = 0;
    this._lastTickSample = performance.now();
    this.tickRate = 0;
    this._toastTimer = null;
  }

  _buildEnemyBadges() {
    if (!this.enemiesEl) return;
    this.enemiesEl.innerHTML = '';
    this.enemyEls = {};
    for (let id = 2; id < this.game.players.length; id++) {
      const p = this.game.players[id];
      if (!p) continue;
      const el = document.createElement('span');
      el.className = 'enemy-badge';
      const c = CONFIG.PLAYER_COLORS[id];
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      const num = document.createElement('b');
      num.textContent = '0';
      el.appendChild(dot);
      el.appendChild(num);
      this.enemiesEl.appendChild(el);
      this.enemyEls[id] = { wrap: el, num };
    }
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
    }, 1600);
  }

  hideHint() {
    if (this.hintEl) this.hintEl.style.display = 'none';
  }

  consumeEvents() {
    const events = this.game.drainEvents();
    for (const e of events) {
      if (e.type === 'eliminated') {
        const name = this.game.players[e.playerId]?.name || `Player ${e.playerId}`;
        this.toast(`${name} eliminated`);
      } else if (e.type === 'capital') {
        const name = this.game.players[e.playerId]?.name || `Player ${e.playerId}`;
        this.toast(`${name} lost a capital`);
      } else if (e.type === 'gameover') {
        this.showGameOver(e.outcome, e.winner);
      }
    }
  }

  showGameOver(outcome, winnerId) {
    if (!this.gameOverEl) return;
    if (outcome === 'victory') {
      this.gameOverTitleEl.textContent = 'VICTORY';
      this.gameOverTitleEl.style.color = '#55c86e';
      this.gameOverSubEl.textContent = 'You eliminated all opponents.';
    } else {
      this.gameOverTitleEl.textContent = 'DEFEAT';
      this.gameOverTitleEl.style.color = '#e84a4a';
      const winner = winnerId > 0 ? this.game.players[winnerId]?.name : 'No one';
      this.gameOverSubEl.textContent = `${winner} won.`;
    }
    this.gameOverEl.classList.add('show');
  }

  update() {
    const me = this.game.human();
    const owned = this.territory.counts[me.id];
    if (this.tilesEl) this.tilesEl.textContent = owned;
    if (this.goldEl)  this.goldEl.textContent  = Math.floor(me.gold);
    if (this.stopBtn) {
      const showStop = me.alive && me.expanding && !this.game.outcome;
      this.stopBtn.classList.toggle('hidden', !showStop);
    }

    // Enemy badges
    if (this.enemyEls) {
      for (const id of Object.keys(this.enemyEls)) {
        const ref = this.enemyEls[id];
        const p = this.game.players[id];
        const c = this.territory.counts[id];
        ref.num.textContent = c;
        ref.wrap.classList.toggle('dead', !p.alive);
      }
    }

    this.consumeEvents();

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
      `<b>Caps</b> ${this.game.capitals.length}`,
      me.target ? `<b>Target</b> ${me.target.x}, ${me.target.y}` : '<b>Target</b> none',
    ].filter(Boolean).join('<br>');
  }
}
