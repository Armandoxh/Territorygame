/** Metro Magnate v2 engine — a faithful TypeScript port of the v1 Dart
 * sim core (`metro/lib/state/game_state.dart`), system by system. v1's
 * balance harness remains the authority on tuning; every constant here
 * mirrors the Dart value by name. Deterministic, no RNG — same law as v1.
 *
 * Ported: rider arrivals with directional platforms, ping-pong trains
 * with dwell, boarding + fares, the rush clock, the light cycle,
 * widest-gap train spawning, line unlocks, and (M3) the FULL UPGRADE
 * ECONOMY — per-line upgrades, the six station works with tier-even
 * bulk buying and player priority, and the eight network upgrades.
 * (M3b) the OPS layer — rush timetable helpers, the five rotating
 * commission types — and the CITY GOALS ladder whose commendations
 * compound income. The Angel Bay city ladder ports next.
 */
import { CityDef, LineDef, LinePath } from './city';

export interface TrainState {
  lineId: string;
  distance: number;
  direction: 1 | -1;
  dwell: number;
  target: number;
}

export class Game {
  // ---- Static tuning (mirrors Dart; the v1 harness pins these) ----
  static readonly fare = 2.0;
  static readonly demandScale = 1.3;
  static readonly baseSpeed = 24;
  static readonly dwellTime = 0.9;
  static readonly stationCapBase = 80;
  static readonly capacityBase = 22;
  static readonly rushPeriod = 180;
  static readonly rushWindow = 45;
  static readonly rushMult = 2.5;
  /** Line upgrades climb to 100 (b54): shallow per-level gains on a
   * long ×1.14 cost curve, with MILESTONES at 10/25/50/100 that each
   * DOUBLE the line's income. Deep, slow, rewarding. */
  static readonly levelMax = 100;
  static readonly milestoneLevels = [10, 25, 50, 100];
  static readonly foodMax = 5; // max level for every station work
  static readonly foodBonusPerLevel = 0.4;

  // City economics (data may override; New Meridian is 1/1).
  get costScale(): number {
    return (this.city as { costScale?: number }).costScale ?? 1;
  }
  get fareScale(): number {
    return (this.city as { fareScale?: number }).fareScale ?? 1;
  }

  readonly city: CityDef;
  readonly paths = new Map<string, LinePath>();

  cash = 0;
  totalEarned = 0;
  totalRiders = 0;
  rushClock = 0;

  readonly waitingUp = new Map<string, number>();
  readonly waitingDown = new Map<string, number>();
  /** Lifetime boardings per station — the map's "hot part of town". */
  readonly boardedAt = new Map<string, number>();
  readonly trains: TrainState[] = [];
  readonly unlockedLineIds = new Set<string>();

  // ---- Station works (six per-station levels) ----
  readonly foodLevel = new Map<string, number>();
  readonly gateLevel = new Map<string, number>();
  readonly platformLevel = new Map<string, number>();
  readonly parkingLevel = new Map<string, number>();
  readonly escalatorLevel = new Map<string, number>();
  readonly securityLevel = new Map<string, number>();

  /** The order the bulk planner attacks work types in — player-set. */
  stationPriority: string[] = STATION_WORKS.map((w) => w.id);

  // ---- Per-line upgrade levels ----
  readonly speedLevels = new Map<string, number>();
  readonly carLevels = new Map<string, number>();
  readonly accessLevels = new Map<string, number>();
  readonly trainsetLevels = new Map<string, number>();

  // ---- Network-wide upgrade levels ----
  readonly globalLevels = new Map<string, number>();

  // ---- City commissions (opt-in directed contracts) ----
  static readonly commissionLimit = 120;
  static readonly sweepThreshold = 25;
  commissionIndex = 0;
  commissionsDone = 0;
  commissionActive = false;
  commissionProgress = 0;
  commissionTimeLeft = 0;
  /** Bumped when a commission resolves so the UI celebrates/consoles. */
  commissionSeq = 0;
  lastCommissionWon = false;

  // ---- City goals: FOUR PARALLEL TRACKS, each with its own benefit
  // (player-directed redesign, b51 — v1's single ladder retired) ----
  readonly goalsDoneByTrack = new Map<string, number>();
  /** Commendations banked in cities already left — they compound too. */
  priorGoals: Record<string, Record<string, number>> = {};
  private _incomeGoalMult = 1;
  private _demandGoalMult = 1;
  private _buildCostMult = 1;
  goalSeq = 0;
  lastGoalName = '';
  lastGoalReward = 1;
  lastGoalBenefit: GoalBenefit = 'income';
  /** Lifetime money earned during rush windows. */
  rushEarnings = 0;

  /** $/s estimate over a rolling window (drives HUD + offline pay). */
  avgRate = 0;
  private windowEarned = 0;
  private windowTime = 0;

  /** Bumped on every line unlock — the renderer keys the reveal off it. */
  unlockSeq = 0;
  lastUnlockedLineId = '';

  /** Bumped on every boarding — the renderer keys effects off it. */
  boardSeq = 0;
  lastBoardStationId = '';
  lastBoardLineId = '';
  lastBoardCount = 0;
  lastBoardAmount = 0;

  private served = new Set<string>();
  private upServedSet = new Set<string>();
  private downServedSet = new Set<string>();
  private linesServing = new Map<string, string[]>();

  constructor(city: CityDef) {
    this.city = city;
    for (const line of city.lines) {
      this.paths.set(line.id, new LinePath(city, line));
    }
    for (const s of city.stations) {
      this.waitingUp.set(s.id, 0);
      this.waitingDown.set(s.id, 0);
    }
    this.unlockedLineIds.add(city.lines[0].id);
    this.recomputeServed();
    this.trains.push(this.spawnTrain(city.lines[0]));
  }

  /** Showcase world for the render proof: the whole approved network
   * running, several trains a line, mid-morning clock. */
  static showcase(city: CityDef, trainsPerLine = 2): Game {
    const g = new Game(city);
    for (const line of city.lines) {
      if (!g.unlockedLineIds.has(line.id)) {
        g.unlockedLineIds.add(line.id);
        g.recomputeServed();
        g.trains.push(g.spawnTrain(line));
      }
    }
    for (const line of city.lines) {
      while (g.trains.filter((t) => t.lineId === line.id).length < trainsPerLine) {
        g.trains.push(g.spawnTrain(line));
      }
    }
    return g;
  }

  lineById(id: string): LineDef {
    return this.city.lines.find((l) => l.id === id)!;
  }

  isUnlocked(lineId: string): boolean {
    return this.unlockedLineIds.has(lineId);
  }

  isServed(stationId: string): boolean {
    return this.served.has(stationId);
  }

  waitingAt(stationId: string): number {
    return (this.waitingUp.get(stationId) ?? 0) + (this.waitingDown.get(stationId) ?? 0);
  }

  // ---- The v1 upgrade economy, formula for formula ----
  speedLevelOf(id: string): number { return this.speedLevels.get(id) ?? 0; }
  carLevelOf(id: string): number { return this.carLevels.get(id) ?? 0; }
  accessLevelOf(id: string): number { return this.accessLevels.get(id) ?? 0; }
  trainsetLevelOf(id: string): number { return this.trainsetLevels.get(id) ?? 0; }
  globalLevelOf(id: string): number { return this.globalLevels.get(id) ?? 0; }

