import {
  BUILDINGS, CARRY_CAP, GATHER_SECONDS, MINE_GOLD, MINE_SIZE, PEASANT_COST, PEASANT_SPEED,
  PEASANT_TRAIN_SECONDS, POP_MAX, START_PEASANTS, START_STOCK, TILE, TRAIN_QUEUE_MAX,
  type BuildingKind, type Cost, type ResourceKind,
} from './config';
import { GameMap, generateTerrain, mulberry32 } from './map';
import { adjacentTo, findPath, type Pt, type Rect } from './path';

export interface Building {
  id: number;
  kind: BuildingKind;
  tx: number;
  ty: number;
  size: number;
  /** 0..1 construction progress; 1 = complete. */
  progress: number;
  queue: number; // peasants queued (hall only)
  trainTimer: number;
}

export interface Mine {
  id: number;
  tx: number;
  ty: number;
  size: number;
  gold: number;
}

/**
 * What a peasant is doing. `phase` says which leg of the job it's on:
 * walking to the work, working, or carrying the load home.
 */
export type Job =
  | { type: 'move' }
  | { type: 'gather'; kind: 'wood'; tx: number; ty: number; phase: 'go' | 'work' | 'return' }
  | { type: 'gather'; kind: 'gold'; mineId: number; phase: 'go' | 'work' | 'return' }
  | { type: 'build'; siteId: number; phase: 'go' | 'work' };

export interface Unit {
  id: number;
  x: number; // world px (tile centre = tile*TILE + TILE/2)
  y: number;
  path: Pt[];
  job: Job | null;
  carry: { kind: ResourceKind; amount: number } | null;
  work: number; // seconds into current work cycle
}

export const tileCenter = (t: number) => t * TILE + TILE / 2;
export const tileOf = (px: number) => Math.floor(px / TILE);
const rectOf = (e: { tx: number; ty: number; size: number }): Rect => ({ x: e.tx, y: e.ty, w: e.size, h: e.size });
/** Tile distance from a unit to an entity's centre. */
const distTo = (u: Unit, e: { tx: number; ty: number; size: number }) =>
  Math.hypot(e.tx + e.size / 2 - u.x / TILE, e.ty + e.size / 2 - u.y / TILE);

export class Game {
  readonly map = new GameMap();
  readonly units: Unit[] = [];
  readonly buildings = new Map<number, Building>();
  readonly mines = new Map<number, Mine>();
  readonly stock: Record<ResourceKind, number> = { ...START_STOCK };
  readonly seed: number;
  hallId = 0;
  private nextId = 1;
  /** Latest player-facing error ("not enough wood"); HUD shows it briefly. */
  notice: { text: string; at: number } | null = null;
  time = 0;

  constructor(seed: number) {
    this.seed = seed;
    const rng = mulberry32(seed);
    const map = this.map;
    const sx = Math.floor(map.w * (0.3 + rng() * 0.4));
    const sy = Math.floor(map.h * (0.3 + rng() * 0.4));
    generateTerrain(map, rng, sx, sy);
    map.clearArea(sx, sy, 3);

    const hall = this.addBuilding('hall', sx - 1, sy - 1, 1);
    this.hallId = hall.id;

    // Starter gold mine 6-8 tiles out, then two richer-looking far ones.
    this.placeMine(rng, sx, sy, 6, 8);
    this.placeMine(rng, sx, sy, 16, 30);
    this.placeMine(rng, sx, sy, 16, 30);

    for (let i = 0; i < START_PEASANTS; i++) this.spawnPeasantNear(hall);
  }

  // ---------- queries ----------

