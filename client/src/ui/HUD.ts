import type { Game, Building, BuildingType, BuildError, BombType, BombError, GroundOpType, GroundOpError, Player, DecreeBranch, ShipKind, ShipBuildError, PlayerId, Mastery, ResourceKind, TradeCurrency } from '@territorygame/shared';
import { DECREES, ABILITIES, MASTERIES } from '@territorygame/shared';
import { formatTroops } from '../render/OverlayLayer.js';

const BUILD_TYPES: BuildingType[] = ['settlement', 'turret', 'airstrip', 'aa', 'port', 'barracks'];
const BOMB_TYPES: BombType[] = ['small', 'large', 'ac130'];
const SHIP_TYPES: ShipKind[] = ['scout', 'skirmisher', 'warship', 'submarine', 'destroyer'];
const DECREE_BRANCHES: DecreeBranch[] = ['economy', 'defense', 'military', 'offense', 'espionage'];
type CmdMode = 'abilities' | 'doctrines';

export class HUD {
  private readonly game: Game;
  private readonly el = {
    tiles:        this._byId('my-tiles'),
    pct:          this._byId('my-pct'),
    troops:       this._byId('my-troops'),
    gold:         this._byId('my-gold'),
    treasury:     this._byId('my-treasury'),
    routes:       this._byId('my-routes'),
    tradeFlow:    this._byId('my-trade-flow'),
    masteryBadge: this._byId('my-mastery'),
    rsFood:       this._byId('rs-food'),
    rsWood:       this._byId('rs-wood'),
    rsStone:      this._byId('rs-stone'),
    rsOil:        this._byId('rs-oil'),
    rsGems:       this._byId('rs-gems'),
    rsFlowFood:   this._byId('rs-flow-food'),
    rsFlowWood:   this._byId('rs-flow-wood'),
    rsFlowStone:  this._byId('rs-flow-stone'),
    rsFlowOil:    this._byId('rs-flow-oil'),
    rsFlowGems:   this._byId('rs-flow-gems'),
    rsFlowGold:   this._byId('rs-flow-gold'),
    dot:          this._byId('my-dot'),
    enemies:      this._byId('enemies'),
    hint:         this._byId('hint'),
    toast:        this._byId('toast'),
    warInvite:    this._byId('war-invite'),
    warInviteMsg: this._byId('wi-msg'),
    warInviteAccept:  this._byId('wi-accept'),
    warInviteDecline: this._byId('wi-decline'),
    tradePrompt:      this._byId('trade-prompt'),
    tpTitle:          this._byId('tp-title'),
    tpGiveKind:       this._byId<HTMLSelectElement>('tp-give-kind'),
    tpGiveAmt:        this._byId('tp-give-amt'),
    tpGiveStock:      this._byId('tp-give-stock'),
    tpTakeKind:       this._byId<HTMLSelectElement>('tp-take-kind'),
    tpTakeAmt:        this._byId('tp-take-amt'),
    tpTakeStock:      this._byId('tp-take-stock'),
    tpSend:           this._byId('tp-send'),
    tpCancel:         this._byId('tp-cancel'),
    resourceOffer:        this._byId('resource-offer'),
    resourceOfferMsg:     this._byId('ro-msg'),
    resourceOfferAccept:  this._byId('ro-accept'),
    resourceOfferDecline: this._byId('ro-decline'),
    debug:        this._byId('debug'),
    stop:         this._byId('stop-btn'),
    hotbar:       this._byId('hotbar'),
    placeBanner:  this._byId('place-banner'),
    placeBannerType: this._byId('pb-type'),
    sheet:        this._byId('buildsheet'),
    sheetCoords:  this._byId('bs-coords'),
    sheetEmpireGold: this._byId('bs-empire-gold'),
    fleetEmpireGold: this._byId('fs-empire-gold'),
    bombEmpireGold:  this._byId('bb-empire-gold'),
    upgradeBtn:   this._byId<HTMLButtonElement>('upgrade-button'),
    upgradeIcon:  this._byId('upgrade-icon'),
    upgradeName:  this._byId('upgrade-name'),
    upgradeDesc:  this._byId('upgrade-desc'),
    upgradeCost:  this._byId('upgrade-cost'),
    menu:         this._byId('menu'),
    menuBtn:      this._byId('menu-btn'),
    oppCount:     this._byId<HTMLInputElement>('opp-count'),
    bombBtn:      this._byId('bomb-btn'),
    bombCd:       this._byId('bomb-cd'),
    bombSheet:    this._byId('bombsheet'),
    fleetBtn:     this._byId('fleet-btn'),
    fleetCount:   this._byId('fleet-count'),
    fleetSheet:   this._byId('fleetsheet'),
    barracksBtn:    this._byId('barracks-btn'),
    barracksCd:     this._byId('barracks-cd'),
    barracksSheet:  this._byId('barrackssheet'),
    gopEmpireGold:  this._byId('gop-empire-gold'),
    leaderbar:    this._byId('leaderbar'),
    vassalLog:    this._byId('vassal-log'),
    commander:    this._byId('commander'),
    crownBtn:     this._byId('crown-btn'),
    cmdTreasury:  this._byId('cmd-treasury'),
    cmdProd:      this._byId('cmd-prod'),
    cmdTroops:    this._byId('cmd-troops'),
    cmdModeTabs:  this._byId('cmd-mode-tabs'),
    cmdAbilities: this._byId('ability-list'),
    cmdTabs:      this._byId('cmd-tabs'),
    cmdTree:      this._byId('cmd-tree'),
    cmdCancel:    this._byId('commander-cancel'),
    masteryPanel: this._byId('mastery'),
    masteryGrid:  this._byId('mastery-grid'),
    masteryTitle: this._byId('mastery-title'),
    masteryBlurb: this._byId('mastery-blurb'),
    masteryCancel:this._byId('mastery-cancel'),
    diploBtn:     this._byId('diplo-btn'),
    diploBadge:   this._byId('diplo-badge'),
    diploPanel:   this._byId('diplomacy'),
    diploList:    this._byId('diplo-list'),
    diploCancel:  this._byId('diplo-cancel'),
    tradeSheet:   this._byId('trade-sheet'),
    tradeTitle:   this._byId('trade-title'),
    tradeGold:    this._byId<HTMLInputElement>('trade-gold'),
    tradeGoldVal: this._byId('trade-gold-val'),
    tradeTroops:  this._byId<HTMLInputElement>('trade-troops'),
    tradeTroopsVal: this._byId('trade-troops-val'),
    tradeRate:    this._byId('trade-rate'),
    tradeConfirm: this._byId('trade-confirm'),
    tradeCancel:  this._byId('trade-cancel'),
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
  private shipBuildMode: ShipKind | null = null;
  private groundOpMode: GroundOpType | null = null;
  private buildSheetCoord: { x: number; y: number } | null = null;
  private enemyEls = new Map<number, { wrap: HTMLElement; num: HTMLElement; intel: HTMLElement }>();
  private cmdActiveBranch: DecreeBranch = 'economy';
  /** Diplomacy panel: hide "Other Nations" (peaceful, no relationship)
   *  by default so the panel reads as "your active relationships and
   *  requests" without scrolling past 50 names of strangers. Toggle
   *  via the "Show all" button at the bottom. */
  private diploShowAll = false;
  /** Trade prompt state. Target = the player we're composing an
   *  offer to. Game is paused while non-zero. */
  private tradePromptTarget: PlayerId = 0;
  private tpGiveKind: TradeCurrency = 'food';
  private tpTakeKind: TradeCurrency = 'stone';
  private tpGiveAmt = 5;
  private tpTakeAmt = 5;
  private cmdMode: CmdMode = 'abilities';
  private _cmdLastSig = '';
  private _lastBuyAt = 0;
  private _tradeTargetId: PlayerId = 0;

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
    this._wireFleet();
    this._wireBarracks();
    this._wireMenu();
    this._wireGameOver();
    this._wireTutorial();
    this._wireCommander();
    this._wireDiplomacy();
    this._wireWarInvite();
    this._wireTradePrompt();
    this._wireMastery();
    // Show the welcome tutorial automatically on first launch.
    try {
      if (!localStorage.getItem('territory:tutorial-seen')) this.showTutorial();
    } catch { /* ignore */ }
    // Mastery picker is shown automatically when the human hasn't picked
    // yet — fresh game = fresh choice. Re-openable via the crown panel
    // (read-only / re-pick for 3000 ♛).
    if (this.game.human().mastery == null) {
      // Defer one frame so the tutorial overlay (if any) sits underneath.
      setTimeout(() => this.showMastery(), 100);
    }
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
      // Sticky: stay in place mode so the player can drop several
      // settlements / turrets in a row without re-pressing the hotkey.
      // Esc or tapping the same hotkey again exits the mode.
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
      const label = type === 'ac130' ? 'AC-130 inbound' : `${type[0]!.toUpperCase()}${type.slice(1)} bomb launched`;
      this.toast(label);
      // Sticky: stay in bomb mode for back-to-back drops. Cooldown /
      // gold gates will block further drops naturally; Esc exits.
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

  // Ground-op aim mode (mirror of bomb-aim mode but for Barracks deployments)

  toggleGroundOpMode(type: GroundOpType): void {
    if (this.game.outcome) { this.groundOpMode = null; }
    else if (this.groundOpMode === type) this.groundOpMode = null;
    else this.groundOpMode = type;
    this.placeMode = null;
    this.bombMode = null;
    this.hideBuildSheet();
    this.hideBombSheet();
    this.hideBarracksSheet();
    this._refreshHotbar();
    this._refreshPlaceBanner();
    this._refreshBarracksFab();
  }

  clearGroundOpMode(): void {
    if (!this.groundOpMode) return;
    this.groundOpMode = null;
    this._refreshPlaceBanner();
    this._refreshBarracksFab();
  }

  /** Returns true if the tap was consumed by ground-op aim mode. */
  tryGroundOpAt(x: number, y: number): boolean {
    if (!this.groundOpMode) return false;
    const type = this.groundOpMode;
    const err = this.game.tryGroundOp(type, x, y, 1);
    if (err === null) {
      const labels: Record<GroundOpType, string> = {
        blitzkrieg: 'Blitzkrieg launched',
        artillery:  'Artillery strike',
        tanks:      'Tanks rolling',
      };
      this.toast(labels[type]);
      // Sticky so player can chain ops if multiple barracks ready.
      this._refreshPlaceBanner();
      this._refreshBarracksFab();
    } else {
      this.toast(this._groundOpErrorMsg(err));
    }
    return true;
  }

  showBarracksSheet(): void {
    if (!this.el.barracksSheet) return;
    if (!this.game.hasBarracks(1)) { this.toast('Build a Barracks first'); return; }
    this.clearPlaceMode();
    this.clearBombMode();
    this.groundOpMode = null;
    this._refreshHotbar();
    this._refreshPlaceBanner();
    this.el.barracksSheet.classList.add('show');
    this._refreshBarracksSheetButtons();
  }

  hideBarracksSheet(): void {
    this.el.barracksSheet?.classList.remove('show');
  }

  private _groundOpErrorMsg(err: GroundOpError): string {
    const msgs: Record<GroundOpError, string> = {
      'no-barracks': 'Build a Barracks first',
      'cooldown':    'Barracks reloading',
      'gold':        'Not enough gold',
      'resources':   'Not enough gems / oil',
      'oob':         'Out of bounds',
      'dead':        'You are eliminated',
      'bad-type':    'Unknown deployment',
    };
    return msgs[err];
  }

  // Long-press build sheet

  showBuildSheet(x: number, y: number): void {
    const me = this.game.human();
    if (!me.alive || this.game.outcome) return;
    if (this.game.territory.getOwner(x, y) !== me.id) {
      this.toast('Build on your own land');
      return;
    }
    this.clearPlaceMode();
    this.buildSheetCoord = { x, y };
    if (this.el.sheetCoords) this.el.sheetCoords.textContent = `${x}, ${y}`;
    const sheet = this.el.sheet;
    if (!sheet) return;
    const buildOpts = sheet.querySelector<HTMLElement>('.build-options');
    const upgradeOpts = sheet.querySelector<HTMLElement>('.upgrade-options');

    const existing = this.game.buildingAt(x, y);
    if (existing) {
      // Show upgrade variant
      if (existing.level >= this.game.config.BUILDING_MAX_LEVEL) {
        this.toast('Already max tier');
        return;
      }
      if (buildOpts) buildOpts.style.display = 'none';
      if (upgradeOpts) upgradeOpts.style.display = '';
      this._refreshUpgradeButton(existing);
    } else {
      if (buildOpts) buildOpts.style.display = '';
      if (upgradeOpts) upgradeOpts.style.display = 'none';
      this._refreshSheetButtons();
    }
    sheet.classList.add('show');
  }

  private _refreshUpgradeButton(b: Building): void {
    const me = this.game.human();
    const next = b.level + 1;
    const cost = this.game.upgradeCostFor(b.type, b.level);
    if (this.el.upgradeIcon) this.el.upgradeIcon.setAttribute('data-icon', b.type);
    if (this.el.upgradeName) this.el.upgradeName.textContent = `Upgrade ${b.type} → Lv ${next}`;
    if (this.el.upgradeDesc) this.el.upgradeDesc.textContent = this._upgradeDescription(b.type, next);
    if (this.el.upgradeCost) this.el.upgradeCost.textContent = String(cost);
    if (this.el.upgradeBtn) {
      const combined = this.game.combinedFundsFor(me.id);
      this.el.upgradeBtn.classList.toggle('disabled', combined < cost);
    }
  }

  private _upgradeDescription(type: BuildingType, lvl: number): string {
    if (type === 'settlement') {
      const goldMult = lvl;        // L2 → +200% in radius, L3 → +300%
      const flatGold = lvl * 5;
      const troops = lvl * 80;
      return `+${goldMult * 100}% gold (r6) · +${flatGold} g/s · +${troops} troops/s`;
    }
    if (type === 'turret') {
      const def = lvl * 4;
      const r = 5 + (lvl - 1);
      return `${1 + def}× attack difficulty · r${r} · ${lvl * 8} retaliation`;
    }
    if (type === 'airstrip') {
      const cdPct = Math.round((1 - Math.pow(0.85, lvl - 1)) * 100);
      const radPct = Math.round((lvl - 1) * 10);
      return `Bombs: ${cdPct}% faster reload · +${radPct}% radius`;
    }
    if (type === 'aa') {
      // Higher tiers tighten the firing ring (more chances per pass)
      // and bump radius slightly. Implementation today scales radius
      // via the level read in game.ts (only base used currently); keep
      // the description aspirational for now.
      return `Anti-air r${7 + (lvl - 1)} · 75% chance per AA · L${lvl}`;
    }
    return '';
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
    if (this.el.gold)     this.el.gold.textContent     = String(Math.floor(me.gold));
    if (this.el.treasury) this.el.treasury.textContent = String(Math.floor(me.treasury));
    if (this.el.rsFood)  this.el.rsFood.textContent  = String(Math.floor(me.resources.food));
    if (this.el.rsWood)  this.el.rsWood.textContent  = String(Math.floor(me.resources.wood));
    if (this.el.rsStone) this.el.rsStone.textContent = String(Math.floor(me.resources.stone));
    if (this.el.rsOil)   this.el.rsOil.textContent   = String(Math.floor(me.resources.oil));
    if (this.el.rsGems)  this.el.rsGems.textContent  = String(Math.floor(me.resources.gems));
    // Net trade flow per currency, summed across all human-side
    // resource trades. Shown as a green/red chip next to the stat
    // so the player sees "I'm bleeding stone" at a glance without
    // opening the diplomacy panel.
    this._refreshResourceFlowChips();
    if (this.el.routes) {
      let n = 0;
      for (const r of this.game.tradeRoutes) if (r.ownerId === me.id) n++;
      this.el.routes.textContent = String(n);
    }
    if (this.el.tradeFlow) {
      const flowPerTick = this.game.tradeFlowFor(me.id);
      const flowPerSec = flowPerTick * this.game.config.SIM_HZ;
      this.el.tradeFlow.textContent = flowPerSec >= 0.05
        ? `+${flowPerSec.toFixed(1)}/s`
        : 'routes';
    }
    if (this.el.masteryBadge) {
      const mb = this.el.masteryBadge;
      mb.classList.remove('ground', 'air', 'naval', 'unset');
      if (me.mastery == null) {
        mb.classList.add('unset');
        mb.textContent = 'PICK PATH';
      } else {
        mb.classList.add(me.mastery);
        mb.textContent = me.mastery.toUpperCase();
      }
    }
    if (this.el.pct) {
      const pct = this.game.totalLand > 0 ? owned / this.game.totalLand : 0;
      // 1 decimal until close to the win threshold, then 2 for tension.
      const display = pct >= 0.85 ? (pct * 100).toFixed(1) : Math.floor(pct * 100).toString();
      this.el.pct.textContent = display + '%';
    }
    if (this.el.stop) {
      const showStop = me.alive && me.expanding && !this.game.outcome;
      this.el.stop.classList.toggle('hidden', !showStop);
      // Focus readout — shows the manual-target multiplier so the
      // player feels how concentrated their push is. 1 target = 3×,
      // 3 = 1× (baseline), more dilutes further.
      const n = me.targetRegions.length;
      if (n > 0) {
        const mult = this.game.config.MANUAL_FOCUS_BOOST / n;
        this.el.stop.textContent = `STOP · ${mult.toFixed(mult >= 1 ? 1 : 2)}×`;
      } else {
        this.el.stop.textContent = 'STOP';
      }
    }
    if (this.el.hint) {
      // Hint stays visible (and pulses) any time the player has nothing
      // targeted — gives them a clear "tap a region" cue without nagging
      // toasts. Hidden on game over so it doesn't fight the overlay.
      // "idle" = no manual targets AND no fully-owned regions yet (no
      // vassals to autopilot). Hint stays visible until they tap.
      const idle = !this.game.outcome && me.alive
        && me.targetRegions.length === 0
        && this.game.fullRegionsForOwner(me.id) === 0;
      this.el.hint.style.display = idle ? '' : 'none';
      this.el.hint.classList.toggle('idle', idle);
    }
    if (this.buildSheetCoord) {
      const existing = this.game.buildingAt(this.buildSheetCoord.x, this.buildSheetCoord.y);
      if (existing && existing.level < this.game.config.BUILDING_MAX_LEVEL) {
        this._refreshUpgradeButton(existing);
      } else {
        this._refreshSheetButtons();
      }
    }
    this._refreshHotbar();
    this._refreshBombFab();
    this._refreshFleetFab();
    this._refreshBarracksFab();
    if (this.el.bombSheet?.classList.contains('show')) this._refreshBombSheetButtons();
    if (this.el.barracksSheet?.classList.contains('show')) this._refreshBarracksSheetButtons();
    if (this.el.fleetSheet?.classList.contains('show')) this._refreshFleetSheetButtons();
    if (this.el.commander?.classList.contains('show')) this._refreshCommander();
    if (this.el.diploPanel?.classList.contains('show')) this._renderDiplomacy();
    this._refreshLeaderBar();
    this._refreshWarInvite();
    this._refreshResourceOffer();
    this._refreshDiploBadge();
    const spy = (me.decreeStacks['spy-network'] ?? 0) > 0;
    for (const [id, ref] of this.enemyEls) {
      const p = this.game.players[id];
      if (!p) continue;
      const cnt = this.game.territory.counts[id]!;
      ref.num.textContent = String(cnt);
      ref.wrap.classList.toggle('dead', cnt === 0);
      if (spy && cnt > 0) {
        ref.intel.textContent = formatTroops(p.troops);
        ref.wrap.classList.add('with-intel');
      } else {
        ref.intel.textContent = '';
        ref.wrap.classList.remove('with-intel');
      }
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
      const intel = document.createElement('i');
      intel.className = 'intel';
      intel.textContent = '';
      wrap.appendChild(intel);
      this.el.enemies.appendChild(wrap);
      this.enemyEls.set(id, { wrap, num, intel });
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
      // The upgrade button has no data-type — it's wired below.
      if (btn.id === 'upgrade-button') return;
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
    this.el.upgradeBtn?.addEventListener('click', () => {
      if (!this.buildSheetCoord) return;
      const { x, y } = this.buildSheetCoord;
      const err = this.game.tryUpgrade(x, y, 1);
      if (err === null) {
        this.toast('Upgraded');
        this.hideBuildSheet();
      } else {
        this.toast(this._buildErrorMsg(err));
      }
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

  private _wireBarracks(): void {
    this.el.barracksBtn?.addEventListener('click', () => {
      if (this.groundOpMode) { this.clearGroundOpMode(); return; }
      if (this.el.barracksSheet?.classList.contains('show')) { this.hideBarracksSheet(); return; }
      this.showBarracksSheet();
    });
    if (this.el.barracksSheet) {
      this.el.barracksSheet.querySelectorAll<HTMLButtonElement>('.bb-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const op = btn.dataset['gop'] as GroundOpType | undefined;
          if (!op) return;
          this.hideBarracksSheet();
          this.toggleGroundOpMode(op);
        });
      });
      this.el.barracksSheet.querySelector<HTMLButtonElement>('.bs-cancel')
        ?.addEventListener('click', () => this.hideBarracksSheet());
    }
  }

  private _wireFleet(): void {
    this.el.fleetBtn?.addEventListener('click', () => {
      if (this.shipBuildMode) { this.clearShipBuildMode(); return; }
      if (this.el.fleetSheet?.classList.contains('show')) { this.hideFleetSheet(); return; }
      this.showFleetSheet();
    });
    if (this.el.fleetSheet) {
      this.el.fleetSheet.querySelectorAll<HTMLButtonElement>('.sb-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const kind = btn.dataset['ship'] as ShipKind | undefined;
          if (!kind || !SHIP_TYPES.includes(kind)) return;
          this.hideFleetSheet();
          this.toggleShipBuildMode(kind);
        });
      });
      this.el.fleetSheet.querySelector<HTMLButtonElement>('.bs-cancel')
        ?.addEventListener('click', () => this.hideFleetSheet());
    }
  }

  showFleetSheet(): void {
    if (!this.el.fleetSheet) return;
    this.clearPlaceMode();
    this.bombMode = null;
    this.shipBuildMode = null;
    this._refreshHotbar();
    this._refreshPlaceBanner();
    this._refreshBombFab();
    this.el.fleetSheet.classList.add('show');
    this._refreshFleetSheetButtons();
  }

  hideFleetSheet(): void {
    this.el.fleetSheet?.classList.remove('show');
  }

  toggleShipBuildMode(kind: ShipKind): void {
    if (this.game.outcome) { this.shipBuildMode = null; }
    else if (this.shipBuildMode === kind) this.shipBuildMode = null;
    else this.shipBuildMode = kind;
    this.placeMode = null;
    this.bombMode = null;
    this._refreshHotbar();
    this._refreshPlaceBanner();
    this._refreshBombFab();
  }

  clearShipBuildMode(): void {
    if (!this.shipBuildMode) return;
    this.shipBuildMode = null;
    this._refreshPlaceBanner();
  }

  /** Returns true if the tap was consumed by ship-build mode. */
  tryBuildShipAt(x: number, y: number): boolean {
    if (!this.shipBuildMode) return false;
    const kind = this.shipBuildMode;
    const err = this.game.buildShip(kind, x, y, 1);
    if (err === null) {
      this.toast(`${kind} launched`);
      // Sticky: stay in ship-build mode so the player can launch a
      // fleet without re-opening the sheet between each ship. Fleet
      // cap / gold will block further; Esc exits.
      this._refreshPlaceBanner();
    } else {
      this.toast(this._shipErrorMsg(err));
    }
    return true;
  }

  private _shipErrorMsg(err: ShipBuildError): string {
    const msgs: Record<ShipBuildError, string> = {
      'gold':         'Not enough gold',
      'dead':         'You are eliminated',
      'oob':          'Out of bounds',
      'bad-type':     'Unknown ship',
      'not-coastal':  'Tap your own coastal land',
      'no-water':     'No adjacent water',
      'cap':          'Fleet at capacity',
      'locked':       'Naval mastery required',
      'no-port':      'Build a Defense Port first',
    };
    return msgs[err];
  }

  private _refreshFleetSheetButtons(): void {
    if (!this.el.fleetSheet) return;
    const me = this.game.human();
    const navalLocked = !this.game.isUnlocked(1, 'ships');
    const combined = this.game.combinedFundsFor(me.id);
    if (this.el.fleetEmpireGold) this.el.fleetEmpireGold.textContent = String(Math.floor(combined));
    this.el.fleetSheet.querySelectorAll<HTMLButtonElement>('.sb-btn').forEach((btn) => {
      const kind = btn.dataset['ship'] as ShipKind | undefined;
      if (!kind) return;
      const cost = this.game.config.SHIP_COSTS[kind];
      const costEl = btn.querySelector('.bs-cost');
      if (costEl) costEl.textContent = navalLocked ? '🔒' : String(cost);
      btn.classList.toggle('disabled', navalLocked || combined < cost);
    });
  }

  private _refreshFleetFab(): void {
    if (!this.el.fleetBtn) return;
    if (this.game.outcome) {
      this.el.fleetBtn.classList.add('hidden');
      return;
    }
    // Hide entirely until the player owns a Defense Port — ports are
    // now the gate for fleet construction (parallel to airstrips for
    // bombs and barracks for ground ops).
    if (!this.game.hasPort(1)) {
      this.el.fleetBtn.classList.add('hidden');
      return;
    }
    this.el.fleetBtn.classList.remove('hidden');
    const myShips = this.game.ships.reduce((n, s) => s.owner === 1 ? n + 1 : n, 0);
    const cap = this.game.config.SHIP_PLAYER_CAP + (this.game.human().mastery === 'naval' ? 2 : 0);
    if (this.el.fleetCount) this.el.fleetCount.textContent = `${myShips}/${cap}`;
    this.el.fleetBtn.classList.toggle('aiming', !!this.shipBuildMode);
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

  private _refreshBarracksFab(): void {
    if (!this.el.barracksBtn) return;
    const has = this.game.hasBarracks(1);
    this.el.barracksBtn.classList.toggle('hidden', !has || !!this.game.outcome);
    if (!has) return;
    this.el.barracksBtn.classList.toggle('aiming', !!this.groundOpMode);
    this.el.barracksBtn.classList.toggle('armed',  !this.groundOpMode);
    if (this.el.barracksCd) {
      this.el.barracksCd.textContent = this.groundOpMode
        ? this.groundOpMode.toUpperCase()
        : 'GND';
    }
  }

  private _refreshBarracksSheetButtons(): void {
    if (!this.el.barracksSheet) return;
    const me = this.game.human();
    const combined = this.game.combinedFundsFor(me.id);
    if (this.el.gopEmpireGold) this.el.gopEmpireGold.textContent = String(Math.floor(combined));
    this.el.barracksSheet.querySelectorAll<HTMLButtonElement>('.bb-btn').forEach((btn) => {
      const op = btn.dataset['gop'] as GroundOpType | undefined;
      if (!op) return;
      const cost = this.game.config.GROUND_OP_COSTS[op];
      const resCost = this.game.config.GROUND_OP_RESOURCE_COSTS[op] ?? {};
      const ready = this.game.barracksReadyAt(1, op);
      const cooling = ready < 0 ? false : ready > this.game.tickCount;
      const costEl = btn.querySelector('.bs-cost');
      if (costEl) costEl.textContent = String(cost);
      // Resource cost row — short labels colored by resource. Marks
      // the line red when the player can't currently afford a kind.
      let resOk = true;
      const resEl = btn.querySelector<HTMLElement>('.bs-res');
      if (resEl) {
        const parts: string[] = [];
        for (const [kind, need] of Object.entries(resCost)) {
          if ((need ?? 0) <= 0) continue;
          const have = me.resources[kind as keyof typeof me.resources] ?? 0;
          if (have < (need ?? 0)) resOk = false;
          parts.push(`<span class="r-${kind}">${need} ${kind}</span>`);
        }
        resEl.innerHTML = parts.join(' · ');
        resEl.classList.toggle('short', !resOk && parts.length > 0);
      }
      btn.classList.toggle('disabled', cooling || combined < cost || !resOk);
    });
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
    const combined = this.game.combinedFundsFor(me.id);
    if (this.el.bombEmpireGold) this.el.bombEmpireGold.textContent = String(Math.floor(combined));
    this.el.bombSheet.querySelectorAll<HTMLButtonElement>('.bb-btn').forEach((btn) => {
      const type = btn.dataset['bomb'] as BombType | undefined;
      if (!type) return;
      const cost = this.game.config.BOMB_COSTS[type];
      const resCost = this.game.config.BOMB_RESOURCE_COSTS[type] ?? {};
      const costEl = btn.querySelector('.bs-cost');
      if (costEl) costEl.textContent = String(cost);
      let resOk = true;
      const resEl = btn.querySelector<HTMLElement>('.bs-res');
      if (resEl) {
        const parts: string[] = [];
        for (const [kind, need] of Object.entries(resCost)) {
          if ((need ?? 0) <= 0) continue;
          const have = me.resources[kind as keyof typeof me.resources] ?? 0;
          if (have < (need ?? 0)) resOk = false;
          parts.push(`<span class="r-${kind}">${need} ${kind}</span>`);
        }
        resEl.innerHTML = parts.join(' · ');
        resEl.classList.toggle('short', !resOk && parts.length > 0);
      }
      btn.classList.toggle('disabled', cooling || combined < cost || !resOk);
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

  private _wireCommander(): void {
    this.el.crownBtn?.addEventListener('click', () => this.showCommander());
    this.el.cmdCancel?.addEventListener('click', () => this.hideCommander());
    this.el.commander?.addEventListener('click', (e) => {
      if (e.target === this.el.commander) this.hideCommander();
    });
    this.el.cmdModeTabs?.querySelectorAll<HTMLButtonElement>('.cmd-mode').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset['mode'] as CmdMode | undefined;
        if (!mode) return;
        this.cmdMode = mode;
        this._cmdLastSig = '';
        this._refreshCommander();
      });
    });
    this.el.cmdTabs?.querySelectorAll<HTMLButtonElement>('.cmd-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const branch = btn.dataset['branch'] as DecreeBranch | undefined;
        if (!branch) return;
        this.cmdActiveBranch = branch;
        this._cmdLastSig = '';
        this._refreshCommander();
      });
    });
    this.el.cmdTree?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.dn-buy');
      if (!btn || btn.disabled) return;
      const id = btn.dataset['decree'];
      if (id) this._buyDecree(id);
    });
    this.el.cmdAbilities?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.ab-fire');
      if (!btn || btn.disabled) return;
      const id = btn.dataset['ability'];
      if (id) this._fireAbility(id);
    });
  }

  showCommander(): void {
    this._cmdLastSig = '';
    this._refreshCommander();
    this.el.commander?.classList.add('show');
  }

  hideCommander(): void {
    this.el.commander?.classList.remove('show');
  }

  private _refreshCommander(): void {
    const me = this.game.human();
    if (this.el.cmdTreasury) this.el.cmdTreasury.textContent = String(Math.floor(me.treasury));
    if (this.el.cmdTroops)   this.el.cmdTroops.textContent   = formatTroops(me.troops);
    if (this.el.cmdProd) {
      const stacks = me.decreeStacks['production'] ?? 0;
      const pct = stacks * this.game.config.DECREE_PRODUCTION_BOOST * 100;
      this.el.cmdProd.textContent = pct === 0 ? '+0%' : `+${pct.toFixed(0)}%`;
    }
    if (this.el.cmdModeTabs) {
      this.el.cmdModeTabs.querySelectorAll<HTMLButtonElement>('.cmd-mode').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset['mode'] === this.cmdMode);
      });
    }
    const showAbilities = this.cmdMode === 'abilities';
    if (this.el.cmdAbilities) this.el.cmdAbilities.style.display = showAbilities ? '' : 'none';
    if (this.el.cmdTabs) this.el.cmdTabs.style.display = showAbilities ? 'none' : '';
    if (this.el.cmdTree) this.el.cmdTree.style.display = showAbilities ? 'none' : '';

    if (showAbilities) {
      this._renderAbilities();
    } else {
      if (this.el.cmdTabs) {
        this.el.cmdTabs.querySelectorAll<HTMLButtonElement>('.cmd-tab').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset['branch'] === this.cmdActiveBranch);
        });
      }
      this._renderDecreeTree();
    }
  }

  private _renderAbilities(): void {
    const list = this.el.cmdAbilities;
    if (!list) return;
    const me = this.game.human();
    const tick = this.game.tickCount;
    // Build/refresh node-per-ability so the DOM stays stable across frames
    // and clicks survive re-renders. Existing nodes' state is updated; new
    // ones are created on first render.
    if (list.childElementCount !== ABILITIES.length) {
      list.innerHTML = '';
      for (const a of ABILITIES) {
        const row = document.createElement('div');
        row.className = 'ability-node';
        row.dataset['ability'] = a.id;
        row.innerHTML = `
          <div class="an-head">
            <span class="an-name"></span>
            <span class="an-cd"></span>
          </div>
          <div class="an-desc"></div>
          <div class="an-foot">
            <span class="an-cost"></span>
            <button class="ab-fire" type="button" data-ability="${a.id}">FIRE</button>
          </div>
        `;
        list.appendChild(row);
      }
    }
    list.querySelectorAll<HTMLElement>('.ability-node').forEach((row) => {
      const id = row.dataset['ability']!;
      const a = ABILITIES.find(x => x.id === id);
      if (!a) return;
      const ready = this.game.abilityReadyAt(1, id);
      const cooling = ready > tick;
      const expires = this.game.buffExpireAt(1, id);
      const active = expires > tick;
      const canAfford = me.treasury >= a.cost;
      const needsTarget = a.needsEnemy;

      row.classList.toggle('cooling', cooling);
      row.classList.toggle('active', active);
      row.classList.toggle('cant-afford', !cooling && !canAfford);

      const name = row.querySelector<HTMLElement>('.an-name');
      if (name) name.textContent = a.name;
      const cd = row.querySelector<HTMLElement>('.an-cd');
      if (cd) {
        if (active) {
          const remain = Math.max(0, Math.ceil((expires - tick) / this.game.config.SIM_HZ));
          cd.textContent = `ACTIVE · ${remain}s`;
        } else if (cooling) {
          const remain = Math.max(0, Math.ceil((ready - tick) / this.game.config.SIM_HZ));
          cd.textContent = `${remain}s`;
        } else {
          cd.textContent = 'READY';
        }
      }
      const desc = row.querySelector<HTMLElement>('.an-desc');
      if (desc) desc.textContent = a.desc + (needsTarget ? ' · pick target in Diplomacy' : '');
      const cost = row.querySelector<HTMLElement>('.an-cost');
      if (cost) cost.textContent = `${a.cost}♛`;
      const fire = row.querySelector<HTMLButtonElement>('.ab-fire');
      if (fire) {
        fire.disabled = cooling || !canAfford || needsTarget;
        fire.textContent = needsTarget ? 'IN DIPLOMACY' : 'FIRE';
      }
    });
  }

  private _fireAbility(id: string, targetId?: PlayerId): void {
    const now = performance.now();
    if (now - this._lastBuyAt < 250) return;
    this._lastBuyAt = now;
    const err = this.game.activateAbility(1, id, targetId);
    if (err === null) {
      this.toast('Ability fired');
      this._cmdLastSig = '';
      this._refreshCommander();
      return;
    }
    if (err === 'gold') this.toast('Treasury too low');
    else if (err === 'cooldown') this.toast('On cooldown');
    else if (err === 'no-target' || err === 'bad-target') this.toast('Pick a valid target');
    else this.toast('Cannot fire');
  }

  // Tree rendering is split in two so the DOM stays stable during a tap:
  //   - _renderDecreeTree rebuilds nodes ONLY when branch or stack counts
  //     change (rare). Cost / disabled state are NOT in the signature so a
  //     ticking gold counter doesn't blow away the buttons mid-click.
  //   - _updateDecreeAffordability runs every frame and only flips
  //     classes / disabled / dynamic cost text on existing buttons.
  private _renderDecreeTree(): void {
    const tree = this.el.cmdTree;
    if (!tree) return;
    const me = this.game.human();
    const branch = this.cmdActiveBranch;
    let stackSig = '';
    for (const d of DECREES) stackSig += (me.decreeStacks[d.id] ?? 0) + '.';
    const sig = `${branch}|${stackSig}`;
    if (sig === this._cmdLastSig) {
      this._updateDecreeAffordability();
      return;
    }
    this._cmdLastSig = sig;

    tree.innerHTML = '';
    const nodes = DECREES.filter(d => d.branch === branch).slice().sort((a, b) => a.tier - b.tier);
    for (const d of nodes) {
      const stacks = me.decreeStacks[d.id] ?? 0;
      const prereqMet = !d.prereq || (me.decreeStacks[d.prereq] ?? 0) > 0;
      const owned = stacks > 0;

      const row = document.createElement('div');
      row.className = 'decree-node';
      row.classList.add(`tier-${d.tier}`);
      row.dataset['decree'] = d.id;
      if (d.comingSoon) row.classList.add('coming-soon');
      else if (!prereqMet) row.classList.add('locked');
      else if (!d.stackable && owned) row.classList.add('owned');

      const head = document.createElement('div');
      head.className = 'dn-head';
      const name = document.createElement('span');
      name.className = 'dn-name';
      name.textContent = `T${d.tier} · ${d.name}`;
      head.appendChild(name);
      if (stacks > 0) {
        const badge = document.createElement('span');
        badge.className = 'dn-stacks';
        badge.textContent = d.stackable ? `×${stacks}` : 'OWNED';
        head.appendChild(badge);
      }
      row.appendChild(head);

      const desc = document.createElement('div');
      desc.className = 'dn-desc';
      desc.textContent = d.desc;
      row.appendChild(desc);

      const foot = document.createElement('div');
      foot.className = 'dn-foot';
      const costEl = document.createElement('span');
      costEl.className = 'dn-cost';
      foot.appendChild(costEl);

      const buy = document.createElement('button');
      buy.className = 'dn-buy';
      buy.type = 'button';
      buy.dataset['decree'] = d.id;
      buy.textContent = (d.comingSoon || !prereqMet || (!d.stackable && owned))
        ? '—'
        : (d.oneShot ? 'ISSUE' : 'DECREE');
      foot.appendChild(buy);
      row.appendChild(foot);

      tree.appendChild(row);
    }
    this._updateDecreeAffordability();
  }

  // Per-frame cheap update: gold ticks change affordability + war-bonds
  // dynamic cost. We mutate existing nodes instead of rebuilding the DOM.
  private _updateDecreeAffordability(): void {
    const tree = this.el.cmdTree;
    if (!tree) return;
    const me = this.game.human();
    const rows = tree.children;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLElement;
      const id = row.dataset['decree'];
      if (!id) continue;
      const d = DECREES.find(x => x.id === id);
      if (!d) continue;
      const stacks = me.decreeStacks[d.id] ?? 0;
      const prereqMet = !d.prereq || (me.decreeStacks[d.prereq] ?? 0) > 0;
      const owned = stacks > 0;
      const locked = !!d.comingSoon || !prereqMet || (!d.stackable && owned);
      const cost = d.id === 'war-bonds' ? Math.floor(me.treasury * 0.30) : d.cost;
      const canAfford = me.treasury >= cost;

      row.classList.toggle('cant-afford', !locked && !canAfford);

      const costEl = row.querySelector<HTMLElement>('.dn-cost');
      if (costEl) {
        costEl.classList.remove('soon');
        if (d.comingSoon) {
          costEl.textContent = 'Coming soon';
          costEl.classList.add('soon');
        } else if (!prereqMet) {
          const pre = DECREES.find(x => x.id === d.prereq);
          costEl.textContent = `Locked · needs ${pre?.name ?? d.prereq}`;
          costEl.classList.add('soon');
        } else if (!d.stackable && owned) {
          costEl.textContent = 'Issued';
          costEl.classList.add('soon');
        } else {
          costEl.textContent = `${cost}g`;
        }
      }
      const buy = row.querySelector<HTMLButtonElement>('.dn-buy');
      if (buy) buy.disabled = locked || !canAfford;
    }
  }

  private _buyDecree(id: string): void {
    // Debounce double-fires from synthesized click + touch events on mobile.
    const now = performance.now();
    if (now - this._lastBuyAt < 250) return;
    this._lastBuyAt = now;

    const err = this.game.buyDecree(1, id);
    if (err === null) {
      this.toast('Decree issued');
      this._cmdLastSig = '';
      this._refreshCommander();
      return;
    }
    if (err === 'gold')   this.toast('Treasury too low');
    else if (err === 'locked') this.toast('Locked — buy prereq first');
    else if (err === 'dead')   this.toast('You are eliminated');
    else this.toast('Cannot decree');
  }

  // --- Diplomacy --------------------------------------------------------

  private _wireDiplomacy(): void {
    this.el.diploBtn?.addEventListener('click', () => this.showDiplomacy());
    this.el.diploCancel?.addEventListener('click', () => this.hideDiplomacy());
    this.el.diploPanel?.addEventListener('click', (e) => {
      if (e.target === this.el.diploPanel) this.hideDiplomacy();
    });
    this.el.diploList?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.diplo-act');
      if (!target || target.disabled) return;
      const idStr = target.dataset['target'];
      const action = target.dataset['action'];
      if (!action) return;
      // Trade-status accept/decline buttons key off `data-idx`, not
      // `data-target`. Allow the dispatch to continue without a pid
      // for those, but require pid for everything else.
      const needsPid = action !== 'rtrade-accept' && action !== 'rtrade-decline';
      if (needsPid && !idStr) return;
      const pid = idStr ? parseInt(idStr, 10) : 0;
      if (action === 'trade')          this._openTrade(pid);
      else if (action === 'alliance')  this._proposeAlliance(pid);
      else if (action === 'break')     this._breakAlliance(pid);
      else if (action === 'embargo')   this._fireAbility('embargo', pid);
      else if (action === 'route')     this._proposeTradeRoute(pid);
      else if (action === 'route-end') this._breakTradeRoute(pid);
      else if (action === 'war')       this._declareWar(pid);
      else if (action === 'peace')     this._suePeace(pid);
      else if (action === 'coerce')    this._coerceAlly(pid);
      else if (action === 'rtrade-open')   this.showTradePrompt(pid);
      else if (action === 'rtrade-cancel') this._cancelResourceTrade(pid);
      else if (action === 'rtrade-accept') {
        const idx = parseInt(target.dataset['idx'] ?? '-1', 10);
        if (idx < 0) return;
        const off = this.game.pendingResourceOffers[idx];
        if (!off) return;
        const from = this.game.players[off.from];
        if (this.game.acceptResourceOffer(idx)) {
          this.toast(`Trade with ${from?.name ?? 'AI'} accepted`);
        }
        this._refreshResourceOffer();
        this._renderDiplomacy();
      } else if (action === 'rtrade-decline') {
        const idx = parseInt(target.dataset['idx'] ?? '-1', 10);
        if (idx < 0) return;
        const off = this.game.pendingResourceOffers[idx];
        if (!off) return;
        const from = this.game.players[off.from];
        this.game.declineResourceOffer(idx);
        this.toast(`Declined ${from?.name ?? 'AI'}'s offer`);
        this._refreshResourceOffer();
        this._renderDiplomacy();
      }
    });

    // Trade sheet wiring
    this.el.tradeCancel?.addEventListener('click', () => this.hideTrade());
    this.el.tradeSheet?.addEventListener('click', (e) => {
      if (e.target === this.el.tradeSheet) this.hideTrade();
    });
    this.el.tradeGold?.addEventListener('input', () => this._refreshTradeRate());
    this.el.tradeTroops?.addEventListener('input', () => this._refreshTradeRate());
    this.el.tradeConfirm?.addEventListener('click', () => this._confirmTrade());
  }

  showDiplomacy(): void {
    this._renderDiplomacy();
    this.el.diploPanel?.classList.add('show');
  }

  hideDiplomacy(): void {
    this.el.diploPanel?.classList.remove('show');
  }

  private _renderDiplomacy(): void {
    const list = this.el.diploList;
    if (!list) return;
    const me = this.game.human();
    const tick = this.game.tickCount;
    const palette = this.game.config.PLAYER_COLORS;
    const spy = this.game.spyActive(1);

    // Collect alive enemies first so we can diff against the existing DOM.
    const enemyIds: number[] = [];
    for (let id = 2; id < this.game.players.length; id++) {
      const p = this.game.players[id];
      if (!p || !p.alive) continue;
      if ((this.game.territory.counts[id] ?? 0) === 0) continue;
      enemyIds.push(id);
    }
    if (enemyIds.length === 0) {
      if (list.dataset['empty'] !== '1') {
        list.innerHTML = '<p class="diplo-empty">No alive enemies to negotiate with.</p>';
        list.dataset['empty'] = '1';
      }
      return;
    }
    if (list.dataset['empty'] === '1') {
      list.innerHTML = '';
      list.dataset['empty'] = '0';
    }

    // Bucket players by relationship so the panel reads at a glance:
    // allies on top (you actually want to manage these), then anyone
    // at war, then peace-and-neutral collapsed at the bottom. Without
    // this the panel was just "AI 1 / AI 2 / AI 3..." with no way to
    // tell who's who.
    const allies: number[] = [];
    const wars: number[] = [];
    const others: number[] = [];
    for (const id of enemyIds) {
      if (this.game.areAllied(1, id))   allies.push(id);
      else if (this.game.areAtWar(1, id)) wars.push(id);
      else others.push(id);
    }

    // Signature includes section assignment so the DOM rebuilds when
    // a player switches buckets (alliance formed/broken, war declared,
    // peace signed). Per-frame field updates handle the rest.
    // Show-all toggle also goes in the sig so flipping it rebuilds.
    // Trade-status sig (offers + actives) so the top section rebuilds
    // when an offer arrives or a trade starts/ends.
    const offerSig = this.game.pendingResourceOffers
      .map(o => `${o.from}:${o.aGives}/${o.aGivesPerSec}>${o.bGives}/${o.bGivesPerSec}`)
      .join(',');
    const tradeSig = this.game.resourceTrades
      .map(t => `${t.a}-${t.b}:${t.aGives}/${t.aGivesPerSec}>${t.bGives}/${t.bGivesPerSec}`)
      .join(',');
    const sig = `a:${allies.join(',')}|w:${wars.join(',')}|o:${others.join(',')}|all:${this.diploShowAll ? 1 : 0}|po:${offerSig}|tr:${tradeSig}`;
    if (list.dataset['sig'] !== sig) {
      list.dataset['sig'] = sig;
      list.innerHTML = '';
      this._renderTradeStatusBlock(list);
      const renderRow = (id: number, kind: 'ally' | 'war' | 'other'): void => {
        const p = this.game.players[id]!;
        const c = palette[id];
        const tint = c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888';
        const m = p.mastery ?? 'ground';
        const row = document.createElement('div');
        row.className = `diplo-node section-${kind}`;
        row.dataset['enemy'] = String(id);
        row.innerHTML = `
          <div class="dn-head">
            <span class="dn-dot" style="background:${tint}"></span>
            <span class="dn-name">${p.name}</span>
            <span class="mastery-badge ${m}" style="margin-left:auto">${m.toUpperCase()}</span>
            <span class="diplo-tag war" style="display:none">WAR</span>
            <span class="diplo-tag ally" style="display:none"></span>
            <span class="diplo-tag route" style="display:none"></span>
            <span class="diplo-tag embargo" style="display:none"></span>
          </div>
          <i class="dn-intel"></i>
          <div class="dn-actions">
            <button class="diplo-act" data-action="trade"    data-target="${id}" type="button">Trade</button>
            <button class="diplo-act ally-btn" data-action="alliance" data-target="${id}" type="button">Propose Alliance</button>
            <button class="diplo-act route-btn" data-action="route" data-target="${id}" type="button" style="display:none">Trade Route</button>
            <button class="diplo-act rtrade-btn" data-action="rtrade-open" data-target="${id}" type="button">Resource Trade</button>
            <button class="diplo-act rtrade-cancel-btn" data-action="rtrade-cancel" data-target="${id}" type="button" style="display:none">Cancel Trade</button>
            <button class="diplo-act war-btn" data-action="war" data-target="${id}" type="button" style="display:none">Declare War</button>
            <button class="diplo-act coerce-btn" data-action="coerce" data-target="${id}" type="button" style="display:none">Make Them Fight</button>
            <button class="diplo-act embargo-btn" data-action="embargo" data-target="${id}" type="button">Embargo</button>
          </div>
          <div class="dn-rtrade" style="display:none"></div>
        `;
        list.appendChild(row);
      };
      const addHeader = (text: string, count: number, cls: string): void => {
        const h = document.createElement('div');
        h.className = `diplo-section-h ${cls}`;
        h.textContent = `${text} · ${count}`;
        list.appendChild(h);
      };

      if (allies.length > 0) {
        addHeader('YOUR ALLIES', allies.length, 'allies');
        for (const id of allies) renderRow(id, 'ally');
      }
      if (wars.length > 0) {
        addHeader('AT WAR', wars.length, 'wars');
        for (const id of wars) renderRow(id, 'war');
      }
      if (allies.length === 0 && wars.length === 0 && !this.diploShowAll) {
        const empty = document.createElement('p');
        empty.className = 'diplo-empty';
        empty.textContent = 'No active alliances or wars yet. Long-press an enemy region to propose a trade alliance.';
        list.appendChild(empty);
      }
      // "Other Nations" section — peace neighbors with no active deals.
      // Hidden by default to keep the panel focused on your real
      // relationships; toggleable so you can still find someone to
      // propose an alliance to from inside the panel.
      if (others.length > 0) {
        if (this.diploShowAll) {
          addHeader('OTHER NATIONS', others.length, 'others');
          for (const id of others) renderRow(id, 'other');
        }
        const toggle = document.createElement('button');
        toggle.className = 'diplo-act diplo-show-all';
        toggle.type = 'button';
        toggle.textContent = this.diploShowAll
          ? `Hide Other Nations`
          : `Show ${others.length} Other Nation${others.length === 1 ? '' : 's'}`;
        toggle.addEventListener('click', () => {
          this.diploShowAll = !this.diploShowAll;
          // Force DOM rebuild on next render.
          if (this.el.diploList) this.el.diploList.dataset['sig'] = '';
          this._renderDiplomacy();
        });
        list.appendChild(toggle);
      }
    }

    // Per-frame field updates only.
    const emb = ABILITIES.find(a => a.id === 'embargo')!;
    const embReady = this.game.abilityReadyAt(1, 'embargo');
    const embCooling = embReady > tick;
    const canAffordEmb = me.treasury >= emb.cost;
    list.querySelectorAll<HTMLElement>('.diplo-node').forEach((row) => {
      const id = parseInt(row.dataset['enemy'] ?? '0', 10);
      const p = this.game.players[id];
      if (!p) return;
      const owned = this.game.territory.counts[id] ?? 0;
      const allied = this.game.areAllied(1, id);
      const allianceExpire = this.game.allianceExpireAt(1, id);
      const embExp = this.game.buffExpireAt(id, 'embargoed');
      const embargoed = embExp > tick;

      const intel = row.querySelector<HTMLElement>('.dn-intel');
      if (intel) intel.textContent = spy ? `${formatTroops(p.troops)} troops · ${owned} tiles` : `${owned} tiles`;

      const allyTag = row.querySelector<HTMLElement>('.diplo-tag.ally');
      if (allyTag) {
        if (allied) {
          allyTag.style.display = '';
          // Permanent alliances show "ALLY" without a countdown; legacy
          // time-limited ones still show seconds remaining.
          if (allianceExpire >= Number.MAX_SAFE_INTEGER || !isFinite(allianceExpire)) {
            allyTag.textContent = 'ALLY';
          } else {
            allyTag.textContent = `ALLY · ${Math.max(0, Math.ceil((allianceExpire - tick) / this.game.config.SIM_HZ))}s`;
          }
        } else {
          allyTag.style.display = 'none';
        }
      }
      // War status tag.
      const atWar = this.game.areAtWar(1, id);
      const warTag = row.querySelector<HTMLElement>('.diplo-tag.war');
      if (warTag) warTag.style.display = atWar ? '' : 'none';
      const embTag = row.querySelector<HTMLElement>('.diplo-tag.embargo');
      if (embTag) {
        if (embargoed) {
          embTag.style.display = '';
          embTag.textContent = `EMBARGOED · ${Math.max(0, Math.ceil((embExp - tick) / this.game.config.SIM_HZ))}s`;
        } else {
          embTag.style.display = 'none';
        }
      }

      const allyBtn = row.querySelector<HTMLButtonElement>('.ally-btn');
      if (allyBtn) {
        if (allied) {
          allyBtn.dataset['action'] = 'break';
          allyBtn.textContent = 'Break Alliance';
          allyBtn.disabled = false;
        } else {
          allyBtn.dataset['action'] = 'alliance';
          allyBtn.textContent = 'Propose Alliance';
          allyBtn.disabled = false;
        }
      }
      // War / Peace button. Only show on non-allied rows (you can't war
      // an ally without breaking the alliance first).
      const warBtn = row.querySelector<HTMLButtonElement>('.war-btn');
      if (warBtn) {
        if (allied) {
          warBtn.style.display = 'none';
        } else if (atWar) {
          warBtn.style.display = '';
          warBtn.dataset['action'] = 'peace';
          warBtn.textContent = 'Sue for Peace';
          warBtn.disabled = false;
        } else {
          warBtn.style.display = '';
          warBtn.dataset['action'] = 'war';
          warBtn.textContent = 'Declare War';
          warBtn.disabled = false;
        }
      }
      // Coerce: only show on allies, only enabled if the human is
      // currently at war with someone — clicking asks the ally to
      // declare war on every player you're fighting.
      const coerceBtn = row.querySelector<HTMLButtonElement>('.coerce-btn');
      if (coerceBtn) {
        if (allied) {
          coerceBtn.style.display = '';
          const myEnemies = this.game.enemiesOf(1);
          coerceBtn.disabled = myEnemies.length === 0;
          coerceBtn.textContent = myEnemies.length === 0
            ? 'Coerce (no war active)'
            : `Make Them Fight (${myEnemies.length})`;
        } else {
          coerceBtn.style.display = 'none';
        }
      }
      // Resource trade: open / cancel buttons + active flow summary.
      const rtrade = this.game.resourceTradeBetween(1, id);
      const rtradeBtn = row.querySelector<HTMLButtonElement>('.rtrade-btn');
      const rtradeCancelBtn = row.querySelector<HTMLButtonElement>('.rtrade-cancel-btn');
      const rtradeLine = row.querySelector<HTMLElement>('.dn-rtrade');
      if (rtradeBtn && rtradeCancelBtn) {
        if (rtrade) {
          rtradeBtn.style.display = 'none';
          rtradeCancelBtn.style.display = '';
        } else if (allied) {
          // Allies use trade-routes for gold flow, not resource trades.
          rtradeBtn.style.display = 'none';
          rtradeCancelBtn.style.display = 'none';
        } else {
          rtradeBtn.style.display = '';
          rtradeCancelBtn.style.display = 'none';
        }
      }
      if (rtradeLine) {
        if (rtrade) {
          rtradeLine.style.display = '';
          // Direction depends on who is `a`.
          const youGive = rtrade.a === 1 ? rtrade.aGives : rtrade.bGives;
          const youGiveAmt = rtrade.a === 1 ? rtrade.aGivesPerSec : rtrade.bGivesPerSec;
          const youGet = rtrade.a === 1 ? rtrade.bGives : rtrade.aGives;
          const youGetAmt = rtrade.a === 1 ? rtrade.bGivesPerSec : rtrade.aGivesPerSec;
          rtradeLine.textContent = `↻ ${youGiveAmt} ${youGive}/s → ⇄ ← ${youGetAmt} ${youGet}/s`;
        } else {
          rtradeLine.style.display = 'none';
        }
      }
      // Trade route: only available between allies. Shows current
      // per-tick flow when active so the player sees the income.
      const route = this.game.externalTradeRouteBetween(1, id);
      const routeTag = row.querySelector<HTMLElement>('.diplo-tag.route');
      if (routeTag) {
        if (route) {
          routeTag.style.display = '';
          // flow is per-tick; ×SIM_HZ → per-second readout. Both sides
          // earn this independently, so the tag shows the per-second
          // figure for the human side.
          const perSec = route.flow * this.game.config.SIM_HZ;
          routeTag.textContent = `ROUTE · +${perSec.toFixed(1)}♛/s`;
        } else {
          routeTag.style.display = 'none';
        }
      }
      const routeBtn = row.querySelector<HTMLButtonElement>('.route-btn');
      if (routeBtn) {
        if (allied && route) {
          routeBtn.style.display = '';
          routeBtn.dataset['action'] = 'route-end';
          routeBtn.textContent = 'End Trade Route';
          routeBtn.disabled = false;
        } else if (allied) {
          routeBtn.style.display = '';
          routeBtn.dataset['action'] = 'route';
          routeBtn.textContent = 'Open Trade Route';
          routeBtn.disabled = false;
        } else {
          routeBtn.style.display = 'none';
        }
      }
      const embBtn = row.querySelector<HTMLButtonElement>('.embargo-btn');
      if (embBtn) {
        embBtn.disabled = embCooling || !canAffordEmb || embargoed || allied;
        if (embCooling) embBtn.textContent = `Embargo · ${Math.ceil((embReady - tick) / this.game.config.SIM_HZ)}s`;
        else if (embargoed) embBtn.textContent = 'Embargo · active';
        else embBtn.textContent = `Embargo · ${emb.cost}♛`;
      }
    });
  }

  /** Renders the "TRADE STATUS" block at the top of the diplomacy
   *  panel — net flow per resource, all incoming offers ranked by
   *  deal score, and all active trades with cancel buttons. Inserted
   *  before the per-player rows. Called from _renderDiplomacy when
   *  the trade signature changes. */
  private _renderTradeStatusBlock(list: HTMLElement): void {
    const offers = this.game.pendingResourceOffers;
    const allTrades = this.game.resourceTrades;
    const trades = allTrades.filter(t => t.a === 1 || t.b === 1);
    const worldTrades = allTrades.filter(t => t.a !== 1 && t.b !== 1);
    if (offers.length === 0 && trades.length === 0 && worldTrades.length === 0) return;

    const me = this.game.human();
    const CURRENCIES: TradeCurrency[] = ['food', 'wood', 'stone', 'oil', 'gems', 'gold'];
    const palette = this.game.config.PLAYER_COLORS;

    // Net flow per currency (resources + gold): sum (received - sent)
    // across all trades. Trading 50 gold/s for 5 oil/s shows up here
    // as -50/s gold and +5/s oil — same red/green chip treatment.
    const flow: Record<TradeCurrency, number> = { food: 0, wood: 0, stone: 0, oil: 0, gems: 0, gold: 0 };
    for (const t of trades) {
      const youGive    = t.a === 1 ? t.aGives : t.bGives;
      const youGiveAmt = t.a === 1 ? t.aGivesPerSec : t.bGivesPerSec;
      const youGet     = t.a === 1 ? t.bGives : t.aGives;
      const youGetAmt  = t.a === 1 ? t.bGivesPerSec : t.aGivesPerSec;
      flow[youGive] -= youGiveAmt;
      flow[youGet]  += youGetAmt;
    }

    // Score offers: how good is this for me? Higher = more lopsided
    // in my favor + I'm short on what they're offering. Gold uses a
    // larger reference stock since the working-treasury floor is
    // higher than any resource.
    const stockOf = (k: TradeCurrency): number =>
      k === 'gold' ? me.gold : (me.resources[k as ResourceKind] ?? 0);
    const refStock = (k: TradeCurrency): number => k === 'gold' ? 2000 : 300;
    const scoreOffer = (o: typeof offers[number]): number => {
      // Normalize gold so a 50 gold/s offer doesn't trivially look 10×
      // better than a 5 stone/s offer purely from the unit difference.
      const norm = (k: TradeCurrency, v: number) => k === 'gold' ? v / 10 : v;
      const sentNorm = norm(o.bGives, o.bGivesPerSec);
      const recvNorm = norm(o.aGives, o.aGivesPerSec);
      const raw = recvNorm / Math.max(0.1, sentNorm);
      const myStock = stockOf(o.aGives);
      const need = Math.max(0.5, Math.min(2, (refStock(o.aGives) - myStock) / (refStock(o.aGives) / 2)));
      return raw * need;
    };
    const sortedOffers = [...offers]
      .map((o, idx) => ({ o, idx, score: scoreOffer(o) }))
      .sort((x, y) => y.score - x.score);

    const block = document.createElement('div');
    block.className = 'trade-status';

    // 1. Net flow header
    const flowParts: string[] = [];
    for (const k of CURRENCIES) {
      const v = flow[k];
      if (Math.abs(v) < 0.05) continue;
      const cls = v > 0 ? 'pos' : 'neg';
      const sign = v > 0 ? '+' : '';
      const label = k === 'gold' ? 'gold ♛' : k;
      flowParts.push(`<span class="ts-chip ${cls}">${label} ${sign}${v.toFixed(1)}/s</span>`);
    }
    const flowRow = document.createElement('div');
    flowRow.className = 'ts-flow';
    if (flowParts.length === 0) {
      flowRow.innerHTML = `<span class="ts-label">NET FLOW</span><span class="ts-empty">— no active trades —</span>`;
    } else {
      flowRow.innerHTML = `<span class="ts-label">NET FLOW</span>${flowParts.join('')}`;
    }
    block.appendChild(flowRow);

    // 2. Pending offers (best deal first)
    if (sortedOffers.length > 0) {
      const offerHdr = document.createElement('div');
      offerHdr.className = 'ts-section-h';
      offerHdr.textContent = `INCOMING OFFERS · ${sortedOffers.length}`;
      block.appendChild(offerHdr);
      sortedOffers.forEach(({ o, idx, score }) => {
        const from = this.game.players[o.from];
        if (!from) return;
        const c = palette[o.from];
        const tint = c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888';
        const rating = score >= 1.4 ? 'great' : score >= 1.0 ? 'fair' : 'weak';
        const row = document.createElement('div');
        row.className = `ts-offer rating-${rating}`;
        row.innerHTML = `
          <span class="ts-dot" style="background:${tint}"></span>
          <span class="ts-from">${from.name}</span>
          <span class="ts-deal">offers <b>${o.aGivesPerSec} ${o.aGives}/s</b> for <b>${o.bGivesPerSec} ${o.bGives}/s</b></span>
          <span class="ts-rating ${rating}">${rating.toUpperCase()}</span>
          <button class="diplo-act ts-accept" data-action="rtrade-accept" data-idx="${idx}" type="button">Accept</button>
          <button class="diplo-act ts-decline" data-action="rtrade-decline" data-idx="${idx}" type="button">Decline</button>
        `;
        block.appendChild(row);
      });
    }

    // 3. Active trades with cancel
    if (trades.length > 0) {
      const trHdr = document.createElement('div');
      trHdr.className = 'ts-section-h';
      trHdr.textContent = `ACTIVE TRADES · ${trades.length}`;
      block.appendChild(trHdr);
      for (const t of trades) {
        const otherId = t.a === 1 ? t.b : t.a;
        const other = this.game.players[otherId];
        if (!other) continue;
        const c = palette[otherId];
        const tint = c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888';
        const youGive    = t.a === 1 ? t.aGives : t.bGives;
        const youGiveAmt = t.a === 1 ? t.aGivesPerSec : t.bGivesPerSec;
        const youGet     = t.a === 1 ? t.bGives : t.aGives;
        const youGetAmt  = t.a === 1 ? t.bGivesPerSec : t.aGivesPerSec;
        const row = document.createElement('div');
        row.className = 'ts-active';
        row.innerHTML = `
          <span class="ts-dot" style="background:${tint}"></span>
          <span class="ts-from">${other.name}</span>
          <span class="ts-deal">
            <span class="ts-out">−${youGiveAmt} ${youGive}/s</span>
            <span class="ts-arrow">⇄</span>
            <span class="ts-in">+${youGetAmt} ${youGet}/s</span>
          </span>
          <button class="diplo-act ts-cancel" data-action="rtrade-cancel" data-target="${otherId}" type="button">Cancel</button>
        `;
        block.appendChild(row);
      }
    }

    // 4. World trades — AI-to-AI deals you're not part of. Read-only,
    //    just so you can see the AI economy is alive and react if a
    //    rival's pumping resources to a coalition partner.
    if (worldTrades.length > 0) {
      const wHdr = document.createElement('div');
      wHdr.className = 'ts-section-h';
      wHdr.textContent = `WORLD TRADES · ${worldTrades.length}`;
      block.appendChild(wHdr);
      for (const t of worldTrades) {
        const aP = this.game.players[t.a];
        const bP = this.game.players[t.b];
        if (!aP || !bP) continue;
        const aCol = palette[t.a];
        const bCol = palette[t.b];
        const aTint = aCol ? `rgb(${aCol[0]},${aCol[1]},${aCol[2]})` : '#888';
        const bTint = bCol ? `rgb(${bCol[0]},${bCol[1]},${bCol[2]})` : '#888';
        const row = document.createElement('div');
        row.className = 'ts-world';
        row.innerHTML = `
          <span class="ts-pair">
            <span class="ts-dot" style="background:${aTint}"></span>
            <span class="ts-from">${aP.name}</span>
            <span class="ts-arrow">⇄</span>
            <span class="ts-dot" style="background:${bTint}"></span>
            <span class="ts-from">${bP.name}</span>
          </span>
          <span class="ts-deal">${t.aGivesPerSec} ${t.aGives}/s ↔ ${t.bGivesPerSec} ${t.bGives}/s</span>
        `;
        block.appendChild(row);
      }
    }

    list.appendChild(block);
  }

  /** Update the per-currency flow chips on the top resource bar
   *  (and the gold stat). Net per-second rate = regional generation
   *  − building upkeep + trade flow. Renders +/- /s in green/red,
   *  hidden when the rate is effectively zero. Gold uses trade flow
   *  only (gold has many income sources surfaced elsewhere). */
  private _refreshResourceFlowChips(): void {
    const flow: Record<TradeCurrency, number> = { food: 0, wood: 0, stone: 0, oil: 0, gems: 0, gold: 0 };
    // Production net of upkeep for the five resources.
    const prod = this.game.resourceProductionFor(1);
    flow.food  += prod.food;
    flow.wood  += prod.wood;
    flow.stone += prod.stone;
    flow.oil   += prod.oil;
    flow.gems  += prod.gems;
    // Trade flow on top.
    for (const t of this.game.resourceTrades) {
      if (t.a !== 1 && t.b !== 1) continue;
      const youGive    = t.a === 1 ? t.aGives : t.bGives;
      const youGiveAmt = t.a === 1 ? t.aGivesPerSec : t.bGivesPerSec;
      const youGet     = t.a === 1 ? t.bGives : t.aGives;
      const youGetAmt  = t.a === 1 ? t.bGivesPerSec : t.aGivesPerSec;
      flow[youGive] -= youGiveAmt;
      flow[youGet]  += youGetAmt;
    }
    const set = (el: HTMLElement | null | undefined, v: number): void => {
      if (!el) return;
      // Threshold low enough that a 5%-share gems region (≈0.01/s)
      // still reads. Use 2 decimals for sub-0.5/s rates so "+0.04/s"
      // doesn't round down to "+0.0/s" and disappear.
      if (Math.abs(v) < 0.005) {
        el.classList.remove('pos', 'neg');
        el.textContent = '';
        return;
      }
      const sign = v > 0 ? '+' : '';
      const decimals = Math.abs(v) < 0.5 ? 2 : 1;
      el.textContent = `${sign}${v.toFixed(decimals)}/s`;
      el.classList.toggle('pos', v > 0);
      el.classList.toggle('neg', v < 0);
    };
    set(this.el.rsFlowFood,  flow.food);
    set(this.el.rsFlowWood,  flow.wood);
    set(this.el.rsFlowStone, flow.stone);
    set(this.el.rsFlowOil,   flow.oil);
    set(this.el.rsFlowGems,  flow.gems);
    set(this.el.rsFlowGold,  flow.gold);
  }

  private _proposeAlliance(targetId: PlayerId): void {
    const r = this.game.proposeAlliance(1, targetId);
    if (r === 'accepted')      this.toast('Alliance formed · 60s');
    else if (r === 'rejected') this.toast('They rejected your proposal');
    else if (r === 'already')  this.toast('Already allied');
    else this.toast('Cannot propose');
    this._renderDiplomacy();
  }

  private _breakAlliance(targetId: PlayerId): void {
    if (this.game.breakAlliance(1, targetId)) this.toast('Alliance broken');
    this._renderDiplomacy();
  }

  private _proposeTradeRoute(targetId: PlayerId): void {
    const r = this.game.proposeTradeRoute(1, targetId);
    if (r === 'accepted') {
      const route = this.game.externalTradeRouteBetween(1, targetId);
      const perSec = route ? route.flow * this.game.config.SIM_HZ : 0;
      this.toast(`Trade route opened · +${perSec.toFixed(1)}♛/s`);
    } else if (r === 'rejected')   this.toast('They rejected the route');
    else if (r === 'no-alliance')  this.toast('Need an alliance first');
    else if (r === 'already')      this.toast('Route already active');
    else                           this.toast('Cannot open route');
    this._renderDiplomacy();
  }

  private _breakTradeRoute(targetId: PlayerId): void {
    if (this.game.breakTradeRoute(1, targetId)) this.toast('Trade route closed');
    this._renderDiplomacy();
  }

  private _declareWar(targetId: PlayerId): void {
    const target = this.game.players[targetId];
    if (!target) return;
    this.game.declareWar(1, targetId, 'manual');
    const allies = this.game.alliesOf(targetId);
    if (allies.length > 0) {
      this.toast(`War declared on ${target.name} (their ${allies.length} ally${allies.length > 1 ? 'ies' : ''} joined them)`);
    } else {
      this.toast(`War declared on ${target.name}`);
    }
    if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* ignore */ }
    this._renderDiplomacy();
  }

  private _suePeace(targetId: PlayerId): void {
    const target = this.game.players[targetId];
    if (this.game.endWar(1, targetId)) {
      this.toast(`Peace with ${target?.name ?? 'enemy'}`);
    } else {
      this.toast('Not at war');
    }
    this._renderDiplomacy();
  }

  private _wireWarInvite(): void {
    this.el.warInviteAccept?.addEventListener('click', () => {
      const inv = this.game.pendingWarInvites[0];
      if (!inv) return;
      const target = this.game.players[inv.target];
      if (this.game.acceptWarInvite(0)) {
        this.toast(`Joined the war against ${target?.name ?? 'enemy'}`);
      }
      this._refreshWarInvite();
    });
    this.el.warInviteDecline?.addEventListener('click', () => {
      const inv = this.game.pendingWarInvites[0];
      if (!inv) return;
      const inviter = this.game.players[inv.from];
      this.game.declineWarInvite(0);
      this.toast(`Declined ${inviter?.name ?? 'ally'}'s war invitation`);
      this._refreshWarInvite();
    });
  }

  private _refreshWarInvite(): void {
    if (!this.el.warInvite) return;
    // Drop any stale invites — inviter must currently be an ally and
    // not already at war/allied with the target. Without this, a
    // pending invite can outlive the alliance that produced it.
    while (this.game.pendingWarInvites.length > 0) {
      const inv = this.game.pendingWarInvites[0]!;
      const inviter = this.game.players[inv.from];
      const target = this.game.players[inv.target];
      const stillAllied = this.game.areAllied(1, inv.from);
      const validTarget = target && target.alive
        && !this.game.areAllied(1, inv.target)
        && !this.game.areAtWar(1, inv.target);
      if (!inviter || !inviter.alive || !stillAllied || !validTarget) {
        this.game.declineWarInvite(0);
        continue;
      }
      break;
    }
    const inv = this.game.pendingWarInvites[0];
    if (!inv) {
      this.el.warInvite.classList.add('hidden');
      return;
    }
    const inviter = this.game.players[inv.from]!;
    const target = this.game.players[inv.target]!;
    this.el.warInvite.classList.remove('hidden');
    if (this.el.warInviteMsg) {
      this.el.warInviteMsg.innerHTML = `<span class="wi-name">${inviter.name}</span> asks you to join their war against <span class="wi-target">${target.name}</span>.`;
    }
  }

  // --- Resource trade prompt ------------------------------------------

  private _wireTradePrompt(): void {
    this.el.tpGiveKind?.addEventListener('change', () => {
      const prev = this.tpGiveKind;
      this.tpGiveKind = (this.el.tpGiveKind!.value as TradeCurrency);
      // Switching to/from gold rescales the amount: 5/sec resource ≈
      // 50/sec gold so the default offer is reasonable on either side.
      if (prev !== 'gold' && this.tpGiveKind === 'gold') this.tpGiveAmt = 50;
      else if (prev === 'gold' && this.tpGiveKind !== 'gold') this.tpGiveAmt = 5;
      this._refreshTradePrompt();
    });
    this.el.tpTakeKind?.addEventListener('change', () => {
      const prev = this.tpTakeKind;
      this.tpTakeKind = (this.el.tpTakeKind!.value as TradeCurrency);
      if (prev !== 'gold' && this.tpTakeKind === 'gold') this.tpTakeAmt = 50;
      else if (prev === 'gold' && this.tpTakeKind !== 'gold') this.tpTakeAmt = 5;
      this._refreshTradePrompt();
    });
    this.el.tradePrompt?.querySelectorAll<HTMLButtonElement>('.tp-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        const op = btn.dataset['tp'];
        const giveStep = this.tpGiveKind === 'gold' ? 10 : 1;
        const takeStep = this.tpTakeKind === 'gold' ? 10 : 1;
        const giveMax  = this.tpGiveKind === 'gold' ? 500 : 50;
        const takeMax  = this.tpTakeKind === 'gold' ? 500 : 50;
        if (op === 'give-up')   this.tpGiveAmt = Math.min(giveMax, this.tpGiveAmt + giveStep);
        if (op === 'give-down') this.tpGiveAmt = Math.max(giveStep, this.tpGiveAmt - giveStep);
        if (op === 'take-up')   this.tpTakeAmt = Math.min(takeMax, this.tpTakeAmt + takeStep);
        if (op === 'take-down') this.tpTakeAmt = Math.max(takeStep, this.tpTakeAmt - takeStep);
        this._refreshTradePrompt();
      });
    });
    this.el.tpSend?.addEventListener('click',   () => this._sendTradeOffer());
    this.el.tpCancel?.addEventListener('click', () => this.hideTradePrompt());
    // Resource-offer popup (incoming AI offers to human).
    this.el.resourceOfferAccept?.addEventListener('click', () => {
      const off = this.game.pendingResourceOffers[0];
      if (!off) return;
      const from = this.game.players[off.from];
      if (this.game.acceptResourceOffer(0)) {
        this.toast(`Trade with ${from?.name ?? 'AI'} accepted`);
      }
      this._refreshResourceOffer();
    });
    this.el.resourceOfferDecline?.addEventListener('click', () => {
      const off = this.game.pendingResourceOffers[0];
      if (!off) return;
      const from = this.game.players[off.from];
      this.game.declineResourceOffer(0);
      this.toast(`Declined ${from?.name ?? 'AI'}'s trade offer`);
      this._refreshResourceOffer();
    });
  }

  /** Open the trade-prompt modal targeting `targetId`. Pauses the
   *  simulation while open so the player can compose without time
   *  pressure. */
  showTradePrompt(targetId: PlayerId): void {
    if (this.game.outcome) return;
    if (targetId === 1 || targetId <= 0) return;
    const target = this.game.players[targetId];
    if (!target || !target.alive) return;
    if (this.game.areAllied(1, targetId)) {
      this.toast(`${target.name} is already your ally — propose a trade route instead`);
      return;
    }
    this.tradePromptTarget = targetId;
    this.tpGiveAmt = 5; this.tpTakeAmt = 5;
    this.tpGiveKind = 'food'; this.tpTakeKind = 'stone';
    this.game.paused = true;
    if (this.el.tpTitle) this.el.tpTitle.textContent = `TRADE WITH ${target.name.toUpperCase()}`;
    if (this.el.tpGiveKind) this.el.tpGiveKind.value = this.tpGiveKind;
    if (this.el.tpTakeKind) this.el.tpTakeKind.value = this.tpTakeKind;
    this._refreshTradePrompt();
    this.el.tradePrompt?.classList.remove('hidden');
  }

  hideTradePrompt(): void {
    this.tradePromptTarget = 0;
    this.game.paused = false;
    this.el.tradePrompt?.classList.add('hidden');
  }

  private _refreshTradePrompt(): void {
    if (!this.el.tradePrompt) return;
    const me = this.game.human();
    if (this.el.tpGiveAmt) this.el.tpGiveAmt.textContent = String(this.tpGiveAmt);
    if (this.el.tpTakeAmt) this.el.tpTakeAmt.textContent = String(this.tpTakeAmt);
    const stockOf = (p: Player, k: TradeCurrency): number =>
      k === 'gold' ? Math.floor(p.gold) : Math.floor(p.resources[k]);
    if (this.el.tpGiveStock) {
      this.el.tpGiveStock.textContent = `you have ${stockOf(me, this.tpGiveKind)} ${this.tpGiveKind}`;
    }
    if (this.el.tpTakeStock) {
      const target = this.game.players[this.tradePromptTarget];
      if (target) {
        this.el.tpTakeStock.textContent = `${target.name} has ${stockOf(target, this.tpTakeKind)} ${this.tpTakeKind}`;
      }
    }
  }

  private _sendTradeOffer(): void {
    const targetId = this.tradePromptTarget;
    if (targetId === 0) return;
    const target = this.game.players[targetId];
    if (!target) return;
    if (this.tpGiveKind === this.tpTakeKind) {
      this.toast('Pick different resources for each side');
      return;
    }
    const err = this.game.proposeResourceTrade(
      1, targetId,
      this.tpGiveKind, this.tpGiveAmt,
      this.tpTakeKind, this.tpTakeAmt,
    );
    if (err === null) {
      this.toast(`${target.name} accepted: ${this.tpGiveAmt} ${this.tpGiveKind}/s ⇄ ${this.tpTakeAmt} ${this.tpTakeKind}/s`);
    } else if (err === 'rejected') {
      this.toast(`${target.name} declined the trade`);
    } else if (err === 'already') {
      this.toast(`Already trading with ${target.name}`);
    } else if (err === 'invalid') {
      this.toast('Invalid trade');
    } else {
      this.toast('Cannot send offer');
    }
    this.hideTradePrompt();
  }

  private _refreshResourceOffer(): void {
    if (!this.el.resourceOffer) return;
    const off = this.game.pendingResourceOffers[0];
    if (!off) {
      this.el.resourceOffer.classList.add('hidden');
      return;
    }
    const from = this.game.players[off.from];
    if (!from || !from.alive) {
      this.game.declineResourceOffer(0);
      this.el.resourceOffer.classList.add('hidden');
      return;
    }
    this.el.resourceOffer.classList.remove('hidden');
    if (this.el.resourceOfferMsg) {
      this.el.resourceOfferMsg.innerHTML =
        `<span class="ro-name">${from.name}</span> offers ` +
        `<span class="ro-give">${off.aGivesPerSec} ${off.aGives}/s</span> for ` +
        `<span class="ro-take">${off.bGivesPerSec} ${off.bGives}/s</span>.`;
    }
  }

  private _refreshDiploBadge(): void {
    if (!this.el.diploBadge) return;
    // Notification count = pending war invites + pending resource trade
    // offers. Both are async incoming events the player should look at.
    const n = this.game.pendingWarInvites.length + this.game.pendingResourceOffers.length;
    if (n <= 0) {
      this.el.diploBadge.classList.add('hidden');
      return;
    }
    this.el.diploBadge.classList.remove('hidden');
    this.el.diploBadge.textContent = n > 9 ? '9+' : String(n);
  }

  private _cancelResourceTrade(otherId: PlayerId): void {
    const other = this.game.players[otherId];
    if (this.game.cancelResourceTrade(1, otherId)) {
      this.toast(`Trade with ${other?.name ?? 'them'} cancelled`);
      this._renderDiplomacy();
    }
  }

  private _coerceAlly(allyId: PlayerId): void {
    const ally = this.game.players[allyId];
    if (!ally) return;
    const myEnemies = this.game.enemiesOf(1);
    if (myEnemies.length === 0) {
      this.toast('You are not at war with anyone');
      return;
    }
    let accepted = 0, declined = 0;
    for (const enemyId of myEnemies) {
      const r = this.game.coerceAllyToWar(1, allyId, enemyId);
      if (r === 'accepted') accepted++;
      else if (r === 'declined') declined++;
    }
    if (accepted > 0 && declined === 0) {
      this.toast(`${ally.name} joined ${accepted} of your wars`);
    } else if (accepted > 0 && declined > 0) {
      this.toast(`${ally.name} joined ${accepted}, declined ${declined}`);
    } else if (declined > 0) {
      this.toast(`${ally.name} declined — they don't feel strong enough`);
    } else {
      this.toast('No wars to join');
    }
    this._renderDiplomacy();
  }

  /** Long-press shortcut: propose alliance + open trade route in one
   *  action. If the target is already an ally we just open the route;
   *  if both already exist we no-op with a friendly toast. Triggered by
   *  long-pressing on enemy land. */
  quickProposeTradeAlliance(targetId: PlayerId): void {
    if (targetId === 1 || targetId <= 0) return;
    const target = this.game.players[targetId];
    if (!target || !target.alive) return;

    const alreadyAllied = this.game.areAllied(1, targetId);
    const route = this.game.externalTradeRouteBetween(1, targetId);

    if (alreadyAllied && route) {
      const perSec = route.flow * this.game.config.SIM_HZ;
      this.toast(`Already trading with ${target.name} · +${perSec.toFixed(1)}♛/s`);
      this.showDiplomacy();
      return;
    }

    if (!alreadyAllied) {
      const ally = this.game.proposeAlliance(1, targetId);
      if (ally === 'rejected') {
        this.toast(`${target.name} rejected the alliance`);
        return;
      }
      if (ally !== 'accepted' && ally !== 'already') {
        this.toast('Cannot propose alliance');
        return;
      }
    }

    // Alliance is in place. Open the trade route.
    if (!route) {
      const tr = this.game.proposeTradeRoute(1, targetId);
      if (tr === 'accepted') {
        const r2 = this.game.externalTradeRouteBetween(1, targetId);
        const perSec = r2 ? r2.flow * this.game.config.SIM_HZ : 0;
        this.toast(`Trade alliance with ${target.name} · +${perSec.toFixed(1)}♛/s both sides`);
        if (navigator.vibrate) try { navigator.vibrate(20); } catch { /* ignore */ }
      } else if (tr === 'rejected') {
        this.toast(`Allied with ${target.name} but they declined the route`);
      } else {
        this.toast('Could not open trade route');
      }
    } else {
      this.toast(`Alliance with ${target.name} formed (route already open)`);
    }
    if (this.el.diploPanel?.classList.contains('show')) this._renderDiplomacy();
  }

  private _openTrade(targetId: PlayerId): void {
    this._tradeTargetId = targetId;
    const target = this.game.players[targetId];
    if (this.el.tradeTitle && target) this.el.tradeTitle.textContent = `TRADE WITH ${target.name.toUpperCase()}`;
    if (this.el.tradeGold)   this.el.tradeGold.value   = '200';
    if (this.el.tradeTroops) this.el.tradeTroops.value = '400';
    this._refreshTradeRate();
    this.el.tradeSheet?.classList.add('show');
  }

  hideTrade(): void {
    this.el.tradeSheet?.classList.remove('show');
    this._tradeTargetId = 0;
  }

  private _refreshTradeRate(): void {
    const g = parseInt(this.el.tradeGold?.value ?? '0', 10) || 0;
    const t = parseInt(this.el.tradeTroops?.value ?? '0', 10) || 0;
    if (this.el.tradeGoldVal)   this.el.tradeGoldVal.textContent   = String(g);
    if (this.el.tradeTroopsVal) this.el.tradeTroopsVal.textContent = String(t);
    if (this.el.tradeRate) {
      const rate = t > 0 ? (g / t).toFixed(2) : '—';
      const fair = (parseFloat(rate) >= 0.4) ? 'fair' : 'low';
      this.el.tradeRate.textContent = `rate: ${rate} g/troop · ${fair} (AI accepts ≥ 0.40)`;
    }
  }

  private _confirmTrade(): void {
    if (this._tradeTargetId <= 0) return;
    const g = parseInt(this.el.tradeGold?.value ?? '0', 10) || 0;
    const t = parseInt(this.el.tradeTroops?.value ?? '0', 10) || 0;
    const r = this.game.proposeTrade(1, this._tradeTargetId, g, t);
    if (r === 'accepted')      { this.toast(`Traded ${g}g for ${t} troops`); this.hideTrade(); this._renderDiplomacy(); }
    else if (r === 'rejected') this.toast('They rejected the trade');
    else if (r === 'gold')     this.toast('Not enough gold');
    else if (r === 'invalid')  this.toast('Invalid trade');
    else this.toast('Cannot trade');
  }

  // --- Mastery picker ---------------------------------------------------

  private _wireMastery(): void {
    this.el.masteryBadge?.addEventListener('click', () => this.showMastery());
    this.el.masteryCancel?.addEventListener('click', () => this.hideMastery());
    this.el.masteryPanel?.addEventListener('click', (e) => {
      // Only allow tap-out-to-dismiss after mastery has been chosen — on
      // the first launch they must commit.
      if (e.target === this.el.masteryPanel && this.game.human().mastery != null) {
        this.hideMastery();
      }
    });
    this.el.masteryGrid?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.mastery-card-opt');
      if (!btn || btn.disabled) return;
      const id = btn.dataset['mastery'] as Mastery | undefined;
      if (!id) return;
      this._chooseMastery(id);
    });
  }

  showMastery(): void {
    this._renderMastery();
    this.el.masteryPanel?.classList.add('show');
  }

  hideMastery(): void {
    // Block dismissal if the human hasn't chosen yet — first-launch
    // commitment.
    if (this.game.human().mastery == null) return;
    this.el.masteryPanel?.classList.remove('show');
  }

  private _renderMastery(): void {
    const grid = this.el.masteryGrid;
    if (!grid) return;
    const me = this.game.human();
    const current = me.mastery;
    const isReroll = current != null;

    if (this.el.masteryTitle) {
      this.el.masteryTitle.textContent = isReroll ? 'YOUR MASTERY' : 'CHOOSE YOUR MASTERY';
    }
    if (this.el.masteryBlurb) {
      this.el.masteryBlurb.textContent = isReroll
        ? `Currently: ${current!.toUpperCase()}. Switching costs 3000 ♛ (you have ${Math.floor(me.treasury)}).`
        : 'One path per game. Sets up rock-paper-scissors with the AIs.';
    }
    if (this.el.masteryCancel) {
      this.el.masteryCancel.style.display = isReroll ? '' : 'none';
    }

    grid.innerHTML = '';
    const colorByMastery: Record<Mastery, string> = {
      ground: '#6db86d',
      air:    '#9bd9ea',
      naval:  '#7aa3e8',
    };
    for (const m of MASTERIES) {
      const isCurrent = m.id === current;
      const canAfford = !isReroll || isCurrent || me.treasury >= 3000;
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'mastery-card-opt';
      if (isCurrent) opt.classList.add('chosen');
      if (!canAfford) opt.classList.add('locked-no-funds');
      opt.disabled = isCurrent || !canAfford;
      opt.dataset['mastery'] = m.id;
      opt.style.setProperty('--mc', colorByMastery[m.id]);
      const tag = isCurrent
        ? 'CURRENT'
        : (isReroll ? 'SWITCH · 3000 ♛' : 'COMMIT');
      opt.innerHTML = `
        <div class="mc-head">
          <span class="mc-name">${m.name}</span>
          <span class="mc-tag">${tag}</span>
        </div>
        <div class="mc-tagline">${m.tagline}</div>
        <ul class="mc-perks">
          ${m.perks.map(p => `<li>${p}</li>`).join('')}
        </ul>
      `;
      grid.appendChild(opt);
    }
  }

  private _chooseMastery(id: Mastery): void {
    const err = this.game.chooseMastery(1, id);
    if (err === null) {
      this.toast(`Mastery: ${id.toUpperCase()}`);
      this._renderMastery();
      // Auto-close on first commit — but stay open after a re-pick so
      // the player sees the new "current" state.
      if (this.el.masteryPanel?.classList.contains('show')) {
        // Close after a short delay so the toast is visible.
        setTimeout(() => this.hideMastery(), 350);
      }
    } else if (err === 'gold') this.toast('Need 3000 ♛ to switch path');
    else if (err === 'unknown') this.toast('Unknown mastery');
    else this.toast('Cannot pick');
  }

  showTutorial(): void {
    this.el.tutorial?.classList.add('show');
  }

  hideTutorial(): void {
    this.el.tutorial?.classList.remove('show');
    try { localStorage.setItem('territory:tutorial-seen', '1'); } catch { /* ignore */ }
  }

  private _isLockedForHuman(type: BuildingType): boolean {
    // Only airstrip remains mastery-gated. AA, ports, barracks etc.
    // are universal defenses/enablers — no mastery lock on those.
    if (type === 'airstrip') return !this.game.isUnlocked(1, 'airstrip');
    return false;
  }

  private _refreshHotbar(): void {
    if (!this.el.hotbar) return;
    const me = this.game.human();
    const combined = this.game.combinedFundsFor(me.id);
    const masterySlot = this.el.hotbar.querySelector<HTMLButtonElement>('#hb-mastery');
    if (masterySlot) {
      const m = me.mastery ?? 'air';
      const cfg: { type: BuildingType; key: string; title: string; name: string } = m === 'naval'
        ? { type: 'port',     key: 'P', title: 'Defense Port (P)', name: 'Defense Port' }
        : m === 'ground'
        ? { type: 'barracks', key: 'G', title: 'Barracks (G)', name: 'Barracks' }
        : { type: 'airstrip', key: 'A', title: 'Airstrip (A)', name: 'Airstrip' };
      masterySlot.dataset['type'] = cfg.type;
      masterySlot.title = cfg.title;
      const keyEl = masterySlot.querySelector('.hb-key');
      if (keyEl) keyEl.textContent = cfg.key;
      const nameEl = masterySlot.querySelector('.hb-name');
      if (nameEl) nameEl.textContent = cfg.name;
    }
    this.el.hotbar.querySelectorAll<HTMLButtonElement>('.hb-btn').forEach((btn) => {
      const type = btn.dataset['type'] as BuildingType | undefined;
      if (!type) return;
      const cost = this.game.config.BUILDING_COSTS[type];
      const resCost = this.game.config.BUILDING_RESOURCE_COSTS[type] ?? {};
      const locked = this._isLockedForHuman(type);
      // Affordability: gold + every required resource.
      let resOk = true;
      for (const [kind, need] of Object.entries(resCost)) {
        if ((need ?? 0) <= 0) continue;
        if ((me.resources[kind as keyof typeof me.resources] ?? 0) < (need ?? 0)) {
          resOk = false; break;
        }
      }
      btn.classList.toggle('active', this.placeMode === type);
      btn.classList.toggle('cant-afford', !locked && (combined < cost || !resOk));
      btn.classList.toggle('locked', locked);
      btn.title = locked
        ? `${type[0]!.toUpperCase()}${type.slice(1)} — locked. Choose AIR mastery.`
        : `${type[0]!.toUpperCase()}${type.slice(1)}`;
      const costEl = btn.querySelector('.hb-cost');
      if (costEl) costEl.textContent = locked ? '🔒 Locked' : `${cost}g`;
      const resEl = btn.querySelector('.hb-res');
      if (resEl) {
        if (locked) {
          resEl.innerHTML = '';
        } else {
          // Build "25 food · 15 wood" with per-resource colored spans
          const parts: string[] = [];
          for (const [kind, need] of Object.entries(resCost)) {
            if ((need ?? 0) <= 0) continue;
            parts.push(
              `<span class="r-${kind}"><b>${need}</b><span class="r-short"> ${kind}</span></span>`,
            );
          }
          resEl.innerHTML = parts.join(' · ');
        }
      }
    });
  }

  private _refreshSheetButtons(): void {
    if (!this.el.sheet) return;
    const me = this.game.human();
    const combined = this.game.combinedFundsFor(me.id);
    if (this.el.sheetEmpireGold) this.el.sheetEmpireGold.textContent = String(Math.floor(combined));
    const resGlyph: Record<string, string> = {
      food: '🌾', wood: '🌲', stone: '⛰', oil: '🛢', gems: '💎',
    };
    this.el.sheet.querySelectorAll<HTMLButtonElement>('.bs-btn').forEach((btn) => {
      const type = btn.dataset['type'] as BuildingType | undefined;
      if (!type) return;
      const cost = this.game.config.BUILDING_COSTS[type];
      const resCost = this.game.config.BUILDING_RESOURCE_COSTS[type] ?? {};
      const locked = this._isLockedForHuman(type);
      // Resource affordability — disable if missing any required resource.
      let resOk = true;
      for (const [kind, need] of Object.entries(resCost)) {
        if ((need ?? 0) <= 0) continue;
        if ((me.resources[kind as keyof typeof me.resources] ?? 0) < (need ?? 0)) {
          resOk = false; break;
        }
      }
      btn.classList.toggle('disabled', locked || combined < cost || !resOk);
      btn.classList.toggle('locked', locked);
      const costEl = btn.querySelector('.bs-cost');
      if (costEl) {
        if (locked) {
          costEl.textContent = '🔒';
        } else {
          // Compose: gold + each required resource as "Ng" + "N🌾" etc.
          const parts: string[] = [`${cost}g`];
          for (const [kind, need] of Object.entries(resCost)) {
            if ((need ?? 0) <= 0) continue;
            parts.push(`${need}${resGlyph[kind] ?? kind}`);
          }
          costEl.textContent = parts.join(' ');
        }
      }
    });
  }

  private _refreshPlaceBanner(): void {
    if (!this.el.placeBanner) return;
    if (this.bombMode) {
      if (this.el.placeBannerType) this.el.placeBannerType.textContent = `${this.bombMode.toUpperCase()} BOMB`;
      this.el.placeBanner.classList.add('show', 'bomb');
    } else if (this.shipBuildMode) {
      if (this.el.placeBannerType) this.el.placeBannerType.textContent = `${this.shipBuildMode.toUpperCase()} · TAP COASTAL TILE`;
      this.el.placeBanner.classList.remove('bomb');
      this.el.placeBanner.classList.add('show');
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
      `<b>Targets</b> ${me.targetRegions.length}`,
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
      'not-coastal':  'Defense Port needs a coastal tile (adjacent to water)',
      'oob':          'Out of bounds',
      'dead':         'You are eliminated',
      'bad-type':     'Unknown building',
      'no-building':  'Nothing to upgrade here',
      'max-level':    'Already max tier',
      'locked':       'Locked — wrong mastery',
      'resources':    'Need more resources (see top bar)',
    };
    return msgs[err];
  }

  private _bombErrorMsg(err: BombError): string {
    const msgs: Record<BombError, string> = {
      'no-airstrip': 'Need an airstrip',
      'cooldown':    'All airstrips on cooldown',
      'gold':        'Not enough gold',
      'resources':   'Not enough gems / oil',
      'oob':         'Out of bounds',
      'dead':        'You are eliminated',
      'locked':      'Air mastery required',
      'bad-type':    'Unknown bomb',
    };
    return msgs[err];
  }
}