  /** This line's trains: +4% speed per level (×5 at L100), times
   * network signals. */
  trainSpeedFor(lineId: string): number {
    return (
      Game.baseSpeed *
      (1 + 0.04 * this.speedLevelOf(lineId)) *
      (1 + 0.04 * this.globalLevelOf('signal'))
    );
  }

  /** This line's cars: riders boarded per stop (+2/level). */
  capacityFor(lineId: string): number {
    return Game.capacityBase + 2.0 * this.carLevelOf(lineId);
  }

  /** The fare riders actually pay right now. */
  get currentFare(): number {
    return (Game.fare + 0.25 * this.globalLevelOf('fare')) * this.fareScale;
  }

  /** Seconds stopped at each station, after platform doors. */
  get effectiveDwell(): number {
    return Game.dwellTime * (1 - 0.05 * this.globalLevelOf('doors'));
  }

  /** Ridership multiplier at one station: every serving line's access +
   * trainset upgrades COMPOUND, then food, park & ride, marketing. */
  demandMultAt(stationId: string): number {
    let m = 1.0;
    for (const lineId of this.linesServing.get(stationId) ?? []) {
      m *=
        (1 + 0.03 * this.accessLevelOf(lineId)) *
        (1 + 0.025 * this.trainsetLevelOf(lineId));
    }
    m *= 1 + 0.1 * (this.foodLevel.get(stationId) ?? 0);
    m *= 1 + 0.06 * (this.parkingLevel.get(stationId) ?? 0);
    return m * (1 + 0.05 * this.globalLevelOf('marketing')) * this._demandGoalMult;
  }

  /** What one rider pays boarding here. */
  incomePerRiderAt(stationId: string): number {
    return (
      (this.currentFare +
        (Game.foodBonusPerLevel * (this.foodLevel.get(stationId) ?? 0) +
          0.25 * (this.gateLevel.get(stationId) ?? 0)) *
          this.fareScale) *
      (1 + 0.04 * (this.securityLevel.get(stationId) ?? 0)) *
      (1 + 0.03 * this.globalLevelOf('billboards')) *
      this._incomeGoalMult
    );
  }

  get stationCapNow(): number {
    return Game.stationCapBase + 8.0 * this.globalLevelOf('crowd');
  }
  stationCapAt(stationId: string): number {
    return this.stationCapNow + 8.0 * (this.escalatorLevel.get(stationId) ?? 0);
  }

  get offlineEfficiencyNow(): number {
    return Game.offlineEfficiency + 0.06 * this.globalLevelOf('night');
  }

  // Per-line upgrade prices scale with the line's tier.
  private upgradeBase(line: LineDef): number {
    return (250 * this.costScale + line.unlockCost * 0.05) * this._buildCostMult;
  }
  // The b54 ×1.14 curve is THE price. These alias lineUpgradeCostAt so
  // the charged cost can never drift from the displayed one again
  // (b59 bug: v1's ×1.9-×2.1 curves survived here while the UI showed
  // ×1.14 — affordable-looking buttons whose buys silently failed).
  nextSpeedCost(id: string): number {
    return this.lineUpgradeCostAt('speed', id, this.speedLevelOf(id));
  }
  nextCarCost(id: string): number {
    return this.lineUpgradeCostAt('cars', id, this.carLevelOf(id));
  }
  nextAccessCost(id: string): number {
    return this.lineUpgradeCostAt('access', id, this.accessLevelOf(id));
  }
  nextTrainsetCost(id: string): number {
    return this.lineUpgradeCostAt('trainset', id, this.trainsetLevelOf(id));
  }

  private buy(allowed: boolean, cost: number, apply: () => void): boolean {
    if (!allowed || this.cash < cost) return false;
    this.cash -= cost;
    apply();
    return true;
  }

  private buyLineLevel(map: Map<string, number>, id: string, cost: number): boolean {
    return this.buy(
      this.isUnlocked(id) && (map.get(id) ?? 0) < Game.levelMax,
      cost,
      () => map.set(id, (map.get(id) ?? 0) + 1),
    );
  }
  buySpeed(id: string): boolean {
    return this.buyLineLevel(this.speedLevels, id, this.nextSpeedCost(id));
  }
  buyCars(id: string): boolean {
    return this.buyLineLevel(this.carLevels, id, this.nextCarCost(id));
  }
  buyAccess(id: string): boolean {
    return this.buyLineLevel(this.accessLevels, id, this.nextAccessCost(id));
  }
  buyTrainset(id: string): boolean {
    return this.buyLineLevel(this.trainsetLevels, id, this.nextTrainsetCost(id));
  }

  // ---- Bundle buying (+1 / +5 / MAX rows in the console) ----
  /** Total cost of the next [n] levels (capped at what remains). */
  private bundle(
    level: number,
    max: number,
    costAt: (l: number) => number,
    n: number,
  ): { count: number; cost: number } {
    let cost = 0;
    let count = 0;
    for (let l = level; l < Math.min(level + n, max); l++) {
      cost += costAt(l);
      count++;
    }
    return { count, cost };
  }

  private buyMany(
    n: number,
    tryBuy: () => boolean,
  ): number {
    let bought = 0;
    while (bought < n && tryBuy()) bought++;
    return bought;
  }

  /** How many milestone levels (10/25/50/100) this kind has reached. */
  milestonesFor(kind: LineUpgradeKind, id: string): number {
    const lvl = this.lineUpgradeLevel(kind, id);
    return Game.milestoneLevels.filter((m) => lvl >= m).length;
  }

  /** The next milestone level ahead for this kind (null at the top). */
  nextMilestone(kind: LineUpgradeKind, id: string): number | null {
    const lvl = this.lineUpgradeLevel(kind, id);
    return Game.milestoneLevels.find((m) => lvl < m) ?? null;
  }

  /** Total milestones on this line, all four kinds. */
  lineMilestoneCount(id: string): number {
    return LINE_UPGRADE_KINDS.reduce((n, k) => n + this.milestonesFor(k, id), 0);
  }

  /** Every milestone DOUBLES this line's income at the fare gate. */
  lineMilestoneMult(id: string): number {
    return Math.pow(2, this.lineMilestoneCount(id));
  }

  lineUpgradeLevel(kind: LineUpgradeKind, id: string): number {
    switch (kind) {
      case 'speed': return this.speedLevelOf(id);
      case 'cars': return this.carLevelOf(id);
      case 'access': return this.accessLevelOf(id);
      case 'trainset': return this.trainsetLevelOf(id);
    }
  }

  lineUpgradeCostAt(kind: LineUpgradeKind, id: string, level: number): number {
    const base = this.upgradeBase(this.lineById(id));
    const factor =
      kind === 'speed' ? 1 : kind === 'cars' ? 1.2 : kind === 'access' ? 1.5 : 1.4;
    // A long, steady climb (~×3.7 by L10, ~×700 by L50, ~×500K by
    // L100) — the slow burn the milestones pay off.
    return base * factor * Math.pow(1.14, level);
  }

