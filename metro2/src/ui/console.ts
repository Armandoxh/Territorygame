/** The v2 console — v1's dashboard idiom (ink bars, hairlines, square
 * corners) as a DOM overlay on the map.
 *
 * b51 shape, from played feedback:
 * - ONE buy button per row + a global ×1/×10/×MAX toggle in the panel
 *   head (the idle-genre standard), so rows stay single-line.
 * - Line sheets split into UPGRADES and STATION WORKS sub-tabs.
 * - Every panel closes from its ✕ or by tapping the map.
 * - GOALS is four parallel tracks with categorized benefits.
 *
 * DOM rule learned in b40: panels REBUILD only when structure changes
 * and mutate in place otherwise, so no button is detached mid-tap. */
import {
  CommissionType, Game, GLOBALS, GOAL_TRACKS, GoalBenefit, LineUpgradeKind,
  STATION_WORKS,
} from '../engine/game';

function mmss(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function commissionTypeName(t: CommissionType): string {
  switch (t) {
    case 'haul': return 'HAUL';
    case 'express': return 'TURNBACK RUN';
    case 'station': return 'HUB SERVICE';
    case 'sweep': return 'CLEAN SWEEP';
    case 'rushCash': return 'RUSH CONTRACT';
  }
}

export function benefitLabel(b: GoalBenefit, reward: number): string {
  if (b === 'income') return `income ×${reward}`;
  if (b === 'riders') return `riders ×${reward}`;
  return `build costs ×${reward}`;
}

function fmt(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 10000) return (v / 1000).toFixed(1) + 'K';
  return Math.floor(v).toLocaleString('en-US');
}

type LineTab = 'up' | 'works';
type PanelMode =
  | { kind: 'lines' }
  | { kind: 'line'; id: string; tab: LineTab }
  | { kind: 'network' }
  | { kind: 'ops' }
  | { kind: 'goals' };

