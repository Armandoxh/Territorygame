import type { GameConfig } from './config.js';
import type {
  Player, PlayerId, Capital, Building, BuildingType, GameEvent,
  GameOutcome, BuildError, Point,
} from './types.js';
import { Territory } from './territory.js';
import { generateTerrain, carveLand } from './terrain.js';

interface ExpansionCandidate {
  x: number; y: number;
  dx: number; dy: number;
  owner: number;
}

// Authoritative game state + per-tick simulation. The renderer reads, the
// input layer calls setHumanTarget / haltHuman / tryBuild. AI players are
// driven inside tick() via _aiThink.
export class Game {
  readonly config: GameConfig;
  readonly territory: Territory;
  readonly players: Array<Player | null>;
  readonly capitals: Capital[];
  readonly buildings: Building[];
  readonly goldMultiplier: Float32Array;
  tickCount: number;
  outcome: GameOutcome;
  private events: GameEvent[];

  constructor(config: GameConfig) {
    this.config = config;
    this.territory = new Territory(config.GRID_WIDTH, config.GRID_HEIGHT);
    this.players = [null]; // index 0 = unclaimed sentinel
    this.players.push(this._mkPlayer(1, 'You', true));
    for (let i = 0; i < config.AI_PLAYER_COUNT; i++) {
      this.players.push(this._mkPlayer(2 + i, `AI ${i + 1}`, false));
    }
    this.capitals = [];
    this.buildings = [];
    this.goldMultiplier = new Float32Array(config.GRID_WIDTH * config.GRID_HEIGHT);
    this.tickCount = 0;
    this.outcome = null;
    this.events = [];
  }

  // --- Setup ---

  generateTerrain(seed?: number): void {
    const W = this.territory.width, H = this.territory.height;
    const t = generateTerrain(W, H, this.config, seed);
    const carveR = this._spawnRadius() + 3;
    for (const s of this.spawnSpots()) {
      carveLand(t, W, H, s.x, s.y, carveR);
    }
    this.territory.setTerrain(t);
  }

  spawnAll(): void {
    const W = this.territory.width, H = this.territory.height;
    for (const s of this.spawnSpots()) {
      this._spawnPlayerAt(s.id, s.x, s.y);
    }
    // AI defaults to targeting the map center; they'll retarget periodically.
    for (let id = 2; id < this.players.length; id++) {
      const p = this.players[id];
      if (p) p.target = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
    }
  }

  spawnSpots(): Array<{ id: PlayerId; x: number; y: number }> {
    const W = this.territory.width, H = this.territory.height;
    const N = this.players.length - 1;
    if (N <= 0) return [];
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.4;
    const start = Math.PI; // player 1 (human) anchors at the west edge
    const spots: Array<{ id: PlayerId; x: number; y: number }> = [];
    for (let i = 0; i < N; i++) {
      const a = start + (i / N) * Math.PI * 2;
      spots.push({
        id: i + 1,
        x: Math.floor(cx + Math.cos(a) * r),
        y: Math.floor(cy + Math.sin(a) * r),
      });
    }
    return spots;
  }

  human(): Player {
    const p = this.players[1];
    if (!p) throw new Error('human player missing');
    return p;
  }

  // --- Player actions ---

  setHumanTarget(x: number, y: number): void {
    if (!this.territory.inBounds(x, y)) return;
    const p = this.human();
    if (!p.alive) return;
    p.target = { x, y };
    p.expanding = true;
  }

  haltHuman(): void {
    const p = this.human();
    p.target = null;
    p.expanding = false;
  }

  // --- Tick ---

