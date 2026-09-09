/** The v2 console — v1's dashboard idiom (ink chips, hairlines, square
 * corners) as a DOM overlay on the 3D city. M3 scope: the LINE DESK,
 * per-line sheets (upgrades + trains + the STATION WORKS planner with
 * player priority and tier-even bulk buys), the NETWORK desk, station
 * cards with all six works, and toasts.
 *
 * DOM rule learned in b40: panels REBUILD only when structure changes
 * (a purchase, a mode switch) and mutate in place otherwise, so no
 * button is ever detached mid-tap. */
import { Game, GLOBALS, STATION_WORKS } from '../engine/game';

function fmt(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 10000) return (v / 1000).toFixed(1) + 'K';
  return Math.floor(v).toLocaleString('en-US');
}

type PanelMode = { kind: 'lines' } | { kind: 'line'; id: string } | { kind: 'network' };

export class Console {
  private cashEl = document.getElementById('cash')!;
  private rateEl = document.getElementById('rate')!;
  private phaseEl = document.getElementById('phase')!;
  private panelEl = document.getElementById('panel')!;
  private stationEl = document.getElementById('station-card')!;
  private toastsEl = document.getElementById('toasts')!;
  private mode: PanelMode | null = null;
  private shownStationId: string | null = null;
  private lastRefresh = 0;
  /** Bumped on every purchase → forces the next render to rebuild. */
  private structSeq = 0;
  private builtKey = '';

  constructor(private game: Game) {
    document.getElementById('btn-lines')!.addEventListener('click', () => {
      this.setMode(this.mode?.kind === 'lines' || this.mode?.kind === 'line'
        ? null
        : { kind: 'lines' });
    });
    document.getElementById('btn-network')!.addEventListener('click', () => {
      this.setMode(this.mode?.kind === 'network' ? null : { kind: 'network' });
    });
    this.panelEl.addEventListener('click', (e) => this.onPanelClick(e));
    this.stationEl.addEventListener('click', (e) => this.onStationClick(e));
  }

  /** main.ts hooks the camera glide here. */
  onUnlock: ((lineId: string) => void) | null = null;

  private setMode(mode: PanelMode | null): void {
    this.mode = mode;
    this.panelEl.hidden = mode === null;
    if (mode) this.hideStation();
    this.structSeq++;
    if (mode) this.renderPanel();
  }

  private onPanelClick(e: Event): void {
    const g = this.game;
    const el = (e.target as HTMLElement).closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act')!;
    const id = el.getAttribute('data-id') ?? '';
    const lineId = this.mode?.kind === 'line' ? this.mode.id : id;
    switch (act) {
      case 'open-line':
        this.setMode({ kind: 'line', id });
        return;
      case 'back':
        this.setMode({ kind: 'lines' });
        return;
      case 'buy-line':
        if (g.buyLine(id)) this.onUnlock?.(id);
        break;
      case 'buy-train':
        g.buyTrain(lineId);
        break;
      case 'buy-speed':
        g.buySpeed(lineId);
        break;
      case 'buy-cars':
        g.buyCars(lineId);
        break;
      case 'buy-access':
        g.buyAccess(lineId);
        break;
      case 'buy-trainset':
        g.buyTrainset(lineId);
        break;
      case 'buy-tier':
        g.buyStationTier(lineId, id);
        break;
      case 'raise-priority':
        g.raisePriority(id);
        break;
      case 'buy-global':
        g.buyGlobal(id);
        break;
    }
    this.structSeq++;
    this.renderPanel();
  }

  private onStationClick(e: Event): void {
    const el = (e.target as HTMLElement).closest('[data-act]');
    if (!el) return;
    if (el.getAttribute('data-act') === 'close-station') {
      this.hideStation();
      return;
    }
    if (el.getAttribute('data-act') === 'buy-work') {
      this.game.buyStationWork(el.getAttribute('data-id')!, this.shownStationId!);
      this.cardKey = ''; // rebuild with fresh costs
      this.renderStation();
    }
  }

  showStation(stationId: string): void {
    this.shownStationId = stationId;
    this.setMode(null);
    this.stationEl.hidden = false;
    this.cardKey = '';
    this.renderStation();
  }

  hideStation(): void {
    this.shownStationId = null;
    this.stationEl.hidden = true;
  }

  private cardKey = '';

