import type { GameConfig } from './config.js';
import type {
  Player, PlayerId, Capital, Building, BuildingType, BombType, GameEvent,
  GameOutcome, BuildError, BombError, Point,
} from './types.js';
import { TERRAIN_LAND } from './types.js';
import { Territory } from './territory.js';
import { generateTerrain } from './terrain.js';
import { generateRegions } from './regions.js';
import { generateRegionNames } from './names.js';

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
  /** Player ID with strict majority (>50% of tiles) in each region. Drives
   *  vassal autonomy — a vassal stays in charge while it holds the majority
   *  even if the region isn't 100% cleared. */
  private _regionDominant!: Uint8Array;
  /** Random country-style name per region ("Kingdom of …"). Set at boot. */
  regionNames: string[] = [];
  /** Random country-style name per player (their "empire"). Set at boot.
   *  Index 0 is unused (matches player IDs starting at 1). */
  playerEmpireNames: string[] = [];
  /** Vassal target region for each region (0 = idle). Used as the
   *  autonomous expansion target for tiles inside that vassal region when
   *  the leader hasn't issued a manual override. */
  private _vassalTarget!: Uint16Array;
  /** Per-vassal gold pool. Independent from leader.gold — region income
   *  flows here (minus tribute), and vassal-driven builds spend from here. */
  private _vassalGold!: Float32Array;
  /** Tile indices grouped by region. */
  private _tilesByRegion!: number[][];
  /** Set of region IDs that border each region (incl. across the map edge). */
  private _regionAdjacency!: Set<number>[];

  /** Returns the player ID who fully owns this region, or 0. */
  regionOwnerOf(regionId: number): PlayerId {
    return this._regionOwner?.[regionId] ?? 0;
  }

  /** Returns the player ID with strict majority (>50% tiles) in this region,
   *  or 0 if no one has a majority. This is the "vassal lord" — they keep
   *  agency even when the region isn't fully cleared. */
  regionDominantOwnerOf(regionId: number): PlayerId {
    return this._regionDominant?.[regionId] ?? 0;
  }

  /** Random country-style name for this region (e.g. "Kingdom of Bhutan"). */
  regionNameOf(regionId: number): string {
    return this.regionNames[regionId] ?? '';
  }

  /** Random country-style name for a player's empire (their realm name). */
  playerEmpireNameOf(playerId: PlayerId): string {
    return this.playerEmpireNames[playerId] ?? '';
  }

  /** Centroid (in tile coordinates) of a region's tiles, or null if empty. */
  regionCentroidOf(regionId: number): { x: number; y: number } | null {
    const tiles = this._tilesByRegion?.[regionId];
    if (!tiles || tiles.length === 0) return null;
    const W = this.territory.width;
    let cx = 0, cy = 0;
    for (const i of tiles) { cx += i % W; cy += (i - (i % W)) / W; }
    return { x: cx / tiles.length, y: cy / tiles.length };
  }

  /** Returns the autonomous expansion target for a region's vassal, or 0. */
  vassalTargetOf(regionId: number): number {
    return this._vassalTarget?.[regionId] ?? 0;
  }

  /** Returns the gold balance held by a region's vassal (0 if no vassal). */
  vassalGoldOf(regionId: number): number {
    return this._vassalGold?.[regionId] ?? 0;
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
    this._regionDominant = new Uint8Array(this.regionCount + 1);
    this._vassalTarget = new Uint16Array(this.regionCount + 1);
    this._vassalGold = new Float32Array(this.regionCount + 1);
    this.regionNames = generateRegionNames(this.regionCount);
    // One empire-name per player (1..N); index 0 unused.
    this.playerEmpireNames = generateRegionNames(this.players.length - 1);
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
      if (!p) continue;
      const t = this._pickAiTargetRegion(p.id);
      p.targetRegions = (t != null && t > 0) ? [t] : [];
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
            // Wake the vassal up immediately so it has a target on the
            // very next expansion tick instead of waiting for the next
            // VASSAL_THINK_INTERVAL boundary.
            const player = this.players[newOwner];
            if (player && player.isHuman) this._vassalTickFor(r, player);
          }
        }
        // Recompute who has the strict-majority foothold in this region. The
        // dominant owner drives vassal autonomy (they keep agency even
        // through invasion and partial loss).
        this._recomputeDominant(r);
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
   * Tap-to-toggle: tapping a region adds it to the player's manual target
   * list (parallel attack); tapping the same region again removes it.
   * Returns the region ID at the tap, or 0 if the tap was on water/oob.
   * Manual targets only drive non-vassal tiles — vassals keep their own
   * autonomous target so your push doesn't pull them off their job.
   */
  setHumanTargetRegion(x: number, y: number): number {
    const p = this.human();
    if (!p.alive) return 0;
    const r = this.regionAt(x, y);
    if (r <= 0) return 0;
    const idx = p.targetRegions.indexOf(r);
    if (idx >= 0) p.targetRegions.splice(idx, 1);
    else p.targetRegions.push(r);
    p.expanding = p.targetRegions.length > 0;
    return r;
  }

  haltHuman(): void {
    const p = this.human();
    p.targetRegions = [];
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
  /**
   * Build a building. If `fromVassalRegion` > 0, the cost is paid from that
   * vassal's gold pool (used by autonomous vassal builds). Default 0 means
   * the cost is paid from the player's main gold pool (manual builds).
   */
  tryBuild(type: BuildingType, x: number, y: number, ownerId: PlayerId, fromVassalRegion = 0): BuildError | null {
    const cost = this.config.BUILDING_COSTS[type];
    if (cost == null) return 'bad-type';
    if (!this.territory.inBounds(x, y)) return 'oob';
    const owner = this.players[ownerId];
    if (!owner || !owner.alive) return 'dead';
    if (this.territory.getOwner(x, y) !== ownerId) return 'not-yours';
    if (this.buildingAt(x, y)) return 'occupied';
    if (this._capitalIndexAt(x, y) >= 0) return 'on-capital';
    if (fromVassalRegion > 0) {
      if ((this._vassalGold[fromVassalRegion] ?? 0) < cost) return 'gold';
      this._vassalGold[fromVassalRegion]! -= cost;
    } else {
      if (owner.gold < cost) return 'gold';
      owner.gold -= cost;
    }
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
  dropBomb(type: BombType, x: number, y: number, ownerId: PlayerId, fromVassalRegion = 0): BombError | null {
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
    if (fromVassalRegion > 0) {
      if ((this._vassalGold[fromVassalRegion] ?? 0) < cost) return 'gold';
      this._vassalGold[fromVassalRegion]! -= cost;
    } else {
      if (owner.gold < cost) return 'gold';
      owner.gold -= cost;
    }
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
    // Turret retaliation: BEFORE the claim, count defending turrets in range
    // and bleed the attacker's troop pool by RETALIATION × turrets. Turrets
    // bite back — every successful capture inside a defender's turret radius
    // costs the attacker extra population.
    if (defender > 0) {
      const r2 = this.config.TURRET_RADIUS * this.config.TURRET_RADIUS;
      let retaliation = 0;
      for (const b of this.buildings) {
        if (b.type !== 'turret') continue;
        if (b.owner !== defender) continue;
        const dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy <= r2) retaliation += this.config.TURRET_RETALIATION_DAMAGE;
      }
      if (retaliation > 0) {
        const attacker = this.players[attackerId];
        if (attacker) attacker.troops = Math.max(0, attacker.troops - retaliation);
      }
    }
    if (!this._claim(x, y, attackerId)) return false;
    this._destroyBuildingsAt(x, y);
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
      targetRegions: [],
      productionStacks: 0,
      expanding: !isHuman,
    };
  }

  // --- Commander decrees ---

  /** Buy a permanent +DECREE_PRODUCTION_BOOST income stack. Returns
   *  null on success, 'gold' on insufficient funds. */
  buyProductionDecree(playerId: PlayerId): 'gold' | 'dead' | null {
    const p = this.players[playerId];
    if (!p || !p.alive) return 'dead';
    const cost = this.config.DECREE_PRODUCTION_COST;
    if (p.gold < cost) return 'gold';
    p.gold -= cost;
    p.productionStacks = (p.productionStacks ?? 0) + 1;
    return null;
  }

  /** Buy a one-shot Conscription Decree: instant troops boost. */
  buyConscriptDecree(playerId: PlayerId): 'gold' | 'dead' | null {
    const p = this.players[playerId];
    if (!p || !p.alive) return 'dead';
    const cost = this.config.DECREE_CONSCRIPT_COST;
    if (p.gold < cost) return 'gold';
    p.gold -= cost;
    p.troops += this.config.DECREE_CONSCRIPT_TROOPS;
    return null;
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
    // Tile-level income with per-vassal accounting:
    //   - If the tile sits in a region the HUMAN owner is the dominant
    //     majority of, route gold to the vassal's pool, with a
    //     VASSAL_TRIBUTE_FRACTION slice forwarded to the leader.
    //   - Otherwise (non-vassal tiles, AI tiles): straight to player.gold.
    const owners = this.territory.owners;
    const mult = this.goldMultiplier;
    const base = this.config.GOLD_PER_TILE_PER_TICK;
    const tributeFrac = this.config.VASSAL_TRIBUTE_FRACTION;
    const N = owners.length;
    const players = this.players;
    const regions = this.regions;
    const dominant = this._regionDominant;
    const vGold = this._vassalGold;
    const decreeBoost = this.config.DECREE_PRODUCTION_BOOST;
    for (let i = 0; i < N; i++) {
      const id = owners[i]!;
      if (id === 0) continue;
      const p = players[id];
      if (!p || !p.alive) continue;
      const decreeMult = 1 + decreeBoost * (p.productionStacks ?? 0);
      const tileGold = base * (1 + mult[i]!) * decreeMult;
      const r = regions[i]!;
      if (p.isHuman && r > 0 && dominant[r] === id) {
        const tribute = tileGold * tributeFrac;
        vGold[r]! += tileGold - tribute;
        p.gold += tribute;
      } else {
        p.gold += tileGold;
      }
    }
    // Flat per-settlement income (in addition to the radius multiplier).
    const flatGold = this.config.SETTLEMENT_GOLD_BONUS;
    if (flatGold > 0) {
      const W = this.territory.width;
      for (const b of this.buildings) {
        if (b.type !== 'settlement') continue;
        const p = players[b.owner];
        if (!p || !p.alive) continue;
        const r = regions[b.y * W + b.x]!;
        if (p.isHuman && r > 0 && dominant[r] === b.owner) {
          const tribute = flatGold * tributeFrac;
          vGold[r]! += flatGold - tribute;
          p.gold += tribute;
        } else {
          p.gold += flatGold;
        }
      }
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
      if (!player.isHuman) continue;
      // Mutual defense: figure out who's invading our vassals the most this
      // moment. _vassalRetarget will boost adjacent regions that belong to
      // this attacker, so OTHER vassals redirect pressure toward them when
      // any one of ours is under siege.
      const threatPlayer = this._findGreatestThreatTo(player.id);
      for (let r = 1; r <= this.regionCount; r++) {
        if (this._regionDominant[r] !== player.id) continue;
        if (((this.tickCount + r * 7) % interval) !== 0) continue;
        this._vassalTickFor(r, player, threatPlayer);
      }
    }
  }

  // Tally every non-leader-owned tile inside the leader's vassal regions,
  // bucketed by attacker. Returns the worst offender (or 0 if no real
  // pressure). Threshold avoids reacting to single-tile probes.
  private _findGreatestThreatTo(playerId: PlayerId): PlayerId {
    const counts = new Int32Array(256);
    for (let r = 1; r <= this.regionCount; r++) {
      if (this._regionDominant[r] !== playerId) continue;
      const tiles = this._tilesByRegion[r];
      if (!tiles) continue;
      for (const i of tiles) {
        const o = this.territory.owners[i]!;
        if (o > 0 && o !== playerId) counts[o]!++;
      }
    }
    let bestId: PlayerId = 0, bestCount = 0;
    for (let id = 1; id < 256; id++) {
      if (counts[id]! > bestCount) { bestCount = counts[id]!; bestId = id; }
    }
    return bestCount >= 8 ? bestId : 0;
  }

  private _vassalTickFor(regionId: number, leader: Player, threatPlayer: PlayerId = 0): void {
    this._vassalRetarget(regionId, leader, threatPlayer);
    this._vassalBuild(regionId, leader);
    this._vassalMaybeBomb(regionId, leader);
  }

  // Priority order (higher score wins):
  //   - Pure-neutral region (≥95% unclaimed): score 5000 — no-brainer.
  //   - Mostly neutral: score 1000+. Easy wins.
  //   - Weak enemy adjacent: medium score.
  //   - Mutual-defense bonus: +800 to any adjacent region whose dominant
  //     owner is the player invading our other vassals (relieves pressure
  //     by redirecting elsewhere on their territory).
  // Reclaim self-targeting only triggers when at least 10% of OUR region
  // has been lost; trivial 1-tile probes don't pull us off offense.
  private _vassalRetarget(regionId: number, leader: Player, threatPlayer: PlayerId = 0): void {
    const ownTiles = this._tilesByRegion[regionId];
    if (ownTiles && ownTiles.length > 0) {
      let invaded = 0;
      for (const i of ownTiles) {
        const o = this.territory.owners[i];
        if (o !== 0 && o !== leader.id) invaded++;
      }
      const reclaimThreshold = Math.max(2, Math.floor(ownTiles.length * 0.10));
      if (invaded >= reclaimThreshold) {
        this._vassalTarget[regionId] = regionId;
        return;
      }
    }

    const adj = this._regionAdjacency[regionId];
    if (!adj || adj.size === 0) {
      this._vassalTarget[regionId] = 0;
      return;
    }
    let bestRegion = 0;
    let bestScore = -Infinity;
    for (const r of adj) {
      if (this._regionOwner[r] === leader.id) continue;
      const tiles = this._tilesByRegion[r];
      if (!tiles || tiles.length === 0) continue;

      let unclaimed = 0;
      let dominantEnemy: PlayerId = 0;
      const counts = new Int32Array(256);
      for (const i of tiles) {
        const o = this.territory.owners[i]!;
        if (o === 0) unclaimed++;
        counts[o]!++;
      }
      let domCount = 0;
      for (let o = 1; o < 256; o++) {
        if (o === leader.id) continue;
        if (counts[o]! > domCount) { domCount = counts[o]!; dominantEnemy = o; }
      }
      const neutralFrac = unclaimed / tiles.length;

      let score: number;
      if (neutralFrac >= 0.95) {
        // Practically empty — top priority no-brainer.
        score = 5000;
      } else if (neutralFrac >= 0.4) {
        score = 1000 + neutralFrac * 200;
      } else if (dominantEnemy > 0) {
        const enemy = this.players[dominantEnemy];
        const enemyTroops = enemy?.troops ?? 1;
        score = 500 - Math.log10(enemyTroops + 1) * 80 - domCount * 0.5 + neutralFrac * 100;
      } else {
        // Empty region (all unclaimed). Treat as neutral.
        score = 1100;
      }
      // Mutual defense: redirect pressure toward the bully invading our other
      // vassals. Adjacent regions belonging to the threat player get a big
      // boost so multiple vassals collectively converge on the offender.
      if (threatPlayer > 0 && dominantEnemy === threatPlayer) {
        score += 800;
      }
      if (score > bestScore) {
        bestScore = score;
        bestRegion = r;
      }
    }
    this._vassalTarget[regionId] = bestRegion;
  }

  // Priority chain: defend, set up offense, expand economy. All build costs
  // come out of THIS vassal's own gold pool now, not the leader's.
  private _vassalBuild(regionId: number, leader: Player): void {
    const reserve = this.config.VASSAL_GOLD_RESERVE;
    const tiles = this._tilesByRegion[regionId];
    if (!tiles || tiles.length === 0) return;
    const W = this.territory.width;
    const vGold = this._vassalGold[regionId] ?? 0;

    const exposed: number[] = [];
    const safe: number[] = [];
    for (const i of tiles) {
      if (this.territory.owners[i] !== leader.id) continue;
      const x = i % W, y = (i - x) / W;
      if (this.buildingAt(x, y)) continue;
      if (this._hasEnemyNeighbor(x, y, leader.id)) exposed.push(i);
      else safe.push(i);
    }

    // 1. THREAT: turret on the most-pressured exposed tile.
    const turretCost = this.config.BUILDING_COSTS.turret;
    if (exposed.length > 0 && vGold >= reserve + turretCost) {
      const spot = this._pickBestTurretSpot(exposed, leader.id);
      if (spot >= 0) {
        const x = spot % W, y = (spot - x) / W;
        if (this.tryBuild('turret', x, y, leader.id, regionId) === null) {
          this.events.push({ type: 'vassal-built', regionId, ownerId: leader.id, buildingType: 'turret' });
          return;
        }
      }
    }

    // 2. OFFENSE: airstrip near the target if we have an enemy in our sights.
    const airCost = this.config.BUILDING_COSTS.airstrip;
    const targetRegion = this._vassalTarget[regionId] ?? 0;
    const targetDom = targetRegion > 0 ? this._dominantOwnerInRegion(targetRegion) : 0;
    const targetIsEnemy = targetRegion > 0 && targetDom > 0 && targetDom !== leader.id;
    if (targetIsEnemy && this.countBuildings(leader.id, 'airstrip') < 2 &&
        safe.length > 0 && vGold >= reserve + airCost) {
      const spot = this._pickAirstripSpot(safe, targetRegion, leader.id);
      if (spot >= 0) {
        const x = spot % W, y = (spot - x) / W;
        if (this.tryBuild('airstrip', x, y, leader.id, regionId) === null) {
          this.events.push({ type: 'vassal-built', regionId, ownerId: leader.id, buildingType: 'airstrip' });
          return;
        }
      }
    }

    // 3. ECONOMY: settlements whenever affordable, spread out from existing.
    const settCost = this.config.BUILDING_COSTS.settlement;
    if (safe.length > 0 && vGold >= reserve + settCost) {
      const spot = this._pickSettlementSpot(safe, leader.id);
      if (spot >= 0) {
        const x = spot % W, y = (spot - x) / W;
        if (this.tryBuild('settlement', x, y, leader.id, regionId) === null) {
          this.events.push({ type: 'vassal-built', regionId, ownerId: leader.id, buildingType: 'settlement' });
          return;
        }
      }
    }
  }

  // Drop a bomb on a dense enemy cluster inside the vassal's target region —
  // softens the target before the push. Only fires when the leader can spare
  // the gold and an airstrip is off cooldown.
  private _vassalMaybeBomb(regionId: number, leader: Player): void {
    const ready = this.airstripReadyAt(leader.id);
    if (ready < 0 || ready > this.tickCount) return;
    const targetRegion = this._vassalTarget[regionId];
    if (!targetRegion) return;
    const targetTiles = this._tilesByRegion[targetRegion];
    if (!targetTiles || targetTiles.length === 0) return;

    // Choose bomb size by what the VASSAL can comfortably afford from its
    // own pool (not the leader's). Keep a healthy reserve so we don't
    // bottom out our own bank on a single bomb.
    const vGold = this._vassalGold[regionId] ?? 0;
    let bombType: BombType | null = null;
    const smallCost = this.config.BOMB_COSTS.small;
    const largeCost = this.config.BOMB_COSTS.large;
    if (vGold >= 100 + largeCost) bombType = 'large';
    else if (vGold >= 60 + smallCost) bombType = 'small';
    if (!bombType) return;
    const radius = this.config.BOMB_RADII[bombType];

    // Sample the target region for the densest enemy cluster within bomb range.
    const W = this.territory.width;
    const r2 = radius * radius;
    let bestX = -1, bestY = -1, bestEnemies = 0;
    const sampleStep = Math.max(1, Math.floor(targetTiles.length / 36));
    for (let k = 0; k < targetTiles.length; k += sampleStep) {
      const i = targetTiles[k]!;
      const x = i % W, y = (i - x) / W;
      let enemies = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const o = this.territory.getOwner(x + dx, y + dy);
          if (o > 0 && o !== leader.id) enemies++;
        }
      }
      if (enemies > bestEnemies) { bestEnemies = enemies; bestX = x; bestY = y; }
    }

    // Don't waste a bomb on a sparse target. Require enough enemies under it.
    const tilesInArea = Math.PI * r2;
    const minEnemies = Math.floor(tilesInArea * (bombType === 'large' ? 0.35 : 0.45));
    if (bestEnemies < minEnemies || bestX < 0) return;

    if (this.dropBomb(bombType, bestX, bestY, leader.id, regionId) === null) {
      this.events.push({ type: 'vassal-bombed', regionId, ownerId: leader.id, bombType, x: bestX, y: bestY });
    }
  }

  private _pickBestTurretSpot(exposed: number[], ownerId: PlayerId): number {
    const W = this.territory.width;
    let best = -1, bestScore = 0;
    for (const i of exposed) {
      const x = i % W, y = (i - x) / W;
      let enemies = 0;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const o = this.territory.getOwner(x + dx, y + dy);
          if (o > 0 && o !== ownerId) enemies++;
        }
      }
      // Penalise sites that already have a turret nearby — don't stack.
      let nearbyTurrets = 0;
      for (const b of this.buildings) {
        if (b.type !== 'turret' || b.owner !== ownerId) continue;
        const dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < 9) nearbyTurrets++;
      }
      const score = enemies - nearbyTurrets * 8;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  private _pickSettlementSpot(safe: number[], ownerId: PlayerId): number {
    const W = this.territory.width;
    let best = -1, bestDist = -1;
    for (const i of safe) {
      const x = i % W, y = (i - x) / W;
      let nearestSettleSq = Infinity;
      for (const b of this.buildings) {
        if (b.type !== 'settlement' || b.owner !== ownerId) continue;
        const dx = b.x - x, dy = b.y - y;
        const d = dx * dx + dy * dy;
        if (d < nearestSettleSq) nearestSettleSq = d;
      }
      // Prefer farther from existing settlements (spread out).
      if (nearestSettleSq > bestDist) { bestDist = nearestSettleSq; best = i; }
    }
    return best;
  }

  private _pickAirstripSpot(safe: number[], targetRegion: number, ownerId: PlayerId): number {
    void ownerId;
    const W = this.territory.width;
    const targetTiles = this._tilesByRegion[targetRegion];
    if (!targetTiles || targetTiles.length === 0) return safe[0] ?? -1;
    // Centroid of the target region (where bombs should reach).
    let cx = 0, cy = 0;
    for (const i of targetTiles) {
      cx += i % W;
      cy += (i - (i % W)) / W;
    }
    cx /= targetTiles.length;
    cy /= targetTiles.length;
    // Pick the safe tile closest to that centroid so bombs stay in range.
    let best = -1, bestSq = Infinity;
    for (const i of safe) {
      const x = i % W, y = (i - x) / W;
      const dx = cx - x, dy = cy - y;
      const d = dx * dx + dy * dy;
      if (d < bestSq) { bestSq = d; best = i; }
    }
    return best;
  }

  private _dominantOwnerInRegion(regionId: number): PlayerId {
    const tiles = this._tilesByRegion[regionId];
    if (!tiles || tiles.length === 0) return 0;
    const counts = new Int32Array(256);
    for (const i of tiles) counts[this.territory.owners[i]!]!++;
    let best: PlayerId = 0, bestC = 0;
    for (let o = 1; o < 256; o++) {
      if (counts[o]! > bestC) { bestC = counts[o]!; best = o; }
    }
    return best;
  }

  // Re-scans tile counts in a region to set _regionDominant — the player
  // (if any) holding strict majority. Called from _claim on every flip;
  // 256 ops per call is trivial. When dominance flips to a NEW human owner,
  // we wake their vassal AI immediately so it can pick a target on the
  // next expansion tick instead of waiting up to VASSAL_THINK_INTERVAL.
  private _recomputeDominant(regionId: number): void {
    const total = this._regionTotal[regionId]!;
    if (total === 0) { this._regionDominant[regionId] = 0; return; }
    let bestOwner = 0, bestCount = 0;
    const base = regionId * 256;
    for (let o = 1; o < 256; o++) {
      const c = this._regionOwnedTiles[base + o]!;
      if (c > bestCount) { bestCount = c; bestOwner = o; }
    }
    const newDom: PlayerId = (bestCount * 2 > total) ? bestOwner : 0;
    const oldDom = this._regionDominant[regionId]!;
    this._regionDominant[regionId] = newDom;
    if (newDom !== oldDom && newDom > 0) {
      const player = this.players[newDom];
      if (player && player.isHuman) this._vassalTickFor(regionId, player);
    }
  }

  // Of a list of candidate target regions, returns the one whose centroid
  // is closest to (x, y) — used to spread non-vassal frontier tiles
  // across multiple parallel manual attacks.
  private _pickClosestTarget(x: number, y: number, candidates: readonly number[]): number {
    let best = 0, bestSq = Infinity;
    for (const r of candidates) {
      const c = this.regionCentroidOf(r);
      if (!c) continue;
      const dx = c.x - x, dy = c.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestSq) { bestSq = d; best = r; }
    }
    return best;
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
    if (this.tickCount % this.config.AI_RETARGET_TICKS !== 0 && p.targetRegions.length > 0) return;
    const t = this._pickAiTargetRegion(p.id);
    p.targetRegions = (t != null && t > 0) ? [t] : [];
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
  //   - VASSAL TILE (tile in a region where this player is the dominant
  //     owner): use the vassal's autonomous target. Manual override does
  //     NOT apply here — vassals keep working on their own job no matter
  //     how many manual fronts the leader is running.
  //   - NON-VASSAL TILE: use the closest manual target from
  //     p.targetRegions. Stays idle if the player has no manual targets.
  //   - If a vassal tile has no vassal target yet (transient at game
  //     start), it falls back to the closest manual target.
  private _expand(p: Player): void {
    const frontier = this.territory.getFrontier(p.id);
    if (frontier.size === 0) return;
    const W = this.territory.width;
    const baseChance = this.config.EXPANSION_CHANCE_PER_FRONTIER_TILE;
    const manualTargets = p.targetRegions;

    const tiles = Array.from(frontier);
    for (let k = 0; k < tiles.length; k++) {
      if (p.gold < this.config.EXPANSION_COST_PER_CLAIM) break;
      const i = tiles[k]!;
      const x = i % W;
      const y = (i - x) / W;

      let effectiveTarget: number | undefined;
      let isVassalDriven = false;
      const tileRegion = this.regions[i]!;
      const isVassal = tileRegion > 0 && this._regionDominant[tileRegion] === p.id;
      if (isVassal) {
        const vt = this._vassalTarget[tileRegion];
        if (vt && vt > 0) {
          effectiveTarget = vt;
          isVassalDriven = true;
        }
      }
      if (effectiveTarget == null && manualTargets.length > 0) {
        effectiveTarget = manualTargets.length === 1
          ? manualTargets[0]!
          : this._pickClosestTarget(x, y, manualTargets);
      }
      if (effectiveTarget == null) continue;
      // Vassals push more eagerly than the player's manual orders.
      const tileChance = isVassalDriven
        ? baseChance * this.config.VASSAL_EXPANSION_BOOST
        : baseChance;

      const cands = this._validTargets(x, y, p.id);
      if (cands.length === 0) continue;

      // Tier 1: neighbors inside the effective target region (focused push).
      // Tier 2: any unclaimed neighbor — opportunistic free-land grab so a
      //         vassal sitting between two neutral regions DOES expand into
      //         the one its target isn't, instead of idling.
      // Tier 3: any candidate at all — guarantees a manual tap on a non-
      //         adjacent region still produces SOME forward motion.
      let pool: ExpansionCandidate[] = [];
      for (const c of cands) {
        if (this.regions[c.y * W + c.x] === effectiveTarget) pool.push(c);
      }
      if (pool.length === 0) {
        for (const c of cands) {
          if (this.territory.getOwner(c.x, c.y) === 0) pool.push(c);
        }
      }
      if (pool.length === 0) pool = cands;
      const chosen = pool[(Math.random() * pool.length) | 0]!;

      const targetOwner = this.territory.getOwner(chosen.x, chosen.y);
      if (targetOwner === 0) {
        if (Math.random() > tileChance) continue;
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
        const rate = tileChance * this.config.ATTACK_RATE_MULT * ratioFactor / (1 + def);
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