  tick(): void {
    if (this.outcome) return;
    this.tickCount++;
    this._earnGoldAll();
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (!p || !p.alive) continue;
      if (!p.isHuman) this._aiThink(p);
      if (p.expanding) this._expand(p);
    }
    this._tickWonders();
    this._checkVictory();
  }

  // UI consumes queued events on each frame.
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // --- Buildings ---

  buildingAt(x: number, y: number): Building | null {
    for (const b of this.buildings) {
      if (b.x === x && b.y === y) return b;
    }
    return null;
  }

  countBuildings(ownerId: PlayerId, type: BuildingType): number {
    let n = 0;
    for (const b of this.buildings) {
      if (b.owner === ownerId && b.type === type) n++;
    }
    return n;
  }

  hasAirstrip(ownerId: PlayerId): boolean {
    return this.countBuildings(ownerId, 'airstrip') > 0;
  }

  /** null on success, error code otherwise. */
  tryBuild(type: BuildingType, x: number, y: number, ownerId: PlayerId): BuildError | null {
    const cost = this.config.BUILDING_COSTS[type];
    if (cost == null) return 'bad-type';
    if (!this.territory.inBounds(x, y)) return 'oob';
    const owner = this.players[ownerId];
    if (!owner || !owner.alive) return 'dead';
    if (this.territory.getOwner(x, y) !== ownerId) return 'not-yours';
    if (this.buildingAt(x, y)) return 'occupied';
    if (this._capitalIndexAt(x, y) >= 0) return 'on-capital';
    if (owner.gold < cost) return 'gold';
    if (type === 'wonder' && this.countBuildings(ownerId, 'wonder') >= this.config.WONDER_MAX_PER_PLAYER) {
      return 'wonder-limit';
    }
    owner.gold -= cost;
    const b: Building = { x, y, owner: ownerId, type };
    if (type === 'wonder') b.progress = 0;
    this.buildings.push(b);
    if (type === 'settlement') this._applySettlement(x, y, +1);
    this.events.push({ type: 'built', buildingType: type, ownerId });
    return null;
  }

  // --- Capture (combat) ---

  /** Attempt to flip (x, y) to attackerId. */
  tryCapture(x: number, y: number, attackerId: PlayerId): boolean {
    const defender = this.territory.getOwner(x, y);
    if (defender < 0 || defender === attackerId) return false;
    const capIdx = this._capitalIndexAt(x, y);
    if (!this.territory.claim(x, y, attackerId)) return false;
    this._destroyBuildingsAt(x, y);
    if (capIdx >= 0) {
      this.capitals.splice(capIdx, 1);
      const eliminated = this._checkElimination(defender);
      if (eliminated) {
        this.events.push({ type: 'eliminated', playerId: defender, by: attackerId });
      } else {
        this.events.push({ type: 'capital', playerId: defender, by: attackerId });
      }
    }
    return true;
  }

  // --- Internals ---

  private _mkPlayer(id: PlayerId, name: string, isHuman: boolean): Player {
    return {
      id, name, isHuman,
      gold: this.config.STARTING_GOLD,
      alive: true,
      target: null,
      expanding: !isHuman,
    };
  }

  private _spawnRadius(): number {
    const N = this.players.length - 1;
    if (N <= 4) return this.config.SPAWN_RADIUS;
    const W = this.territory.width, H = this.territory.height;
    const circ = 2 * Math.PI * Math.min(W, H) * 0.4;
    const spacing = circ / N;
    return Math.max(2, Math.min(this.config.SPAWN_RADIUS, Math.floor(spacing / 3)));
  }

  private _spawnPlayerAt(id: PlayerId, cx: number, cy: number): void {
    const r = this._spawnRadius();
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          this.territory.claim(cx + dx, cy + dy, id);
        }
      }
    }
    const offsets: Point[] = [
      { x: 0,  y: 0  },
      { x: 3,  y: 1  },
      { x: -2, y: -2 },
    ];
    for (let i = 0; i < this.config.CAPITALS_PER_PLAYER; i++) {
      const o = offsets[i] ?? offsets[0]!;
      this.capitals.push({ x: cx + o.x, y: cy + o.y, owner: id });
    }
  }

  private _earnGoldAll(): void {
    const owners = this.territory.owners;
    const mult = this.goldMultiplier;
    const base = this.config.GOLD_PER_TILE_PER_TICK;
    const N = owners.length;
    const players = this.players;
    for (let i = 0; i < N; i++) {
      const id = owners[i]!;
      if (id === 0) continue;
      const p = players[id];
      if (!p || !p.alive) continue;
      p.gold += base * (1 + mult[i]!);
    }
  }

  private _aiThink(p: Player): void {
    if (this.tickCount % this.config.AI_RETARGET_TICKS !== 0 && p.target) return;
    const W = this.territory.width, H = this.territory.height;
    let bestId = -1, bestCount = -1;
    for (let id = 1; id < this.players.length; id++) {
      if (id === p.id) continue;
      const op = this.players[id];
      if (!op || !op.alive) continue;
      const c = this.territory.counts[id]!;
      if (c > bestCount) { bestCount = c; bestId = id; }
    }
    let tx = W / 2, ty = H / 2;
    if (bestId > 0 && Math.random() < 0.65) {
      const c = this.territory.centroid(bestId);
      tx = c.x; ty = c.y;
    }
    p.target = { x: Math.floor(tx), y: Math.floor(ty) };
  }

  private _expand(p: Player): void {
    const frontier = this.territory.getFrontier(p.id);
    if (frontier.size === 0) return;
    const W = this.territory.width;
    const baseChance = this.config.EXPANSION_CHANCE_PER_FRONTIER_TILE;
    const target = p.target;

    let useTarget = false, tNx = 0, tNy = 0, cx = 0, cy = 0;
    if (target) {
      const c = this.territory.centroid(p.id);
      cx = c.x; cy = c.y;
      const tdx = target.x - cx;
      const tdy = target.y - cy;
      const tDist = Math.hypot(tdx, tdy);
      if (tDist > 0.5) {
        useTarget = true;
        tNx = tdx / tDist;
        tNy = tdy / tDist;
      }
    }

    const tiles = Array.from(frontier);
    for (let k = 0; k < tiles.length; k++) {
      if (p.gold < this.config.EXPANSION_COST_PER_CLAIM) break;
      const i = tiles[k]!;
      const x = i % W;
      const y = (i - x) / W;

      const cands = this._validTargets(x, y, p.id);
      if (cands.length === 0) continue;

      let chance = baseChance;
      let chosen: ExpansionCandidate;
      if (useTarget) {
        const fx = x - cx, fy = y - cy;
        const fDist = Math.hypot(fx, fy) || 1;
        const align = (fx / fDist) * tNx + (fy / fDist) * tNy;
        chance *= Math.pow(Math.max(0, align + 1), this.config.EXPANSION_DIRECTIONAL_EXP);
        if (Math.random() < this.config.EXPANSION_TARGET_BIAS) {
          let bestS = -Infinity;
          chosen = cands[0]!;
          for (const c of cands) {
            const s = c.dx * tNx + c.dy * tNy;
            if (s > bestS) { bestS = s; chosen = c; }
          }
        } else {
          chosen = cands[(Math.random() * cands.length) | 0]!;
        }
      } else {
        chosen = cands[(Math.random() * cands.length) | 0]!;
      }

      const targetOwner = this.territory.getOwner(chosen.x, chosen.y);
      if (targetOwner === 0) {
        if (Math.random() > chance) continue;
        if (p.gold < this.config.EXPANSION_COST_PER_CLAIM) continue;
        if (this.territory.claim(chosen.x, chosen.y, p.id)) {
          p.gold -= this.config.EXPANSION_COST_PER_CLAIM;
        }
      } else {
        const def = this._defenseAt(chosen.x, chosen.y, targetOwner);
        const cost = this.config.ATTACK_COST_PER_CLAIM * (1 + def);
        const rate = chance * this.config.ATTACK_RATE_MULT / (1 + def);
        if (Math.random() > rate) continue;
        if (p.gold < cost) continue;
        if (this.tryCapture(chosen.x, chosen.y, p.id)) {
          p.gold -= cost;
        }
      }
    }
  }

  private _validTargets(x: number, y: number, owner: PlayerId): ExpansionCandidate[] {
    const cands: ExpansionCandidate[] = [];
    const dirs: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      const o = this.territory.getOwner(nx, ny);
      if (o === -1 || o === owner) continue;
      if (!this.territory.isPassable(nx, ny)) continue;
      cands.push({ x: nx, y: ny, dx, dy, owner: o });
    }
    return cands;
  }

  private _defenseAt(x: number, y: number, defenderId: PlayerId): number {
    let bonus = 0;
    const r2 = this.config.TURRET_RADIUS * this.config.TURRET_RADIUS;
    for (const b of this.buildings) {
      if (b.type !== 'turret') continue;
      if (b.owner !== defenderId) continue;
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy <= r2) bonus += this.config.TURRET_DEFENSE_BONUS;
    }
    return bonus;
  }

  private _capitalIndexAt(x: number, y: number): number {
    for (let i = 0; i < this.capitals.length; i++) {
      const c = this.capitals[i]!;
      if (c.x === x && c.y === y) return i;
    }
    return -1;
  }

  private _destroyBuildingsAt(x: number, y: number): void {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!;
      if (b.x === x && b.y === y) {
        if (b.type === 'settlement') this._applySettlement(b.x, b.y, -1);
        this.buildings.splice(i, 1);
        this.events.push({ type: 'destroyed', buildingType: b.type, ownerId: b.owner });
      }
    }
  }

  private _applySettlement(cx: number, cy: number, sign: number): void {
    const r = this.config.SETTLEMENT_RADIUS;
    const r2 = r * r;
    const W = this.territory.width, H = this.territory.height;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        if (x < 0 || x >= W) continue;
        this.goldMultiplier[y * W + x]! += sign * this.config.SETTLEMENT_BONUS;
      }
    }
  }

  private _tickWonders(): void {
    for (const b of this.buildings) {
      if (b.type !== 'wonder') continue;
      const owner = this.players[b.owner];
      if (!owner || !owner.alive) continue;
      if ((b.progress ?? 0) < this.config.WONDER_BUILD_TIME_TICKS) {
        b.progress = (b.progress ?? 0) + 1;
      }
    }
  }

  private _checkElimination(playerId: PlayerId): boolean {
    if (playerId <= 0) return false;
    let n = 0;
    for (const c of this.capitals) if (c.owner === playerId) n++;
    if (n === 0) {
      const p = this.players[playerId];
      if (p && p.alive) {
        p.alive = false;
        p.expanding = false;
        return true;
      }
    }
    return false;
  }

  private _checkVictory(): void {
    if (this.outcome) return;
    let aliveCount = 0;
    let lastAlive = -1;
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (p && p.alive) { aliveCount++; lastAlive = id; }
    }
    if (aliveCount <= 1) {
      const human = this.human();
      const outcome: 'victory' | 'defeat' = (aliveCount === 1 && lastAlive === human.id) ? 'victory' : 'defeat';
      this.outcome = outcome;
      this.events.push({ type: 'gameover', outcome, winner: lastAlive });
    } else if (!this.human().alive) {
      this.outcome = 'defeat';
      this.events.push({ type: 'gameover', outcome: 'defeat', winner: -1 });
    }
  }
}
