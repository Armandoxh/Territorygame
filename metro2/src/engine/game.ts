/** Metro Magnate v2 engine — a faithful TypeScript port of the v1 Dart
 * sim core (`metro/lib/state/game_state.dart`), system by system. v1's
 * balance harness remains the authority on tuning; every constant here
 * mirrors the Dart value by name. Deterministic, no RNG — same law as v1.
 *
 * Ported so far (milestone 1, the render proof): rider arrivals with
 * directional platforms, ping-pong trains with dwell, boarding + fares,
 * the rush clock, the light cycle, widest-gap train spawning, line
 * unlocks. Upgrades, works, commissions, and goals port in later
 * milestones.
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

  readonly city: CityDef;
  readonly paths = new Map<string, LinePath>();

  cash = 0;
  totalEarned = 0;
  totalRiders = 0;
  rushClock = 0;

  readonly waitingUp = new Map<string, number>();
  readonly waitingDown = new Map<string, number>();
  readonly trains: TrainState[] = [];
  readonly unlockedLineIds = new Set<string>();

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

  trainSpeedFor(_lineId: string): number {
    return Game.baseSpeed; // + upgrades, in a later milestone
  }

  capacityFor(_lineId: string): number {
    return Game.capacityBase;
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
      const add = st.demand * Game.demandScale * this.rushFactorAt(id) * dt;
      const uo = this.upServedSet.has(id);
      const dn = this.downServedSet.has(id);
      let dUp = uo && dn ? add / 2 : uo ? add : 0;
      let dDown = uo && dn ? add / 2 : dn ? add : 0;
      const room =
        Game.stationCapBase - this.waitingUp.get(id)! - this.waitingDown.get(id)!;
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
    t.dwell = Game.dwellTime;
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
    const earned = take * Game.fare;
    this.cash += earned;
    this.totalEarned += earned;
    this.totalRiders += take;
    this.windowEarned += earned;
    this.boardSeq += 1;
    this.lastBoardStationId = stationId;
    this.lastBoardLineId = lineId;
    this.lastBoardCount = Math.floor(take);
    this.lastBoardAmount = earned;
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
    return line.trainCost * Math.pow(2.5, this.trainCount(lineId) - 1);
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
    return {
      v2s: 1,
      cash: this.cash,
      totalEarned: this.totalEarned,
      totalRiders: this.totalRiders,
      rushClock: this.rushClock,
      avgRate: this.avgRate,
      unlocked: [...this.unlockedLineIds],
      trains: this.trains.map((t) => ({ ...t })),
      waitingUp: Object.fromEntries(this.waitingUp),
      waitingDown: Object.fromEntries(this.waitingDown),
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
    const away = Math.min(
      Math.max((nowMs - Number(j.lastSeenMs ?? nowMs)) / 1000, 0),
      Game.maxOfflineSeconds,
    );
    const offlineEarned = away * g.avgRate * Game.offlineEfficiency;
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