  private renderStation(): void {
    const id = this.shownStationId;
    if (!id) return;
    const g = this.game;
    const st = g.city.stations.find((s) => s.id === id)!;
    const served = g.isServed(id);
    const key = `${id}:${served}`;
    if (this.cardKey !== key) {
      this.cardKey = key;
      const bullets = g.city.lines
        .filter((l) => g.isUnlocked(l.id) && l.stationIds.includes(id))
        .map((l) => `<span class="bullet" style="background:${l.color}">${l.bullet}</span>`)
        .join('');
      const works = !served
        ? ''
        : STATION_WORKS.map((w) => {
            const lvl = g.stationWorkLevel(w.id, id);
            const maxed = lvl >= Game.foodMax;
            const cost = maxed ? 0 : g.stationWorkCost(w.id, lvl);
            return `<div class="row"><span class="nm">${w.name}</span>
              <span class="meta">L${lvl} · ${w.blurb}</span>
              <button data-act="buy-work" data-id="${w.id}" data-cost="${cost}"
                ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : '$' + fmt(cost)}</button>
            </div>`;
          }).join('');
      this.stationEl.innerHTML = `
        <div class="card-head"><b>${st.name}</b>${bullets}
          <button class="x" data-act="close-station">×</button></div>
        <div class="card-row" id="station-row"></div>${works}`;
    }
    const up = Math.floor(g.waitingUp.get(id) ?? 0);
    const down = Math.floor(g.waitingDown.get(id) ?? 0);
    document.getElementById('station-row')!.textContent = served
      ? `waiting ${up} ↑ · ${down} ↓  ·  demand ×${g.demandMultAt(id).toFixed(2)}  ·  $${g.incomePerRiderAt(id).toFixed(2)}/rider`
      : 'no service yet — a locked route stops here';
    this.refreshDisabled(this.stationEl);
  }

  private head(title: string): string {
    return `<div class="panel-head"><span>${title}</span>
      <span class="head-bal">$<span class="bal">${fmt(this.game.cash)}</span></span></div>`;
  }

  private renderPanel(): void {
    const g = this.game;
    if (!this.mode) return;
    const key = `${JSON.stringify(this.mode)}:${this.structSeq}`;
    if (key === this.builtKey) {
      this.refreshLive();
      return;
    }
    this.builtKey = key;
    if (this.mode.kind === 'lines') this.panelEl.innerHTML = this.linesHtml();
    else if (this.mode.kind === 'line') this.panelEl.innerHTML = this.lineHtml(this.mode.id);
    else this.panelEl.innerHTML = this.networkHtml();
    this.refreshLive();
    void g;
  }

  private linesHtml(): string {
    const g = this.game;
    const rows = g.city.lines
      .map((l) => {
        const bullet = `<span class="bullet" style="background:${l.color}">${l.bullet}</span>`;
        if (!g.isUnlocked(l.id)) {
          const cost = l.unlockCost;
          return `<div class="row locked">${bullet}<span class="nm">${l.name}</span>
            <span class="meta">${l.stationIds.length} stops</span>
            <button data-act="buy-line" data-id="${l.id}" data-cost="${cost}">
              OPEN · $${fmt(cost)}</button></div>`;
        }
        const n = g.trainCount(l.id);
        const lv =
          g.speedLevelOf(l.id) + g.carLevelOf(l.id) + g.accessLevelOf(l.id) +
          g.trainsetLevelOf(l.id);
        return `<div class="row" data-act="open-line" data-id="${l.id}">
          ${bullet}<span class="nm">${l.name}</span>
          <span class="meta">${n} train${n === 1 ? '' : 's'} · ${lv} upgrade lvls</span>
          <span class="chev">›</span></div>`;
      })
      .join('');
    return this.head('LINE DESK') + rows;
  }