  lineUpgradeBundle(kind: LineUpgradeKind, id: string, n: number) {
    return this.bundle(
      this.lineUpgradeLevel(kind, id),
      Game.levelMax,
      (l) => this.lineUpgradeCostAt(kind, id, l),
      n,
    );
  }

  buyLineUpgrades(kind: LineUpgradeKind, id: string, n: number): number {
    const buyOne = {
      speed: () => this.buySpeed(id),
      cars: () => this.buyCars(id),
      access: () => this.buyAccess(id),
      trainset: () => this.buyTrainset(id),
    }[kind];
    return this.buyMany(n, buyOne);
  }

  globalBundle(id: string, n: number) {
    const def = GLOBALS.find((g) => g.id === id)!;
    return this.bundle(
      this.globalLevelOf(id),
      def.maxLevel,
      (l) => def.baseCost * this.costScale * Math.pow(def.growth, l) * this._buildCostMult,
      n,
    );
  }

  buyGlobals(id: string, n: number): number {
    return this.buyMany(n, () => this.buyGlobal(id));
  }

  workBundle(type: string, stationId: string, n: number) {
    return this.bundle(
      this.stationWorkLevel(type, stationId),
      Game.foodMax,
      (l) => this.stationWorkCost(type, l),
      n,
    );
  }

  buyWorks(type: string, stationId: string, n: number): number {
    return this.buyMany(n, () => this.buyStationWork(type, stationId));
  }

  // ---- Network upgrades ----
  nextGlobalCost(id: string): number {
    const def = GLOBALS.find((g) => g.id === id)!;
    return (
      def.baseCost * this.costScale * Math.pow(def.growth, this.globalLevelOf(id)) *
      this._buildCostMult
    );
  }
  buyGlobal(id: string): boolean {
    const def = GLOBALS.find((g) => g.id === id)!;
    return this.buy(
      this.globalLevelOf(id) < def.maxLevel,
      this.nextGlobalCost(id),
      () => this.globalLevels.set(id, this.globalLevelOf(id) + 1),
    );
  }

  // ---- Station works: singles, and the tier-even bulk planner ----
  workMapFor(type: string): Map<string, number> {
    switch (type) {
      case 'food': return this.foodLevel;
      case 'gates': return this.gateLevel;
      case 'platform': return this.platformLevel;
      case 'parking': return this.parkingLevel;
      case 'escalators': return this.escalatorLevel;
      default: return this.securityLevel;
    }
  }
  stationWorkLevel(type: string, stationId: string): number {
    return this.workMapFor(type).get(stationId) ?? 0;
  }
  stationWorkCost(type: string, level: number): number {
    const def = STATION_WORKS.find((w) => w.id === type)!;
    return (
      def.baseCost * this.costScale * Math.pow(def.growth, level) * this._buildCostMult
    );
  }
  buyStationWork(type: string, stationId: string): boolean {
    const level = this.stationWorkLevel(type, stationId);
    return this.buy(
      this.isServed(stationId) && level < Game.foodMax,
      this.stationWorkCost(type, level),
      () => this.workMapFor(type).set(stationId, level + 1),
    );
  }
  raisePriority(type: string): void {
    const i = this.stationPriority.indexOf(type);
    if (i <= 0) return;
    this.stationPriority.splice(i, 1);
    this.stationPriority.splice(i - 1, 0, type);
  }
  /** The line's lowest tier of one work — the tier the bulk buy levels. */
  minStationLevel(lineId: string, type: string): number {
    let min = Game.foodMax;
    const m = this.workMapFor(type);
    for (const sid of this.lineById(lineId).stationIds) {
      min = Math.min(min, m.get(sid) ?? 0);
    }
    return min;
  }
  stationsAtMin(lineId: string, type: string): number {
    const min = this.minStationLevel(lineId, type);
    const m = this.workMapFor(type);
    return this.lineById(lineId).stationIds.filter((sid) => (m.get(sid) ?? 0) === min).length;
  }
  stationTierCost(lineId: string, type: string): number {
    const min = this.minStationLevel(lineId, type);
    if (min >= Game.foodMax) return 0;
    return this.stationsAtMin(lineId, type) * this.stationWorkCost(type, min);
  }
  /** Raise the line's LOWEST-tier stations one level each while cash
   * lasts — 8/9 at tier 2 means nobody reaches tier 3 until the 9th
   * catches up. Returns how many stations upgraded. */
  buyStationTier(lineId: string, type: string): number {
    if (!this.isUnlocked(lineId)) return 0;
    const min = this.minStationLevel(lineId, type);
    if (min >= Game.foodMax) return 0;
    const m = this.workMapFor(type);
    const cost = this.stationWorkCost(type, min);
    let bought = 0;
    for (const sid of this.lineById(lineId).stationIds) {
      if ((m.get(sid) ?? 0) !== min) continue;
      if (this.cash < cost) break;
      this.cash -= cost;
      m.set(sid, min + 1);
      bought++;
    }
    return bought;
  }
  nextPlannedType(lineId: string): string | null {
    for (const type of this.stationPriority) {
      if (this.minStationLevel(lineId, type) < Game.foodMax) return type;
    }
    return null;
  }

  // ---- Rush hour + the light cycle (mirrors Dart exactly) ----
  private get rushPhase(): number {
    return this.rushClock % Game.rushPeriod;
  }

  get rushActive(): boolean {
    return this.rushPhase >= Game.rushPeriod - Game.rushWindow;
  }

  private get unlockedInOrder(): string[] {
    return this.city.lines.filter((l) => this.isUnlocked(l.id)).map((l) => l.id);
  }

  get rushLineId(): string | null {
    const u = this.unlockedInOrder;
    if (u.length === 0) return null;
    return u[Math.floor(this.rushClock / Game.rushPeriod) % u.length];
  }

  /** Seconds until the rush ends (while active) or begins (while calm). */
  get rushSecondsLeft(): number {
    return this.rushActive
      ? Game.rushPeriod - this.rushPhase
      : Game.rushPeriod - Game.rushWindow - this.rushPhase;
  }

  /** The line cycle [offset] cycles from now will rush (0 = current) —
   * the clock is deterministic, so the OPS board prints a timetable. */
  rushLineIdForCycle(offset: number): string | null {
    const u = this.unlockedInOrder;
    if (u.length === 0) return null;
    return u[(Math.floor(this.rushClock / Game.rushPeriod) + offset) % u.length];
  }

  /** Seconds until that cycle's rush window opens (negative = open now). */
  secondsUntilRushStart(offset: number): number {
    return (
      (Math.floor(this.rushClock / Game.rushPeriod) + offset) * Game.rushPeriod +
      (Game.rushPeriod - Game.rushWindow) -
      this.rushClock
    );
  }

  /** 0 = full day … 1 = full night; every rush window is the night rush.
   * A brand-new city opens in daylight (no dawn before the first night). */
  get nightFactor(): number {
    const t = this.rushPhase;
    if (this.rushClock >= Game.rushPeriod && t < 20) return 1 - t / 20;
    if (t < 110) return 0;
    if (t < 135) return (t - 110) / 25;
    return 1;
  }

