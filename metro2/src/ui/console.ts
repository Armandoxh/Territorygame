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
  CITY_LADDER, CommissionType, Game, GLOBALS, GoalBenefit, GoalTrack,
  LineUpgradeKind, STATION_WORKS,
} from '../engine/game';
import { BUILD } from '../version';
import { sound } from './sound';

/** Category colors: the reward signal gets a hue per track. */
export const TRACK_COLORS: Record<string, string> = {
  growth: '#2f9e63',
  profit: '#b07714',
  expansion: '#4a6fd8',
  mastery: '#8a5fc9',
};

const KIND_WORDS: Record<string, string> = {
  riders: 'riders',
  earned: 'earned',
  lines: 'lines built',
  trains: 'trains',
  commissions: 'contracts',
  works: 'works built',
  lineUpgrades: 'upgrade lvls',
  rushEarned: 'rush earnings',
};

/** Compact figures with MATCHED units on both sides of a slash. */
function cfmt(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
  return String(Math.floor(v));
}

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

/** Milestone multiplier printer: ×1, ×1.5, ×2.25, ×11.4… */
function fmtMult(v: number): string {
  return v >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '');
}

function fmt(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.floor(v).toLocaleString('en-US');
}

/** NETWORK groups (audit 7): color-coded categories. */
const NET_GROUPS: { name: string; color: string; ids: string[] }[] = [
  { name: 'THROUGHPUT', color: '#5b8def', ids: ['signal', 'doors'] },
  { name: 'DEMAND', color: '#2f9e63', ids: ['marketing', 'crowd'] },
  { name: 'REVENUE', color: '#f0a04a', ids: ['fare', 'billboards'] },
  { name: 'SERVICE', color: '#8a5fc9', ids: ['yards', 'night'] },
];

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
  /** The cash figure the HEADER shows — eased toward the real value so
   * spends and windfalls ROLL instead of teleporting. */
  private shownCash: number | null = null;
  private cashHeld = false;

  /** Freeze the rolling cash display at [v] (the return card holds the
   * pre-collect figure); releaseCash lets it roll up. */
  holdCashAt(v: number): void {
    this.shownCash = v;
    this.cashHeld = true;
  }

  releaseCash(): void {
    this.cashHeld = false;
  }

  /** A spent price flies out of the button that took it. */
  private spawnFly(anchor: Element, amount: number): void {
    const r = anchor.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'flyout';
    fly.textContent = `−$${fmt(amount)}`;
    fly.style.left = `${r.left + r.width / 2}px`;
    fly.style.top = `${r.top - 4}px`;
    document.body.appendChild(fly);
    setTimeout(() => fly.remove(), 900);
  }

  /** After a rebuild, flash the row the purchase landed in. */
  private pulseRow(root: HTMLElement, act: string, attr: string | null): void {
    const sel = attr
      ? `[data-act="${act}"]${attr}`
      : `[data-act="${act}"]`;
    root.querySelector(sel)?.closest('.uprow, .row')?.classList.add('pulse');
  }

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

  /** main.ts hooks the city handoff here (save + reload). */
  onMoveOn: (() => void) | null = null;
  private moveOnArmed = false;

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
    this.moveOnArmed = false;
    this.panelEl.hidden = mode === null;
    if (mode) this.hideStation();
    const active =
      mode?.kind === 'line' ? 'lines' : mode?.kind === 'network' ? 'network' : mode?.kind;
    for (const [btn, key] of [
      ['btn-lines', 'lines'], ['btn-ops', 'ops'],
      ['btn-goals', 'goals'], ['btn-network', 'network'],
    ] as const) {
      document.getElementById(btn)!.classList.toggle('on', active === key);
    }
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
    const cashBefore = g.cash;
    switch (act) {
      case 'close-panel':
        this.setMode(null);
        return;
      case 'set-mode':
        this.buyMode = Number(el.getAttribute('data-n')) as 1 | 10 | 99;
        this.structSeq++;
        this.renderPanel();
        return;
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
      case 'move-on':
        if (this.moveOnArmed) {
          this.onMoveOn?.();
          return;
        }
        this.moveOnArmed = true;
        this.structSeq++;
        this.renderPanel();
        return;
      case 'accept-commission':
        g.acceptCommission();
        break;
      case 'skip-commission':
        g.skipCommission();
        break;
    }
    const spent = cashBefore - g.cash;
    if (spent > 0.005) {
      sound.buy();
      this.spawnFly(el, spent);
    }
    this.structSeq++;
    this.renderPanel();
    if (spent > 0.005) {
      const kind = el.getAttribute('data-kind');
      const dataId = el.getAttribute('data-id');
      this.pulseRow(
        this.panelEl, act,
        kind ? `[data-kind="${kind}"]` : dataId ? `[data-id="${dataId}"]` : null,
      );
    }
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
      const before = this.game.cash;
      this.game.buyWorks(el.getAttribute('data-id')!, this.shownStationId!, this.buyN());
      const spent = before - this.game.cash;
      if (spent > 0.005) {
        sound.buy();
        this.spawnFly(el, spent);
      }
      this.cardKey = '';
      this.renderStation();
      if (spent > 0.005) {
        this.pulseRow(
          this.stationEl, 'buy-work', `[data-id="${el.getAttribute('data-id')}"]`,
        );
      }
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

  /** What one level of this work buys — labeled, no notation soup. */
  private workSub(wid: string): string {
    switch (wid) {
      case 'food': return 'each level: <b>+$0.40</b>/rider · <b>+10%</b> riders here';
      case 'gates': return 'each level: <b>+$0.25</b> recovered per rider';
      case 'platform': return 'each level: trains stop <b>15%</b> faster here';
      case 'parking': return 'each level: <b>+6%</b> riders here';
      case 'escalators': return 'each level: <b>+8</b> platform capacity';
      default: return 'each level: <b>+4%</b> income on every fare here';
    }
  }

  private head(title: string): string {
    return `<div class="panel-head"><span>${title}</span>
      <span class="head-right">
        <button class="xbtn" data-act="close-panel">×</button>
      </span></div>`;
  }

  /** The ×1 | ×10 | MAX segmented control + live afford count. */
  private segRow(): string {
    const seg = BUY_MODES.map((m) => {
      const label = m === 1 ? '×1' : m === 10 ? '×10' : 'MAX';
      return `<button class="seg${this.buyMode === m ? ' on' : ''}"
        data-act="set-mode" data-n="${m}">${label}</button>`;
    }).join('');
    return `<div class="segrow"><div class="seg3">${seg}</div>
      <span class="segnote" id="afford-note"></span></div>`;
  }

  /** THE UpgradeRow — one component for every shop. Affordability is
   * a lit spine + bordered price; out-of-reach rows fall back whole.
   * A pip track shows scale even at L0; milestones tick in amber. */
  private upRow(o: {
    name: string;
    level: number;
    max: number;
    sub: string; // labeled, mono, single-format
    cat?: string; // category/affordability color
    milestones?: number[];
    nextMilestone?: number | null;
    act: string;
    attrs: string;
    bundle: (n: number) => { count: number; cost: number };
    pri?: 'lit' | 'dim' | null;
    priAttrs?: string;
  }): string {
    const cat = o.cat ?? 'var(--line, #e5484d)';
    const pipCount = Math.min(o.max, 10);
    const filled = Math.round((o.level / o.max) * pipCount);
    const ticks = (o.milestones ?? [])
      .filter((m) => m < o.max)
      .map((m) => `<em style="left:${(m / o.max) * 100}%"></em>`)
      .join('');
    let pips = '';
    for (let i = 0; i < pipCount; i++) {
      pips += `<i class="${i < filled ? 'on' : ''}"></i>`;
    }
    const pri =
      o.pri === undefined || o.pri === null
        ? ''
        : `<button class="pri${o.pri === 'lit' ? ' lit' : ''}" data-act="raise-priority" ${o.priAttrs ?? ''}>▲</button>`;
    if (o.level >= o.max) {
      return `<div class="uprow maxed" style="--cat:${cat}">
        <div class="uphead">${pri}<span class="upname">${o.name}</span>
          <span class="uplvl">L${o.level}</span>
          <div class="pricecol"><button class="buy" disabled>MAX</button></div></div>
        <div class="upsub">${o.sub}</div>
        <div class="pips">${pips}${ticks}</div></div>`;
    }
    const full = o.bundle(this.buyMode);
    const b1 = this.buyMode === 1 ? full : o.bundle(1);
    // Cumulative prices of the next 1..n levels — bundle(k).cost is
    // already the total for k, so this is one pass.
    const cums: number[] = [];
    for (let k = 1; k <= Math.max(full.count, 1); k++) {
      cums.push(o.bundle(k).cost);
    }
    const near =
      o.nextMilestone != null && o.nextMilestone - o.level <= 7
        ? ` <span class="upnext">⚡×1.5 @L${o.nextMilestone}</span>`
        : '';
    return `<div class="uprow" style="--cat:${cat}">
      <div class="uphead">${pri}<span class="upname">${o.name}</span>
        <span class="uplvl">L${o.level}</span>${near}
        <div class="pricecol">
          <button class="buy" data-act="${o.act}" ${o.attrs}
            data-cost="${b1.cost}" data-cums="${cums.map((c) => c.toFixed(2)).join('|')}">$${fmt(b1.cost)}</button>
          <span class="modecnt">×1</span></div></div>
      <div class="upsub">${o.sub}</div>
      <div class="pips">${pips}${ticks}</div></div>`;
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
              return this.upRow({
                name: w.name,
                level: lvl,
                max: Game.foodMax,
                sub: this.workSub(w.id),
                cat: '#2f9e63',
                act: 'buy-work',
                attrs: `data-id="${w.id}"`,
                bundle: (n) => g.workBundle(w.id, id, n),
              });
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
    this.panelEl.style.setProperty(
      '--line',
      this.mode.kind === 'line' ? this.game.lineById(this.mode.id).color : '#1a1a1a',
    );
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
          const open = g.lineUnlockCost(l.id);
          return `<div class="row locked">${bullet}<span class="nm">${l.name}</span>
            <span class="meta">${l.stationIds.length} stops</span>
            <button data-act="buy-line" data-id="${l.id}" data-cost="${open}">
              OPEN · $${fmt(open)}</button></div>`;
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
      const up = (kind: LineUpgradeKind, name: string, sub: string) =>
        this.upRow({
          name,
          level: g.lineUpgradeLevel(kind, id),
          max: Game.levelMax,
          sub,
          milestones: Game.milestoneLevels,
          nextMilestone: g.nextMilestone(kind, id),
          act: 'buy-up',
          attrs: `data-kind="${kind}"`,
          bundle: (n) => g.lineUpgradeBundle(kind, id, n),
        });
      const sig = 1 + 0.04 * g.globalLevelOf('signal');
      const spd = g.trainSpeedFor(id);
      const cap = g.capacityFor(id);
      const acc = 3 * g.accessLevelOf(id);
      const tset = 2.5 * g.trainsetLevelOf(id);
      const bonus = g.lineMilestoneMult(id);
      const arrow = (kind: LineUpgradeKind, label: string, now: string, next: string, maxv: string) => {
        const lv = g.lineUpgradeLevel(kind, id);
        if (lv >= Game.levelMax) return `${label} <b>${now}</b> · fully built`;
        if (lv === 0) return `${label} <b>${next}</b> to start · max ${maxv}`;
        return `${label} <b>${now}</b> → <b>${next}</b> · max ${maxv}`;
      };
      body =
        `<div class="row"><span class="meta">${l.stationIds.length} stops · ${g.trainCount(id)} train${g.trainCount(id) === 1 ? '' : 's'}</span>
          <button class="buy" data-act="buy-train" data-cost="${trainCost}">+TRAIN · $${fmt(trainCost)}</button></div>` +
        `<div class="sect">LINE BONUS ×${fmtMult(bonus)} · each ⚡ pays ×1.5 income here, +1 car</div>` +
        up('speed', 'SPEED', arrow('speed', 'speed', spd.toFixed(1), (spd + Game.baseSpeed * 0.04 * sig).toFixed(1), (Game.baseSpeed * 5 * sig).toFixed(0))) +
        up('cars', 'CARS', arrow('cars', 'per stop', cap.toFixed(0), (cap + 2).toFixed(0), '222')) +
        up('access', 'ACCESS', arrow('access', 'riders', `+${acc}%`, `+${acc + 3}%`, '+300%')) +
        up('trainset', 'TRAINSETS', arrow('trainset', 'riders', `+${tset.toFixed(1)}%`, `+${(tset + 2.5).toFixed(1)}%`, '+250%'));
    } else {
      const topPriority = g.stationPriority[0];
      body =
        `<div class="sect">STATION WORKS<span class="cnt">${l.stationIds.length} stops · tier-even</span></div>` +
        STATION_WORKS.slice()
          .sort((a, b) => g.stationPriority.indexOf(a.id) - g.stationPriority.indexOf(b.id))
          .map((w) => {
            const min = g.minStationLevel(id, w.id);
            return this.upRow({
              name: w.name,
              level: min,
              max: Game.foodMax,
              sub: this.workSub(w.id),
              cat: '#2f9e63',
              act: 'buy-tier',
              attrs: `data-id="${w.id}"`,
              bundle: () => ({
                count: g.stationsAtMin(id, w.id),
                cost: g.stationTierCost(id, w.id),
              }),
              pri: w.id === topPriority ? 'lit' : 'dim',
              priAttrs: `data-id="${w.id}"`,
            });
          })
          .join('');
    }
    return (
      this.head(`${bullet} ${l.name.toUpperCase()}`) +
      tabs +
      (tab === 'up' ? this.segRow() : '') +
      body
    );
  }

  /** One labeled sub per global: label once, unit once (audit 6). */
  private globalSub(id: string): string {
    const g = this.game;
    const lvl = g.globalLevelOf(id);
    const def = GLOBALS.find((d) => d.id === id)!;
    const maxed = lvl >= def.maxLevel;
    const rng = (label: string, now: string, next: string, maxv: string) => {
      if (maxed) return `${label} <b>${now}</b> · fully built`;
      if (lvl === 0) return `${label} <b>${next}</b> to start · max ${maxv}`;
      return `${label} <b>${now}</b> → <b>${next}</b> · max ${maxv}`;
    };
    switch (id) {
      case 'signal':
        return rng('speed', `+${4 * lvl}%`, `+${4 * (lvl + 1)}%`, '+40%');
      case 'doors':
        return rng('stop time', `−${5 * lvl}%`, `−${5 * (lvl + 1)}%`, '−50%');
      case 'marketing':
        return rng('riders', `+${5 * lvl}%`, `+${5 * (lvl + 1)}%`, '+50%');
      case 'fare':
        return rng('fare', `$${g.currentFare.toFixed(2)}`,
          `$${(g.currentFare + 0.25 * g.fareScale).toFixed(2)}`,
          `$${(4 * g.fareScale).toFixed(2)}`);
      case 'billboards':
        return rng('income', `+${3 * lvl}%`, `+${3 * (lvl + 1)}%`, '+30%');
      case 'crowd':
        return rng('capacity', g.stationCapNow.toFixed(0),
          (g.stationCapNow + 8).toFixed(0), String(Game.stationCapBase + 80));
      case 'yards':
        return rng('train cost', `−${4 * lvl}%`, `−${4 * (lvl + 1)}%`, '−40%');
      default:
        return rng('offline rate', `${(100 * g.offlineEfficiencyNow).toFixed(0)}%`,
          `${(100 * g.offlineEfficiencyNow + 6).toFixed(0)}%`, '80%');
    }
  }

  private networkHtml(): string {
    const g = this.game;
    const sections = NET_GROUPS.map((grp) => {
      const defs = grp.ids.map((gid) => GLOBALS.find((d) => d.id === gid)!);
      const lvls = defs.reduce((n, d) => n + g.globalLevelOf(d.id), 0);
      const maxs = defs.reduce((n, d) => n + d.maxLevel, 0);
      const rows = defs
        .map((d) =>
          this.upRow({
            name: d.name,
            level: g.globalLevelOf(d.id),
            max: d.maxLevel,
            sub: this.globalSub(d.id),
            cat: grp.color,
            act: 'buy-global',
            attrs: `data-id="${d.id}"`,
            bundle: (n) => g.globalBundle(d.id, n),
          }),
        )
        .join('');
      return (
        `<div class="sect" style="color:${grp.color}"><span class="sq" style="background:${grp.color}"></span>${grp.name}<span class="cnt">${lvls}/${maxs}</span></div>` +
        rows
      );
    }).join('');
    return this.head('NETWORK') + this.segRow() + sections;
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
    const chip = (label: string, live: boolean, color: string): string =>
      `<span class="multchip${live ? ' lit' : ''}"${live ? ` style="color:${color}"` : ''}>${label}</span>`;
    const earned =
      `<div class="multrow">` +
      chip(`riders ×${g.demandGoalMult.toFixed(2)}`, g.demandGoalMult > 1, '#57c785') +
      chip(`income ×${g.goalMult.toFixed(2)}`, g.goalMult > 1, '#f0a04a') +
      chip(`costs ×${g.buildCostMult.toFixed(2)}`, g.buildCostMult < 1, '#5b8def') +
      `</div>`;
    const section = (track: GoalTrack): string => {
      const color = TRACK_COLORS[track.id];
      const done = g.trackDone(track.id);
      const goal = g.trackCurrentGoal(track.id);
      const current = goal
        ? `<div class="gcard" style="--tk:${color}">
            <div class="gfill2" id="goal-bar-${track.id}"
              style="width:${100 * g.trackProgress(track.id)}%"></div>
            <div class="gtitle">${goal.name}</div>
            <div class="gsub" id="goal-live-${track.id}">${cfmt(g.goalValue(goal.kind))} / ${cfmt(goal.target)} ${KIND_WORDS[goal.kind]}</div>
            <span class="gr" style="color:${color}">${benefitLabel(track.benefit, goal.reward)}</span>
          </div>`
        : `<div class="gcard"><div class="gtitle" style="color:#57c785">TRACK COMPLETE ✓</div></div>`;
      const upNext = track.goals[done + 1];
      const next = upNext
        ? `<div class="gnext"><span>🔒</span><span>${upNext.name}</span>
            <span class="gr2">×${upNext.reward}</span></div>`
        : '';
      return (
        `<div class="sect" style="color:${color}"><span class="sq" style="background:${color}"></span>${track.name}<span class="cnt">${done}/${track.goals.length}</span></div>` +
        current +
        next
      );
    };
    const nextId = g.nextCityId;
    let ladder = '';
    if (nextId) {
      const nextName = nextId.replace(/_/g, ' ').toUpperCase();
      if (g.canMoveOn) {
        ladder = this.moveOnArmed
          ? `<div class="gcard moveon armed" data-act="move-on">
              <div class="gtitle">HAND OVER THE KEYS?</div>
              <div class="gsub">cash, riders and every commendation travel with you
                — this network stays behind. Tap again to move.</div></div>`
          : `<div class="gcard moveon" data-act="move-on">
              <div class="gtitle">MOVE TO ${nextName} ›</div>
              <div class="gsub">all four tracks complete — a bigger city calls.
                costs ×10 · fares ×8 · fresh network</div></div>`;
      } else {
        const doneTracks = this.game.tracks.filter(
          (t) => g.trackCurrentGoal(t.id) === null,
        ).length;
        ladder = `<div class="gnext ladder"><span>⛴</span>
          <span>${nextName} AWAITS — finish all four tracks</span>
          <span class="gr2">${doneTracks}/4</span></div>`;
      }
    } else if (CITY_LADDER.indexOf(g.city.id) > 0) {
      ladder = `<div class="gnext ladder"><span>⛴</span>
        <span>${g.city.name.toUpperCase()} — the frontier, for now</span></div>`;
    }
    return (
      this.head('CITY GOALS') +
      earned +
      ladder +
      this.game.tracks.map(section).join('') +
      `<div class="buildfoot">METRO MAGNATE · ${BUILD}</div>`
    );
  }

  private refreshLive(): void {
    const g = this.game;
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
      for (const track of this.game.tracks) {
        const goal = g.trackCurrentGoal(track.id);
        const live = document.getElementById(`goal-live-${track.id}`);
        if (goal && live) {
          live.textContent = `${cfmt(g.goalValue(goal.kind))} / ${cfmt(goal.target)} ${KIND_WORDS[goal.kind]}`;
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
    let ok = 0;
    let total = 0;
    const cash = this.game.cash;
    for (const btn of root.querySelectorAll<HTMLButtonElement>('button[data-cost]')) {
      const cums = btn.getAttribute('data-cums');
      let can: boolean;
      if (cums) {
        // b62 field report: ×10/MAX priced the FULL bundle and lit on
        // ×1 affordability — misleading. The button now shows the max
        // purchasable right now: price of k levels, ×k underneath,
        // lit only when k ≥ 1. Re-aimed live as cash grows.
        const ladder = cums.split('|').map(Number);
        let k = 0;
        while (k < ladder.length && ladder[k] <= cash) k++;
        can = k > 0;
        btn.disabled = !can;
        btn.classList.toggle('afford', can);
        btn.textContent = `$${fmt(ladder[Math.max(k - 1, 0)])}`;
        const cnt = btn.parentElement?.querySelector('.modecnt');
        if (cnt) {
          if (!can && this.game.avgRate > 0.01) {
            // Anticipation timer: how long until the first level lands.
            const wait = (ladder[0] - cash) / this.game.avgRate;
            cnt.textContent = wait < 5940 ? `in ${mmss(wait)}` : 'later';
          } else {
            cnt.textContent =
              this.buyMode === 99 ? (can ? `MAX ×${k}` : '×0') : `×${k}`;
          }
        }
      } else {
        const cost = Number(btn.getAttribute('data-cost'));
        if (cost <= 0) continue;
        can = cash >= cost;
        btn.disabled = !can;
        btn.classList.toggle('afford', can);
      }
      const row = btn.closest('.uprow');
      if (row) {
        row.classList.toggle('ok', can);
        row.classList.toggle('no', !can);
        total++;
        if (can) ok++;
      }
    }
    const note = root.querySelector('#afford-note');
    if (note) note.textContent = `${ok} of ${total} affordable`;
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
    if (this.shownCash === null) this.shownCash = g.cash;
    if (!this.cashHeld) {
      const d = g.cash - this.shownCash;
      this.shownCash =
        Math.abs(d) < Math.max(0.5, g.cash * 1e-7) ? g.cash : this.shownCash + d * 0.16;
    }
    this.cashEl.innerHTML =
      `$${fmt(this.shownCash)}<span class="cashrate">+$${g.avgRate >= 100 ? fmt(g.avgRate) : g.avgRate.toFixed(2)} / sec</span>`;
    this.rateEl.textContent = `${fmt(g.totalRiders)} riders`;
    const n = g.nightFactor;
    const phase = g.rushActive
      ? ['⚡', 'RUSH']
      : n === 0
        ? ['☀', 'DAY']
        : n === 1
          ? ['☾', 'NIGHT']
          : g.rushClock % 180 < 110
            ? ['◑', 'DAWN']
            : ['◐', 'DUSK'];
    this.phaseEl.innerHTML = `<i>${phase[0]}</i>${phase[1]}`;
    const best = g.bestTrack;
    const strip = document.getElementById('goal-strip')!;
    if (best.goal) {
      const color = TRACK_COLORS[best.track.id];
      const pct = Math.floor(best.progress * 100);
      strip.innerHTML = `<span class="gslabel"><b>NEXT · </b>${best.goal.name}</span>
        <span class="gsbar"><span class="gsfill" style="width:${pct}%;background:${color}"></span></span>
        <span class="gspct">${pct}%</span>`;
    } else {
      strip.innerHTML = '<span class="gslabel">ALL TRACKS COMPLETE</span>';
    }
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
