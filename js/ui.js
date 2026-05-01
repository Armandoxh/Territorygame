// HUD: top bar (you + enemy badges), debug overlay (triple-tap top-right),
// transient toast, STOP button, build sheet (long-press), game-over overlay.
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
    this.buildSheetEl    = document.getElementById('buildsheet');
    this.buildCoordsEl   = document.getElementById('bs-coords');
    this.buildSheetCoord = null;
    this.hotbarEl        = document.getElementById('hotbar');
    this.placeBannerEl   = document.getElementById('place-banner');
    this.placeBannerType = document.getElementById('pb-type');
    this.placeMode       = null;

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
    if (this.buildSheetEl) {
      this.buildSheetEl.querySelectorAll('.bs-btn').forEach(btn => {
        btn.addEventListener('click', () => this._onBuildClick(btn.dataset.type));
      });
      const cancel = this.buildSheetEl.querySelector('.bs-cancel');
      if (cancel) cancel.addEventListener('click', () => this.hideBuildSheet());
    }
    if (this.hotbarEl) {
      this.hotbarEl.querySelectorAll('.hb-btn').forEach(btn => {
        btn.addEventListener('click', () => this.togglePlaceMode(btn.dataset.type));
      });
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

  showBuildSheet(x, y) {
    const me = this.game.human();
    if (!me.alive || this.game.outcome) return;
    if (this.territory.getOwner(x, y) !== me.id) {
      this.toast('Build on your own land');
      return;
    }
    if (this.game.buildingAt(x, y)) {
      this.toast('Tile already built on');
      return;
    }
    this.clearPlaceMode();
    this.buildSheetCoord = { x, y };
    if (this.buildCoordsEl) this.buildCoordsEl.textContent = `${x}, ${y}`;
    this.buildSheetEl.classList.add('show');
    this._refreshBuildButtons();
  }

  hideBuildSheet() {
    this.buildSheetCoord = null;
    if (this.buildSheetEl) this.buildSheetEl.classList.remove('show');
  }

  _refreshBuildButtons() {
    if (!this.buildSheetEl) return;
    const me = this.game.human();
    this.buildSheetEl.querySelectorAll('.bs-btn').forEach(btn => {
      const type = btn.dataset.type;
      const cost = CONFIG.BUILDING_COSTS[type];
      const costEl = btn.querySelector('.bs-cost');
      if (costEl) costEl.textContent = cost;
      btn.classList.toggle('disabled', me.gold < cost);
    });
  }

  _onBuildClick(type) {
    if (!this.buildSheetCoord) return;
    const { x, y } = this.buildSheetCoord;
    const err = this.game.tryBuild(type, x, y, 1);
    if (err === null) {
      this.toast(`Built ${type}`);
      this.hideBuildSheet();
    } else {
      this.toast(this._buildErrorMsg(err));
    }
  }

  // --- Place mode (hotbar / keyboard) ---

  togglePlaceMode(type) {
    if (this.game.outcome) { this.placeMode = null; }
    else if (this.placeMode === type) this.placeMode = null;
    else this.placeMode = type;
    this.hideBuildSheet();
    this._refreshHotbar();
    this._refreshPlaceBanner();
  }

  clearPlaceMode() {
    if (this.placeMode) {
      this.placeMode = null;
      this._refreshHotbar();
      this._refreshPlaceBanner();
    }
  }

  // Returns true if a place was attempted (consumed the tap), false otherwise.
  tryPlaceAt(x, y) {
    if (!this.placeMode) return false;
    const type = this.placeMode;
    const err = this.game.tryBuild(type, x, y, 1);
    if (err === null) {
      this.toast(`Built ${type}`);
      this.placeMode = null;
      this._refreshHotbar();
      this._refreshPlaceBanner();
    } else {
      this.toast(this._buildErrorMsg(err));
    }
    return true;
  }

  _refreshHotbar() {
    if (!this.hotbarEl) return;
    const me = this.game.human();
    this.hotbarEl.querySelectorAll('.hb-btn').forEach(btn => {
      const type = btn.dataset.type;
      const cost = CONFIG.BUILDING_COSTS[type];
      btn.classList.toggle('active', this.placeMode === type);
      btn.classList.toggle('cant-afford', me.gold < cost);
      const costEl = btn.querySelector('.hb-cost');
      if (costEl) costEl.textContent = cost;
    });
  }

  _refreshPlaceBanner() {
    if (!this.placeBannerEl) return;
    if (this.placeMode) {
      if (this.placeBannerType) {
        this.placeBannerType.textContent = this.placeMode.toUpperCase();
      }
      this.placeBannerEl.classList.add('show');
    } else {
      this.placeBannerEl.classList.remove('show');
    }
  }

  _buildErrorMsg(err) {
    return ({
      'gold': 'Not enough gold',
      'not-yours': 'Build on your own land',
      'occupied': 'Tile already built on',
      'on-capital': 'Cannot build on capital',
      'wonder-limit': 'Wonder limit reached',
      'oob': 'Out of bounds',
      'dead': 'You are eliminated',
      'bad-type': 'Unknown building',
    })[err] || 'Cannot build';
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
      } else if (e.type === 'destroyed' && e.ownerId === 1) {
        this.toast(`Your ${e.buildingType} destroyed`);
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
    if (this.buildSheetCoord) this._refreshBuildButtons();
    this._refreshHotbar();

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
      `<b>Builds</b> ${this.game.buildings.length}`,
      me.target ? `<b>Target</b> ${me.target.x}, ${me.target.y}` : '<b>Target</b> none',
    ].filter(Boolean).join('<br>');
  }
}