  rushFactorAt(stationId: string): number {
    return this.rushActive &&
      (this.linesServing.get(stationId) ?? []).includes(this.rushLineId ?? '')
      ? Game.rushMult
      : 1;
  }

  // ---- Commissions: the five rotating contract types ----
  get commissionLineId(): string | null {
    const u = this.unlockedInOrder;
    if (u.length === 0) return null;
    return u[(this.commissionIndex * 2 + 1) % u.length];
  }

  get commissionType(): CommissionType {
    return COMMISSION_TYPES[this.commissionIndex % COMMISSION_TYPES.length];
  }

  /** HUB SERVICE targets the busiest MID-LINE station of the contract
   * line — terminals get one call per lap, so they are excluded. */
  get commissionStationId(): string | null {
    if (this.commissionType !== 'station') return null;
    const lineId = this.commissionLineId;
    if (!lineId) return null;
    const ids = this.lineById(lineId).stationIds;
    let best: string | null = null;
    let bestDemand = -1;
    for (const sid of ids.slice(1, -1)) {
      const st = this.city.stations.find((s) => s.id === sid)!;
      if (st.demand > bestDemand) {
        bestDemand = st.demand;
        best = sid;
      }
    }
    return best;
  }

  /** The escalating difficulty spine every contract type is priced from. */
  private get haulEquivalent(): number {
    return 400 * Math.pow(1.6, Math.min(this.commissionIndex, 12));
  }

  get commissionQuota(): number {
    switch (this.commissionType) {
      case 'haul':
        return this.haulEquivalent;
      case 'express':
        return 4 + 2 * Math.min(this.commissionIndex, 20);
      case 'station':
        return Math.floor(this.haulEquivalent * 0.06);
      case 'sweep': {
        const lineId = this.commissionLineId;
        return lineId ? this.lineById(lineId).stationIds.length : 1;
      }
      case 'rushCash':
        return Math.floor(0.25 * this.haulEquivalent * this.currentFare * this.goalMult);
    }
  }

  /** Rush contracts get a clock long enough to contain a rush window. */
  get commissionTimeLimit(): number {
    return this.commissionType === 'rushCash' ? 240 : Game.commissionLimit;
  }

  get commissionReward(): number {
    return 2 * this.haulEquivalent * this.currentFare * this.goalMult;
  }

  acceptCommission(): void {
    if (this.commissionActive || this.commissionLineId === null) return;
    this.commissionActive = true;
    this.commissionProgress = 0;
    this.commissionTimeLeft = this.commissionTimeLimit;
  }

  skipCommission(): void {
    if (this.commissionActive) return;
    this.commissionIndex += 1;
  }

  private tickCommission(dt: number): void {
    if (!this.commissionActive) return;
    // CLEAN SWEEP is a live condition, not a counter.
    if (this.commissionType === 'sweep') {
      const lineId = this.commissionLineId;
      if (lineId) {
        let clear = 0;
        for (const sid of this.lineById(lineId).stationIds) {
          if (this.waitingAt(sid) <= Game.sweepThreshold) clear++;
        }
        this.commissionProgress = clear;
      }
    }
    if (this.commissionProgress >= this.commissionQuota) {
      const reward = this.commissionReward;
      this.cash += reward;
      this.totalEarned += reward;
      this.windowEarned += reward;
      this.commissionsDone += 1;
      this.lastCommissionWon = true;
      this.commissionSeq += 1;
      this.commissionActive = false;
      this.commissionIndex += 1;
      return;
    }
    this.commissionTimeLeft -= dt;
    if (this.commissionTimeLeft <= 0) {
      this.lastCommissionWon = false;
      this.commissionSeq += 1;
      this.commissionActive = false;
      this.commissionIndex += 1;
    }
  }

  // ---- Goals: four parallel commendation tracks ----
  trackDone(trackId: string): number {
    return this.goalsDoneByTrack.get(trackId) ?? 0;
  }

  /** This city's four tracks (each city has its own targets). */
  get tracks(): GoalTrack[] {
    return goalTracksFor(this.city.id);
  }

  trackCurrentGoal(trackId: string): GoalDef | null {
    const track = this.tracks.find((t) => t.id === trackId)!;
    const done = this.trackDone(trackId);
    return done < track.goals.length ? track.goals[done] : null;
  }

  trackProgress(trackId: string): number {
    const goal = this.trackCurrentGoal(trackId);
    if (!goal) return 1;
    return Math.min(this.goalValue(goal.kind) / goal.target, 1);
  }

  /** Permanent income multiplier (PROFIT + MASTERY commendations). */
  get goalMult(): number {
    return this._incomeGoalMult;
  }

  /** Permanent ridership multiplier (GROWTH commendations). */
  get demandGoalMult(): number {
    return this._demandGoalMult;
  }

  /** Build-cost discount factor (EXPANSION commendations, <1 is cheaper).
   * Applies to trains, line upgrades, station works, and network
   * upgrades — never to line unlocks (the progression ladder). */
  get buildCostMult(): number {
    return this._buildCostMult;
  }

  private recomputeGoalMult(): void {
    this._incomeGoalMult = 1;
    this._demandGoalMult = 1;
    this._buildCostMult = 1;
    const fold = (tracks: GoalTrack[], done: (trackId: string) => number) => {
      for (const track of tracks) {
        const n = done(track.id);
        for (let i = 0; i < n && i < track.goals.length; i++) {
          const r = track.goals[i].reward;
          if (track.benefit === 'income') this._incomeGoalMult *= r;
          else if (track.benefit === 'riders') this._demandGoalMult *= r;
          else this._buildCostMult *= r;
        }
      }
    };
    // Every commendation from every city carries (the v1 moveOn law).
    for (const [cityId, done] of Object.entries(this.priorGoals)) {
      fold(goalTracksFor(cityId), (t) => done[t] ?? 0);
    }
    fold(this.tracks, (t) => this.trackDone(t));
  }

  // ---- The city ladder (M3c): finish every track, move on ----
  get nextCityId(): string | null {
    const idx = CITY_LADDER.indexOf(this.city.id);
    return idx >= 0 && idx + 1 < CITY_LADDER.length ? CITY_LADDER[idx + 1] : null;
  }

  /** True once ALL FOUR tracks are complete and another city awaits. */
  get canMoveOn(): boolean {
    return (
      this.nextCityId !== null &&
      this.tracks.every((t) => this.trackCurrentGoal(t.id) === null)
    );
  }

  /** Hand the keys over: cash, lifetime stats, and every commendation
   * carry; the network starts fresh at the new city's higher stakes.
   * The caller supplies the next city's def and swaps the world in. */
  moveOn(next: CityDef): Game {
    if (!this.canMoveOn || next.id !== this.nextCityId) {
      throw new Error(`cannot move on to ${next.id}`);
    }
    const g = new Game(next);
    g.cash = this.cash;
    g.totalEarned = this.totalEarned;
    g.totalRiders = this.totalRiders;
    g.avgRate = this.avgRate;
    g.rushEarnings = this.rushEarnings;
    g.priorGoals = {
      ...this.priorGoals,
      [this.city.id]: Object.fromEntries(this.goalsDoneByTrack),
    };
    g.recomputeGoalMult();
    return g;
  }