  get popCap(): number {
    let cap = 0;
    for (const b of this.buildings.values()) if (b.progress >= 1) cap += BUILDINGS[b.kind].pop;
    return Math.min(cap, POP_MAX);
  }
  get popUsed(): number {
    let n = this.units.length;
    for (const b of this.buildings.values()) n += b.queue;
    return n;
  }
  canAfford(cost: Cost): boolean {
    return (Object.keys(cost) as ResourceKind[]).every((k) => this.stock[k] >= (cost[k] ?? 0));
  }
  /** "need 20 wood" for the largest shortfall, or null if affordable. */
  shortfall(cost: Cost): string | null {
    let worst: string | null = null;
    let gap = 0;
    for (const k of Object.keys(cost) as ResourceKind[]) {
      const d = (cost[k] ?? 0) - this.stock[k];
      if (d > gap) { gap = d; worst = `need ${d} more ${k}`; }
    }
    return worst;
  }
  canPlace(kind: BuildingKind, tx: number, ty: number): boolean {
    return this.map.areaFree(tx, ty, BUILDINGS[kind].size);
  }
  unitAt(wx: number, wy: number, radius: number): Unit | null {
    let best: Unit | null = null;
    let bestD = radius;
    for (const u of this.units) {
      const d = Math.hypot(u.x - wx, u.y - wy);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }
  idleUnits(): Unit[] {
    return this.units.filter((u) => u.job === null);
  }

  // ---------- orders ----------

  /** Contextual order: tapping a tree / mine / site / ground with peasants selected. */
  orderAt(units: Unit[], tx: number, ty: number): void {
    const map = this.map;
    if (map.hasTree(tx, ty)) {
      for (const u of units) this.startGather(u, { type: 'gather', kind: 'wood', tx, ty, phase: 'go' });
      return;
    }
    const occ = map.occupantAt(tx, ty);
    const mine = this.mines.get(occ);
    if (mine) {
      for (const u of units) this.startGather(u, { type: 'gather', kind: 'gold', mineId: mine.id, phase: 'go' });
      return;
    }
    const b = this.buildings.get(occ);
    if (b && b.progress < 1) {
      for (const u of units) this.assignBuild(u, b);
      return;
    }
    if (b) {
      // Tapped a finished building: drop off what they carry if it accepts it,
      // otherwise just walk up to it.
      for (const u of units) {
        if (u.job?.type === 'gather' && u.carry && BUILDINGS[b.kind].dropOff.includes(u.carry.kind)) {
          u.job.phase = 'return';
          u.path = this.pathTo(u, rectOf(b)) ?? [];
        } else {
          u.job = { type: 'move' };
          u.path = this.pathTo(u, rectOf(b)) ?? [];
        }
      }
      return;
    }
    this.moveGroup(units, tx, ty);
  }

  placeBuilding(kind: BuildingKind, tx: number, ty: number, builders: Unit[]): boolean {
    const def = BUILDINGS[kind];
    if (!this.canPlace(kind, tx, ty)) return this.fail('can\'t build there');
    const short = this.shortfall(def.cost);
    if (short) return this.fail(short);
    for (const k of Object.keys(def.cost) as ResourceKind[]) this.stock[k] -= def.cost[k] ?? 0;
    const site = this.addBuilding(kind, tx, ty, 0);
    for (const u of builders) this.assignBuild(u, site);
    return true;
  }

  train(hall: Building): boolean {
    if (hall.kind !== 'hall' || hall.progress < 1) return false;
    if (hall.queue >= TRAIN_QUEUE_MAX) return this.fail('queue full');
    if (this.popUsed >= this.popCap) return this.fail('need more houses');
    const short = this.shortfall(PEASANT_COST);
    if (short) return this.fail(short);
    for (const k of Object.keys(PEASANT_COST) as ResourceKind[]) this.stock[k] -= PEASANT_COST[k] ?? 0;
    hall.queue++;
    return true;
  }

  // ---------- simulation ----------

  tick(dt: number): void {
    this.time += dt;
    for (const u of this.units) this.tickUnit(u, dt);
    for (const b of this.buildings.values()) {
      if (b.queue === 0) continue;
      b.trainTimer += dt;
      if (b.trainTimer >= PEASANT_TRAIN_SECONDS) {
        b.trainTimer = 0;
        b.queue--;
        this.spawnPeasantNear(b);
      }
    }
  }

  private tickUnit(u: Unit, dt: number): void {
    if (u.path.length > 0) {
      this.step(u, dt);
      if (u.path.length === 0) this.arrive(u);
      return;
    }
    const job = u.job;
    if (!job) return;
    if (job.type === 'gather' && job.phase === 'work') {
      if (!this.resourceExists(job)) return this.retargetGather(u, job);
      u.work += dt;
      if (u.work >= GATHER_SECONDS[job.kind]) {
        u.work = 0;
        u.carry = { kind: job.kind, amount: this.takeResource(job) };
        job.phase = 'return';
        this.headHome(u, job.kind);
      }
    } else if (job.type === 'build' && job.phase === 'work') {
      const site = this.buildings.get(job.siteId);
      if (!site || site.progress >= 1) { u.job = null; return; }
      site.progress = Math.min(1, site.progress + dt / BUILDINGS[site.kind].buildSeconds);
      if (site.progress >= 1) {
        for (const other of this.units)
          if (other.job?.type === 'build' && other.job.siteId === site.id) other.job = null;
      }
    }
  }

  private step(u: Unit, dt: number): void {
    let budget = PEASANT_SPEED * dt;
    while (budget > 0 && u.path.length > 0) {
      const next = u.path[0]!;
      // Re-plan if something got built on the path since we planned it.
      if (!this.map.passable(next.x, next.y)) {
        this.replan(u);
        return;
      }
      const nx = tileCenter(next.x);
      const ny = tileCenter(next.y);
      const d = Math.hypot(nx - u.x, ny - u.y);
      if (d <= budget) {
        u.x = nx;
        u.y = ny;
        budget -= d;
        u.path.shift();
      } else {
        u.x += ((nx - u.x) / d) * budget;
        u.y += ((ny - u.y) / d) * budget;
        budget = 0;
      }
    }
  }

  private replan(u: Unit): void {
    const job = u.job;
    const last = u.path[u.path.length - 1]!;
    u.path = [];
    if (!job || job.type === 'move') {
      u.path = this.pathToTile(u, last.x, last.y) ?? [];
      if (u.path.length === 0) u.job = null;
    } else if (job.type === 'gather') {
      if (job.phase === 'return') this.headHome(u, job.kind);
      else this.startGather(u, job);
    } else {
      const site = this.buildings.get(job.siteId);
      if (site) this.assignBuild(u, site);
      else u.job = null;
    }
  }

  private arrive(u: Unit): void {
    const job = u.job;
    if (!job) return;
    if (job.type === 'move') { u.job = null; return; }
    if (job.type === 'build') {
      const site = this.buildings.get(job.siteId);
      if (site && adjacentTo(rectOf(site), tileOf(u.x), tileOf(u.y))) job.phase = 'work';
      else if (site) this.assignBuild(u, site);
      else u.job = null;
      return;
    }
    if (job.phase === 'go') {
      if (!this.resourceExists(job)) return this.retargetGather(u, job);
      job.phase = 'work';
      u.work = 0;
    } else if (job.phase === 'return') {
      const drop = this.dropOffNextTo(u);
      if (!drop || !u.carry) { this.headHome(u, job.kind); return; }
      this.stock[u.carry.kind] += u.carry.amount;
      u.carry = null;
      if (this.resourceExists(job)) this.startGather(u, { ...job, phase: 'go' });
      else this.retargetGather(u, job);
    }
  }

  // ---------- helpers ----------

  private fail(text: string): false {
    this.notice = { text, at: this.time };
    return false;
  }

  private addBuilding(kind: BuildingKind, tx: number, ty: number, progress: number): Building {
    const b: Building = { id: this.nextId++, kind, tx, ty, size: BUILDINGS[kind].size, progress, queue: 0, trainTimer: 0 };
    this.buildings.set(b.id, b);
    this.map.setOccupant(tx, ty, b.size, b.id);
    return b;
  }

  private placeMine(rng: () => number, sx: number, sy: number, minD: number, maxD: number): void {
    const map = this.map;
    for (let tries = 0; tries < 200; tries++) {
      const a = rng() * Math.PI * 2;
      const d = minD + rng() * (maxD - minD);
      const tx = Math.round(sx + Math.cos(a) * d);
      const ty = Math.round(sy + Math.sin(a) * d);
      if (tx < 2 || ty < 2 || tx + MINE_SIZE > map.w - 2 || ty + MINE_SIZE > map.h - 2) continue;
      // Clear the footprint + a 1-tile ring so it's always approachable.
      for (let y = ty - 1; y <= ty + MINE_SIZE; y++)
        for (let x = tx - 1; x <= tx + MINE_SIZE; x++) map.tree[map.idx(x, y)] = 0;
      if (!map.areaFree(tx, ty, MINE_SIZE)) continue;
      const m: Mine = { id: this.nextId++, tx, ty, size: MINE_SIZE, gold: MINE_GOLD };
      this.mines.set(m.id, m);
      map.setOccupant(tx, ty, MINE_SIZE, m.id);
      map.treeVersion++;
      return;
    }
  }

  private spawnPeasantNear(b: Building): void {
    // First free tile in the ring around the building, walking outward.
    for (let r = 1; r < 6; r++)
      for (let y = b.ty - r; y < b.ty + b.size + r; y++)
        for (let x = b.tx - r; x < b.tx + b.size + r; x++) {
          if (!this.map.passable(x, y)) continue;
          if (this.units.some((u) => tileOf(u.x) === x && tileOf(u.y) === y)) continue;
          this.units.push({ id: this.nextId++, x: tileCenter(x), y: tileCenter(y), path: [], job: null, carry: null, work: 0 });
          return;
        }
  }

  private pathTo(u: Unit, r: Rect): Pt[] | null {
    return findPath(this.map, tileOf(u.x), tileOf(u.y), (x, y) => adjacentTo(r, x, y), r);
  }
  private pathToTile(u: Unit, tx: number, ty: number): Pt[] | null {
    return findPath(this.map, tileOf(u.x), tileOf(u.y), (x, y) => x === tx && y === ty, { x: tx, y: ty, w: 1, h: 1 });
  }

  private moveGroup(units: Unit[], tx: number, ty: number): void {
    // Hand each unit its own free tile, spiralling out from the tap.
    const taken = new Set<number>();
    for (const u of units) {
      let dest: Pt | null = null;
      for (let r = 0; r < 5 && !dest; r++)
        for (let y = ty - r; y <= ty + r && !dest; y++)
          for (let x = tx - r; x <= tx + r && !dest; x++) {
            if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
            if (this.map.passable(x, y) && !taken.has(this.map.idx(x, y))) dest = { x, y };
          }
      if (!dest) continue;
      taken.add(this.map.idx(dest.x, dest.y));
      const path = this.pathToTile(u, dest.x, dest.y);
      if (!path) continue;
      u.job = { type: 'move' };
      u.path = path;
      u.work = 0;
    }
  }

  private startGather(u: Unit, job: Extract<Job, { type: 'gather' }>): void {
    if (u.carry && u.carry.kind !== job.kind) u.carry = null; // switching jobs drops the load
    u.work = 0;
    const r = this.resourceRect(job);
    const path = r && this.pathTo(u, r);
    if (!path) {
      if (job.kind === 'wood') return this.retargetGather(u, job);
      u.job = null;
      u.path = [];
      return;
    }
    u.job = { ...job, phase: 'go' };
    u.path = path;
    if (path.length === 0) this.arrive(u);
  }

  private assignBuild(u: Unit, site: Building): void {
    const path = this.pathTo(u, rectOf(site));
    if (!path) { u.job = null; u.path = []; return; }
    u.job = { type: 'build', siteId: site.id, phase: path.length === 0 ? 'work' : 'go' };
    u.path = path;
  }

  private resourceRect(job: Extract<Job, { type: 'gather' }>): Rect | null {
    if (job.kind === 'wood') return { x: job.tx, y: job.ty, w: 1, h: 1 };
    const m = this.mines.get(job.mineId);
    return m ? rectOf(m) : null;
  }

  private resourceExists(job: Extract<Job, { type: 'gather' }>): boolean {
    if (job.kind === 'wood') return this.map.hasTree(job.tx, job.ty);
    return (this.mines.get(job.mineId)?.gold ?? 0) > 0;
  }

  private takeResource(job: Extract<Job, { type: 'gather' }>): number {
    if (job.kind === 'wood') {
      const i = this.map.idx(job.tx, job.ty);
      const got = Math.min(CARRY_CAP, this.map.tree[i]!);
      this.map.tree[i] = this.map.tree[i]! - got;
      if (this.map.tree[i] === 0) this.map.treeVersion++;
      return got;
    }
    const m = this.mines.get(job.mineId)!;
    const got = Math.min(CARRY_CAP, m.gold);
    m.gold -= got;
    if (m.gold === 0) {
      this.mines.delete(m.id);
      this.map.setOccupant(m.tx, m.ty, m.size, 0);
      this.map.treeVersion++;
    }
    return got;
  }

  /** Current resource ran out: find the nearest reachable replacement of the same kind. */
  private retargetGather(u: Unit, job: Extract<Job, { type: 'gather' }>): void {
    const ux = tileOf(u.x);
    const uy = tileOf(u.y);
    if (job.kind === 'wood') {
      const R = 10;
      const trees: Pt[] = [];
      for (let y = uy - R; y <= uy + R; y++)
        for (let x = ux - R; x <= ux + R; x++) if (this.map.hasTree(x, y)) trees.push({ x, y });
      trees.sort((a, b) => Math.hypot(a.x - ux, a.y - uy) - Math.hypot(b.x - ux, b.y - uy));
      for (const t of trees.slice(0, 12)) {
        const path = this.pathTo(u, { x: t.x, y: t.y, w: 1, h: 1 });
        if (!path) continue;
        u.job = { type: 'gather', kind: 'wood', tx: t.x, ty: t.y, phase: 'go' };
        u.path = path;
        if (path.length === 0) this.arrive(u);
        return;
      }
    } else {
      const mines = [...this.mines.values()].sort(
        (a, b) => Math.hypot(a.tx - ux, a.ty - uy) - Math.hypot(b.tx - ux, b.ty - uy));
      const m = mines[0];
      if (m) return this.startGather(u, { type: 'gather', kind: 'gold', mineId: m.id, phase: 'go' });
    }
    u.job = null;
    u.path = [];
  }

  private dropOffNextTo(u: Unit): Building | null {
    if (!u.carry) return null;
    const ux = tileOf(u.x);
    const uy = tileOf(u.y);
    for (const b of this.buildings.values())
      if (b.progress >= 1 && BUILDINGS[b.kind].dropOff.includes(u.carry.kind) && adjacentTo(rectOf(b), ux, uy)) return b;
    return null;
  }

  private headHome(u: Unit, kind: ResourceKind): void {
    const drops = [...this.buildings.values()]
      .filter((b) => b.progress >= 1 && BUILDINGS[b.kind].dropOff.includes(kind))
      .sort((a, b) => distTo(u, a) - distTo(u, b));
    for (const b of drops) {
      const path = this.pathTo(u, rectOf(b));
      if (!path) continue;
      u.path = path;
      if (path.length === 0) this.arrive(u);
      return;
    }
    u.job = null;
    u.path = [];
  }
}
