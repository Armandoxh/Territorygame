import type { Game, BuildingType, BuildError, BombType, BombError, Player } from '@territorygame/shared';
import { formatTroops } from '../render/OverlayLayer.js';

const BUILD_TYPES: BuildingType[] = ['settlement', 'turret', 'airstrip'];
const BOMB_TYPES: BombType[] = ['small', 'large'];

export class HUD {
  private readonly game: Game;
  private readonly el = {
    tiles:        this._byId('my-tiles'),
    pct:          this._byId('my-pct'),
    troops:       this._byId('my-troops'),
    gold:         this._byId('my-gold'),
    dot:          this._byId('my-dot'),
    enemies:      this._byId('enemies'),
    hint:         this._byId('hint'),
    toast:        this._byId('toast'),
    debug:        this._byId('debug'),
    stop:         this._byId('stop-btn'),
    hotbar:       this._byId('hotbar'),
    placeBanner:  this._byId('place-banner'),
    placeBannerType: this._byId('pb-type'),
    sheet:        this._byId('buildsheet'),
    sheetCoords:  this._byId('bs-coords'),
    menu:         this._byId('menu'),
    menuBtn:      this._byId('menu-btn'),
    oppCount:     this._byId<HTMLInputElement>('opp-count'),
    bombBtn:      this._byId('bomb-btn'),
    bombCd:       this._byId('bomb-cd'),
    bombSheet:    this._byId('bombsheet'),
    leaderbar:    this._byId('leaderbar'),
    vassalLog:    this._byId('vassal-log'),
    tutorial:     this._byId('tutorial'),
    helpBtn:      this._byId('help-btn'),
    tutorialBtn:  this._byId('tutorial-start'),
    gameover:     this._byId('gameover'),
    gameoverTitle:this._byId('gameover-title'),
    gameoverSub:  this._byId('gameover-sub'),
    playAgain:    this._byId('play-again'),
  };
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private debugVisible = false;
  private placeMode: BuildingType | null = null;
  private bombMode: BombType | null = null;
  private buildSheetCoord: { x: number; y: number } | null = null;
  private enemyEls = new Map<number, { wrap: HTMLElement; num: HTMLElement }>();

  // Debug HUD live stats — set by main.ts loop
  fps = 0;
  tickRate = 0;

  constructor(game: Game) {
    this.game = game;

    const me = this.game.human();
    if (this.el.dot) {
      const c = this.game.config.PLAYER_COLORS[me.id];
      if (c) this.el.dot.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    this._buildEnemyBadges();
    this._wireStop();
    this._wireHotbar();
    this._wireSheet();
    this._wireBomb();
    this._wireMenu();
    this._wireGameOver();
    this._wireTutorial();
    // Show the welcome tutorial automatically on first launch.
    try {
      if (!localStorage.getItem('territory:tutorial-seen')) this.showTutorial();
    } catch { /* ignore */ }
  }

  // --- callbacks set from main.ts ---

  onHaltRequested?: () => void;
  onBombEvent?: (x: number, y: number, radius: number) => void;

  // --- public ---

  // Append a vassal-decision line to the persistent log on the bottom-left.
  // Caps at 6 visible entries; oldest fade out after a few seconds.
  private _logVassal(html: string): void {
    if (!this.el.vassalLog) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = html;
    this.el.vassalLog.appendChild(entry);
    while (this.el.vassalLog.childElementCount > 6) {
      this.el.vassalLog.firstElementChild?.remove();
    }
    setTimeout(() => {
      entry.classList.add('fading');
      setTimeout(() => entry.remove(), 500);
    }, 6000);
  }

  toast(msg: string): void {
    if (!this.el.toast) return;
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast?.classList.remove('show'), 1600);
  }