  /** The track nearest its next commendation — the header strip. */
  get bestTrack(): { track: GoalTrack; goal: GoalDef | null; progress: number } {
    let best = this.tracks[0];
    let bestP = -1;
    for (const track of this.tracks) {
      const p = this.trackProgress(track.id);
      const goal = this.trackCurrentGoal(track.id);
      if (goal && p > bestP) {
        bestP = p;
        best = track;
      }
    }
    return {
      track: best,
      goal: this.trackCurrentGoal(best.id),
      progress: Math.max(bestP, 0),
    };
  }

  get totalStationWorks(): number {
    let sum = 0;
    for (const m of [
      this.foodLevel, this.gateLevel, this.platformLevel,
      this.parkingLevel, this.escalatorLevel, this.securityLevel,
    ]) {
      for (const v of m.values()) sum += v;
    }
    return sum;
  }

  get totalLineUpgradeLevels(): number {
    let sum = 0;
    for (const m of [
      this.speedLevels, this.carLevels, this.accessLevels, this.trainsetLevels,
    ]) {
      for (const v of m.values()) sum += v;
    }
    return sum;
  }

  worksAt(stationId: string): number {
    let sum = 0;
    for (const m of [
      this.foodLevel, this.gateLevel, this.platformLevel,
      this.parkingLevel, this.escalatorLevel, this.securityLevel,
    ]) {
      sum += m.get(stationId) ?? 0;
    }
    return sum;
  }

  /** How BUILT-UP this station's neighborhood is: service + investment
   * + lifetime traffic. The renderer grows city blocks off it. */
  stationHeat(stationId: string): number {
    if (!this.isServed(stationId)) return 0;
    let lineLevels = 0;
    for (const lineId of this.linesServing.get(stationId) ?? []) {
      lineLevels +=
        this.speedLevelOf(lineId) + this.carLevelOf(lineId) +
        this.accessLevelOf(lineId) + this.trainsetLevelOf(lineId);
    }
    return (
      1 +
      this.worksAt(stationId) +
      lineLevels / 2 +
      Math.min((this.boardedAt.get(stationId) ?? 0) / 1500, 10)
    );
  }

  goalValue(kind: GoalKind): number {
    switch (kind) {
      case 'riders': return this.totalRiders;
      case 'earned': return this.totalEarned;
      case 'lines': return this.unlockedLineIds.size;
      case 'trains': return this.trains.length;
      case 'commissions': return this.commissionsDone;
      case 'works': return this.totalStationWorks;
      case 'lineUpgrades': return this.totalLineUpgradeLevels;
      case 'rushEarned': return this.rushEarnings;
    }
  }

  private checkGoals(): void {
    for (const track of this.tracks) {
      for (;;) {
        const goal = this.trackCurrentGoal(track.id);
        if (!goal || this.goalValue(goal.kind) < goal.target) break;
        this.goalsDoneByTrack.set(track.id, this.trackDone(track.id) + 1);
        if (track.benefit === 'income') this._incomeGoalMult *= goal.reward;
        else if (track.benefit === 'riders') this._demandGoalMult *= goal.reward;
        else this._buildCostMult *= goal.reward;
        this.goalSeq += 1;
        this.lastGoalName = goal.name;
        this.lastGoalReward = goal.reward;
        this.lastGoalBenefit = track.benefit;
      }
    }
  }

  // ---- The tick (mirrors Dart _tick order: arrivals, then trains) ----
  tick(dt: number): void {
    if (dt <= 0) return;
    this.rushClock += dt;

    // Rolling earn-rate estimate (v1 idiom: a windowed average the HUD
    // and offline pay can trust).
    this.windowTime += dt;
    if (this.windowTime >= 20) {
      const rate = this.windowEarned / this.windowTime;
      this.avgRate = this.avgRate === 0 ? rate : this.avgRate * 0.6 + rate * 0.4;
      this.windowEarned = 0;
      this.windowTime = 0;
    }

    for (const id of this.served) {
      const st = this.city.stations.find((s) => s.id === id)!;
      const add =
        st.demand *
        Game.demandScale *
        this.demandMultAt(id) *
        this.rushFactorAt(id) *
        dt;
      const uo = this.upServedSet.has(id);
      const dn = this.downServedSet.has(id);
      let dUp = uo && dn ? add / 2 : uo ? add : 0;
      let dDown = uo && dn ? add / 2 : dn ? add : 0;
      const room =
        this.stationCapAt(id) - this.waitingUp.get(id)! - this.waitingDown.get(id)!;
      if (room <= 0) continue;
      const want = dUp + dDown;
      if (want > room) {
        const f = room / want;
        dUp *= f;
        dDown *= f;
      }
      this.waitingUp.set(id, this.waitingUp.get(id)! + dUp);
      this.waitingDown.set(id, this.waitingDown.get(id)! + dDown);
    }

    for (const t of this.trains) this.tickTrain(t, dt);
    this.tickCommission(dt);
    this.checkGoals();
  }

  private tickTrain(t: TrainState, dt: number): void {
    const line = this.lineById(t.lineId);
    const path = this.paths.get(t.lineId)!;
    let remaining = dt;
    if (t.dwell > 0) {
      const used = Math.min(t.dwell, remaining);
      t.dwell -= used;
      remaining -= used;
    }
    if (remaining <= 0) return;

    const targetD = path.stationDistance[t.target];
    const next = t.distance + this.trainSpeedFor(t.lineId) * remaining * t.direction;
    const arrived = t.direction > 0 ? next >= targetD : next <= targetD;
    if (!arrived) {
      t.distance = next;
      return;
    }
    t.distance = targetD;
    // Riders board for where the train goes NEXT — at a terminal that's
    // the turned-around direction, so the outbound platform gets scooped.
    const nextDir: 1 | -1 =
      t.target === line.stationIds.length - 1 ? -1 : t.target === 0 ? 1 : t.direction;
    const stationId = line.stationIds[t.target];
    this.board(t.lineId, stationId, nextDir);
    // TURNBACK RUN counts terminal turnarounds on the contract line.
    if (
      this.commissionActive &&
      this.commissionType === 'express' &&
      t.lineId === this.commissionLineId &&
      (t.target === 0 || t.target === line.stationIds.length - 1)
    ) {
      this.commissionProgress += 1;
    }
    t.dwell =
      this.effectiveDwell * (1 - 0.15 * (this.platformLevel.get(stationId) ?? 0));
    t.direction = nextDir;
    t.target += nextDir;
  }

