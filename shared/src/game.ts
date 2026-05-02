import type { GameConfig } from './config.js';
import type {
  Player, PlayerId, Capital, Building, BuildingType, BombType, GameEvent,
  GameOutcome, BuildError, BombError, Point,
} from './types.js';
import { TERRAIN_LAND } from './types.js';
import { Territory } from './territory.js';
import { generateTerrain } from './terrain.js';
import { generateRegions } from './regions.js';

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
    this._spawnSpotsCache = null;
    this.totalLand = 0;
    this.regions = new Uint8Array(config.GRID_WIDTH * config.GRID_HEIGHT);
    this.regionCount = 0;
  }

  /** Number of passable (LAND) tiles on the map. Set during generateTerrain. */
  totalLand: number;

  /** Region ID per tile (1..regionCount); 0 = water. Set during generateTerrain. */
  regions: Uint8Array;
  regionCount: number;

  // --- Region ownership tracking ---
  /** Total passable tile count per region (index = regionId). */
  private _regionTotal!: Uint32Array;
  /** Per-(region, owner) tile count — flattened: index = r * 256 + ownerId. */
  private _regionOwnedTiles!: Int32Array;
  /** Player ID currently fully owning each region (0 if contested or empty). */
  private _regionOwner!: Uint8Array;
  /** Vassal target region for each region (0 = idle). Used as the
   *  autonomous expansion target for tiles inside that vassal region when
   *  the leader hasn't issued a manual override. */
  private _vassalTarget!: Uint16Array;
  /** Tile indices grouped by region. */
  private _tilesByRegion!: number[][];
  /** Set of region IDs that border each region (incl. across the map edge). */
  private _regionAdjacency!: Set<number>[];

  /** Returns the player ID who fully owns this region, or 0. */
  regionOwnerOf(regionId: number): PlayerId {
    return this._regionOwner?.[regionId] ?? 0;
  }

  /** Returns the autonomous expansion target for a region's vassal, or 0. */
  vassalTargetOf(regionId: number): number {
    return this._vassalTarget?.[regionId] ?? 0;
  }

  /** Whether a given player's vassals are currently loyal (active). Humans
   *  need >= VASSAL_LOYALTY_THRESHOLD of the map; AIs are always loyal. */
  vassalsLoyalFor(playerId: PlayerId): boolean {
    const p = this.players[playerId];
    if (!p || !p.alive) return false;
    if (!p.isHuman) return true;
    if (this.totalLand <= 0) return false;
    return (this.territory.counts[playerId]! / this.totalLand) >= this.config.VASSAL_LOYALTY_THRESHOLD;
  }

  /** How many regions are completely owned by this player. */
  fullRegionsForOwner(id: PlayerId): number {
    if (!this._regionOwner) return 0;
    let n = 0;
    for (let r = 1; r <= this.regionCount; r++) {
      if (this._regionOwner[r] === id) n++;
    }
    return n;
  }

  // --- Setup ---

  generateTerrain(seed?: number): void {
    const W = this.territory.width, H = this.territory.height;
    const t = generateTerrain(W, H, this.config, seed);
    this.territory.setTerrain(t);
    // Count land tiles for the win-threshold denominator.
    let land = 0;
    for (let i = 0; i < t.length; i++) if (t[i] === TERRAIN_LAND) land++;
    this.totalLand = land;
    // Spawn spots will be chosen on the already-generated land in spawnAll().
    this._spawnSpotsCache = null;
  }

  spawnAll(): void {
    const W = this.territory.width, H = this.territory.height;
    const spots = this._chooseSpawnSpotsOnLand();
    this._spawnSpotsCache = spots;
    // Carve a tiny safety patch at each spawn so the blob always fits even
    // when the chosen tile sits on a coastline.
    const carveR = this._spawnRadius() + 1;
    for (const s of spots) this.territory.carveLand(s.x, s.y, carveR);

    // Land count is final (water won't be re-added). Region partition needs
    // it, so do it before spawning.
    let land = 0;
    const t = this.territory.terrain;
    for (let i = 0; i < t.length; i++) if (t[i] === TERRAIN_LAND) land++;
    this.totalLand = land;

    // Partition the (now final) land into districts. The renderer reads this
    // for the border overlay and gameplay reads it to bound expansion.
    const seedCount = Math.max(20, Math.min(120, Math.floor(Math.sqrt(this.totalLand) / 3)));
    this.regions = generateRegions(this.territory.terrain, W, H, seedCount);
    let maxR = 0;
    for (let i = 0; i < this.regions.length; i++) {
      if (this.regions[i]! > maxR) maxR = this.regions[i]!;
    }
    this.regionCount = maxR;

    // Region ownership tracking. Must be initialised before the spawn blobs
    // start landing tiles, since _claim updates these arrays as it goes.
    this._regionTotal = new Uint32Array(this.regionCount + 1);
    this._regionOwnedTiles = new Int32Array((this.regionCount + 1) * 256);
    this._regionOwner = new Uint8Array(this.regionCount + 1);
    this._vassalTarget = new Uint16Array(this.regionCount + 1);
    this._tilesByRegion = [];
    for (let r = 0; r <= this.regionCount; r++) this._tilesByRegion.push([]);
    for (let i = 0; i < this.regions.length; i++) {
      const r = this.regions[i]!;
      if (r > 0) {
        this._regionTotal[r]!++;
        this._tilesByRegion[r]!.push(i);
      }
    }
    // Region adjacency: which regions touch which. One scan, check left/up
    // neighbours so each pair is added once (we still add both directions
    // for symmetric lookup).
    this._regionAdjacency = [];
    for (let r = 0; r <= this.regionCount; r++) this._regionAdjacency.push(new Set<number>());
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const r = this.regions[row + x]!;
        if (r === 0) continue;
        if (x > 0) {
          const nr = this.regions[row + x - 1]!;
          if (nr > 0 && nr !== r) {
            this._regionAdjacency[r]!.add(nr);
            this._regionAdjacency[nr]!.add(r);
          }
        }
        if (y > 0) {
          const nr = this.regions[row - W + x]!;
          if (nr > 0 && nr !== r) {
            this._regionAdjacency[r]!.add(nr);
            this._regionAdjacency[nr]!.add(r);
          }
        }
      }
    }

    // Now spawn each player. _claim updates regionOwnedTiles + regionOwner.
    for (const s of spots) this._spawnPlayerAt(s.id, s.x, s.y);

    // AI targets adjacent to their spawn (or random fallback).
    for (let id = 2; id < this.players.length; id++) {
      const p = this.players[id];
      if (p) p.targetRegion = this._pickAiTargetRegion(p.id);
    }
  }

  // Centralised tile claim: routes through territory.claim and keeps the
  // per-region ownership tables in sync. All gameplay code paths that change
  // tile ownership (spawn blobs, expansion, combat capture, bombs) call this.
  private _claim(x: number, y: number, newOwner: PlayerId): boolean {
    if (!this.territory.inBounds(x, y)) return false;
    const W = this.territory.width;
    const oldOwner = this.territory.getOwner(x, y);
    if (!this.territory.claim(x, y, newOwner)) return false;
    if (this.regionCount > 0) {
      const r = this.regions[y * W + x]!;
      if (r > 0) {
        if (oldOwner > 0) {
          this._regionOwnedTiles[r * 256 + oldOwner]!--;
          if (this._regionOwner[r] === oldOwner) {
            this._regionOwner[r] = 0;
            this.events.push({ type: 'region-lost', regionId: r, ownerId: oldOwner });
          }
        }
        if (newOwner > 0) {
          this._regionOwnedTiles[r * 256 + newOwner]!++;
          if (this._regionOwnedTiles[r * 256 + newOwner] === this._regionTotal[r]) {
            this._regionOwner[r] = newOwner;
            this.events.push({ type: 'region-conquered', regionId: r, ownerId: newOwner });
          }
        }
      }
    }
    return true;
  }

  regionAt(x: number, y: number): number {
    if (!this.territory.inBounds(x, y)) return 0;
    return this.regions[y * this.territory.width + x] ?? 0;
  }

  spawnSpots(): Array<{ id: PlayerId; x: number; y: number }> {
    return this._spawnSpotsCache ?? [];
  }

  private _spawnSpotsCache: Array<{ id: PlayerId; x: number; y: number }> | null;

  // Even sampling on passable terrain, Poisson-disk style: random rejection
  // sampling at decreasing minimum spacing until N spawns are found. Falls
  // back to a circle layout if the map is too fragmented to fit them all.
  private _chooseSpawnSpotsOnLand(): Array<{ id: PlayerId; x: number; y: number }> {
    const N = this.players.length - 1;
    if (N <= 0) return [];
    const W = this.territory.width, H = this.territory.height;
    const margin = this._spawnRadius() + 2;
    const terrain = this.territory.terrain;

    const candidates: number[] = [];
    for (let y = margin; y < H - margin; y++) {
      const row = y * W;
      for (let x = margin; x < W - margin; x++) {
        if (terrain[row + x] === TERRAIN_LAND) candidates.push(row + x);
      }
    }
    if (candidates.length === 0) return this._fallbackCircleSpots();

    const idealR = Math.sqrt(candidates.length / N) * 1.2;
    const maxFails = Math.max(2000, Math.min(50000, N * 200));

    for (let factor = 1.0; factor >= 0.3; factor *= 0.7) {
      const r = idealR * factor;
      const r2 = r * r;
      const picked: Array<{ id: PlayerId; x: number; y: number }> = [];
      let fails = 0;
      while (picked.length < N && fails < maxFails) {
        const i = candidates[(Math.random() * candidates.length) | 0]!;
        const x = i % W;
        const y = (i - x) / W;
        let ok = true;
        for (let k = 0; k < picked.length; k++) {
          const p = picked[k]!;
          const dx = p.x - x, dy = p.y - y;
          if (dx * dx + dy * dy < r2) { ok = false; break; }
        }
        if (ok) picked.push({ id: picked.length + 1, x, y });
        else fails++;
      }
      if (picked.length === N) return picked;
    }
    return this._fallbackCircleSpots();
  }

  // Backstop: circle layout (will rely on Territory.carveLand to make these
  // positions usable even if they happen to sit on water).
  private _fallbackCircleSpots(): Array<{ id: PlayerId; x: number; y: number }> {
    const N = this.players.length - 1;
    const W = this.territory.width, H = this.territory.height;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.4;
    const start = Math.PI;
    const out: Array<{ id: PlayerId; x: number; y: number }> = [];
    for (let i = 0; i < N; i++) {
      const a = start + (i / N) * Math.PI * 2;
      out.push({
        id: i + 1,
        x: Math.floor(cx + Math.cos(a) * r),
        y: Math.floor(cy + Math.sin(a) * r),
      });
    }
    return out;
  }

  human(): Player {
    const p = this.players[1];
    if (!p) throw new Error('human player missing');
    return p;
  }

  // --- Player actions ---

  /**
   * Tap-to-claim: target the region containing (x, y). Frontier tiles bordering
   * that region will push into it and only into it. Returns the region ID
   * targeted, or 0 if the tap was on water/oob.
   */
  setHumanTargetRegion(x: number, y: number): number {
    const p = this.human();
    if (!p.alive) return 0;
    const r = this.regionAt(x, y);
    if (r <= 0) return 0;
    p.targetRegion = r;
    p.target = { x, y };
    p.expanding = true;
    return r;
  }

  haltHuman(): void {
    const p = this.human();
    p.targetRegion = null;
    p.target = null;
    p.expanding = false;
  }

  // --- Tick ---

  tick(): void {
    if (this.outcome) return;
    this.tickCount++;
    this._earnGoldAll();
    this._growTroops();
    this._vassalsThink();
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (!p || !p.alive) continue;
      if (!p.isHuman) this._aiThink(p);
      // Always attempt expansion. _expand falls through tile-by-tile and
      // skips tiles with no effective target (no override + non-vassal).
      this._expand(p);
    }
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

  /**
   * Returns the soonest tick at which an airstrip belonging to ownerId
   * will be ready, or -1 if the player has no airstrips at all.
   */
  airstripReadyAt(ownerId: PlayerId): number {
    let best = Infinity;
    let any = false;
    for (const b of this.buildings) {
      if (b.type !== 'airstrip' || b.owner !== ownerId) continue;
      any = true;
      const ready = b.cooldownUntil ?? 0;
      if (ready < best) best = ready;
    }
    return any ? best : -1;
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
    owner.gold -= cost;
    const b: Building = { x, y, owner: ownerId, type };
    this.buildings.push(b);
    if (type === 'settlement') this._applySettlement(x, y, +1);
    this.events.push({ type: 'built', buildingType: type, ownerId });
    return null;
  }

  // --- Bombs ---

  /**
   * Drop a bomb of the given type at (x, y). Requires an airstrip off
   * cooldown and enough gold. Wipes claims and destroys buildings on every
   * tile in radius — including the bomber's own. Capitals are immune.
   */
  dropBomb(type: BombType, x: number, y: number, ownerId: PlayerId): BombError | null {
    if (!this.territory.inBounds(x, y)) return 'oob';
    const owner = this.players[ownerId];
    if (!owner || !owner.alive) return 'dead';
    const cost = this.config.BOMB_COSTS[type];
    if (cost == null) return 'bad-type';

    // Find the soonest-ready airstrip belonging to ownerId.
    let chosen: Building | null = null;
    let chosenReady = Infinity;
    let any = false;
    for (const b of this.buildings) {
      if (b.type !== 'airstrip' || b.owner !== ownerId) continue;
      any = true;
      const ready = b.cooldownUntil ?? 0;
      if (ready <= this.tickCount && ready < chosenReady) {
        chosen = b;
        chosenReady = ready;
      }
    }
    if (!any) return 'no-airstrip';
    if (!chosen) return 'cooldown';
    if (owner.gold < cost) return 'gold';

    owner.gold -= cost;
    chosen.cooldownUntil = this.tickCount + this.config.BOMB_COOLDOWN_TICKS[type];

    const radius = this.config.BOMB_RADII[type];
    const r2 = radius * radius;
    const W = this.territory.width;
    const H = this.territory.height;
    for (let dy = -radius; dy <= radius; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= H) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = x + dx;
        if (tx < 0 || tx >= W) continue;
        // Capitals are immune — bombs cannot remove a capital.
        if (this._capitalIndexAt(tx, ty) >= 0) continue;
        // Only land tiles can be hit (water already has nothing to lose).
        if (!this.territory.isPassable(tx, ty)) continue;
        if (this.territory.getOwner(tx, ty) !== 0) {
          if (this._claim(tx, ty, 0)) {
            this._destroyBuildingsAt(tx, ty);
          }
        } else {
          // Edge case: a stray building on unclaimed land — destroy it.
          if (this.buildingAt(tx, ty)) this._destroyBuildingsAt(tx, ty);
        }
      }
    }
    this.events.push({ type: 'bomb', bombType: type, x, y, radius, ownerId });
    return null;
  }

  // --- Capture (combat) ---

  /** Attempt to flip (x, y) to attackerId. Returns true on success. */
  tryCapture(x: number, y: number, attackerId: PlayerId): boolean {
    const defender = this.territory.getOwner(x, y);
    if (defender < 0 || defender === attackerId) return false;
    const capIdx = this._capitalIndexAt(x, y);
    const capOwner = capIdx >= 0 ? this.capitals[capIdx]!.owner : -1;
    if (!this._claim(x, y, attackerId)) return false;
    this._destroyBuildingsAt(x, y);
    // Capitals are still destroyed when their tile is captured, but losing
    // them no longer eliminates a player — victory is decided by territory
    // share. We just emit a 'capital' toast for player feedback.
    if (capIdx >= 0 && capOwner > 0) {
      this.capitals.splice(capIdx, 1);
      this.events.push({ type: 'capital', playerId: capOwner, by: attackerId });
    }
    return true;
  }

  // --- Internals ---

  private _mkPlayer(id: PlayerId, name: string, isHuman: boolean): Player {
    return {
      id, name, isHuman,
      gold: this.config.STARTING_GOLD,
      troops: this.config.STARTING_TROOPS,
      alive: true,
      targetRegion: null,
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
          this._claim(cx + dx, cy + dy, id);
        }
      }
    }
    // Capitals at fixed mid-blob offsets so they are NOT on the spawn
    // perimeter (where they'd fall the moment an enemy frontier touches
    // your blob). For tight spawn radii where the desired offset doesn't
    // land on owned land, snap to the nearest owned tile.
    const desired: Point[] = [
      { x: 0,  y: 0  },
      { x: 2,  y: 1  },
      { x: -2, y: -1 },
    ];
    const N = this.config.CAPITALS_PER_PLAYER;
    for (let i = 0; i < N; i++) {
      const want = desired[i] ?? desired[0]!;
      let tx = cx + want.x, ty = cy + want.y;
      if (this.territory.getOwner(tx, ty) !== id) {
        let bestD = Infinity, bestX = tx, bestY = ty;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = cx + dx, y = cy + dy;
            if (this.territory.getOwner(x, y) !== id) continue;
            const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
            if (d < bestD) { bestD = d; bestX = x; bestY = y; }
          }
        }
        if (bestD === Infinity) continue;
        tx = bestX; ty = bestY;
      }
      if (this._capitalIndexAt(tx, ty) < 0) {
        this.capitals.push({ x: tx, y: ty, owner: id });
      }
    }
  }

  private _growTroops(): void {
    const growth = this.config.TROOP_GROWTH_PER_TILE_PER_TICK;
    const cap = this.config.TROOP_CAP_PER_TILE;
    const settlementBonus = this.config.SETTLEMENT_TROOP_BONUS;
    const fullRegionBonus = this.config.FULL_REGION_TROOP_BONUS;
    // Pre-count settlements per owner so we don't iterate buildings inside the loop.
    const settlementCount = new Int32Array(256);
    for (const b of this.buildings) {
      if (b.type === 'settlement') settlementCount[b.owner]!++;
    }
    // Pre-count fully-owned regions per owner.
    const fullRegions = new Int32Array(256);
    for (let r = 1; r <= this.regionCount; r++) {
      const o = this._regionOwner[r]!;
      if (o > 0) fullRegions[o]!++;
    }
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (!p || !p.alive) continue;
      const owned = this.territory.counts[id]!;
      const max = owned * cap;
      const next = p.troops
        + owned * growth
        + settlementCount[id]! * settlementBonus
        + fullRegions[id]! * fullRegionBonus;
      p.troops = next > max ? max : next;
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

  // Per-region vassal AI tick. Each vassal: (1) refreshes its expansion
  // target to an adjacent enemy/empty region, (2) opportunistically buys a
  // turret on an enemy-bordering tile or a settlement on an interior tile.
  // Vassals dip into the leader's gold but keep VASSAL_GOLD_RESERVE in the
  // pot so the leader still has cash for big strategic moves.
  private _vassalsThink(): void {
    const interval = this.config.VASSAL_THINK_INTERVAL;
    if (interval <= 0) return;
    for (let pid = 1; pid < this.players.length; pid++) {
      const player = this.players[pid];
      if (!player || !player.alive) continue;
      // Loyalty: humans need to control >= the threshold, AIs are always
      // backed by their global brain so we don't grant them autonomous
      // vassals (would compound their advantage too much).
      if (!player.isHuman) continue;
      if (!this.vassalsLoyalFor(player.id)) continue;
      for (let r = 1; r <= this.regionCount; r++) {
        if (this._regionOwner[r] !== player.id) continue;
        // Stagger so all vassals don't act on the same tick.
        if (((this.tickCount + r * 7) % interval) !== 0) continue;
        this._vassalTickFor(r, player);
      }
    }
  }

  private _vassalTickFor(regionId: number, leader: Player): void {
    // Refresh / pick an expansion target adjacent to this region that the
    // leader doesn't already fully own.
    const adj = this._regionAdjacency[regionId];
    if (adj && adj.size > 0) {
      const choices: number[] = [];
      for (const a of adj) {
        if (this._regionOwner[a] !== leader.id) choices.push(a);
      }
      if (choices.length > 0) {
        this._vassalTarget[regionId] = choices[(Math.random() * choices.length) | 0]!;
      } else {
        this._vassalTarget[regionId] = 0;
      }
    }
    this._vassalBuild(regionId, leader);
  }

  private _vassalBuild(regionId: number, leader: Player): void {
    const reserve = this.config.VASSAL_GOLD_RESERVE;
    const tiles = this._tilesByRegion[regionId];
    if (!tiles || tiles.length === 0) return;
    const W = this.territory.width;

    // 1. Try a turret on an enemy-bordering tile if we can spare it.
    const turretCost = this.config.BUILDING_COSTS.turret;
    if (leader.gold >= reserve + turretCost) {
      for (const i of tiles) {
        if (this.territory.owners[i] !== leader.id) continue;
        const x = i % W, y = (i - x) / W;
        if (!this._hasEnemyNeighbor(x, y, leader.id)) continue;
        if (this.buildingAt(x, y)) continue;
        if (this.tryBuild('turret', x, y, leader.id) === null) return;
      }
    }
    // 2. A settlement on a safe interior tile if budget allows.
    const settCost = this.config.BUILDING_COSTS.settlement;
    if (leader.gold >= reserve + settCost) {
      for (const i of tiles) {
        if (this.territory.owners[i] !== leader.id) continue;
        const x = i % W, y = (i - x) / W;
        if (this._hasEnemyNeighbor(x, y, leader.id)) continue;
        if (this.buildingAt(x, y)) continue;
        if (this.tryBuild('settlement', x, y, leader.id) === null) return;
      }
    }
    // 3. An airstrip if there are no airstrips yet and we have plenty of gold.
    const airCost = this.config.BUILDING_COSTS.airstrip;
    if (leader.gold >= reserve + airCost && this.countBuildings(leader.id, 'airstrip') < 2) {
      for (const i of tiles) {
        if (this.territory.owners[i] !== leader.id) continue;
        const x = i % W, y = (i - x) / W;
        if (this._hasEnemyNeighbor(x, y, leader.id)) continue;
        if (this.buildingAt(x, y)) continue;
        if (this.tryBuild('airstrip', x, y, leader.id) === null) return;
      }
    }
  }

  private _hasEnemyNeighbor(x: number, y: number, ownerId: PlayerId): boolean {
    const dirs: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const o = this.territory.getOwner(x + dx, y + dy);
      if (o > 0 && o !== ownerId) return true;
    }
    return false;
  }

  private _aiThink(p: Player): void {
    if (this.tickCount % this.config.AI_RETARGET_TICKS !== 0 && p.targetRegion != null) return;
    p.targetRegion = this._pickAiTargetRegion(p.id);
  }

  // Pick a region for an AI to push into: prefer regions adjacent to its
  // current territory that aren't already fully owned. Falls back to a random
  // region if none are adjacent.
  private _pickAiTargetRegion(playerId: PlayerId): number | null {
    if (this.regionCount <= 0) return null;
    const adjacent = this._adjacentRegions(playerId);
    if (adjacent.size > 0) {
      const arr = Array.from(adjacent);
      return arr[(Math.random() * arr.length) | 0]!;
    }
    return 1 + ((Math.random() * this.regionCount) | 0);
  }

  // Region IDs touching the player's frontier (incl. tiles currently owned by
  // someone else) — i.e. regions the player can push into right now.
  private _adjacentRegions(playerId: PlayerId): Set<number> {
    const out = new Set<number>();
    const W = this.territory.width;
    const frontier = this.territory.getFrontier(playerId);
    const dirs: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const i of frontier) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!this.territory.inBounds(nx, ny)) continue;
        const own = this.territory.getOwner(nx, ny);
        if (own === playerId) continue;
        const r = this.regions[ny * W + nx]!;
        if (r > 0) out.add(r);
      }
    }
    return out;
  }

  // Region-bounded expansion. Each frontier tile picks its own effective
  // target region:
  //   - If the player has set a manual override (p.targetRegion), every
  //     frontier tile uses that.
  //   - Otherwise, frontier tiles inside a region the player FULLY owns
  //     (a vassal region) use that vassal's autonomous target.
  //   - Frontier tiles in partially-owned regions stay idle when there's
  //     no override (the player must tap to push there).
  // Combat math (troop ratio, turret defense) is unchanged.
  private _expand(p: Player): void {
    const frontier = this.territory.getFrontier(p.id);
    if (frontier.size === 0) return;
    const W = this.territory.width;
    const baseChance = this.config.EXPANSION_CHANCE_PER_FRONTIER_TILE;
    const overrideTarget = p.targetRegion;

    const tiles = Array.from(frontier);
    for (let k = 0; k < tiles.length; k++) {
      if (p.gold < this.config.EXPANSION_COST_PER_CLAIM) break;
      const i = tiles[k]!;
      const x = i % W;
      const y = (i - x) / W;

      // Resolve the target region for THIS tile:
      //   override > vassal target (if tile is in a vassal of p) > skip
      let effectiveTarget = overrideTarget;
      if (effectiveTarget == null) {
        const tileRegion = this.regions[i]!;
        if (tileRegion > 0 && this._regionOwner[tileRegion] === p.id) {
          const vt = this._vassalTarget[tileRegion];
          if (vt && vt > 0) effectiveTarget = vt;
        }
      }
      if (effectiveTarget == null) continue;

      const cands = this._validTargets(x, y, p.id);
      if (cands.length === 0) continue;

      const inRegion: ExpansionCandidate[] = [];
      for (const c of cands) {
        if (this.regions[c.y * W + c.x] === effectiveTarget) inRegion.push(c);
      }
      if (inRegion.length === 0) continue;
      const chosen = inRegion[(Math.random() * inRegion.length) | 0]!;

      const targetOwner = this.territory.getOwner(chosen.x, chosen.y);
      if (targetOwner === 0) {
        if (Math.random() > baseChance) continue;
        if (p.gold < this.config.EXPANSION_COST_PER_CLAIM) continue;
        if (p.troops < this.config.EXPANSION_TROOP_COST) continue;
        if (this.tryCapture(chosen.x, chosen.y, p.id)) {
          p.gold -= this.config.EXPANSION_COST_PER_CLAIM;
          p.troops = Math.max(0, p.troops - this.config.EXPANSION_TROOP_COST);
        }
      } else {
        const def = this._defenseAt(chosen.x, chosen.y, targetOwner);
        const cost = this.config.ATTACK_COST_PER_CLAIM * (1 + def);
        const defender = this.players[targetOwner];
        const defTroops = Math.max(1, defender?.troops ?? 1);
        const ratio = p.troops / defTroops;
        const ratioFactor = Math.max(
          this.config.ATTACK_RATIO_MIN,
          Math.min(
            this.config.ATTACK_RATIO_MAX,
            Math.pow(ratio, this.config.ATTACK_RATIO_EXP),
          ),
        );
        const rate = baseChance * this.config.ATTACK_RATE_MULT * ratioFactor / (1 + def);
        if (Math.random() > rate) continue;
        if (p.gold < cost) continue;
        if (p.troops < this.config.TROOP_COST_PER_ATTACK) continue;
        if (this.tryCapture(chosen.x, chosen.y, p.id)) {
          p.gold -= cost;
          p.troops = Math.max(0, p.troops - this.config.TROOP_COST_PER_ATTACK);
          if (defender) {
            defender.troops = Math.max(0, defender.troops - this.config.TROOP_DAMAGE_PER_ATTACK);
          }
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
    // Fully-owned region: every tile inside the region gets a flat fortress
    // bonus on top of any turrets, simulating the "walls + reinforcement"
    // benefit of holding the whole district.
    if (this.regionCount > 0) {
      const r = this.regions[y * this.territory.width + x]!;
      if (r > 0 && this._regionOwner[r] === defenderId) {
        bonus += this.config.FULL_REGION_DEFENSE_BONUS;
      }
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


  private _checkVictory(): void {
    if (this.outcome) return;
    if (this.totalLand <= 0) return;
    const threshold = Math.ceil(this.totalLand * this.config.WIN_TERRITORY_FRACTION);

    // Find the player with the most land. If they're past the threshold, the
    // game is over.
    let bestId = -1, bestCount = -1;
    for (let id = 1; id < this.players.length; id++) {
      const c = this.territory.counts[id]!;
      if (c > bestCount) { bestCount = c; bestId = id; }
    }
    if (bestId > 0 && bestCount >= threshold) {
      const outcome: 'victory' | 'defeat' = (bestId === this.human().id) ? 'victory' : 'defeat';
      this.outcome = outcome;
      this.events.push({ type: 'gameover', outcome, winner: bestId });
      return;
    }
    // Soft-end: if the human has been wiped out (and a few seconds have
    // passed so it's not a startup glitch), they have no way back in. Show
    // defeat with the current strongest player credited.
    if (this.tickCount > 30 && this.territory.counts[this.human().id] === 0 && bestId > 0) {
      this.outcome = 'defeat';
      this.events.push({ type: 'gameover', outcome: 'defeat', winner: bestId });
    }
  }
}