  private lineHtml(id: string): string {
    const g = this.game;
    const l = g.lineById(id);
    const bullet = `<span class="bullet" style="background:${l.color}">${l.bullet}</span>`;
    const up = (
      act: string,
      name: string,
      blurb: string,
      lvl: number,
      cost: number,
    ) => {
      const maxed = lvl >= Game.levelMax;
      return `<div class="row"><span class="nm">${name}</span>
        <span class="meta">L${lvl} · ${blurb}</span>
        <button data-act="${act}" data-cost="${maxed ? 0 : cost}" ${maxed ? 'disabled' : ''}>
          ${maxed ? 'MAX' : '$' + fmt(cost)}</button></div>`;
    };
    const trainCost = g.nextTrainCost(id);
    const next = g.nextPlannedType(id);
    const works = STATION_WORKS
      .slice()
      .sort((a, b) => g.stationPriority.indexOf(a.id) - g.stationPriority.indexOf(b.id))
      .map((w) => {
        const min = g.minStationLevel(id, w.id);
        const done = min >= Game.foodMax;
        const count = done ? 0 : g.stationsAtMin(id, w.id);
        const cost = g.stationTierCost(id, w.id);
        return `<div class="row${w.id === next ? ' next' : ''}">
          <button class="pri" data-act="raise-priority" data-id="${w.id}">▲</button>
          <span class="nm">${w.name}</span>
          <span class="meta">${done ? 'all stations MAX' : `L${min}→${min + 1} · ${count} stop${count === 1 ? '' : 's'}`}</span>
          <button data-act="buy-tier" data-id="${w.id}" data-cost="${done ? 0 : cost}"
            ${done ? 'disabled' : ''}>${done ? 'MAX' : '$' + fmt(cost)}</button></div>`;
      })
      .join('');
    return (
      this.head(`${l.name.toUpperCase()}`) +
      `<div class="row"><button data-act="back">‹ ALL LINES</button>${bullet}
        <span class="meta">${l.stationIds.length} stops · ${g.trainCount(id)} trains</span>
        <button data-act="buy-train" data-cost="${trainCost}">+TRAIN · $${fmt(trainCost)}</button></div>` +
      `<div class="sect">LINE UPGRADES</div>` +
      up('buy-speed', 'EXPRESS SPEED', '+15% train speed', g.speedLevelOf(id), g.nextSpeedCost(id)) +
      up('buy-cars', 'BIGGER CARS', '+6 riders per stop', g.carLevelOf(id), g.nextCarCost(id)) +
      up('buy-access', 'STEP-FREE ACCESS', '+10% ridership on this line', g.accessLevelOf(id), g.nextAccessCost(id)) +
      up('buy-trainset', 'NEW SUBWAY CARS', '+8% ridership on this line', g.trainsetLevelOf(id), g.nextTrainsetCost(id)) +
      `<div class="sect">STATION WORKS · tier-even, ▲ sets my priority</div>` +
      works
    );
  }

  private networkHtml(): string {
    const g = this.game;
    const rows = GLOBALS.map((d) => {
      const lvl = g.globalLevelOf(d.id);
      const maxed = lvl >= d.maxLevel;
      const cost = maxed ? 0 : g.nextGlobalCost(d.id);
      return `<div class="row"><span class="nm">${d.name}</span>
        <span class="meta">L${lvl}/${d.maxLevel} · ${d.blurb}</span>
        <button data-act="buy-global" data-id="${d.id}" data-cost="${cost}"
          ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : '$' + fmt(cost)}</button></div>`;
    }).join('');
    return this.head('NETWORK UPGRADES') + rows;
  }

  /** In-place refresh: balance text + affordability, nothing detached. */
  private refreshLive(): void {
    const bal = this.panelEl.querySelector('.bal');
    if (bal) bal.textContent = fmt(this.game.cash);
    this.refreshDisabled(this.panelEl);
  }

  private refreshDisabled(root: HTMLElement): void {
    for (const btn of root.querySelectorAll<HTMLButtonElement>('button[data-cost]')) {
      const cost = Number(btn.getAttribute('data-cost'));
      if (cost > 0) btn.disabled = this.game.cash < cost;
    }
  }

  toast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastsEl.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }

  update(nowMs: number): void {
    const g = this.game;
    this.cashEl.textContent = `$${fmt(g.cash)}`;
    this.rateEl.textContent = `$${g.avgRate.toFixed(1)}/s · ${fmt(g.totalRiders)} riders`;
    const n = g.nightFactor;
    this.phaseEl.textContent = g.rushActive
      ? 'NIGHT RUSH'
      : n === 0
        ? 'DAY'
        : n === 1
          ? 'NIGHT'
          : g.rushClock % 180 < 110
            ? 'DAWN'
            : 'DUSK';
    if (nowMs - this.lastRefresh > 250) {
      this.lastRefresh = nowMs;
      if (this.mode) this.renderPanel();
      if (this.shownStationId) this.renderStation();
    }
  }
}