  /** No-op kept for legacy call sites. Hint visibility is now toggled by
   *  update() based on whether the human has an active target region. */
  hideHint(): void { /* intentionally empty */ }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    if (this.el.debug) this.el.debug.style.display = this.debugVisible ? 'block' : 'none';
    this.toast(this.debugVisible ? 'Debug HUD on' : 'Debug HUD off');
  }

  // Place mode (hotbar / keyboard)

  togglePlaceMode(type: BuildingType): void {
    if (this.game.outcome) { this.placeMode = null; }
    else if (this.placeMode === type) this.placeMode = null;
    else this.placeMode = type;
    this.hideBuildSheet();
    this._refreshHotbar();
    this._refreshPlaceBanner();
  }

  clearPlaceMode(): void {
    if (!this.placeMode) return;
    this.placeMode = null;
    this._refreshHotbar();
    this._refreshPlaceBanner();
  }

  /** Returns true if the tap was consumed by place-mode. */
  tryPlaceAt(x: number, y: number): boolean {
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

  // Bomb aim mode

  toggleBombMode(type: BombType): void {
    if (this.game.outcome) { this.bombMode = null; }
    else if (this.bombMode === type) this.bombMode = null;
    else this.bombMode = type;
    this.placeMode = null;
    this.hideBuildSheet();
    this.hideBombSheet();
    this._refreshHotbar();
    this._refreshPlaceBanner();
    this._refreshBombFab();
  }

  clearBombMode(): void {
    if (!this.bombMode) return;
    this.bombMode = null;
    this._refreshPlaceBanner();
    this._refreshBombFab();
  }

  /** Returns true if the tap was consumed by bomb-aim mode. */
  tryBombAt(x: number, y: number): boolean {
    if (!this.bombMode) return false;
    const type = this.bombMode;
    const err = this.game.dropBomb(type, x, y, 1);
    if (err === null) {
      this.toast(`${type[0]!.toUpperCase()}${type.slice(1)} bomb dropped`);
      this.bombMode = null;
      this._refreshPlaceBanner();
      this._refreshBombFab();
    } else {
      this.toast(this._bombErrorMsg(err));
    }
    return true;
  }

  showBombSheet(): void {
    if (!this.el.bombSheet) return;
    if (!this.game.hasAirstrip(1)) { this.toast('Build an airstrip first'); return; }
    this.clearPlaceMode();
    this.bombMode = null;
    this._refreshHotbar();
    this._refreshPlaceBanner();
    this.el.bombSheet.classList.add('show');
    this._refreshBombSheetButtons();
  }

  hideBombSheet(): void {
    this.el.bombSheet?.classList.remove('show');
  }

  // Long-press build sheet

  showBuildSheet(x: number, y: number): void {
    const me = this.game.human();
    if (!me.alive || this.game.outcome) return;
    if (this.game.territory.getOwner(x, y) !== me.id) {
      this.toast('Build on your own land');
      return;
    }
    if (this.game.buildingAt(x, y)) {
      this.toast('Tile already built on');
      return;
    }
    this.clearPlaceMode();
    this.buildSheetCoord = { x, y };
    if (this.el.sheetCoords) this.el.sheetCoords.textContent = `${x}, ${y}`;
    this.el.sheet?.classList.add('show');
    this._refreshSheetButtons();
  }

  hideBuildSheet(): void {
    this.buildSheetCoord = null;
    this.el.sheet?.classList.remove('show');
  }

  // Menu

  showMenu(): void {
    this._clampOppInput();
    this.el.menu?.classList.add('show');
  }

  hideMenu(): void {
    this.el.menu?.classList.remove('show');
  }

  // Per-frame
  update(): void {
    const me = this.game.human();
    const owned = this.game.territory.counts[me.id]!;
    if (this.el.tiles)  this.el.tiles.textContent  = String(owned);
    if (this.el.troops) this.el.troops.textContent = formatTroops(me.troops);
    if (this.el.gold)   this.el.gold.textContent   = String(Math.floor(me.gold));
    if (this.el.pct) {
      const pct = this.game.totalLand > 0 ? owned / this.game.totalLand : 0;
      // 1 decimal until close to the win threshold, then 2 for tension.
      const display = pct >= 0.85 ? (pct * 100).toFixed(1) : Math.floor(pct * 100).toString();
      this.el.pct.textContent = display + '%';
    }
    if (this.el.stop) {
      const showStop = me.alive && me.expanding && !this.game.outcome;
      this.el.stop.classList.toggle('hidden', !showStop);
    }
    if (this.el.hint) {
      // Hint stays visible (and pulses) any time the player has nothing
      // targeted — gives them a clear "tap a region" cue without nagging
      // toasts. Hidden on game over so it doesn't fight the overlay.
      const idle = !this.game.outcome && me.alive && me.targetRegion == null;
      this.el.hint.style.display = idle ? '' : 'none';
      this.el.hint.classList.toggle('idle', idle);
    }
    if (this.buildSheetCoord) this._refreshSheetButtons();
    this._refreshHotbar();
    this._refreshBombFab();
    if (this.el.bombSheet?.classList.contains('show')) this._refreshBombSheetButtons();
    this._refreshLeaderBar();
    for (const [id, ref] of this.enemyEls) {
      const p = this.game.players[id];
      if (!p) continue;
      const cnt = this.game.territory.counts[id]!;
      ref.num.textContent = String(cnt);
      ref.wrap.classList.toggle('dead', cnt === 0);
    }
    this._consumeEvents();

    if (this.debugVisible) this._writeDebug(me);
  }

  // --- internals ---

  private _byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
  }

  private _buildEnemyBadges(): void {
    if (!this.el.enemies) return;
    this.el.enemies.innerHTML = '';
    for (let id = 2; id < this.game.players.length; id++) {
      const p = this.game.players[id];
      if (!p) continue;
      const wrap = document.createElement('span');
      wrap.className = 'enemy-badge';
      const c = this.game.config.PLAYER_COLORS[id];
      if (c) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
        wrap.appendChild(dot);
      }
      const num = document.createElement('b');
      num.textContent = '0';
      wrap.appendChild(num);
      this.el.enemies.appendChild(wrap);
      this.enemyEls.set(id, { wrap, num });
    }
  }

  private _wireStop(): void {
    this.el.stop?.addEventListener('click', () => {
      this.onHaltRequested?.();
      this.toast('Halted');
    });
  }

  private _wireHotbar(): void {
    if (!this.el.hotbar) return;
    this.el.hotbar.querySelectorAll<HTMLButtonElement>('.hb-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset['type'] as BuildingType | undefined;
        if (type && BUILD_TYPES.includes(type)) this.togglePlaceMode(type);
      });
    });
  }

  private _wireSheet(): void {
    if (!this.el.sheet) return;
    this.el.sheet.querySelectorAll<HTMLButtonElement>('.bs-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.buildSheetCoord) return;
        const type = btn.dataset['type'] as BuildingType | undefined;
        if (!type || !BUILD_TYPES.includes(type)) return;
        const { x, y } = this.buildSheetCoord;
        const err = this.game.tryBuild(type, x, y, 1);
        if (err === null) { this.toast(`Built ${type}`); this.hideBuildSheet(); }
        else this.toast(this._buildErrorMsg(err));
      });
    });
    this.el.sheet.querySelector<HTMLButtonElement>('.bs-cancel')
      ?.addEventListener('click', () => this.hideBuildSheet());
  }

  private _wireBomb(): void {
    this.el.bombBtn?.addEventListener('click', () => {
      if (this.bombMode) { this.clearBombMode(); return; }
      if (this.el.bombSheet?.classList.contains('show')) { this.hideBombSheet(); return; }
      this.showBombSheet();
    });
    if (this.el.bombSheet) {
      this.el.bombSheet.querySelectorAll<HTMLButtonElement>('.bb-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.dataset['bomb'] as BombType | undefined;
          if (!type || !BOMB_TYPES.includes(type)) return;
          this.hideBombSheet();
          this.toggleBombMode(type);
        });
      });
      this.el.bombSheet.querySelector<HTMLButtonElement>('.bs-cancel')
        ?.addEventListener('click', () => this.hideBombSheet());
    }
  }

  private _refreshBombFab(): void {
    if (!this.el.bombBtn) return;
    const has = this.game.hasAirstrip(1);
    this.el.bombBtn.classList.toggle('hidden', !has || !!this.game.outcome);
    if (!has) return;
    const ready = this.game.airstripReadyAt(1);
    const cooling = ready > this.game.tickCount;
    this.el.bombBtn.classList.toggle('cooling', cooling && !this.bombMode);
    this.el.bombBtn.classList.toggle('armed',   !cooling && !this.bombMode);
    this.el.bombBtn.classList.toggle('aiming',  !!this.bombMode);
    if (this.el.bombCd) {
      if (this.bombMode) {
        this.el.bombCd.textContent = this.bombMode.toUpperCase();
      } else if (cooling) {
        const secs = Math.max(0, Math.ceil((ready - this.game.tickCount) / this.game.config.SIM_HZ));
        this.el.bombCd.textContent = `${secs}s`;
      } else {
        this.el.bombCd.textContent = 'BOMB';
      }
    }
  }

  // Rebuilds the thin stacked progress bar at the top of the screen showing
  // each alive player's share of the map. Top 8 + "others" so it stays
  // readable at high opponent counts.
  private _refreshLeaderBar(): void {
    if (!this.el.leaderbar) return;
    const land = this.game.totalLand;
    if (land <= 0) return;
    const palette = this.game.config.PLAYER_COLORS;
    const ranked: { id: number; owned: number }[] = [];
    for (let id = 1; id < this.game.players.length; id++) {
      const owned = this.game.territory.counts[id]!;
      if (owned > 0) ranked.push({ id, owned });
    }
    ranked.sort((a, b) => b.owned - a.owned);

    const TOP = 8;
    const top = ranked.slice(0, TOP);
    const rest = ranked.slice(TOP).reduce((s, r) => s + r.owned, 0);

    // Reuse children to avoid GC churn each frame.
    const bar = this.el.leaderbar;
    const slotCount = top.length + (rest > 0 ? 1 : 0);
    while (bar.childElementCount > slotCount) bar.removeChild(bar.lastChild!);
    while (bar.childElementCount < slotCount) bar.appendChild(document.createElement('span'));

    for (let i = 0; i < top.length; i++) {
      const { id, owned } = top[i]!;
      const c = palette[id];
      const pct = owned / land * 100;
      const el = bar.children[i] as HTMLElement;
      el.style.width = pct.toFixed(2) + '%';
      el.style.background = c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888';
      el.title = `${this.game.players[id]?.name ?? id}: ${pct.toFixed(1)}%`;
    }
    if (rest > 0) {
      const pct = rest / land * 100;
      const el = bar.children[top.length] as HTMLElement;
      el.style.width = pct.toFixed(2) + '%';
      el.style.background = '#3a4048';
      el.title = `others: ${pct.toFixed(1)}%`;
    }
  }

  private _refreshBombSheetButtons(): void {
    if (!this.el.bombSheet) return;
    const me = this.game.human();
    const ready = this.game.airstripReadyAt(1);
    const cooling = ready > this.game.tickCount;
    this.el.bombSheet.querySelectorAll<HTMLButtonElement>('.bb-btn').forEach((btn) => {
      const type = btn.dataset['bomb'] as BombType | undefined;
      if (!type) return;
      const cost = this.game.config.BOMB_COSTS[type];
      const costEl = btn.querySelector('.bs-cost');
      if (costEl) costEl.textContent = String(cost);
      btn.classList.toggle('disabled', cooling || me.gold < cost);
    });
  }

  private _wireMenu(): void {
    if (!this.el.menu) return;
    if (this.el.oppCount) this.el.oppCount.value = String(this._initialOppCount());
    this.el.oppCount?.addEventListener('change', () => this._clampOppInput());
    this.el.oppCount?.addEventListener('blur',   () => this._clampOppInput());
    this.el.menuBtn?.addEventListener('click', () => this.showMenu());
    this.el.menu.querySelector('#menu-cancel')?.addEventListener('click', () => this.hideMenu());
    this.el.menu.querySelector('#restart-btn')?.addEventListener('click', () => this._restart());
    this.el.menu.querySelectorAll<HTMLButtonElement>('.num-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset['delta'] ?? '0', 10) || 0;
        if (!this.el.oppCount) return;
        const v = (parseInt(this.el.oppCount.value, 10) || 0) + d;
        this.el.oppCount.value = String(Math.max(1, Math.min(254, v)));
      });
    });
    this.el.menu.querySelectorAll<HTMLButtonElement>('.quick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.el.oppCount) this.el.oppCount.value = btn.dataset['count'] ?? '3';
      });
    });
    this.el.menu.addEventListener('click', (e) => {
      if (e.target === this.el.menu) this.hideMenu();
    });
  }

  private _wireGameOver(): void {
    this.el.playAgain?.addEventListener('click', () => {
      this.el.gameover?.classList.remove('show');
      this.showMenu();
    });
  }

  private _wireTutorial(): void {
    this.el.helpBtn?.addEventListener('click', () => this.showTutorial());
    this.el.tutorialBtn?.addEventListener('click', () => this.hideTutorial());
    // Tap on the dim background also dismisses.
    this.el.tutorial?.addEventListener('click', (e) => {
      if (e.target === this.el.tutorial) this.hideTutorial();
    });
  }

  showTutorial(): void {
    this.el.tutorial?.classList.add('show');
  }

  hideTutorial(): void {
    this.el.tutorial?.classList.remove('show');
    try { localStorage.setItem('territory:tutorial-seen', '1'); } catch { /* ignore */ }
  }

  private _refreshHotbar(): void {
    if (!this.el.hotbar) return;
    const me = this.game.human();
    this.el.hotbar.querySelectorAll<HTMLButtonElement>('.hb-btn').forEach((btn) => {
      const type = btn.dataset['type'] as BuildingType | undefined;
      if (!type) return;
      const cost = this.game.config.BUILDING_COSTS[type];
      btn.classList.toggle('active', this.placeMode === type);
      btn.classList.toggle('cant-afford', me.gold < cost);
      const costEl = btn.querySelector('.hb-cost');
      if (costEl) costEl.textContent = String(cost);
    });
  }

  private _refreshSheetButtons(): void {
    if (!this.el.sheet) return;
    const me = this.game.human();
    this.el.sheet.querySelectorAll<HTMLButtonElement>('.bs-btn').forEach((btn) => {
      const type = btn.dataset['type'] as BuildingType | undefined;
      if (!type) return;
      const cost = this.game.config.BUILDING_COSTS[type];
      btn.classList.toggle('disabled', me.gold < cost);
      const costEl = btn.querySelector('.bs-cost');
      if (costEl) costEl.textContent = String(cost);
    });
  }

  private _refreshPlaceBanner(): void {
    if (!this.el.placeBanner) return;
    if (this.bombMode) {
      if (this.el.placeBannerType) this.el.placeBannerType.textContent = `${this.bombMode.toUpperCase()} BOMB`;
      this.el.placeBanner.classList.add('show', 'bomb');
    } else if (this.placeMode) {
      if (this.el.placeBannerType) this.el.placeBannerType.textContent = this.placeMode.toUpperCase();
      this.el.placeBanner.classList.remove('bomb');
      this.el.placeBanner.classList.add('show');
    } else {
      this.el.placeBanner.classList.remove('show', 'bomb');
    }
  }

  private _consumeEvents(): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'eliminated') {
        const name = this.game.players[e.playerId]?.name ?? `Player ${e.playerId}`;
        this.toast(`${name} eliminated`);
      } else if (e.type === 'capital') {
        const name = this.game.players[e.playerId]?.name ?? `Player ${e.playerId}`;
        this.toast(`${name} lost a capital`);
      } else if (e.type === 'gameover') {
        this._showGameOver(e.outcome, e.winner);
      } else if (e.type === 'destroyed' && e.ownerId === 1) {
        this.toast(`Your ${e.buildingType} destroyed`);
      } else if (e.type === 'bomb') {
        this.onBombEvent?.(e.x, e.y, e.radius);
      } else if (e.type === 'region-conquered' && e.ownerId === 1) {
        const name = this.game.regionNameOf(e.regionId) || `Region ${e.regionId}`;
        this.toast(`${name} fortified`);
        this._logVassal(`Conquered <b>${name}</b>`);
      } else if (e.type === 'vassal-built' && e.ownerId === 1) {
        const name = this.game.regionNameOf(e.regionId) || `Region ${e.regionId}`;
        this._logVassal(`<b>${name}</b> built a ${e.buildingType}`);
      } else if (e.type === 'vassal-bombed' && e.ownerId === 1) {
        const name = this.game.regionNameOf(e.regionId) || `Region ${e.regionId}`;
        this._logVassal(`<b>${name}</b> dropped a ${e.bombType} bomb`);
        this.onBombEvent?.(e.x, e.y, this.game.config.BOMB_RADII[e.bombType]);
      }
    }
  }

  private _showGameOver(outcome: 'victory' | 'defeat', winnerId: number): void {
    if (!this.el.gameover) return;
    const land = this.game.totalLand;
    const winnerOwned = winnerId > 0 ? (this.game.territory.counts[winnerId] ?? 0) : 0;
    const winnerPct = land > 0 ? (winnerOwned / land * 100).toFixed(1) : '0';
    if (outcome === 'victory') {
      if (this.el.gameoverTitle) {
        this.el.gameoverTitle.textContent = 'VICTORY';
        this.el.gameoverTitle.style.color = '#55c86e';
      }
      if (this.el.gameoverSub) {
        this.el.gameoverSub.textContent = `You control ${winnerPct}% of the map.`;
      }
    } else {
      if (this.el.gameoverTitle) {
        this.el.gameoverTitle.textContent = 'DEFEAT';
        this.el.gameoverTitle.style.color = '#e84a4a';
      }
      const name = winnerId > 0 ? this.game.players[winnerId]?.name ?? '—' : 'No one';
      if (this.el.gameoverSub) {
        this.el.gameoverSub.textContent = `${name} controls ${winnerPct}% of the map.`;
      }
    }
    this.el.gameover.classList.add('show');
  }

  private _writeDebug(me: Player): void {
    if (!this.el.debug) return;
    const total = this.game.territory.width * this.game.territory.height;
    const totalOwned = total - this.game.territory.counts[0]!;
    const frontier = this.game.territory.getFrontier(me.id).size;
    const winNeed = Math.ceil(this.game.totalLand * this.game.config.WIN_TERRITORY_FRACTION);
    const lines = [
      `<b>FPS</b> ${this.fps}`,
      `<b>Tick/s</b> ${this.tickRate.toFixed(1)}`,
      `<b>Mine</b> ${this.game.territory.counts[me.id]!} (frontier ${frontier})`,
      `<b>Land</b> ${this.game.totalLand} (need ${winNeed} to win)`,
      `<b>Owned</b> ${totalOwned} / ${total}`,
      `<b>Troops</b> ${formatTroops(me.troops)}`,
      `<b>Gold</b> ${me.gold.toFixed(1)}`,
      `<b>Caps</b> ${this.game.capitals.length}`,
      `<b>Builds</b> ${this.game.buildings.length}`,
      `<b>Regions</b> ${this.game.fullRegionsForOwner(me.id)} / ${this.game.regionCount}`,
      `<b>Vassals</b> ${this.game.vassalsLoyalFor(me.id) ? 'loyal' : 'dormant'}`,
      me.target ? `<b>Target</b> ${me.target.x}, ${me.target.y}` : '<b>Target</b> none',
    ];
    this.el.debug.innerHTML = lines.join('<br>');
  }

  private _initialOppCount(): number {
    const fromUrl = parseInt(new URLSearchParams(location.search).get('ai') ?? '', 10);
    if (Number.isFinite(fromUrl)) return Math.max(1, Math.min(254, fromUrl));
    const fromStorage = parseInt(localStorage.getItem('territory:ai') ?? '', 10);
    if (Number.isFinite(fromStorage)) return Math.max(1, Math.min(254, fromStorage));
    return this.game.config.AI_PLAYER_COUNT;
  }

  private _clampOppInput(): void {
    if (!this.el.oppCount) return;
    const v = parseInt(this.el.oppCount.value, 10);
    if (!Number.isFinite(v)) { this.el.oppCount.value = '3'; return; }
    this.el.oppCount.value = String(Math.max(1, Math.min(254, v)));
  }

  private _restart(): void {
    this._clampOppInput();
    const v = parseInt(this.el.oppCount?.value ?? '3', 10) || 3;
    try { localStorage.setItem('territory:ai', String(v)); } catch { /* ignore */ }
    location.search = '?ai=' + v;
  }

  private _buildErrorMsg(err: BuildError): string {
    const msgs: Record<BuildError, string> = {
      'gold':         'Not enough gold',
      'not-yours':    'Build on your own land',
      'occupied':     'Tile already built on',
      'on-capital':   'Cannot build on capital',
      'oob':          'Out of bounds',
      'dead':         'You are eliminated',
      'bad-type':     'Unknown building',
    };
    return msgs[err];
  }

  private _bombErrorMsg(err: BombError): string {
    const msgs: Record<BombError, string> = {
      'no-airstrip': 'Need an airstrip',
      'cooldown':    'All airstrips on cooldown',
      'gold':        'Not enough gold',
      'oob':         'Out of bounds',
      'dead':        'You are eliminated',
      'bad-type':    'Unknown bomb',
    };
    return msgs[err];
  }
}