const BUY_MODES = [1, 10, 99] as const;

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
  private structSeq = 0;
  private builtKey = '';
  /** The global buy amount: ×1, ×10, or MAX — one toggle for all rows. */
  private buyMode: 1 | 10 | 99 = 1;

  constructor(private game: Game) {
    document.getElementById('btn-lines')!.addEventListener('click', () => {
      this.setMode(this.mode?.kind === 'lines' || this.mode?.kind === 'line'
        ? null
        : { kind: 'lines' });
    });
    document.getElementById('btn-network')!.addEventListener('click', () => {
      this.setMode(this.mode?.kind === 'network' ? null : { kind: 'network' });
    });
    document.getElementById('btn-ops')!.addEventListener('click', () => {
      this.setMode(this.mode?.kind === 'ops' ? null : { kind: 'ops' });
    });
    document.getElementById('btn-goals')!.addEventListener('click', () => {
      this.setMode(this.mode?.kind === 'goals' ? null : { kind: 'goals' });
    });
    document.getElementById('goal-strip')!.addEventListener('click', () => {
      this.setMode({ kind: 'goals' });
    });
    this.panelEl.addEventListener('click', (e) => this.onPanelClick(e));
    this.stationEl.addEventListener('click', (e) => this.onStationClick(e));
  }

  /** main.ts hooks the camera glide here. */
  onUnlock: ((lineId: string) => void) | null = null;

  /** True while any panel or card is open (map taps close them). */
  get isOpen(): boolean {
    return this.mode !== null || this.shownStationId !== null;
  }

  closeAll(): void {
    this.setMode(null);
    this.hideStation();
  }

  private setMode(mode: PanelMode | null): void {
    this.mode = mode;
    this.panelEl.hidden = mode === null;
    if (mode) this.hideStation();
    this.structSeq++;
    if (mode) this.renderPanel();
  }

  private buyN(): number {
    return this.buyMode;
  }

  private onPanelClick(e: Event): void {
    const g = this.game;
    const el = (e.target as HTMLElement).closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act')!;
    const id = el.getAttribute('data-id') ?? '';
    const lineId = this.mode?.kind === 'line' ? this.mode.id : id;
    switch (act) {
      case 'close-panel':
        this.setMode(null);
        return;
      case 'cycle-mode': {
        const i = BUY_MODES.indexOf(this.buyMode);
        this.buyMode = BUY_MODES[(i + 1) % BUY_MODES.length];
        this.structSeq++;
        this.renderPanel();
        return;
      }
      case 'open-line':
        this.setMode({ kind: 'line', id, tab: 'up' });
        return;
      case 'line-tab':
        if (this.mode?.kind === 'line') {
          this.setMode({ kind: 'line', id: this.mode.id, tab: id as LineTab });
        }
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
      case 'buy-up':
        g.buyLineUpgrades(
          el.getAttribute('data-kind') as LineUpgradeKind,
          lineId,
          this.buyN(),
        );
        break;
      case 'buy-tier':
        g.buyStationTier(lineId, id);
        break;
      case 'raise-priority':
        g.raisePriority(id);
        break;
      case 'buy-global':
        g.buyGlobals(id, this.buyN());
        break;
      case 'accept-commission':
        g.acceptCommission();
        break;
      case 'skip-commission':
        g.skipCommission();
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
    if (el.getAttribute('data-act') === 'toggle-works') {
      this.stationWorksOpen = !this.stationWorksOpen;
      this.cardKey = '';
      this.renderStation();
      return;
    }
    if (el.getAttribute('data-act') === 'buy-work') {
      this.game.buyWorks(el.getAttribute('data-id')!, this.shownStationId!, this.buyN());
      this.cardKey = '';
      this.renderStation();
    }
  }

  showStation(stationId: string): void {
    this.shownStationId = stationId;
    this.stationWorksOpen = false;
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
  private stationWorksOpen = false;

  /** Current → next effect for one station work at [lvl]. */
  private workStat(wid: string, lvl: number): string {
    const nxt = lvl + 1;
    switch (wid) {
      case 'food': return lvl >= Game.foodMax
        ? `+$${(0.4 * lvl).toFixed(1)} · +${10 * lvl}%`
        : `+$${(0.4 * lvl).toFixed(1)} → ${(0.4 * nxt).toFixed(1)} · +${10 * lvl} → ${10 * nxt}%`;
      case 'gates': return lvl >= Game.foodMax
        ? `+$${(0.25 * lvl).toFixed(2)}/rider`
        : `+$${(0.25 * lvl).toFixed(2)} → ${(0.25 * nxt).toFixed(2)}/rider`;
      case 'platform': return lvl >= Game.foodMax
        ? `−${15 * lvl}% dwell`
        : `−${15 * lvl}% → ${15 * nxt}% dwell`;
      case 'parking': return lvl >= Game.foodMax
        ? `+${6 * lvl}% riders`
        : `+${6 * lvl}% → ${6 * nxt}% riders`;
      case 'escalators': return lvl >= Game.foodMax
        ? `+${8 * lvl} cap`
        : `+${8 * lvl} → ${8 * nxt} cap`;
      default: return lvl >= Game.foodMax
        ? `+${4 * lvl}% income`
        : `+${4 * lvl}% → ${4 * nxt}% income`;
    }
  }

  private modeLabel(): string {
    return this.buyMode === 1 ? '×1' : this.buyMode === 10 ? '×10' : 'MAX';
  }

  private head(title: string, withMode = false): string {
    return `<div class="panel-head"><span>${title}</span>
      <span class="head-right">
        ${withMode ? `<button class="modebtn" data-act="cycle-mode">BUY ${this.modeLabel()}</button>` : ''}
        <span class="head-bal">$<span class="bal">${fmt(this.game.cash)}</span></span>
        <button class="xbtn" data-act="close-panel">×</button>
      </span></div>`;
  }

  /** One upgrade row: NAME · Ln · stat, one buy button (global mode). */
  private upRow(
    name: string,
    level: number,
    max: number,
    stat: string,
    maxStat: string,
    buys: { act: string; attrs: string },
    bundle: (n: number) => { count: number; cost: number },
  ): string {
    if (level >= max) {
      return `<div class="row up"><span class="nm">${name}</span>
        <span class="lvl">MAX</span><span class="stat">${stat}</span></div>`;
    }
    const b = bundle(this.buyMode);
    const b1 = this.buyMode === 1 ? b : bundle(1);
    const label =
      this.buyMode === 1
        ? `$${fmt(b.cost)}`
        : this.buyMode === 10
          ? `×${b.count} $${fmt(b.cost)}`
          : `MAX $${fmt(b.cost)}`;
    return `<div class="row up">
      <span class="nm">${name}</span><span class="lvl">L${level}</span>
      <span class="stat">${stat} <b class="maxhint">· max ${maxStat}</b></span>
      <button data-act="${buys.act}" ${buys.attrs} data-cost="${b1.cost}">${label}</button>
    </div>`;
  }

  private renderStation(): void {
    const id = this.shownStationId;
    if (!id) return;
    const g = this.game;
    const st = g.city.stations.find((s) => s.id === id)!;
    const served = g.isServed(id);
    const key = `${id}:${served}:${this.stationWorksOpen}:${this.buyMode}:${this.structSeq}`;
    if (this.cardKey !== key) {
      this.cardKey = key;
      const bullets = g.city.lines
        .filter((l) => g.isUnlocked(l.id) && l.stationIds.includes(id))
        .map((l) => `<span class="bullet" style="background:${l.color}">${l.bullet}</span>`)
        .join('');
      if (!served) {
        this.stationEl.innerHTML = `
          <div class="card-head"><b>${st.name}</b>
            <button class="xbtn" data-act="close-station">×</button></div>
          <div class="card-row">no service yet — a locked route stops here</div>`;
      } else {
        // The station DASHBOARD: big live stat tiles; the works shop
        // hides behind its own button.
        const tiles = `<div class="cardgrid">
          <div class="tile"><div class="big" id="st-demand">–</div>
            <div class="sub" id="st-demand-sub">riders arriving /s</div></div>
          <div class="tile"><div class="big" id="st-ticket">–</div>
            <div class="sub">per boarding</div></div>
          <div class="tile"><div class="big" id="st-waiting">–</div>
            <div class="sub" id="st-cap-sub">waiting · cap –</div></div>
          <div class="tile"><div class="big" id="st-life">–</div>
            <div class="sub">riders boarded here</div></div>
          <div class="tile"><div class="big" id="st-service">–</div>
            <div class="sub">trains serving this stop</div></div>
          <div class="tile"><div class="big" id="st-works">–</div>
            <div class="sub">station works built</div></div>
        </div>`;
        const works = !this.stationWorksOpen
          ? ''
          : STATION_WORKS.map((w) => {
              const lvl = g.stationWorkLevel(w.id, id);
              return this.upRow(
                w.name,
                lvl,
                Game.foodMax,
                this.workStat(w.id, lvl),
                this.workStat(w.id, Game.foodMax),
                { act: 'buy-work', attrs: `data-id="${w.id}"` },
                (n) => g.workBundle(w.id, id, n),
              );
            }).join('');
        this.stationEl.innerHTML = `
          <div class="card-head"><b>${st.name}</b>${bullets}
            <button class="worksbtn" data-act="toggle-works">
              ${this.stationWorksOpen ? '‹ STATS' : 'WORKS ›'}</button>
            <button class="xbtn" data-act="close-station">×</button></div>
          ${this.stationWorksOpen ? works : tiles}`;
      }
    }
    if (!served) return;
    if (!this.stationWorksOpen) {
      const arrivals =
        st.demand * Game.demandScale * g.demandMultAt(id) * g.rushFactorAt(id);
      const rushing = g.rushFactorAt(id) > 1;
      const up = Math.floor(g.waitingUp.get(id) ?? 0);
      const down = Math.floor(g.waitingDown.get(id) ?? 0);
      const cap = g.stationCapAt(id);
      const trains = g.trains.filter((t) =>
        g.lineById(t.lineId).stationIds.includes(id)).length;
      const set = (elId: string, text: string) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = text;
      };
      set('st-demand', `${arrivals.toFixed(1)}/s`);
      set('st-demand-sub', rushing ? 'riders arriving /s · RUSH ×2.5' : 'riders arriving /s');
      set('st-ticket', `$${g.incomePerRiderAt(id).toFixed(2)}`);
      set('st-waiting', `${up}↑ ${down}↓`);
      set('st-cap-sub', `waiting · cap ${cap.toFixed(0)}`);
      set('st-life', fmt(g.boardedAt.get(id) ?? 0));
      set('st-service', String(trains));
      set('st-works', `${g.worksAt(id)}/${STATION_WORKS.length * Game.foodMax}`);
      const dEl = document.getElementById('st-demand');
      if (dEl) dEl.style.color = rushing ? '#c62828' : '#1a1a1a';
      const wEl = document.getElementById('st-waiting');
      if (wEl) {
        const ratio = (up + down) / cap;
        wEl.style.color = ratio >= 1 ? '#c62828' : ratio > 0.5 ? '#b07714' : '#1a1a1a';
      }
    }
    this.refreshDisabled(this.stationEl);
  }

  private renderPanel(): void {
    if (!this.mode) return;
    const key = `${JSON.stringify(this.mode)}:${this.structSeq}:${this.buyMode}`;
    if (key === this.builtKey) {
      this.refreshLive();
      return;
    }
    this.builtKey = key;
    if (this.mode.kind === 'lines') this.panelEl.innerHTML = this.linesHtml();
    else if (this.mode.kind === 'line') {
      this.panelEl.innerHTML = this.lineHtml(this.mode.id, this.mode.tab);
    } else if (this.mode.kind === 'ops') this.panelEl.innerHTML = this.opsHtml();
    else if (this.mode.kind === 'goals') this.panelEl.innerHTML = this.goalsHtml();
    else this.panelEl.innerHTML = this.networkHtml();
    this.refreshLive();
  }

  private linesHtml(): string {
    const g = this.game;
    const rows = g.city.lines
      .map((l) => {
        const bullet = `<span class="bullet" style="background:${l.color}">${l.bullet}</span>`;
        if (!g.isUnlocked(l.id)) {
          return `<div class="row locked">${bullet}<span class="nm">${l.name}</span>
            <span class="meta">${l.stationIds.length} stops</span>
            <button data-act="buy-line" data-id="${l.id}" data-cost="${l.unlockCost}">
              OPEN · $${fmt(l.unlockCost)}</button></div>`;
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

  private lineHtml(id: string, tab: LineTab): string {
    const g = this.game;
    const l = g.lineById(id);
    const bullet = `<span class="bullet" style="background:${l.color}">${l.bullet}</span>`;
    const trainCost = g.nextTrainCost(id);
    const tabs = `<div class="tabs">
      <button data-act="back">‹</button>
      <button class="${tab === 'up' ? 'on' : ''}" data-act="line-tab" data-id="up">UPGRADES</button>
      <button class="${tab === 'works' ? 'on' : ''}" data-act="line-tab" data-id="works">STATION WORKS</button>
    </div>`;
    let body: string;
    if (tab === 'up') {
      const up = (kind: LineUpgradeKind, name: string, stat: string, maxStat: string) =>
        this.upRow(
          name,
          g.lineUpgradeLevel(kind, id),
          Game.levelMax,
          stat,
          maxStat,
          { act: 'buy-up', attrs: `data-kind="${kind}"` },
          (n) => g.lineUpgradeBundle(kind, id, n),
        );
      const sig = 1 + 0.04 * g.globalLevelOf('signal');
      const arrow = (kind: LineUpgradeKind, now: string, next: string) =>
        g.lineUpgradeLevel(kind, id) >= Game.levelMax ? now : `${now} → ${next}`;
      const spd = g.trainSpeedFor(id);
      const spdNext = spd + Game.baseSpeed * 0.15 * sig;
      const cap = g.capacityFor(id);
      const acc = 10 * g.accessLevelOf(id);
      const tset = 8 * g.trainsetLevelOf(id);
      body =
        `<div class="row"><span class="meta">${l.stationIds.length} stops · ${g.trainCount(id)} train${g.trainCount(id) === 1 ? '' : 's'}</span>
          <button data-act="buy-train" data-cost="${trainCost}">+TRAIN · $${fmt(trainCost)}</button></div>` +
        up('speed', 'SPEED', arrow('speed', spd.toFixed(1), spdNext.toFixed(1)),
          (Game.baseSpeed * 2.5 * sig).toFixed(1)) +
        up('cars', 'CARS', arrow('cars', `${cap.toFixed(0)}/stop`, `${(cap + 6).toFixed(0)}/stop`),
          '82/stop') +
        up('access', 'ACCESS', arrow('access', `+${acc}%`, `${acc + 10}% riders`), '+100%') +
        up('trainset', 'TRAINSETS', arrow('trainset', `+${tset}%`, `${tset + 8}% riders`), '+80%');
    } else {
      const next = g.nextPlannedType(id);
      body = STATION_WORKS
        .slice()
        .sort((a, b) => g.stationPriority.indexOf(a.id) - g.stationPriority.indexOf(b.id))
        .map((w) => {
          const min = g.minStationLevel(id, w.id);
          const done = min >= Game.foodMax;
          const count = done ? 0 : g.stationsAtMin(id, w.id);
          const cost = g.stationTierCost(id, w.id);
          return `<div class="row up${w.id === next ? ' next' : ''}">
            <button class="pri" data-act="raise-priority" data-id="${w.id}">▲</button>
            <span class="nm">${w.name}</span>
            <span class="lvl">${done ? 'MAX' : `L${min}→${min + 1} ·${count}×`}</span>
            <span class="stat">${this.workStat(w.id, done ? Game.foodMax : min)}</span>
            <button data-act="buy-tier" data-id="${w.id}" data-cost="${done ? 0 : cost}"
              ${done ? 'disabled' : ''}>${done ? 'MAX' : '$' + fmt(cost)}</button></div>`;
        })
        .join('');
      body = `<div class="sect">tier-even across the line · ▲ sets priority</div>` + body;
    }
    return this.head(`${bullet} ${l.name.toUpperCase()}`, tab === 'up') + tabs + body;
  }

  private globalStat(id: string, lvl: number): string {
    const g = this.game;
    switch (id) {
      case 'signal': return `+${4 * lvl}% → ${4 * (lvl + 1)}% speed`;
      case 'doors': return `−${5 * lvl}% → ${5 * (lvl + 1)}% stop time`;
      case 'marketing': return `+${5 * lvl}% → ${5 * (lvl + 1)}% riders`;
      case 'fare': return `$${g.currentFare.toFixed(2)} → ${(g.currentFare + 0.25 * g.fareScale).toFixed(2)} fare`;
      case 'billboards': return `+${3 * lvl}% → ${3 * (lvl + 1)}% income`;
      case 'crowd': return `${g.stationCapNow.toFixed(0)} → ${(g.stationCapNow + 8).toFixed(0)} cap`;
      case 'yards': return `−${4 * lvl}% → ${4 * (lvl + 1)}% train cost`;
      default: return `${(100 * g.offlineEfficiencyNow).toFixed(0)}% → ${(100 * g.offlineEfficiencyNow + 6).toFixed(0)}% offline`;
    }
  }

  private globalStatAtMax(id: string, lvl: number): string {
    const g = this.game;
    switch (id) {
      case 'signal': return `+${4 * lvl}% speed`;
      case 'doors': return `−${5 * lvl}% stop time`;
      case 'marketing': return `+${5 * lvl}% riders`;
      case 'fare':
        return `$${((Game.fare + 0.25 * lvl) * g.fareScale).toFixed(2)} fare`;
      case 'billboards': return `+${3 * lvl}% income`;
      case 'crowd': return `${(Game.stationCapBase + 8 * lvl).toFixed(0)} cap`;
      case 'yards': return `−${4 * lvl}% train cost`;
      default: return `${(50 + 6 * lvl).toFixed(0)}% offline`;
    }
  }

  private networkHtml(): string {
    const g = this.game;
    const rows = GLOBALS.map((d) => {
      const lvl = g.globalLevelOf(d.id);
      const stat =
        lvl >= d.maxLevel ? this.globalStatAtMax(d.id, lvl) : this.globalStat(d.id, lvl);
      return this.upRow(
        d.name,
        lvl,
        d.maxLevel,
        stat,
        this.globalStatAtMax(d.id, d.maxLevel),
        { act: 'buy-global', attrs: `data-id="${d.id}"` },
        (n) => g.globalBundle(d.id, n),
      );
    }).join('');
    return this.head('NETWORK UPGRADES', true) + rows;
  }

  private lineName(id: string | null): string {
    if (!id) return '—';
    const l = this.game.city.lines.find((x) => x.id === id)!;
    return `<span class="bullet" style="background:${l.color}">${l.bullet}</span> ${l.name}`;
  }

  private offerText(): string {
    const g = this.game;
    const q = g.commissionQuota;
    const t = mmss(g.commissionTimeLimit);
    switch (g.commissionType) {
      case 'haul':
        return `Carry ${Math.floor(q)} riders on this line within ${t}.`;
      case 'express':
        return `Complete ${Math.floor(q)} terminal turnbacks on this line within ${t} — speed pays.`;
      case 'station': {
        const sid = g.commissionStationId;
        const name = sid
          ? g.city.stations.find((s) => s.id === sid)!.name
          : 'the hub';
        return `Board ${Math.floor(q)} riders at ${name} within ${t} — cars and trains on this line feed the hub.`;
      }
      case 'sweep':
        return `Get EVERY platform on this line under ${Game.sweepThreshold} waiting at once, within ${t}.`;
      case 'rushCash':
        return `Earn $${fmt(q)} during rush windows within ${t} — check the timetable above.`;
    }
  }

  private progressText(): string {
    const g = this.game;
    const p = g.commissionProgress;
    const q = g.commissionQuota;
    const t = mmss(g.commissionTimeLeft);
    switch (g.commissionType) {
      case 'haul': return `${Math.floor(p)} / ${Math.floor(q)} riders · ${t} left`;
      case 'express': return `${Math.floor(p)} / ${Math.floor(q)} turnbacks · ${t} left`;
      case 'station': return `${Math.floor(p)} / ${Math.floor(q)} boarded at the hub · ${t} left`;
      case 'sweep': return `${Math.floor(p)} / ${Math.floor(q)} platforms clear · ${t} left`;
      case 'rushCash': return `$${fmt(p)} / $${fmt(q)} in rush · ${t} left`;
    }
  }

  private opsHtml(): string {
    const g = this.game;
    const timetable = [0, 1, 2, 3]
      .map((o) => {
        const id = g.rushLineIdForCycle(o);
        const when =
          o === 0 && g.rushActive
            ? `<span class="rushnow">RUNNING · <span id="ops-t${o}">${mmss(g.rushSecondsLeft)}</span> left</span>`
            : `in <span id="ops-t${o}">${mmss(g.secondsUntilRushStart(o))}</span>`;
        return `<div class="row">${this.lineName(id)}<span class="meta"></span><span>${when}</span></div>`;
      })
      .join('');
    let desk: string;
    if (g.commissionActive) {
      desk = `<div class="row"><span class="nm">${commissionTypeName(g.commissionType)}</span>
          <span class="meta">${this.lineName(g.commissionLineId)}</span></div>
        <div class="card-row" id="ops-progress">${this.progressText()}</div>
        <div class="pbar"><div class="pfill" id="ops-bar" style="width:${(100 * g.commissionProgress) / g.commissionQuota}%"></div></div>`;
    } else {
      desk = `<div class="row"><span class="nm">${commissionTypeName(g.commissionType)}</span>
          <span class="meta">${this.lineName(g.commissionLineId)}</span>
          <span class="nm">pays $${fmt(g.commissionReward)}</span></div>
        <div class="card-row">${this.offerText()}</div>
        <div class="row"><button data-act="accept-commission">ACCEPT</button>
          <button data-act="skip-commission">SKIP</button>
          <span class="meta">${g.commissionsDone} delivered</span></div>`;
    }
    return (
      this.head('OPERATIONS') +
      `<div class="sect">RUSH TIMETABLE · ×${Game.rushMult} demand, ${Game.rushWindow}s window</div>` +
      timetable +
      `<div class="sect">COMMISSION DESK</div>` +
      desk
    );
  }

  private goalsHtml(): string {
    const g = this.game;
    const sections = GOAL_TRACKS.map((track) => {
      const done = g.trackDone(track.id);
      const goal = g.trackCurrentGoal(track.id);
      const rows = goal
        ? `<div class="row goal-current"><span class="mark">►</span>
            <span class="nm">${goal.name}</span><span class="meta"></span>
            <span>${benefitLabel(track.benefit, goal.reward)}</span></div>
          <div class="card-row" id="goal-live-${track.id}">${fmt(g.goalValue(goal.kind))} / ${fmt(goal.target)}</div>
          <div class="pbar"><div class="pfill" id="goal-bar-${track.id}" style="width:${100 * g.trackProgress(track.id)}%"></div></div>`
        : `<div class="row goal-done"><span class="mark">✓</span>
            <span class="nm">TRACK COMPLETE</span></div>`;
      const upNext = track.goals[done + 1];
      return (
        `<div class="sect">${track.name} · ${track.blurb} · ${done}/${track.goals.length}</div>` +
        rows +
        (upNext
          ? `<div class="row goal-ahead"><span class="mark">·</span>
              <span class="nm">${upNext.name}</span><span class="meta"></span>
              <span>${benefitLabel(track.benefit, upNext.reward)}</span></div>`
          : '')
      );
    }).join('');
    return (
      this.head(
        `CITY GOALS · income ×${g.goalMult.toFixed(2)} · riders ×${g.demandGoalMult.toFixed(2)} · costs ×${g.buildCostMult.toFixed(2)}`,
      ) + sections
    );
  }

  private refreshLive(): void {
    const g = this.game;
    const bal = this.panelEl.querySelector('.bal');
    if (bal) bal.textContent = fmt(g.cash);
    if (this.mode?.kind === 'ops') {
      for (const o of [0, 1, 2, 3]) {
        const el = document.getElementById(`ops-t${o}`);
        if (!el) continue;
        el.textContent =
          o === 0 && g.rushActive
            ? mmss(g.rushSecondsLeft)
            : mmss(g.secondsUntilRushStart(o));
      }
      const prog = document.getElementById('ops-progress');
      if (prog && g.commissionActive) {
        prog.textContent = this.progressText();
        const bar = document.getElementById('ops-bar');
        if (bar) {
          bar.style.width = `${Math.min(100, (100 * g.commissionProgress) / g.commissionQuota)}%`;
        }
      }
      if (this.opsSeq !== g.commissionSeq) {
        this.opsSeq = g.commissionSeq;
        this.structSeq++;
        this.renderPanel();
      }
    }
    if (this.mode?.kind === 'goals') {
      for (const track of GOAL_TRACKS) {
        const goal = g.trackCurrentGoal(track.id);
        const live = document.getElementById(`goal-live-${track.id}`);
        if (goal && live) {
          live.textContent = `${fmt(g.goalValue(goal.kind))} / ${fmt(goal.target)}`;
          const bar = document.getElementById(`goal-bar-${track.id}`);
          if (bar) bar.style.width = `${100 * g.trackProgress(track.id)}%`;
        }
      }
      if (this.goalsSeqSeen !== g.goalSeq) {
        this.goalsSeqSeen = g.goalSeq;
        this.structSeq++;
        this.renderPanel();
      }
    }
    this.refreshDisabled(this.panelEl);
  }

  private opsSeq = 0;
  private goalsSeqSeen = 0;

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
    this.cashEl.innerHTML =
      `$${fmt(g.cash)} <span class="cashrate">+$${g.avgRate >= 100 ? fmt(g.avgRate) : g.avgRate.toFixed(1)}/s</span>`;
    this.rateEl.textContent = `${fmt(g.totalRiders)} riders`;
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
    const best = g.bestTrack;
    document.getElementById('goal-strip')!.textContent = best.goal
      ? `${best.track.name} · ${best.goal.name} · ${Math.floor(best.progress * 100)}%`
      : 'ALL TRACKS COMPLETE';
    document
      .getElementById('btn-ops')!
      .classList.toggle('dot', !g.commissionActive);
    if (nowMs - this.lastRefresh > 250) {
      this.lastRefresh = nowMs;
      if (this.mode) this.renderPanel();
      if (this.shownStationId) this.renderStation();
    }
  }
}