  private board(lineId: string, stationId: string, direction: 1 | -1): void {
    const bucket = direction > 0 ? this.waitingUp : this.waitingDown;
    const w = bucket.get(stationId)!;
    const cap = this.capacityFor(lineId);
    const take = Math.min(w, cap);
    if (take <= 0) return;
    bucket.set(stationId, w - take);
    const earned =
      take * this.incomePerRiderAt(stationId) * this.lineMilestoneMult(lineId);
    this.cash += earned;
    this.totalEarned += earned;
    this.totalRiders += take;
    this.windowEarned += earned;
    this.boardSeq += 1;
    this.lastBoardStationId = stationId;
    this.lastBoardLineId = lineId;
    this.lastBoardCount = Math.floor(take);
    this.lastBoardAmount = earned;
    this.boardedAt.set(stationId, (this.boardedAt.get(stationId) ?? 0) + take);
    if (this.rushActive) this.rushEarnings += earned;
    if (this.commissionActive) {
      switch (this.commissionType) {
        case 'haul':
          if (lineId === this.commissionLineId) this.commissionProgress += take;
          break;
        case 'station':
          if (stationId === this.commissionStationId) this.commissionProgress += take;
          break;
        case 'rushCash':
          if (this.rushActive) this.commissionProgress += earned;
          break;
        default:
          break; // express and sweep are tracked elsewhere
      }
    }
  }

  // ---- Fleet (widest-phase-gap spawn, ported verbatim in spirit) ----
  /** A ping-pong train is a point on a circular ROUND-TRIP phase [0, 2L).
   * The new train enters at the midpoint of the widest phase gap in the
   * line's current fleet, so it is bidirectionally equidistant from the
   * trains already running. */
  private spawnTrain(line: LineDef): TrainState {
    const path = this.paths.get(line.id)!;
    const len = path.length;
    const phases = this.trains
      .filter((t) => t.lineId === line.id)
      .map((t) => (t.direction > 0 ? t.distance : 2 * len - t.distance))
      .sort((a, b) => a - b);
    let phase: number;
    if (phases.length === 0) {
      phase = 0;
    } else {
      let bestGap = 2 * len - phases[phases.length - 1] + phases[0];
      let bestStart = phases[phases.length - 1];
      for (let i = 1; i < phases.length; i++) {
        const gap = phases[i] - phases[i - 1];
        if (gap > bestGap) {
          bestGap = gap;
          bestStart = phases[i - 1];
        }
      }
      phase = (bestStart + bestGap / 2) % (2 * len);
    }
    const direction: 1 | -1 = phase < len ? 1 : -1;
    const distance = phase < len ? phase : 2 * len - phase;
    // Target = the next station strictly ahead in the travel direction.
    let target: number;
    if (direction > 0) {
      target = path.stationDistance.length - 1;
      for (let i = 0; i < path.stationDistance.length; i++) {
        if (path.stationDistance[i] > distance + 1e-9) {
          target = i;
          break;
        }
      }
    } else {
      target = 0;
      for (let i = path.stationDistance.length - 1; i >= 0; i--) {
        if (path.stationDistance[i] < distance - 1e-9) {
          target = i;
          break;
        }
      }
    }
    return { lineId: line.id, distance, direction, dwell: 0, target };
  }

  buyLine(lineId: string): boolean {
    const line = this.lineById(lineId);
    if (this.isUnlocked(lineId) || this.cash < line.unlockCost) return false;
    this.cash -= line.unlockCost;
    this.unlockedLineIds.add(lineId);
    this.recomputeServed();
    this.trains.push(this.spawnTrain(line));
    this.unlockSeq += 1;
    this.lastUnlockedLineId = lineId;
    return true;
  }

  trainCount(lineId: string): number {
    return this.trains.filter((t) => t.lineId === lineId).length;
  }

  /** Cost of the NEXT train (2nd costs the line's base, ×2.5 each after)
   * — the v1 cost law, rail-yard discounts arrive with the upgrade port. */
  nextTrainCost(lineId: string): number {
    const line = this.lineById(lineId);
    return (
      line.trainCost *
      Math.pow(2.5, this.trainCount(lineId) - 1) *
      (1 - 0.04 * this.globalLevelOf('yards')) *
      this._buildCostMult
    );
  }

  buyTrain(lineId: string): boolean {
    if (!this.isUnlocked(lineId)) return false;
    const cost = this.nextTrainCost(lineId);
    if (this.cash < cost) return false;
    this.cash -= cost;
    this.trains.push(this.spawnTrain(this.lineById(lineId)));
    return true;
  }

  // ---- Save (v2 format, version s1) + the v1 offline-earnings law ----
  static readonly offlineEfficiency = 0.5;
  static readonly maxOfflineSeconds = 8 * 3600;

  toJson(nowMs: number): Record<string, unknown> {
    const dump = (m: Map<string, number>) => Object.fromEntries(m);
    return {
      v2s: 5,
      cash: this.cash,
      totalEarned: this.totalEarned,
      totalRiders: this.totalRiders,
      rushClock: this.rushClock,
      avgRate: this.avgRate,
      unlocked: [...this.unlockedLineIds],
      trains: this.trains.map((t) => ({ ...t })),
      waitingUp: dump(this.waitingUp),
      waitingDown: dump(this.waitingDown),
      foodLevel: dump(this.foodLevel),
      gateLevel: dump(this.gateLevel),
      platformLevel: dump(this.platformLevel),
      parkingLevel: dump(this.parkingLevel),
      escalatorLevel: dump(this.escalatorLevel),
      securityLevel: dump(this.securityLevel),
      speedLevels: dump(this.speedLevels),
      carLevels: dump(this.carLevels),
      accessLevels: dump(this.accessLevels),
      trainsetLevels: dump(this.trainsetLevels),
      globalLevels: dump(this.globalLevels),
      stationPriority: this.stationPriority,
      commissionIndex: this.commissionIndex,
      commissionsDone: this.commissionsDone,
      commissionActive: this.commissionActive,
      commissionProgress: this.commissionProgress,
      commissionTimeLeft: this.commissionTimeLeft,
      goalsDoneByTrack: Object.fromEntries(this.goalsDoneByTrack),
      cityId: this.city.id,
      priorGoals: this.priorGoals,
      boardedAt: dump(this.boardedAt),
      rushEarnings: this.rushEarnings,
      lastSeenMs: nowMs,
    };
  }

