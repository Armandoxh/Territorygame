/** The v2 console — v1's dashboard idiom (ink chips, hairlines, square
 * corners) rebuilt as a DOM overlay on the 3D city. Milestone 2 scope:
 * the BALANCE header, the LINES desk (buy lines, buy trains), the
 * station card, and toasts for unlocks + offline pay. */
import { Game } from '../engine/game';

function fmt(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 10000) return (v / 1000).toFixed(1) + 'K';
  return Math.floor(v).toLocaleString('en-US');
}

export class Console {
  private cashEl = document.getElementById('cash')!;
  private rateEl = document.getElementById('rate')!;
  private phaseEl = document.getElementById('phase')!;
  private panelEl = document.getElementById('panel')!;
  private stationEl = document.getElementById('station-card')!;
  private toastsEl = document.getElementById('toasts')!;
  private linesBtn = document.getElementById('btn-lines')!;
  private panelOpen = false;
  private shownStationId: string | null = null;
  private lastPanelRefresh = 0;

  constructor(private game: Game) {
    this.linesBtn.addEventListener('click', () => {
      this.panelOpen = !this.panelOpen;
      this.panelEl.hidden = !this.panelOpen;
      if (this.panelOpen) {
        this.hideStation();
        this.renderPanel();
      }
    });
    this.panelEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act')!;
      const lineId = btn.getAttribute('data-line')!;
      if (act === 'buy-line' && this.game.buyLine(lineId)) {
        this.onUnlock?.(lineId);
      } else if (act === 'buy-train') {
        this.game.buyTrain(lineId);
      }
      this.renderPanel();
    });
  }

  /** main.ts hooks the camera glide here. */
  onUnlock: ((lineId: string) => void) | null = null;

  showStation(stationId: string): void {
    this.shownStationId = stationId;
    this.panelOpen = false;
    this.panelEl.hidden = true;
    this.stationEl.hidden = false;
    this.renderStation();
  }

  hideStation(): void {
    this.shownStationId = null;
    this.stationEl.hidden = true;
  }

  private cardStationId: string | null = null;

  private renderStation(): void {
    const id = this.shownStationId;
    if (!id) return;
    const g = this.game;
    const st = g.city.stations.find((s) => s.id === id)!;
    const served = g.isServed(id);
    const up = Math.floor(g.waitingUp.get(id) ?? 0);
    const down = Math.floor(g.waitingDown.get(id) ?? 0);
    const rowText = served
      ? `waiting ${up} ↑ · ${down} ↓  ·  demand ${st.demand.toFixed(2)}/s`
      : 'no service yet — a locked route stops here';
    // Rebuild only when the station changes; live numbers mutate in
    // place so the close button is never detached mid-tap.
    if (this.cardStationId !== id) {
      this.cardStationId = id;
      const bullets = g.city.lines
        .filter((l) => g.isUnlocked(l.id) && l.stationIds.includes(id))
        .map(
          (l) =>
            `<span class="bullet" style="background:${l.color}">${l.bullet}</span>`,
        )
        .join('');
      this.stationEl.innerHTML = `
        <div class="card-head"><b>${st.name}</b>${bullets}
          <button class="x" id="station-x">×</button></div>
        <div class="card-row" id="station-row"></div>`;
      document
        .getElementById('station-x')!
        .addEventListener('click', () => this.hideStation());
    }
    document.getElementById('station-row')!.textContent = rowText;
  }

  /** Structure key: rebuild rows only when a line or train is bought;
   * between rebuilds, update text/disabled IN PLACE so buttons are
   * never detached mid-tap. */
  private panelKey = '';

  private renderPanel(): void {
    const g = this.game;
    const key = `${g.unlockedLineIds.size}:${g.trains.length}`;
    if (key === this.panelKey && this.panelEl.childElementCount > 0) {
      this.updatePanelInPlace();
      return;
    }
    this.panelKey = key;
    const rows = g.city.lines
      .map((l) => {
        const owned = g.isUnlocked(l.id);
        const bullet = `<span class="bullet" style="background:${l.color}">${l.bullet}</span>`;
        if (!owned) {
          const can = g.cash >= l.unlockCost;
          return `<div class="row locked">${bullet}<span class="nm">${l.name}</span>
            <span class="meta">${l.stationIds.length} stops</span>
            <button data-act="buy-line" data-line="${l.id}" ${can ? '' : 'disabled'}>
              OPEN · $${fmt(l.unlockCost)}</button></div>`;
        }
        const cost = g.nextTrainCost(l.id);
        const can = g.cash >= cost;
        return `<div class="row">${bullet}<span class="nm">${l.name}</span>
          <span class="meta">${g.trainCount(l.id)} train${g.trainCount(l.id) === 1 ? '' : 's'}</span>
          <button data-act="buy-train" data-line="${l.id}" ${can ? '' : 'disabled'}>
            +TRAIN · $${fmt(cost)}</button></div>`;
      })
      .join('');
    this.panelEl.innerHTML =
      `<div class="panel-head">LINE DESK · balance $<span id="panel-bal">${fmt(g.cash)}</span></div>` +
      rows;
  }

  private updatePanelInPlace(): void {
    const g = this.game;
    const bal = document.getElementById('panel-bal');
    if (bal) bal.textContent = fmt(g.cash);
    for (const btn of this.panelEl.querySelectorAll<HTMLButtonElement>(
      'button[data-act]',
    )) {
      const lineId = btn.getAttribute('data-line')!;
      const cost =
        btn.getAttribute('data-act') === 'buy-line'
          ? g.lineById(lineId).unlockCost
          : g.nextTrainCost(lineId);
      btn.disabled = g.cash < cost;
    }
  }

  toast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastsEl.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }

  /** Per-frame HUD refresh (panel DOM at 4 Hz to avoid churn). */
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
    if (nowMs - this.lastPanelRefresh > 250) {
      this.lastPanelRefresh = nowMs;
      if (this.panelOpen) this.renderPanel();
      if (this.shownStationId) this.renderStation();
    }
  }
}