  /** Restores a save; returns the "while you were away" payout. */
  static fromJson(
    city: CityDef,
    j: Record<string, unknown>,
    nowMs: number,
  ): { game: Game; offlineEarned: number } {
    const g = new Game(city);
    g.cash = Number(j.cash ?? 0);
    g.totalEarned = Number(j.totalEarned ?? 0);
    g.totalRiders = Number(j.totalRiders ?? 0);
    g.rushClock = Number(j.rushClock ?? 0);
    g.avgRate = Number(j.avgRate ?? 0);
    g.unlockedLineIds.clear();
    for (const id of (j.unlocked as string[]) ?? ['1']) {
      if (city.lines.some((l) => l.id === id)) g.unlockedLineIds.add(id);
    }
    if (g.unlockedLineIds.size === 0) g.unlockedLineIds.add(city.lines[0].id);
    g.recomputeServed();
    g.trains.length = 0;
    for (const t of (j.trains as TrainState[]) ?? []) {
      if (!g.unlockedLineIds.has(t.lineId)) continue;
      const path = g.paths.get(t.lineId)!;
      g.trains.push({
        lineId: t.lineId,
        distance: Math.min(Math.max(t.distance, 0), path.length),
        direction: t.direction > 0 ? 1 : -1,
        dwell: Math.max(t.dwell, 0),
        target: Math.min(Math.max(t.target, 0), path.points.length - 1),
      });
    }
    for (const lineId of g.unlockedLineIds) {
      if (g.trainCount(lineId) === 0) {
        g.trains.push(g.spawnTrain(g.lineById(lineId)));
      }
    }
    for (const [id, w] of Object.entries((j.waitingUp as Record<string, number>) ?? {})) {
      if (g.waitingUp.has(id)) g.waitingUp.set(id, Number(w));
    }
    for (const [id, w] of Object.entries((j.waitingDown as Record<string, number>) ?? {})) {
      if (g.waitingDown.has(id)) g.waitingDown.set(id, Number(w));
    }
    const load = (m: Map<string, number>, o: unknown, keyOk?: (k: string) => boolean) => {
      for (const [k, v] of Object.entries((o as Record<string, number>) ?? {})) {
        if (!keyOk || keyOk(k)) m.set(k, Number(v));
      }
    };
    const stOk = (k: string) => g.waitingUp.has(k);
    const lnOk = (k: string) => city.lines.some((l) => l.id === k);
    load(g.boardedAt, j.boardedAt, stOk);
    load(g.foodLevel, j.foodLevel, stOk);
    load(g.gateLevel, j.gateLevel, stOk);
    load(g.platformLevel, j.platformLevel, stOk);
    load(g.parkingLevel, j.parkingLevel, stOk);
    load(g.escalatorLevel, j.escalatorLevel, stOk);
    load(g.securityLevel, j.securityLevel, stOk);
    load(g.speedLevels, j.speedLevels, lnOk);
    load(g.carLevels, j.carLevels, lnOk);
    load(g.accessLevels, j.accessLevels, lnOk);
    load(g.trainsetLevels, j.trainsetLevels, lnOk);
    load(g.globalLevels, j.globalLevels);
    g.commissionIndex = Number(j.commissionIndex ?? 0);
    g.commissionsDone = Number(j.commissionsDone ?? 0);
    g.commissionActive = Boolean(j.commissionActive ?? false);
    g.commissionProgress = Number(j.commissionProgress ?? 0);
    g.commissionTimeLeft = Number(j.commissionTimeLeft ?? 0);
    // v2s4 tracks; older saves simply re-complete their tracks from
    // lifetime counters on the first tick. v2s5 adds prior-city banks.
    for (const [k, v] of Object.entries(
      (j.goalsDoneByTrack as Record<string, number>) ?? {},
    )) {
      if (g.tracks.some((t) => t.id === k)) g.goalsDoneByTrack.set(k, Number(v));
    }
    for (const [cityId, done] of Object.entries(
      (j.priorGoals as Record<string, Record<string, number>>) ?? {},
    )) {
      if (CITY_LADDER.includes(cityId) && cityId !== g.city.id) {
        g.priorGoals[cityId] = { ...done };
      }
    }
    g.recomputeGoalMult();
    g.rushEarnings = Number(j.rushEarnings ?? 0);
    const prio = j.stationPriority as string[] | undefined;
    if (prio && STATION_WORKS.every((w) => prio.includes(w.id))) {
      g.stationPriority = prio.filter((t) => STATION_WORKS.some((w) => w.id === t));
    }
    const away = Math.min(
      Math.max((nowMs - Number(j.lastSeenMs ?? nowMs)) / 1000, 0),
      Game.maxOfflineSeconds,
    );
    const offlineEarned = away * g.avgRate * g.offlineEfficiencyNow;
    g.cash += offlineEarned;
    g.totalEarned += offlineEarned;
    return { game: g, offlineEarned };
  }

  private recomputeServed(): void {
    this.served = new Set();
    this.linesServing = new Map();
    this.upServedSet = new Set();
    this.downServedSet = new Set();
    for (const lineId of this.unlockedLineIds) {
      const ids = this.lineById(lineId).stationIds;
      for (let i = 0; i < ids.length; i++) {
        this.served.add(ids[i]);
        if (!this.linesServing.has(ids[i])) this.linesServing.set(ids[i], []);
        this.linesServing.get(ids[i])!.push(lineId);
        if (i < ids.length - 1) this.upServedSet.add(ids[i]);
        if (i > 0) this.downServedSet.add(ids[i]);
      }
    }
  }
}

// ---- Catalogs (v1's registries, verbatim) ----
export interface WorkDef {
  id: string;
  name: string;
  blurb: string;
  baseCost: number;
  growth: number;
}
export const STATION_WORKS: WorkDef[] = [
  { id: 'food', name: 'FOOD COURT', blurb: '+$0.40/rider · +10% ridership here', baseCost: 300, growth: 2.2 },
  { id: 'gates', name: 'FARE GATES', blurb: 'Stops fare evasion: +$0.25/rider here', baseCost: 400, growth: 2.2 },
  { id: 'platform', name: 'PLATFORM WORKS', blurb: 'Trains get in & out 15% faster here', baseCost: 500, growth: 2.3 },
  { id: 'parking', name: 'PARK & RIDE', blurb: '+6% ridership here', baseCost: 450, growth: 2.2 },
  { id: 'escalators', name: 'ESCALATORS', blurb: '+8 platform capacity here', baseCost: 350, growth: 2.15 },
  { id: 'security', name: 'SECURITY DESK', blurb: '+4% income on every fare here', baseCost: 600, growth: 2.3 },
];

export interface GlobalDef extends WorkDef {
  maxLevel: number;
}
export const GLOBALS: GlobalDef[] = [
  { id: 'signal', name: 'SIGNAL MODERNIZATION', blurb: '+4% train speed, every line', baseCost: 2500, growth: 2.0, maxLevel: 10 },
  { id: 'doors', name: 'PLATFORM DOORS', blurb: 'Stops 5% shorter at every station', baseCost: 2000, growth: 2.0, maxLevel: 10 },
  { id: 'marketing', name: 'CITY MARKETING', blurb: '+5% ridership across the city', baseCost: 3000, growth: 2.1, maxLevel: 10 },
  { id: 'fare', name: 'FARE REVIEW', blurb: '+$0.25 fare per rider', baseCost: 5000, growth: 2.5, maxLevel: 8 },
  { id: 'billboards', name: 'AD BILLBOARDS', blurb: '+3% income on every fare', baseCost: 3500, growth: 2.15, maxLevel: 10 },
  { id: 'crowd', name: 'CROWD CONTROL', blurb: '+8 platform capacity, every station', baseCost: 4000, growth: 2.2, maxLevel: 10 },
  { id: 'yards', name: 'RAIL YARDS', blurb: 'New trains 4% cheaper', baseCost: 6000, growth: 2.4, maxLevel: 10 },
  { id: 'night', name: 'NIGHT SERVICE', blurb: '+6% offline earning rate', baseCost: 8000, growth: 2.6, maxLevel: 5 },
];

// ---- OPS + GOALS catalogs (v1's registries, verbatim) ----
export const COMMISSION_TYPES = [
  'haul', 'express', 'station', 'sweep', 'rushCash',
] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export type GoalKind =
  | 'riders' | 'earned' | 'lines' | 'trains'
  | 'commissions' | 'works' | 'lineUpgrades' | 'rushEarned';

export type GoalBenefit = 'income' | 'riders' | 'build';

export interface GoalDef {
  name: string;
  kind: GoalKind;
  target: number;
  reward: number;
}

export interface GoalTrack {
  id: string;
  name: string;
  benefit: GoalBenefit;
  blurb: string;
  goals: GoalDef[];
}

const g = (name: string, kind: GoalKind, target: number, reward: number): GoalDef =>
  ({ name, kind, target, reward });

/** Four ladders climb AT ONCE, and their rewards differ by track —
 * chase whichever fits your build. Income rewards multiply the fare,
 * riders rewards multiply demand, build rewards CUT purchase costs. */
export const GOAL_TRACKS: GoalTrack[] = [
  {
    id: 'growth', name: 'GROWTH', benefit: 'riders',
    blurb: 'ridership boosts',
    goals: [
      g('OPENING DAY', 'riders', 1000, 1.1),
      g('TEN THOUSAND', 'riders', 10000, 1.1),
      g('BUSY MORNING', 'riders', 50000, 1.15),
      g('QUARTER MILLION', 'riders', 250000, 1.15),
      g('MILLION RIDERS', 'riders', 1000000, 1.2),
      g('FIVE MILLION', 'riders', 5000000, 1.2),
      g('TWENTY MILLION', 'riders', 20000000, 1.25),
      g('CITY THAT RIDES', 'riders', 100000000, 1.25),
    ],
  },
  {
    id: 'profit', name: 'PROFIT', benefit: 'income',
    blurb: 'fare boosts',
    goals: [
      g('FIRST FIFTY K', 'earned', 50000, 1.2),
      g('QUARTER MILLION', 'earned', 250000, 1.2),
      g('FIRST MILLION', 'earned', 1000000, 1.25),
      g('FIVE MILLION', 'earned', 5000000, 1.25),
      g('TWENTY-FIVE MILLION', 'earned', 25000000, 1.3),
      g('HUNDRED MILLION', 'earned', 100000000, 1.3),
      g('HALF BILLION', 'earned', 500000000, 1.4),
      g('TWO BILLION', 'earned', 2000000000, 1.5),
    ],
  },
  {
    id: 'expansion', name: 'EXPANSION', benefit: 'build',
    blurb: 'build discounts',
    goals: [
      g('SECOND LINE', 'lines', 2, 0.97),
      g('ROLLING STOCK', 'trains', 4, 0.97),
      g('FOUR ROUTES', 'lines', 4, 0.95),
      g('TEN TRAINS', 'trains', 10, 0.95),
      g('SEVEN ROUTES', 'lines', 7, 0.95),
      g('TEN ROUTES', 'lines', 10, 0.95),
      g('BIG FLEET', 'trains', 25, 0.95),
      g('SIXTEEN ROUTES', 'lines', 16, 0.93),
      g('EVERY LINE', 'lines', 24, 0.93),
    ],
  },
  {
    id: 'mastery', name: 'MASTERY', benefit: 'income',
    blurb: 'income boosts',
    goals: [
      g('FIRST CONTRACTS', 'commissions', 3, 1.15),
      g('BUILDER', 'works', 15, 1.15),
      g('TUNED MACHINE', 'lineUpgrades', 20, 1.2),
      g('RUSH MONEY', 'rushEarned', 500000, 1.2),
      g('CITY CONTRACTOR', 'commissions', 12, 1.25),
      g('MASTER BUILDER', 'works', 60, 1.25),
      g('FULL SERVICE', 'lineUpgrades', 120, 1.3),
      g('RUSH BARON', 'rushEarned', 10000000, 1.3),
    ],
  },
];

/** Angel Bay's four tracks — the second rung of the city ladder.
 * Lifetime kinds (riders/earned/rushEarned) target ABOVE New
 * Meridian's finals since those counters carry across the move;
 * network kinds start fresh with the fresh network. */
export const ANGEL_BAY_TRACKS: GoalTrack[] = [
  {
    id: 'growth', name: 'GROWTH', benefit: 'riders',
    blurb: 'ridership boosts',
    goals: [
      g('BAY COMMUTERS', 'riders', 150000000, 1.15),
      g('HARBOR CROWDS', 'riders', 400000000, 1.2),
      g('MILLIONS DAILY', 'riders', 1000000000, 1.2),
      g('COAST THAT RIDES', 'riders', 3000000000, 1.25),
      g('ALL OF ANGEL BAY', 'riders', 10000000000, 1.3),
    ],
  },
  {
    id: 'profit', name: 'PROFIT', benefit: 'income',
    blurb: 'fare boosts',
    goals: [
      g('BAY LEDGER', 'earned', 5000000000, 1.25),
      g('TEN BILLION', 'earned', 10000000000, 1.3),
      g('HARBOR FORTUNE', 'earned', 50000000000, 1.3),
      g('QUARTER TRILLION', 'earned', 250000000000, 1.4),
      g('ANGEL BAY COMPLETE', 'earned', 1000000000000, 1.5),
    ],
  },
  {
    id: 'expansion', name: 'EXPANSION', benefit: 'build',
    blurb: 'build discounts',
    goals: [
      g('WEST SHORE OPENS', 'lines', 2, 0.97),
      g('THE NARROWS', 'lines', 3, 0.95),
      g('SIX TRAINS', 'trains', 6, 0.95),
      g('FIVE ROUTES', 'lines', 5, 0.95),
      g('BAY FLEET', 'trains', 15, 0.95),
      g('SEVEN ROUTES', 'lines', 7, 0.93),
      g('EVERY LINE', 'lines', 9, 0.93),
    ],
  },
  {
    id: 'mastery', name: 'MASTERY', benefit: 'income',
    blurb: 'income boosts',
    goals: [
      g('BAY CONTRACTOR', 'commissions', 5, 1.2),
      g('HARBOR WORKS', 'works', 30, 1.2),
      g('BAY RUSH BARON', 'rushEarned', 50000000, 1.25),
      g('TUNED HARBOR', 'lineUpgrades', 80, 1.25),
      g('MASTER OF THE BAY', 'works', 120, 1.3),
      g('FULL BAY SERVICE', 'lineUpgrades', 200, 1.4),
    ],
  },
];

/** The city ladder, in order. moveOn() walks it left to right. */
export const CITY_LADDER = ['new_meridian', 'angel_bay'];

export function goalTracksFor(cityId: string): GoalTrack[] {
  return cityId === 'angel_bay' ? ANGEL_BAY_TRACKS : GOAL_TRACKS;
}

export type LineUpgradeKind = 'speed' | 'cars' | 'access' | 'trainset';
export const LINE_UPGRADE_KINDS: LineUpgradeKind[] = [
  'speed', 'cars', 'access', 'trainset',
];
