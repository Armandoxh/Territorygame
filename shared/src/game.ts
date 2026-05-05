import type { GameConfig } from './config.js';
import type {
  Player, PlayerId, Capital, Building, BuildingType, BombType, GameEvent,
  GameOutcome, BuildError, BombError, Point,
  Ship, ShipKind, ShipBuildError,
  Plane,
} from './types.js';
import { TERRAIN_LAND } from './types.js';
import { Territory } from './territory.js';
import { generateTerrain } from './terrain.js';
import { generateRegions } from './regions.js';
import { generateRegionNames } from './names.js';
import { decreeById } from './decrees.js';
import { abilityById } from './abilities.js';
import type { AbilityError } from './abilities.js';
import { masteryById, type Mastery } from './mastery.js';

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
  readonly ships: Ship[] = [];
  private _shipNextId = 1;
  readonly planes: Plane[] = [];
  private _planeNextId = 1;
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
  /** Per-region morale (0..1). Drops when bombs wipe tiles inside the
   *  region, recovers slowly each tick. Multiplies into per-region
   *  combat power so a bombed-out vassal genuinely fights weaker. */
  private _regionMorale!: Float32Array;

  /** Per-tile cached turret defense bonus per defender. Allocated lazily
   *  per active defender (full 256-player buffer would be 150 MB on a
   *  384×384 map). Rebuilt only when buildings/decrees change. */
  private _turretBonus = new Map<PlayerId, Float32Array>();
  /** Per-tile cached turret retaliation per defender. */
  private _turretRetal = new Map<PlayerId, Float32Array>();
  /** Set when buildings change; we rebuild the caches lazily on next read. */
  private _turretCacheDirty = true;
  /** Reusable scratch arrays so tick paths don't allocate. */
  private readonly _scratch256a = new Float32Array(256);
  private readonly _scratch256b = new Int32Array(256);
  private readonly _scratch256c = new Int32Array(256);

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

  /** Per-region visibility for this player and their allies, recomputed
   *  on demand. Returns Uint8Array of length regionCount+1 where:
   *    0 = hidden (fog), 1 = partial (half-fog), 2 = full visible
   *  Rules:
   *    - regions you have ANY tile in or your allies have any tile in → 2
   *    - regions adjacent to a level-2 region → 2 (you border them)
   *    - regions adjacent to a level-2 region (but not already 2) → 1
   *      (you can see "half of the one behind it") */
  visibilityForPlayer(playerId: PlayerId): Uint8Array {
    const out = new Uint8Array(this.regionCount + 1);
    const allies = new Set<PlayerId>([playerId, ...this.alliesOf(playerId)]);
    // Level 2 — regions you or your allies have presence in.
    const W = this.territory.width;
    const owners = this.territory.owners;
    for (let i = 0; i < owners.length; i++) {
      const o = owners[i]!;
      if (o > 0 && allies.has(o)) {
        const r = this.regions[i]!;
        if (r > 0) out[r] = 2;
      }
    }
    // Level 2 again — regions adjacent to a presence region.
    const presence: number[] = [];
    for (let r = 1; r <= this.regionCount; r++) if (out[r] === 2) presence.push(r);
    for (const r of presence) {
      const adj = this._regionAdjacency[r];
      if (!adj) continue;
      for (const nr of adj) if (out[nr]! < 2) out[nr] = 2;
    }
    // Level 1 — regions adjacent to a level-2 region (one further hop).
    const visible: number[] = [];
    for (let r = 1; r <= this.regionCount; r++) if (out[r] === 2) visible.push(r);
    for (const r of visible) {
      const adj = this._regionAdjacency[r];
      if (!adj) continue;
      for (const nr of adj) if (out[nr] === 0) out[nr] = 1;
    }
    void W;
    return out;
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

  /** Morale of a region (0..1). 1 = full strength, drops on bomb damage. */
  regionMoraleOf(regionId: number): number {
    return this._regionMorale?.[regionId] ?? 1;
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
    this._regionMorale = new Float32Array(this.regionCount + 1).fill(1.0);
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
    this._recoverMorale();
    this._earnGoldAll();
    this._growTroops();
    this._vassalsThink();
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (!p || !p.alive) continue;
      if (!p.isHuman) {
        this._aiThink(p);
        this._aiBuild(p);
      }
      // Always attempt expansion. _expand falls through tile-by-tile and
      // skips tiles with no effective target (no override + non-vassal).
      this._expand(p);
    }
    this._shipsTick();
    this._planesTick();
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

  /** Count owner's buildings of a given type that sit inside `regionId`. */
  private _countBuildingsInRegion(regionId: number, ownerId: PlayerId, type: BuildingType): number {
    const W = this.territory.width;
    let n = 0;
    for (const b of this.buildings) {
      if (b.owner !== ownerId) continue;
      if (b.type !== type) continue;
      if (this.regions[b.y * W + b.x] !== regionId) continue;
      n++;
    }
    return n;
  }

  /** Cap on how many of a given building type one owner can squeeze into
   *  one region, scaled by region size so a 60-tile patch can't host an
   *  airstrip + turret farm. Manual builds are NOT capped — the cap is a
   *  guideline used by AI / vassal builders only. */
  private _regionBuildingCap(type: BuildingType, regionTiles: number): number {
    if (type === 'turret')     return 1 + Math.floor(regionTiles / 25);
    if (type === 'settlement') return 1 + Math.floor(regionTiles / 35);
    if (type === 'airstrip')   return 1 + Math.floor(regionTiles / 60);
    return 0;
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
    // Mastery gate. Settlement + turret are always available; airstrip
    // and AA require the AIR mastery.
    if (type === 'airstrip' && !this.isUnlocked(ownerId, 'airstrip')) return 'locked';
    if (type === 'aa' && !this.isUnlocked(ownerId, 'aa')) return 'locked';
    if (fromVassalRegion > 0) {
      if ((this._vassalGold[fromVassalRegion] ?? 0) < cost) return 'gold';
      this._vassalGold[fromVassalRegion]! -= cost;
    } else {
      if (owner.gold < cost) return 'gold';
      owner.gold -= cost;
    }
    const b: Building = { x, y, owner: ownerId, type, level: 1 };
    this.buildings.push(b);
    if (type === 'settlement') this._applySettlement(x, y, +1, this._settlementRadius(1));
    if (type === 'turret') this._turretCacheDirty = true;
    this.events.push({ type: 'built', buildingType: type, ownerId });
    // A new L1 won't trigger consolidation (we need 5 of same tier+),
    // but call anyway to keep the code path uniform with tryUpgrade.
    this._tryConsolidate(b);
    return null;
  }

  /**
   * Upgrade an existing building one tier. Same fund routing as tryBuild
   * (fromVassalRegion > 0 spends from vassal pool). Each upgrade costs the
   * building's base BUILDING_COST at L1→L2 and 1.5× base at L2→L3.
   * Returns null on success.
   */
  tryUpgrade(x: number, y: number, ownerId: PlayerId, fromVassalRegion = 0): BuildError | null {
    if (!this.territory.inBounds(x, y)) return 'oob';
    const owner = this.players[ownerId];
    if (!owner || !owner.alive) return 'dead';
    const b = this.buildingAt(x, y);
    if (!b) return 'no-building';
    if (b.owner !== ownerId) return 'not-yours';
    if (b.level >= this.config.BUILDING_MAX_LEVEL) return 'max-level';
    const cost = this._upgradeCost(b.type, b.level);
    if (fromVassalRegion > 0) {
      if ((this._vassalGold[fromVassalRegion] ?? 0) < cost) return 'gold';
      this._vassalGold[fromVassalRegion]! -= cost;
    } else {
      if (owner.gold < cost) return 'gold';
      owner.gold -= cost;
    }
    b.level++;
    // Settlement gold-multiplier accounting: each tier adds one full
    // SETTLEMENT_BONUS unit at the level's current radius.
    if (b.type === 'settlement') this._applySettlement(b.x, b.y, +1, this._settlementRadius(b.level));
    if (b.type === 'turret') this._turretCacheDirty = true;
    this.events.push({ type: 'built', buildingType: b.type, ownerId });
    this._tryConsolidate(b);
    return null;
  }

  /** Cost to take a building of `type` from `currentLevel` to the next tier.
   *  L1→L2 = base, L2→L3 = 1.5× base. Returns -1 if already at max. */
  upgradeCostFor(type: BuildingType, currentLevel: number): number {
    if (currentLevel >= this.config.BUILDING_MAX_LEVEL) return -1;
    const base = this.config.BUILDING_COSTS[type];
    if (base == null) return -1;
    return currentLevel === 1 ? base : Math.floor(base * 1.5);
  }

  private _upgradeCost(type: BuildingType, currentLevel: number): number {
    return this.upgradeCostFor(type, currentLevel);
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
    if (!this.isUnlocked(ownerId, 'bombs')) return 'locked';
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
    // Higher-tier airstrips reload faster and throw bombs slightly farther.
    // Air Supremacy decree halves cooldown empire-wide on top of tier bonus.
    const stripLevel = chosen.level ?? 1;
    const cooldownMult = Math.pow(0.85, stripLevel - 1) * this._bombCooldownMult(owner);
    chosen.cooldownUntil = this.tickCount + Math.floor(this.config.BOMB_COOLDOWN_TICKS[type] * cooldownMult);

    // Launch a plane from the airstrip toward the target. The actual
    // bomb effect is deferred to plane arrival inside _planesTick — and
    // any AA along the route gets a chance to shoot the plane down first.
    const plane: Plane = {
      id: this._planeNextId++,
      owner: ownerId,
      bombType: type,
      x: chosen.x + 0.5,
      y: chosen.y + 0.5,
      destX: x + 0.5,
      destY: y + 0.5,
      speed: this.config.PLANE_SPEED[type],
      rolledAA: new Set<number>(),
      orbitUntilTick: 0,
      nextStrafeTick: 0,
    };
    this.planes.push(plane);
    this.events.push({
      type: 'plane-launched',
      bombType: type,
      ownerId,
      x: plane.x, y: plane.y,
      destX: plane.destX, destY: plane.destY,
    });
    return null;
  }

  /** Detonate a bomb at (x, y) — the actual radius effect that used to
   *  live inside dropBomb. Now invoked when a plane arrives or, if the
   *  plane is shot down, NOT invoked at all. */
  private _detonateBomb(type: BombType, x: number, y: number, ownerId: PlayerId): void {
    // Tier-based radius bump from the spawning airstrip is approximated
    // here by re-scanning the owner's airstrips for the highest level.
    let stripLevel = 1;
    for (const b of this.buildings) {
      if (b.type === 'airstrip' && b.owner === ownerId) {
        if ((b.level ?? 1) > stripLevel) stripLevel = b.level ?? 1;
      }
    }
    const owner = this.players[ownerId];
    // Air mastery: +25% bomb radius.
    const masteryRadiusMult = owner?.mastery === 'air' ? 1.25 : 1.0;
    const radiusMult = (1 + 0.10 * (stripLevel - 1)) * masteryRadiusMult;
    const radius = Math.floor(this.config.BOMB_RADII[type] * radiusMult);
    const r2 = radius * radius;
    const W = this.territory.width;
    const H = this.territory.height;
    // Track per-region wipe counts so we can drain morale proportionally
    // after the radius loop — gives every wiped vassal a power penalty
    // matching how much of their land we just took.
    const wipedByRegion = new Map<number, number>();
    for (let dy = -radius; dy <= radius; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= H) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = x + dx;
        if (tx < 0 || tx >= W) continue;
        if (this._capitalIndexAt(tx, ty) >= 0) continue;
        if (!this.territory.isPassable(tx, ty)) continue;
        const tileOwner = this.territory.getOwner(tx, ty);
        // No friendly fire — bombs spare the bomber's own tiles and
        // their allies' tiles.
        if (tileOwner === ownerId) continue;
        if (tileOwner > 0 && this.areAllied(ownerId, tileOwner)) continue;
        if (tileOwner !== 0) {
          if (this._claim(tx, ty, 0)) {
            this._destroyBuildingsAt(tx, ty);
            const r = this.regions[ty * W + tx]!;
            if (r > 0) wipedByRegion.set(r, (wipedByRegion.get(r) ?? 0) + 1);
          }
        } else {
          if (this.buildingAt(tx, ty)) this._destroyBuildingsAt(tx, ty);
        }
      }
    }
    for (const [r, n] of wipedByRegion) this._drainMoraleForRegion(r, n);
    // Air-vs-naval: enemy ships caught in the blast take direct hull damage.
    // Small bomb 30hp, large bomb 100hp — small one-shots scouts (30hp),
    // large one-shots skirmishers (80hp), warships (200hp) eat 2 large hits.
    const shipDmg = type === 'small' ? 30 : 100;
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i]!;
      if (s.owner === ownerId) continue;
      if (this.areAllied(ownerId, s.owner)) continue;
      const dx2 = s.x + 0.5 - x;
      const dy2 = s.y + 0.5 - y;
      if (dx2 * dx2 + dy2 * dy2 > r2) continue;
      s.hp -= shipDmg;
      if (s.hp <= 0) {
        this.events.push({ type: 'ship-sunk', shipKind: s.kind, ownerId: s.owner, x: s.x, y: s.y });
        this.ships.splice(i, 1);
      }
    }

    this.events.push({ type: 'bomb', bombType: type, x, y, radius, ownerId });
  }

  /** AC-130 strafe — a tight mini-bomb that scuffs a small area each
   *  pass. Picks a random spot inside the orbit zone and detonates a
   *  radius-2 blast (wipes claims, destroys buildings, damages ships).
   *  Called every AC130_STRAFE_INTERVAL ticks during orbit, so a full
   *  10s pass produces ~7 of these — the cumulative wipe is comparable
   *  to a single small bomb but spread across the orbit zone. */
  private _strafe(cx: number, cy: number, ownerId: PlayerId): void {
    const orbitR = this.config.BOMB_RADII['ac130'];
    const W = this.territory.width;
    const H = this.territory.height;
    // Pick a random target tile inside the orbit footprint.
    let tx = Math.floor(cx + (Math.random() * 2 - 1) * orbitR);
    let ty = Math.floor(cy + (Math.random() * 2 - 1) * orbitR);
    if (tx < 0) tx = 0; if (tx >= W) tx = W - 1;
    if (ty < 0) ty = 0; if (ty >= H) ty = H - 1;
    // Strafe blast: tight radius-2 area bomb.
    const blastR = 2;
    const blastR2 = blastR * blastR;
    let hit = 0;
    const wipedByRegion = new Map<number, number>();
    for (let dy = -blastR; dy <= blastR; dy++) {
      const ny = ty + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -blastR; dx <= blastR; dx++) {
        if (dx * dx + dy * dy > blastR2) continue;
        const nx = tx + dx;
        if (nx < 0 || nx >= W) continue;
        if (this._capitalIndexAt(nx, ny) >= 0) continue;
        if (!this.territory.isPassable(nx, ny)) continue;
        const o = this.territory.getOwner(nx, ny);
        if (o === ownerId) continue;
        if (o > 0 && this.areAllied(ownerId, o)) continue;
        // Drain troops on owned tiles (whether enemy or unclaimed
        // defenders sitting nearby) and clear the claim.
        if (o > 0) {
          const dp = this.players[o];
          if (dp) dp.troops = Math.max(0, dp.troops - 25);
        }
        if (this._claim(nx, ny, 0)) {
          this._destroyBuildingsAt(nx, ny);
          const W2 = this.territory.width;
          const r = this.regions[ny * W2 + nx]!;
          if (r > 0) wipedByRegion.set(r, (wipedByRegion.get(r) ?? 0) + 1);
        } else if (this.buildingAt(nx, ny)) {
          this._destroyBuildingsAt(nx, ny);
        }
        hit++;
      }
    }
    void hit;
    for (const [r, n] of wipedByRegion) this._drainMoraleForRegion(r, n);
    // Renderer flashes the strafe.
    this.events.push({ type: 'bomb', bombType: 'ac130', x: tx, y: ty, radius: blastR, ownerId });
    // Splash on enemy ships nearby (15 hp).
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i]!;
      if (s.owner === ownerId) continue;
      if (this.areAllied(ownerId, s.owner)) continue;
      const dx2 = s.x + 0.5 - tx;
      const dy2 = s.y + 0.5 - ty;
      if (dx2 * dx2 + dy2 * dy2 > blastR2) continue;
      s.hp -= 15;
      if (s.hp <= 0) {
        this.events.push({ type: 'ship-sunk', shipKind: s.kind, ownerId: s.owner, x: s.x, y: s.y });
        this.ships.splice(i, 1);
      }
    }
  }

  // --- Capture (combat) ---

  /** Attempt to flip (x, y) to attackerId. Returns true on success. */
  tryCapture(x: number, y: number, attackerId: PlayerId): boolean {
    const defender = this.territory.getOwner(x, y);
    if (defender < 0 || defender === attackerId) return false;
    // Allied players cannot capture each other's tiles via any path
    // (expansion, ships, bombs are still allowed since bombs only neutralise).
    if (defender > 0 && this.areAllied(attackerId, defender)) return false;
    const capIdx = this._capitalIndexAt(x, y);
    const capOwner = capIdx >= 0 ? this.capitals[capIdx]!.owner : -1;
    // Turret retaliation: BEFORE the claim, count defending turrets in range
    // and bleed the attacker's troop pool by RETALIATION × turrets. Turrets
    // bite back — every successful capture inside a defender's turret radius
    // costs the attacker extra population.
    if (defender > 0) {
      const retaliation = this._turretRetaliationAt(x, y, defender);
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
    // AIs auto-pick mastery at spawn so they have a coherent kit from
    // tick 1. Humans start unchosen and get prompted by the HUD on first
    // launch (treated as 'ground' for build-lock purposes until chosen).
    let mastery: Mastery | null = null;
    if (!isHuman) {
      const r = Math.random();
      // Weighting: 50% ground / 30% air / 20% naval — keeps ground the
      // most common so air/naval feel like committed strategies.
      mastery = r < 0.5 ? 'ground' : r < 0.8 ? 'air' : 'naval';
    }
    return {
      id, name, isHuman,
      gold: this.config.STARTING_GOLD,
      treasury: 0,
      troops: this.config.STARTING_TROOPS,
      alive: true,
      targetRegions: [],
      decreeStacks: {},
      abilityCooldowns: {},
      activeBuffs: {},
      mastery,
      expanding: !isHuman,
    };
  }

  // --- Mastery (path-based specialization) ----------------------------------

  /** Returns true if a building/unit category is unlocked for this player.
   *  Humans with no chosen mastery yet are treated as 'ground' so they can
   *  still build settlements/turrets while the picker is open. */
  isUnlocked(playerId: PlayerId, category: 'airstrip' | 'aa' | 'bombs' | 'ships'): boolean {
    const p = this.players[playerId];
    if (!p) return false;
    const m = p.mastery ?? 'ground';
    const def = masteryById(m);
    if (!def) return false;
    return !!def.unlocked[category];
  }

  /** One-time pick at game start. Re-picks cost 3000 treasury (heavy fee
   *  to discourage hot-swapping). Returns null on success. */
  chooseMastery(playerId: PlayerId, mastery: Mastery): 'gold' | 'dead' | 'unknown' | null {
    const p = this.players[playerId];
    if (!p || !p.alive) return 'dead';
    if (!masteryById(mastery)) return 'unknown';
    const isReroll = p.mastery != null && p.mastery !== mastery;
    if (isReroll) {
      const cost = 3000;
      if (p.treasury < cost) return 'gold';
      p.treasury -= cost;
    }
    p.mastery = mastery;
    return null;
  }

  // --- Commander decrees ---

  /** Returns the player's stack count for a decree (0 if never bought). */
  decreeStackCount(playerId: PlayerId, decreeId: string): number {
    const p = this.players[playerId];
    return p?.decreeStacks?.[decreeId] ?? 0;
  }

  /** True if the decree is currently buyable for that player — prereq met,
   *  not coming-soon, and (for non-stackable) not already bought. Used by
   *  the UI to grey out locked nodes. */
  decreeAvailable(playerId: PlayerId, decreeId: string): boolean {
    const d = decreeById(decreeId);
    if (!d) return false;
    if (d.comingSoon) return false;
    if (d.prereq && this.decreeStackCount(playerId, d.prereq) === 0) return false;
    if (!d.stackable && this.decreeStackCount(playerId, decreeId) > 0) return false;
    return true;
  }

  /** Returns null on success, error code otherwise. */
  buyDecree(playerId: PlayerId, decreeId: string): 'gold' | 'dead' | 'locked' | 'unknown' | null {
    const p = this.players[playerId];
    if (!p || !p.alive) return 'dead';
    const d = decreeById(decreeId);
    if (!d) return 'unknown';
    if (!this.decreeAvailable(playerId, decreeId)) return 'locked';
    // War Bonds: cost is 30% of current treasury.
    let cost = d.cost;
    if (decreeId === 'war-bonds') cost = Math.floor(p.treasury * 0.30);
    // Doctrines pay from the commander treasury, not operational gold.
    if (p.treasury < cost) return 'gold';
    p.treasury -= cost;
    p.decreeStacks[decreeId] = (p.decreeStacks[decreeId] ?? 0) + 1;
    // Border Patrol changes effective turret radius — invalidate cache.
    if (decreeId === 'border-patrol') this._turretCacheDirty = true;
    // Apply one-shot side effects at purchase time.
    this._applyDecreeOneShot(p, decreeId);
    return null;
  }

  private _applyDecreeOneShot(p: Player, id: string): void {
    if (id === 'conscription') {
      p.troops += this.config.DECREE_CONSCRIPT_TROOPS;
    } else if (id === 'war-bonds') {
      p.troops += 5000;
    }
  }

  // --- Decree effect helpers (read at the call sites in income/troops/etc.) ---

  /** Income multiplier from Production Decree stacks. */
  private _productionMult(p: Player): number {
    return 1 + this.config.DECREE_PRODUCTION_BOOST * (p.decreeStacks['production'] ?? 0);
  }

  /** Tribute fraction taking Free Market into account. */
  private _tributeFractionFor(p: Player): number {
    const base = this.config.VASSAL_TRIBUTE_FRACTION;
    return (p.decreeStacks['free-market'] ?? 0) > 0 ? base * 0.5 : base;
  }

  /** Vassal expansion boost taking Forced March into account. */
  private _expansionBoostFor(p: Player): number {
    const stacks = p.decreeStacks['forced-march'] ?? 0;
    return this.config.VASSAL_EXPANSION_BOOST + 0.20 * stacks;
  }

  /** Troop cap multiplier from Standing Army stacks. */
  private _troopCapFor(p: Player): number {
    const stacks = p.decreeStacks['standing-army'] ?? 0;
    return this.config.TROOP_CAP_PER_TILE * (1 + 0.50 * stacks);
  }

  /** Bomb-cooldown multiplier from Air Supremacy. */
  private _bombCooldownMult(p: Player): number {
    return (p.decreeStacks['air-supremacy'] ?? 0) > 0 ? 0.5 : 1;
  }

  // --- Active commander abilities ---------------------------------------

  private _abilityActive(p: Player, id: string): boolean {
    return (p.activeBuffs[id] ?? 0) > this.tickCount;
  }

  /** Attack-rate multiplier from Rally (1.5× while active). */
  private _rallyMult(p: Player): number {
    return this._abilityActive(p, 'rally') ? 1.5 : 1;
  }

  /** Income multiplier from Trade Embargo against the *target* player.
   *  When this player is currently embargoed by anyone, their gold income
   *  is multiplied by 0.6. */
  private _embargoMult(p: Player): number {
    return this._abilityActive(p, 'embargoed') ? 0.6 : 1;
  }

  /** Returns true if the human has Spy Report active and so should see
   *  enemy troop counts / targets in the HUD. */
  spyActive(playerId: PlayerId): boolean {
    const p = this.players[playerId];
    if (!p) return false;
    return this._abilityActive(p, 'spy-report')
        || (p.decreeStacks['spy-network'] ?? 0) > 0;
  }

  /** Tick count at which an ability is next ready (or 0 = ready now). */
  abilityReadyAt(playerId: PlayerId, abilityId: string): number {
    const p = this.players[playerId];
    return p?.abilityCooldowns?.[abilityId] ?? 0;
  }

  /** Tick count at which a buff/debuff expires (or 0 = inactive). */
  buffExpireAt(playerId: PlayerId, abilityId: string): number {
    const p = this.players[playerId];
    return p?.activeBuffs?.[abilityId] ?? 0;
  }

  /** Fire an active ability. targetId required for enemy-targeted abilities
   *  (currently just Embargo). Returns null on success, error code otherwise. */
  activateAbility(playerId: PlayerId, abilityId: string, targetId?: PlayerId): AbilityError | null {
    const p = this.players[playerId];
    if (!p || !p.alive) return 'dead';
    const a = abilityById(abilityId);
    if (!a) return 'unknown';
    if (this.abilityReadyAt(playerId, abilityId) > this.tickCount) return 'cooldown';
    if (a.needsEnemy) {
      if (!targetId) return 'no-target';
      const t = this.players[targetId];
      if (!t || !t.alive || t.id === playerId) return 'bad-target';
    }
    if (p.treasury < a.cost) return 'gold';
    p.treasury -= a.cost;
    p.abilityCooldowns[abilityId] = this.tickCount + a.cooldown;

    // Effect application
    if (abilityId === 'rally') {
      p.activeBuffs['rally'] = this.tickCount + a.duration;
    } else if (abilityId === 'reinforcements') {
      p.troops += 3000;
      // Halt empire-wide growth for the duration (read in _growTroops).
      p.activeBuffs['no-growth'] = this.tickCount + a.duration;
    } else if (abilityId === 'spy-report') {
      p.activeBuffs['spy-report'] = this.tickCount + a.duration;
    } else if (abilityId === 'embargo') {
      const t = this.players[targetId!];
      if (t) t.activeBuffs['embargoed'] = this.tickCount + a.duration;
    }

    this.events.push({ type: 'ability-fired', abilityId, ownerId: playerId, targetId });
    return null;
  }

  // --- Alliances --------------------------------------------------------

  private _allianceKey(a: PlayerId, b: PlayerId): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }
  private _alliances = new Map<string, number>();

  /** True iff the two players currently share an active alliance. */
  areAllied(a: PlayerId, b: PlayerId): boolean {
    if (a === b) return false;
    const exp = this._alliances.get(this._allianceKey(a, b));
    return exp != null && exp > this.tickCount;
  }

  /** Tick count at which a current alliance expires, or 0 if none. */
  allianceExpireAt(a: PlayerId, b: PlayerId): number {
    return this._alliances.get(this._allianceKey(a, b)) ?? 0;
  }

  /** Pure-AI accept rule for alliance proposals. */
  private _aiAcceptsAlliance(proposer: Player, target: Player): boolean {
    // Don't ally with the dominant leader (they don't need it).
    const total = this.totalLand;
    const propShare = total > 0 ? (this.territory.counts[proposer.id] ?? 0) / total : 0;
    const targShare = total > 0 ? (this.territory.counts[target.id] ?? 0) / total : 0;
    if (propShare > targShare * 1.6) return false;
    // Otherwise probability scales with how much the target is being squeezed.
    const threat = this._findGreatestThreatTo(target.id);
    if (threat === proposer.id) return false; // can't ally with your bully
    return true;
  }

  /** Propose an alliance from `fromId` to `toId`. Default 60s (600 ticks).
   *  Returns 'accepted' on success or a reason string. */
  proposeAlliance(fromId: PlayerId, toId: PlayerId, durationTicks = 600):
    'accepted' | 'rejected' | 'invalid' | 'already' {
    if (fromId === toId) return 'invalid';
    const a = this.players[fromId];
    const b = this.players[toId];
    if (!a || !a.alive || !b || !b.alive) return 'invalid';
    if (this.areAllied(fromId, toId)) return 'already';
    if (b.isHuman) return 'rejected';
    if (!this._aiAcceptsAlliance(a, b)) return 'rejected';
    this._alliances.set(this._allianceKey(fromId, toId), this.tickCount + durationTicks);
    this.events.push({ type: 'alliance-formed', a: fromId, b: toId });
    return 'accepted';
  }

  /** End an alliance early. */
  breakAlliance(byId: PlayerId, otherId: PlayerId): boolean {
    const key = this._allianceKey(byId, otherId);
    if (!this._alliances.has(key)) return false;
    this._alliances.delete(key);
    this.events.push({ type: 'alliance-broken', a: byId, b: otherId, brokenBy: byId });
    return true;
  }

  /** Returns the list of player ids currently allied with `playerId`. */
  alliesOf(playerId: PlayerId): PlayerId[] {
    const out: PlayerId[] = [];
    for (const [key, exp] of this._alliances) {
      if (exp <= this.tickCount) continue;
      const [aStr, bStr] = key.split('-');
      const a = parseInt(aStr!, 10);
      const b = parseInt(bStr!, 10);
      if (a === playerId) out.push(b);
      else if (b === playerId) out.push(a);
    }
    return out;
  }

  // --- Trade ------------------------------------------------------------

  /** One-shot exchange: `fromId` pays `gold`, `toId` sends `troops`. AI
   *  accepts if the offered gold/troop ratio meets a fair-market rate AND
   *  they have the troops to spare. Returns null on success. */
  proposeTrade(fromId: PlayerId, toId: PlayerId, gold: number, troops: number):
    'accepted' | 'rejected' | 'gold' | 'invalid' | null {
    if (fromId === toId || gold <= 0 || troops <= 0) return 'invalid';
    const a = this.players[fromId];
    const b = this.players[toId];
    if (!a || !a.alive || !b || !b.alive) return 'invalid';
    if (a.gold < gold) return 'gold';
    // AI accept rule: rate must be at least 0.4 g/troop, and the seller
    // can't drop below 30% of their cap.
    const rate = gold / Math.max(1, troops);
    const minRate = 0.4;
    if (rate < minRate && !b.isHuman) return 'rejected';
    const owned = this.territory.counts[b.id] ?? 0;
    const minTroops = owned * this._troopCapFor(b) * 0.3;
    if (b.troops - troops < minTroops && !b.isHuman) return 'rejected';
    a.gold -= gold;
    b.gold += gold;
    b.troops = Math.max(0, b.troops - troops);
    a.troops += troops;
    this.events.push({ type: 'trade-completed', fromId, toId, gold, troops });
    return 'accepted';
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
    const settlementBonus = this.config.SETTLEMENT_TROOP_BONUS;
    const fullRegionBonus = this.config.FULL_REGION_TROOP_BONUS;
    // Pre-count settlements per owner — reuse scratch arrays so we don't
    // allocate every tick.
    const settlementCount = this._scratch256b;
    settlementCount.fill(0);
    for (const b of this.buildings) {
      if (b.type === 'settlement') settlementCount[b.owner]! += (b.level ?? 1);
    }
    const fullRegions = this._scratch256c;
    fullRegions.fill(0);
    for (let r = 1; r <= this.regionCount; r++) {
      const o = this._regionOwner[r]!;
      if (o > 0) fullRegions[o]!++;
    }
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (!p || !p.alive) continue;
      const owned = this.territory.counts[id]!;
      const max = owned * this._troopCapFor(p);
      // Reinforcements decree halts growth for its duration — instant
      // troop spike now, but you live off that pile until the buff ends.
      if (this._abilityActive(p, 'no-growth')) {
        p.troops = Math.min(p.troops, max);
        continue;
      }
      // Ground mastery: +25% troop growth empire-wide.
      const masteryGrowthMult = p.mastery === 'ground' ? 1.25 : 1.0;
      const next = p.troops
        + owned * growth * masteryGrowthMult
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
    // Sabotage: a player with sabotage stacks siphons 5% per stack from
    // every other player's per-tick gross income into their own treasury.
    const owners = this.territory.owners;
    const mult = this.goldMultiplier;
    const base = this.config.GOLD_PER_TILE_PER_TICK;
    const N = owners.length;
    const players = this.players;
    const regions = this.regions;
    const dominant = this._regionDominant;
    const vGold = this._vassalGold;

    const sabotageDrain = this._scratch256a;
    sabotageDrain.fill(0);
    let anySabotage = false;
    for (let id = 1; id < players.length; id++) {
      const sp = players[id];
      if (!sp || !sp.alive) continue;
      const stacks = sp.decreeStacks['sabotage'] ?? 0;
      if (stacks > 0) {
        sabotageDrain[id] = Math.min(0.5, 0.05 * stacks);
        anySabotage = true;
      }
    }
    const siphon = (earnerId: PlayerId, gross: number): number => {
      if (!anySabotage) return gross;
      let kept = gross;
      for (let id = 1; id < players.length; id++) {
        if (id === earnerId) continue;
        const drain = sabotageDrain[id]!;
        if (drain <= 0) continue;
        const sp = players[id];
        if (!sp || !sp.alive) continue;
        const slice = gross * drain;
        sp.gold += slice;
        kept -= slice;
      }
      return kept;
    };

    for (let i = 0; i < N; i++) {
      const id = owners[i]!;
      if (id === 0) continue;
      const p = players[id];
      if (!p || !p.alive) continue;
      const decreeMult = this._productionMult(p) * this._embargoMult(p);
      const tileGold = base * (1 + mult[i]!) * decreeMult;
      const net = siphon(id, tileGold);
      const r = regions[i]!;
      if (p.isHuman && r > 0 && dominant[r] === id) {
        // Vassal tribute flows to the leader's TREASURY (commander pool),
        // separate from operational gold. Vassals keep the rest in their
        // own per-region pool for builds/expansion.
        const tribute = net * this._tributeFractionFor(p);
        vGold[r]! += net - tribute;
        p.treasury += tribute;
      } else {
        p.gold += net;
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
        const tierGold = flatGold * (b.level ?? 1) * this._embargoMult(p);
        const net = siphon(b.owner, tierGold);
        const r = regions[b.y * W + b.x]!;
        if (p.isHuman && r > 0 && dominant[r] === b.owner) {
          const tribute = net * this._tributeFractionFor(p);
          vGold[r]! += net - tribute;
          p.treasury += tribute;
        } else {
          p.gold += net;
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
    const counts = this._scratch256c;
    counts.fill(0);
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

    // Building caps scale with region size — small districts get 1-2
    // structures total, large ones get more. Prevents stacking 20 turrets
    // on a 50-tile patch and the runaway lag that comes with it.
    const turretCap     = this._regionBuildingCap('turret',     tiles.length);
    const settlementCap = this._regionBuildingCap('settlement', tiles.length);
    const airstripCap   = this._regionBuildingCap('airstrip',   tiles.length);
    const aaCap         = this._regionBuildingCap('aa',         tiles.length);
    const turretCount     = this._countBuildingsInRegion(regionId, leader.id, 'turret');
    const settlementCount = this._countBuildingsInRegion(regionId, leader.id, 'settlement');
    const airstripCount   = this._countBuildingsInRegion(regionId, leader.id, 'airstrip');
    const aaCount         = this._countBuildingsInRegion(regionId, leader.id, 'aa');

    // 1. THREAT: turret on the most-pressured exposed tile.
    const turretCost = this.config.BUILDING_COSTS.turret;
    if (exposed.length > 0 && turretCount < turretCap && vGold >= reserve + turretCost) {
      const spot = this._pickBestTurretSpot(exposed, leader.id);
      if (spot >= 0) {
        const x = spot % W, y = (spot - x) / W;
        if (this.tryBuild('turret', x, y, leader.id, regionId) === null) {
          this.events.push({ type: 'vassal-built', regionId, ownerId: leader.id, buildingType: 'turret' });
          return;
        }
      }
    }

    // 1b. AIR DEFENCE: vassals of an AIR-mastery leader build AA when an
    // enemy has airstrips/planes. tryBuild's lock check passes only if
    // leader has AIR mastery, so the isUnlocked test guards both lock
    // and intent.
    if (this.isUnlocked(leader.id, 'aa') && aaCount < aaCap && this._anyEnemyHasAir(leader.id)) {
      const aaCost = this.config.BUILDING_COSTS.aa;
      if (vGold >= reserve + aaCost) {
        const candidates = safe.length > 0 ? safe : exposed;
        if (candidates.length > 0) {
          const spot = this._pickBestTurretSpot(candidates, leader.id);
          if (spot >= 0) {
            const x = spot % W, y = (spot - x) / W;
            if (this.tryBuild('aa', x, y, leader.id, regionId) === null) {
              this.events.push({ type: 'vassal-built', regionId, ownerId: leader.id, buildingType: 'aa' });
              return;
            }
          }
        }
      }
    }

    // 2. OFFENSE: airstrip near the target if we have an enemy in our sights.
    const airCost = this.config.BUILDING_COSTS.airstrip;
    const targetRegion = this._vassalTarget[regionId] ?? 0;
    const targetDom = targetRegion > 0 ? this._dominantOwnerInRegion(targetRegion) : 0;
    const targetIsEnemy = targetRegion > 0 && targetDom > 0 && targetDom !== leader.id;
    // Vassal airfield cap also scales with empire size now (was flat 4).
    const leaderTiles = this.territory.counts[leader.id] ?? 0;
    const vassalAirCap = Math.max(4, Math.floor(leaderTiles / 80));
    if (targetIsEnemy && airstripCount < airstripCap &&
        this.countBuildings(leader.id, 'airstrip') < vassalAirCap &&
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
    if (safe.length > 0 && settlementCount < settlementCap && vGold >= reserve + settCost) {
      const spot = this._pickSettlementSpot(safe, leader.id);
      if (spot >= 0) {
        const x = spot % W, y = (spot - x) / W;
        if (this.tryBuild('settlement', x, y, leader.id, regionId) === null) {
          this.events.push({ type: 'vassal-built', regionId, ownerId: leader.id, buildingType: 'settlement' });
          return;
        }
      }
    }

    // 4. UPGRADE: spend leftover budget tier-ing up our existing buildings.
    //    Iterate buildings inside this region; pick the lowest-level
    //    upgrade-eligible one whose cost we can afford. Tiering yields more
    //    bang-per-tile than spreading more settlements indefinitely.
    let bestB: Building | null = null;
    let bestLvl = Infinity;
    for (const b of this.buildings) {
      if (b.owner !== leader.id) continue;
      if ((b.level ?? 1) >= this.config.BUILDING_MAX_LEVEL) continue;
      if (this.regions[b.y * W + b.x] !== regionId) continue;
      const cost = this.upgradeCostFor(b.type, b.level);
      if (cost < 0 || vGold < reserve + cost) continue;
      // Prefer upgrading the lowest-level building we have so progress
      // spreads across tiers instead of one structure jumping to L3.
      if (b.level < bestLvl) { bestLvl = b.level; bestB = b; }
    }
    if (bestB) {
      if (this.tryUpgrade(bestB.x, bestB.y, leader.id, regionId) === null) {
        this.events.push({ type: 'vassal-built', regionId, ownerId: leader.id, buildingType: bestB.type });
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

    // Sample the target region for the densest enemy cluster within bomb
    // range. Score = enemies − 4×friendlies. Heavy penalty on own-tile
    // splash so vassals stop bombing their own front line. Friendly fire
    // is already disabled in _detonateBomb but the score still steers
    // away from waste.
    const W = this.territory.width;
    const r2 = radius * radius;
    let bestX = -1, bestY = -1, bestEnemies = 0, bestScore = -Infinity;
    const sampleStep = Math.max(1, Math.floor(targetTiles.length / 36));
    for (let k = 0; k < targetTiles.length; k += sampleStep) {
      const i = targetTiles[k]!;
      const x = i % W, y = (i - x) / W;
      let enemies = 0, friendlies = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const o = this.territory.getOwner(x + dx, y + dy);
          if (o <= 0) continue;
          if (o === leader.id) friendlies++;
          else if (this.areAllied(leader.id, o)) friendlies++;
          else enemies++;
        }
      }
      const score = enemies - friendlies * 4;
      if (score > bestScore) { bestScore = score; bestEnemies = enemies; bestX = x; bestY = y; }
    }

    // Don't waste a bomb on a sparse target. Require enough enemies under it.
    const tilesInArea = Math.PI * r2;
    const minEnemies = Math.floor(tilesInArea * (bombType === 'large' ? 0.20 : 0.25));
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

  /** Slow morale recovery — every region nudges back toward 1.0 by a
   *  small amount each tick. ~1% per tick = full recovery in ~10s from
   *  any drop, so a bombed-out vassal genuinely feels weakened for a
   *  meaningful window of time before bouncing back. */
  private _recoverMorale(): void {
    const m = this._regionMorale;
    if (!m) return;
    const RECOVER = 0.005; // 0.5% per tick → ~20s for a 0→1 climb
    for (let r = 1; r <= this.regionCount; r++) {
      const v = m[r]!;
      if (v < 1.0) m[r] = v + RECOVER > 1.0 ? 1.0 : v + RECOVER;
    }
  }

  /** Settlement garrison multiplier — every settlement physically inside
   *  the region buffs that region's combat power. Stacks by level
   *  (4% per level), capped at +40%. So a vassal with one bronze (L4)
   *  gets +16%; a vassal with several settlements maxes out at +40%.
   *  Applied multiplicatively on top of regional troop share + morale. */
  private _settlementGarrison(regionId: number, ownerId: PlayerId): number {
    if (regionId <= 0) return 1.0;
    const W = this.territory.width;
    let levels = 0;
    for (const b of this.buildings) {
      if (b.type !== 'settlement') continue;
      if (b.owner !== ownerId) continue;
      if (this.regions[b.y * W + b.x] !== regionId) continue;
      levels += (b.level ?? 1);
    }
    return 1 + Math.min(0.40, levels * 0.04);
  }

  /** Apply morale damage to a region based on lost-tile fraction.
   *  Called by bombs and strafes when tiles in a region are wiped. */
  private _drainMoraleForRegion(regionId: number, lostTiles: number): void {
    if (regionId <= 0) return;
    const total = this._tilesByRegion[regionId]?.length ?? 1;
    // The morale drop scales with the LOST FRACTION times 0.8 — slightly
    // amplified relative to the area lost so bombs feel like real
    // setbacks, not just chip damage. Floored at 0.20 so a region is
    // never fully impotent.
    const drop = Math.min(0.7, (lostTiles / total) * 0.8);
    const cur = this._regionMorale[regionId]!;
    const next = cur - drop;
    this._regionMorale[regionId] = next < 0.20 ? 0.20 : next;
  }

  /** True if any non-allied alive player has an airstrip OR a plane in
   *  the air. Used by AI/vassal builders to decide whether AA is worth
   *  the gold (reactive, not eager). */
  private _anyEnemyHasAir(playerId: PlayerId): boolean {
    if (this.planes.some(pl => pl.owner !== playerId && !this.areAllied(pl.owner, playerId))) return true;
    for (const b of this.buildings) {
      if (b.type !== 'airstrip') continue;
      if (b.owner === playerId) continue;
      if (this.areAllied(b.owner, playerId)) continue;
      const o = this.players[b.owner];
      if (o && o.alive) return true;
    }
    return false;
  }

  private _aiThink(p: Player): void {
    if (this.tickCount % this.config.AI_RETARGET_TICKS !== 0 && p.targetRegions.length > 0) return;
    const t = this._pickAiTargetRegion(p.id);
    p.targetRegions = (t != null && t > 0) ? [t] : [];
  }

  /** AI players build the same way vassals do — turret on threat, airstrip
   *  for offense, settlement for income, then upgrade. Cost comes out of
   *  p.gold (no vassal pool for AI). Capped per region by region size to
   *  avoid late-game building sprawl + perf cliff.
   *
   *  Called every VASSAL_THINK_INTERVAL ticks per AI player, with the
   *  player offset spread by ID so all AIs don't think on the same frame. */
  private _aiBuild(p: Player): void {
    const interval = this.config.VASSAL_THINK_INTERVAL;
    if (interval <= 0) return;
    if (((this.tickCount + p.id * 11) % interval) !== 0) return;
    const reserve = this.config.VASSAL_GOLD_RESERVE;
    if (p.gold < reserve) return;

    // Build in every region we dominate — same throttle the vassals use.
    // Each region tries one structure per think tick; cap is enforced inside.
    for (let r = 1; r <= this.regionCount; r++) {
      if (this._regionDominant[r] !== p.id) continue;
      this._aiBuildRegion(p, r);
      if (p.gold < reserve) break;
    }

    // Naval mastery: try to build a ship on a coastal tile if under cap.
    if (this.isUnlocked(p.id, 'ships')) this._aiMaybeBuildShip(p);

    // Bombs: try once per think against the AI's current target region.
    const targetRegion = p.targetRegions[0] ?? 0;
    const targetDom = targetRegion > 0 ? this._dominantOwnerInRegion(targetRegion) : 0;
    const targetIsEnemy = targetRegion > 0 && targetDom > 0 && targetDom !== p.id;
    if (targetIsEnemy && this.hasAirstrip(p.id)) this._aiMaybeBomb(p, targetRegion);
  }

  /** Naval-mastery AIs build ships when under their cap. Picks the
   *  most expensive ship they can afford given the budget — bigger
   *  fleets prefer warships, smaller starts pick scouts to ramp. */
  private _aiMaybeBuildShip(p: Player): void {
    const myShips = this.ships.reduce((n, s) => s.owner === p.id ? n + 1 : n, 0);
    const cap = this.config.SHIP_PLAYER_CAP + (p.mastery === 'naval' ? 2 : 0);
    if (myShips >= cap) return;
    const reserve = this.config.VASSAL_GOLD_RESERVE;
    // Pick the most expensive ship we can afford (with reserve buffer).
    let kind: ShipKind | null = null;
    for (const k of ['warship', 'skirmisher', 'scout'] as const) {
      if (p.gold >= reserve + this.config.SHIP_COSTS[k]) { kind = k; break; }
    }
    if (!kind) return;
    // Find a coastal tile we own. Sample a frontier-ish tile that touches
    // water — buildShip handles the rest (spawns the ship on adjacent water).
    const W = this.territory.width;
    const H = this.territory.height;
    const owners = this.territory.owners;
    // Light sampling — at most 64 tries
    for (let attempt = 0; attempt < 64; attempt++) {
      const i = (Math.random() * owners.length) | 0;
      if (owners[i] !== p.id) continue;
      const x = i % W, y = (i - x) / W;
      // Quick water-adjacency check
      let coastal = false;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        if (this.territory.isPassable(nx, ny) === false) { coastal = true; break; }
      }
      if (!coastal) continue;
      if (this.buildShip(kind, x, y, p.id) === null) return;
    }
  }

  private _aiBuildRegion(p: Player, regionId: number): void {
    const reserve = this.config.VASSAL_GOLD_RESERVE;
    const W = this.territory.width;
    const tiles = this._tilesByRegion[regionId];
    if (!tiles || tiles.length === 0) return;

    const exposed: number[] = [];
    const safe: number[] = [];
    for (const i of tiles) {
      if (this.territory.owners[i] !== p.id) continue;
      const x = i % W, y = (i - x) / W;
      if (this.buildingAt(x, y)) continue;
      if (this._hasEnemyNeighbor(x, y, p.id)) exposed.push(i);
      else safe.push(i);
    }

    const turretCap     = this._regionBuildingCap('turret',     tiles.length);
    const settlementCap = this._regionBuildingCap('settlement', tiles.length);
    const airstripCap   = this._regionBuildingCap('airstrip',   tiles.length);
    const aaCap         = this._regionBuildingCap('aa',         tiles.length);
    const turretCount     = this._countBuildingsInRegion(regionId, p.id, 'turret');
    const settlementCount = this._countBuildingsInRegion(regionId, p.id, 'settlement');
    const airstripCount   = this._countBuildingsInRegion(regionId, p.id, 'airstrip');
    const aaCount         = this._countBuildingsInRegion(regionId, p.id, 'aa');

    // 1. THREAT — turret on any exposed tile, OR a preemptive perimeter
    // turret on safe tiles when this region has none yet (so AI hardens
    // its core regions even before they're attacked).
    const turretCost = this.config.BUILDING_COSTS.turret;
    if (turretCount < turretCap && p.gold >= reserve + turretCost) {
      const candidates = exposed.length > 0
        ? exposed
        : (turretCount === 0 ? safe : []);
      if (candidates.length > 0) {
        const spot = this._pickBestTurretSpot(candidates, p.id);
        if (spot >= 0) {
          const x = spot % W, y = (spot - x) / W;
          if (this.tryBuild('turret', x, y, p.id) === null) return;
        }
      }
    }

    // 1b. AIR DEFENCE — AIR-mastery AIs build AA when any non-allied
    // player has airstrips (or planes are airborne). Sized by region
    // cap. Reactive, not eager — no point building AA before threats.
    if (this.isUnlocked(p.id, 'aa') && aaCount < aaCap && this._anyEnemyHasAir(p.id)) {
      const aaCost = this.config.BUILDING_COSTS.aa;
      if (p.gold >= reserve + aaCost) {
        // Prefer to drop AA on a safe interior tile so it isn't on the
        // bleeding edge — AAs need to LIVE long enough to fire.
        const candidates = safe.length > 0 ? safe : exposed;
        if (candidates.length > 0) {
          const spot = this._pickBestTurretSpot(candidates, p.id);
          if (spot >= 0) {
            const x = spot % W, y = (spot - x) / W;
            if (this.tryBuild('aa', x, y, p.id) === null) return;
          }
        }
      }
    }

    // 2. OFFENSE — airstrip if pushing an enemy region (or if we have NONE
    // anywhere on the map — gives AI a baseline bomb capability).
    const targetRegion = p.targetRegions[0] ?? 0;
    const targetDom = targetRegion > 0 ? this._dominantOwnerInRegion(targetRegion) : 0;
    const targetIsEnemy = targetRegion > 0 && targetDom > 0 && targetDom !== p.id;
    const airCost = this.config.BUILDING_COSTS.airstrip;
    const wantAirstrip = targetIsEnemy || this.countBuildings(p.id, 'airstrip') === 0;
    // Airfield cap scales with empire size — was a flat 3, which made
    // big AIs anemic on air projection. Now: 1 per ~80 owned tiles,
    // floor 3, so a 400-tile empire can run 5 fields.
    const ownedTiles = this.territory.counts[p.id] ?? 0;
    const airstripGlobalCap = Math.max(3, Math.floor(ownedTiles / 80));
    if (wantAirstrip && airstripCount < airstripCap &&
        this.countBuildings(p.id, 'airstrip') < airstripGlobalCap &&
        safe.length > 0 && p.gold >= reserve + airCost) {
      const spot = this._pickAirstripSpot(safe, targetRegion || regionId, p.id);
      if (spot >= 0) {
        const x = spot % W, y = (spot - x) / W;
        if (this.tryBuild('airstrip', x, y, p.id) === null) return;
      }
    }

    // 3. ECONOMY
    const settCost = this.config.BUILDING_COSTS.settlement;
    if (safe.length > 0 && settlementCount < settlementCap && p.gold >= reserve + settCost) {
      const spot = this._pickSettlementSpot(safe, p.id);
      if (spot >= 0) {
        const x = spot % W, y = (spot - x) / W;
        if (this.tryBuild('settlement', x, y, p.id) === null) return;
      }
    }

    // 4. UPGRADE: tier up the lowest-level building we have here.
    let bestB: Building | null = null;
    let bestLvl = Infinity;
    for (const b of this.buildings) {
      if (b.owner !== p.id) continue;
      if ((b.level ?? 1) >= this.config.BUILDING_MAX_LEVEL) continue;
      if (this.regions[b.y * W + b.x] !== regionId) continue;
      const cost = this.upgradeCostFor(b.type, b.level);
      if (cost < 0 || p.gold < reserve + cost) continue;
      if (b.level < bestLvl) { bestLvl = b.level; bestB = b; }
    }
    if (bestB) this.tryUpgrade(bestB.x, bestB.y, p.id);
  }

  private _aiMaybeBomb(p: Player, targetRegion: number): void {
    const ready = this.airstripReadyAt(p.id);
    if (ready < 0 || ready > this.tickCount) return;
    const tiles = this._tilesByRegion[targetRegion];
    if (!tiles || tiles.length === 0) return;
    // Pick the densest enemy cluster in the target region. Score
    // = enemies − 4×friendlies so we don't bomb our own border.
    const W = this.territory.width;
    let bestX = -1, bestY = -1, bestCount = 0, bestScore = -Infinity;
    for (let n = 0; n < Math.min(20, tiles.length); n++) {
      const i = tiles[(Math.random() * tiles.length) | 0]!;
      const o = this.territory.owners[i]!;
      if (o === 0 || o === p.id) continue;
      const x = i % W, y = (i - x) / W;
      let enemies = 0, friendlies = 0;
      const r = 4;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!this.territory.inBounds(nx, ny)) continue;
        const oo = this.territory.getOwner(nx, ny);
        if (oo <= 0) continue;
        if (oo === p.id) friendlies++;
        else if (this.areAllied(p.id, oo)) friendlies++;
        else enemies++;
      }
      const score = enemies - friendlies * 4;
      if (score > bestScore) { bestScore = score; bestCount = enemies; bestX = x; bestY = y; }
    }
    if (bestCount < 6) return;
    const bombType: BombType = p.gold >= this.config.BOMB_COSTS.large * 1.5 ? 'large' : 'small';
    if (p.gold < this.config.BOMB_COSTS[bombType]) return;
    this.dropBomb(bombType, bestX, bestY, p.id);
  }

  // Pick a region for an AI to push into: prefer regions adjacent to its
  // current territory that aren't already fully owned. Falls back to a random
  // region if none are adjacent.
  private _pickAiTargetRegion(playerId: PlayerId): number | null {
    if (this.regionCount <= 0) return null;
    // Sim-aware fog: AI can only target regions adjacent to its frontier.
    // No random-distant-region fallback — that was effectively the AI
    // "seeing through fog". An AI cut off from any neighbour just sits
    // tight (which is what a real player would do until they expand to
    // a new contact point).
    const adjacent = this._adjacentRegions(playerId);
    if (adjacent.size === 0) return null;
    const arr = Array.from(adjacent);
    return arr[(Math.random() * arr.length) | 0]!;
  }

  // Region IDs touching the player's frontier (incl. tiles currently owned by
  // someone else) — i.e. regions the player can push into right now.
  // Allied players' regions are filtered out so AI doesn't waste a target
  // on someone it can't actually attack.
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
        if (own > 0 && this.areAllied(playerId, own)) continue;
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

      // Gold for vassal-driven expansion comes out of the vassal region's
      // own pool, not the leader's. Manual / leader-driven expansion still
      // pays from p.gold. This matches the per-vassal economy contract:
      // commander treasury is fed by tribute, not drained by vassal moves.
      const useVassalGold = isVassalDriven && p.isHuman && tileRegion > 0;
      const goldPool = (): number => useVassalGold ? this._vassalGold[tileRegion]! : p.gold;
      const spend = (n: number): void => {
        if (useVassalGold) this._vassalGold[tileRegion]! -= n;
        else p.gold -= n;
      };

      if (goldPool() < this.config.EXPANSION_COST_PER_CLAIM) continue;

      // Vassals push more eagerly than the player's manual orders. Forced
      // March decree adds further boost on top. Rich AIs (gold > 1500)
      // burn through their stockpile by pushing 60% harder — keeps the
      // AI from sitting on a giant idle treasury.
      let tileChance = isVassalDriven
        ? baseChance * this._expansionBoostFor(p)
        : baseChance;
      if (!p.isHuman && p.gold > 1500) tileChance *= 1.6;

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
      // Allies don't fight: skip every attack into an allied player's
      // territory. Idle expansion into unclaimed land still works.
      if (targetOwner > 0 && targetOwner !== p.id && this.areAllied(p.id, targetOwner)) continue;
      if (targetOwner === 0) {
        if (Math.random() > tileChance) continue;
        if (goldPool() < this.config.EXPANSION_COST_PER_CLAIM) continue;
        if (p.troops < this.config.EXPANSION_TROOP_COST) continue;
        if (this.tryCapture(chosen.x, chosen.y, p.id)) {
          spend(this.config.EXPANSION_COST_PER_CLAIM);
          p.troops = Math.max(0, p.troops - this.config.EXPANSION_TROOP_COST);
        }
      } else {
        const def = this._defenseAt(chosen.x, chosen.y, targetOwner);
        const cost = this.config.ATTACK_COST_PER_CLAIM * (1 + def);
        const defender = this.players[targetOwner];
        // Vassal-driven attacks now resolve at the REGIONAL level: each
        // side's effective troop strength is its leader's pool times the
        // attacker/defender region's share of that leader's empire,
        // times that region's morale, times a settlement garrison
        // multiplier (so a heavily-settled vassal genuinely defends
        // harder than an empty one).
        //
        // - DEFENDER side ALWAYS uses regional math: a fortified vassal
        //   feels fortified no matter who attacks (manual / vassal / AI).
        // - ATTACKER side uses regional math only on vassal-driven
        //   pushes; manual / AI attacks command the empire's full pool.
        let attackerPower = p.troops;
        let defenderPower = Math.max(1, defender?.troops ?? 1);
        const defR = this.regions[chosen.y * W + chosen.x] ?? 0;
        if (defender) {
          const ownedD = this.territory.counts[defender.id] || 1;
          const tilesD = defR > 0 ? (this._tilesByRegion[defR]?.length ?? 1) : ownedD;
          const fracD = ownedD > 0 ? Math.min(1, tilesD / ownedD) : 1;
          const moraleD = defR > 0 ? (this._regionMorale[defR] ?? 1) : 1;
          const garrisonD = this._settlementGarrison(defR, defender.id);
          defenderPower = Math.max(1, defender.troops * fracD * moraleD * garrisonD);
        }
        if (isVassalDriven) {
          const ownedA = this.territory.counts[p.id] || 1;
          const tilesA = (tileRegion > 0 ? this._tilesByRegion[tileRegion]?.length : 0) || 1;
          const fracA = ownedA > 0 ? Math.min(1, tilesA / ownedA) : 1;
          const moraleA = tileRegion > 0 ? (this._regionMorale[tileRegion] ?? 1) : 1;
          const garrisonA = this._settlementGarrison(tileRegion, p.id);
          attackerPower = p.troops * fracA * moraleA * garrisonA;
        }
        const ratio = attackerPower / defenderPower;
        const ratioFactor = Math.max(
          this.config.ATTACK_RATIO_MIN,
          Math.min(
            this.config.ATTACK_RATIO_MAX,
            Math.pow(ratio, this.config.ATTACK_RATIO_EXP),
          ),
        );
        // Rally buff applies a 1.5× multiplier to combat rate for its duration.
        const rate = tileChance * this.config.ATTACK_RATE_MULT * ratioFactor * this._rallyMult(p) / (1 + def);
        if (Math.random() > rate) continue;
        if (goldPool() < cost) continue;
        if (p.troops < this.config.TROOP_COST_PER_ATTACK) continue;
        if (this.tryCapture(chosen.x, chosen.y, p.id)) {
          spend(cost);
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
    if (this._turretCacheDirty) this._rebuildTurretCache();
    const defender = this.players[defenderId];
    const ironDoctrine = defender ? (defender.decreeStacks['iron-doctrine'] ?? 0) : 0;
    const W = this.territory.width;
    const i = y * W + x;
    const grid = this._turretBonus.get(defenderId);
    let bonus = grid ? grid[i]! : 0;
    if (ironDoctrine > 0) bonus = (bonus + 1) * 1.2 - 1;
    if (this.regionCount > 0) {
      const r = this.regions[i]!;
      if (r > 0 && this._regionOwner[r] === defenderId) {
        // Ground mastery: full-region fortress bonus is 50% bigger.
        const groundFortMult = defender?.mastery === 'ground' ? 1.5 : 1.0;
        bonus += this.config.FULL_REGION_DEFENSE_BONUS * groundFortMult;
      }
    }
    // Ground mastery: every owned tile defends 30% better. Compounds
    // multiplicatively with iron-doctrine and turret coverage so a
    // ground player with turrets feels genuinely fortress-like.
    if (defender?.mastery === 'ground') bonus = (bonus + 1) * 1.30 - 1;
    return bonus;
  }

  /** Returns total turret retaliation damage at (x, y) against attackerId. */
  private _turretRetaliationAt(x: number, y: number, defenderId: PlayerId): number {
    if (this._turretCacheDirty) this._rebuildTurretCache();
    const grid = this._turretRetal.get(defenderId);
    if (!grid) return 0;
    const W = this.territory.width;
    const i = y * W + x;
    let val = grid[i]!;
    const defender = this.players[defenderId];
    const borderPatrol = defender ? (defender.decreeStacks['border-patrol'] ?? 0) : 0;
    if (borderPatrol > 0) val *= 1.5;
    // Ground mastery: +50% turret retaliation (the bite-back damage when
    // attackers successfully capture inside a turret radius).
    if (defender?.mastery === 'ground') val *= 1.5;
    return val;
  }

  /** Stamps every turret's defense + retaliation onto a per-defender tile
   *  grid (one Float32Array per active defender). After this, _defenseAt /
   *  retaliation lookups are O(1). Border Patrol's +1 radius is baked in;
   *  the +50% retaliation is applied at lookup time so the cache doesn't
   *  invalidate as decrees stack. */
  private _rebuildTurretCache(): void {
    const W = this.territory.width;
    const H = this.territory.height;
    const tiles = W * H;
    // Reuse existing buffers; zero them in place. Owners that no longer have
    // turrets keep the zeroed buffer (cheap to leave; freed when player dies).
    for (const arr of this._turretBonus.values()) arr.fill(0);
    for (const arr of this._turretRetal.values()) arr.fill(0);

    const ensureGrid = (id: PlayerId): { def: Float32Array; ret: Float32Array } => {
      let def = this._turretBonus.get(id);
      let ret = this._turretRetal.get(id);
      if (!def) { def = new Float32Array(tiles); this._turretBonus.set(id, def); }
      if (!ret) { ret = new Float32Array(tiles); this._turretRetal.set(id, ret); }
      return { def, ret };
    };

    const baseRBy = this._scratch256b;
    baseRBy.fill(this.config.TURRET_RADIUS);
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (p && (p.decreeStacks['border-patrol'] ?? 0) > 0) {
        baseRBy[id]! = this.config.TURRET_RADIUS + 1;
      }
    }
    for (const b of this.buildings) {
      if (b.type !== 'turret') continue;
      const owner = b.owner;
      const lvl = b.level ?? 1;
      // L1-3: gentle +1 radius per tier. L4-6 (bronze/silver/diamond
      // consolidations): much wider coverage so the consolidated tower
      // visibly replaces the cluster it absorbed.
      const r = lvl <= 3
        ? baseRBy[owner]! + (lvl - 1)
        : baseRBy[owner]! + 2 + (lvl - 3) * 4; // L4=base+6, L5=+10, L6=+14
      const r2 = r * r;
      const defAdd = this.config.TURRET_DEFENSE_BONUS * lvl;
      const retAdd = this.config.TURRET_RETALIATION_DAMAGE * lvl;
      const grids = ensureGrid(owner);
      const def = grids.def, ret = grids.ret;
      const x0 = Math.max(0, b.x - r);
      const x1 = Math.min(W - 1, b.x + r);
      const y0 = Math.max(0, b.y - r);
      const y1 = Math.min(H - 1, b.y + r);
      for (let y = y0; y <= y1; y++) {
        const dy = y - b.y;
        const dy2 = dy * dy;
        const row = y * W;
        for (let x = x0; x <= x1; x++) {
          const dx = x - b.x;
          if (dx * dx + dy2 <= r2) {
            def[row + x]! += defAdd;
            ret[row + x]! += retAdd;
          }
        }
      }
    }
    this._turretCacheDirty = false;
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
        if (b.type === 'settlement') {
          // Use the settlement's actual level radius — tiers 4-6 paint a
          // bigger circle than L1-3, so destruction must mirror that.
          const lvl = b.level ?? 1;
          this._applySettlement(b.x, b.y, -lvl, this._settlementRadius(lvl));
        }
        if (b.type === 'turret') this._turretCacheDirty = true;
        this.buildings.splice(i, 1);
        this.events.push({ type: 'destroyed', buildingType: b.type, ownerId: b.owner });
      }
    }
  }

  /** Radius for a settlement at a given level. Levels 1-3 use the
   *  config base; bronze/silver/diamond (4/5/6) cover much larger
   *  areas because they consolidate 5 lower-tier settlements each. */
  private _settlementRadius(level: number): number {
    if (level <= 3) return this.config.SETTLEMENT_RADIUS;
    return this.config.SETTLEMENT_RADIUS + (level - 3) * 4; // L4=10, L5=14, L6=18
  }

  /** Tier-promotion: when 5 same-type same-level (≥3) buildings of the
   *  same owner are clustered tightly, fold them into one bronze (L4),
   *  silver (L5), or diamond (L6). Drastically reduces visual clutter
   *  while expanding the cluster's effective range.
   *
   *  Triggered by tryBuild and tryUpgrade after success. Recurses on
   *  the promoted building so 5 bronze can chain into silver, etc. */
  private _tryConsolidate(b: Building): void {
    if (b.type !== 'settlement' && b.type !== 'turret') return;
    const lvl = b.level ?? 1;
    if (lvl < 3 || lvl >= 6) return; // promote only from L3-5 → L4-6

    const detectR = lvl === 3 ? 12 : lvl === 4 ? 16 : 20;
    const detectR2 = detectR * detectR;
    const cluster: Building[] = [];
    for (const c of this.buildings) {
      if (c.type !== b.type) continue;
      if ((c.level ?? 1) !== lvl) continue;
      if (c.owner !== b.owner) continue;
      const dx = c.x - b.x, dy = c.y - b.y;
      if (dx * dx + dy * dy > detectR2) continue;
      cluster.push(c);
    }
    if (cluster.length < 5) return;
    // Closest 5 to the trigger building.
    cluster.sort((a, c) =>
      ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y))
      - ((c.x - b.x) * (c.x - b.x) + (c.y - b.y) * (c.y - b.y)));
    const toMerge = cluster.slice(0, 5);

    // Centroid → snap to a non-water owned tile if the rounded centroid
    // is unsuitable. Falls back to the trigger building's tile so we
    // never end up on water or on someone else's land.
    let sx = 0, sy = 0;
    for (const c of toMerge) { sx += c.x; sy += c.y; }
    let cx = Math.round(sx / 5);
    let cy = Math.round(sy / 5);
    const tileOK = (x: number, y: number): boolean =>
      this.territory.inBounds(x, y)
      && this.territory.isPassable(x, y)
      && this.territory.getOwner(x, y) === b.owner;
    if (!tileOK(cx, cy)) { cx = b.x; cy = b.y; }
    // Avoid colliding with a non-merged building at that tile.
    const blocking = this.buildings.find(c => c.x === cx && c.y === cy && !toMerge.includes(c));
    if (blocking) { cx = b.x; cy = b.y; }

    // Remove the 5 originals (paint-out their effects, drop them).
    for (const c of toMerge) {
      if (c.type === 'settlement') {
        const cl = c.level ?? 1;
        this._applySettlement(c.x, c.y, -cl, this._settlementRadius(cl));
      }
      if (c.type === 'turret') this._turretCacheDirty = true;
      const idx = this.buildings.indexOf(c);
      if (idx >= 0) this.buildings.splice(idx, 1);
    }

    // Add the promoted building at the centroid.
    const promoted: Building = { x: cx, y: cy, owner: b.owner, type: b.type, level: lvl + 1 };
    this.buildings.push(promoted);
    if (b.type === 'settlement') {
      this._applySettlement(cx, cy, lvl + 1, this._settlementRadius(lvl + 1));
    }
    if (b.type === 'turret') this._turretCacheDirty = true;
    this.events.push({ type: 'built', buildingType: b.type, ownerId: b.owner });

    // Chain: 5 bronze → silver, 5 silver → diamond.
    this._tryConsolidate(promoted);
  }

  /** Apply a settlement's gold-multiplier paint at the supplied radius
   *  (defaults to the L1-3 base if omitted). `sign` is added per tile. */
  private _applySettlement(cx: number, cy: number, sign: number, radius?: number): void {
    const r = radius ?? this.config.SETTLEMENT_RADIUS;
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

  // --- Ships -------------------------------------------------------------

  /** Returns true if (x, y) is in bounds AND a water tile (any kind). */
  private _isWaterTile(x: number, y: number): boolean {
    if (!this.territory.inBounds(x, y)) return false;
    return !this.territory.isPassable(x, y);
  }

  /** Build a ship of the given kind. The build origin must be a coastal
   *  land tile owned by the player; the ship spawns on the closest water
   *  tile adjacent to it. */
  buildShip(kind: ShipKind, x: number, y: number, ownerId: PlayerId): ShipBuildError | null {
    const cost = this.config.SHIP_COSTS[kind];
    if (cost == null) return 'bad-type';
    if (!this.territory.inBounds(x, y)) return 'oob';
    const owner = this.players[ownerId];
    if (!owner || !owner.alive) return 'dead';
    if (!this.isUnlocked(ownerId, 'ships')) return 'locked';
    if (this.territory.getOwner(x, y) !== ownerId) return 'not-coastal';
    if (this.territory.isPassable(x, y) === false) return 'not-coastal';
    // Find adjacent water tile to spawn on.
    let sx = -1, sy = -1;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (this._isWaterTile(nx, ny)) { sx = nx; sy = ny; break; }
    }
    if (sx < 0) return 'no-water';
    const myShips = this.ships.reduce((n, s) => s.owner === ownerId ? n + 1 : n, 0);
    // Naval mastery: +2 ship cap (e.g. 8 → 10).
    const cap = this.config.SHIP_PLAYER_CAP + (owner.mastery === 'naval' ? 2 : 0);
    if (myShips >= cap) return 'cap';
    if (owner.gold < cost) return 'gold';
    owner.gold -= cost;
    const ship: Ship = {
      id: this._shipNextId++,
      owner: ownerId,
      kind,
      x: sx, y: sy,
      destX: -1, destY: -1,
      manual: false,
      hp: this.config.SHIP_HP[kind],
      fireCooldown: 0,
    };
    this.ships.push(ship);
    this.events.push({ type: 'ship-built', shipKind: kind, ownerId });
    return null;
  }

  /** Set a ship's destination. If (x, y) is land it's snapped to the
   *  nearest water neighbor — otherwise the ship can't reach it. Returns
   *  true on success. Used by the player tap-to-target. */
  setShipTarget(shipId: number, x: number, y: number, ownerId: PlayerId): boolean {
    const s = this.shipById(shipId);
    if (!s || s.owner !== ownerId) return false;
    if (!this.territory.inBounds(x, y)) return false;
    let tx = x, ty = y;
    if (!this._isWaterTile(tx, ty)) {
      // Snap to the nearest water-adjacent tile.
      let best = -1, bx = tx, by = ty;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tx + dx, ny = ty + dy;
        if (this._isWaterTile(nx, ny)) {
          const d = Math.abs(nx - s.x) + Math.abs(ny - s.y);
          if (best < 0 || d < best) { best = d; bx = nx; by = ny; }
        }
      }
      if (best < 0) return false;
      tx = bx; ty = by;
    }
    s.destX = tx; s.destY = ty;
    s.manual = true;
    return true;
  }

  shipById(id: number): Ship | null {
    for (const s of this.ships) if (s.id === id) return s;
    return null;
  }

  /** Return a ship belonging to ownerId within `tolTiles` of (wx, wy), or
   *  null. Used by tap-to-select. Closest match wins. */
  shipNear(wx: number, wy: number, ownerId: PlayerId, tolTiles: number): Ship | null {
    let best: Ship | null = null;
    let bestD = Infinity;
    for (const s of this.ships) {
      if (s.owner !== ownerId) continue;
      const d = Math.hypot(s.x - wx, s.y - wy);
      if (d <= tolTiles && d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** Per-tick simulation for all ships: movement, patrol target choice,
   *  bombardment of adjacent enemy coast, and warship landfall (claiming
   *  the coastal tile). */
  private _shipsTick(): void {
    if (this.ships.length === 0) return;
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i]!;
      const owner = this.players[s.owner];
      if (!owner || !owner.alive || s.hp <= 0) {
        this.events.push({ type: 'ship-sunk', shipKind: s.kind, ownerId: s.owner, x: s.x, y: s.y });
        this.ships.splice(i, 1);
        continue;
      }
      if (s.fireCooldown > 0) s.fireCooldown--;
      this._shipMove(s);
      this._shipFire(s);
    }
  }

  private _shipMove(s: Ship): void {
    const moveTicks = this.config.SHIP_MOVE_TICKS[s.kind];
    if (this.tickCount % moveTicks !== 0) return;
    if (s.destX < 0 || s.destY < 0) {
      // Pick a patrol target near an enemy coast (or random water).
      const t = this._pickShipPatrolTarget(s);
      if (t) { s.destX = t.x; s.destY = t.y; s.manual = false; }
      else return;
    }
    if (s.x === s.destX && s.y === s.destY) {
      s.destX = -1; s.destY = -1; s.manual = false;
      return;
    }
    const dx = Math.sign(s.destX - s.x);
    const dy = Math.sign(s.destY - s.y);
    // Try diagonal first, then axis-aligned, then perpendicular nudges.
    const tries: Array<[number, number]> = [
      [dx, dy], [dx, 0], [0, dy],
      [dx, dy === 0 ? 1 : 0], [dx, dy === 0 ? -1 : 0],
      [dx === 0 ? 1 : 0, dy], [dx === 0 ? -1 : 0, dy],
    ];
    for (const [stepX, stepY] of tries) {
      if (stepX === 0 && stepY === 0) continue;
      const nx = s.x + stepX, ny = s.y + stepY;
      if (this._isWaterTile(nx, ny)) {
        s.x = nx; s.y = ny;
        return;
      }
    }
    // Stuck — drop the destination so we re-roll a patrol next tick.
    s.destX = -1; s.destY = -1; s.manual = false;
  }

  private _shipFire(s: Ship): void {
    if (s.fireCooldown > 0) return;
    const range = this.config.SHIP_RANGE[s.kind];
    const r2 = range * range;
    const owner = this.players[s.owner];

    // DESTROYER: prioritises enemy ships in range. If any are present
    // it shoots at the closest one for heavy damage; otherwise falls
    // back to the standard land-bombardment behavior at half damage
    // (it's an anti-ship hull, not a coast cracker).
    if (s.kind === 'destroyer') {
      let bestShip: Ship | null = null;
      let bestShipD = Infinity;
      for (const o of this.ships) {
        if (o.id === s.id) continue;
        if (o.owner === s.owner) continue;
        if (this.areAllied(s.owner, o.owner)) continue;
        const dx = o.x - s.x, dy = o.y - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        if (d2 < bestShipD) { bestShipD = d2; bestShip = o; }
      }
      if (bestShip) {
        bestShip.hp -= 50; // big anti-ship payload
        if (bestShip.hp <= 0) {
          this.events.push({ type: 'ship-sunk', shipKind: bestShip.kind, ownerId: bestShip.owner, x: bestShip.x, y: bestShip.y });
          const idx = this.ships.indexOf(bestShip);
          if (idx >= 0) this.ships.splice(idx, 1);
        }
        const reloadMult = owner?.mastery === 'naval' ? 0.75 : 1.0;
        s.fireCooldown = Math.max(1, Math.floor(this.config.SHIP_FIRE_TICKS[s.kind] * reloadMult));
        return;
      }
      // No ships in range — fall through to land bombardment below.
    }

    // SUBMARINE: doesn't direct-fire. Launches a missile (a Plane
    // configured as a small bomb) toward the nearest enemy land tile
    // in range. The missile flies, can be hit by AA en route, and
    // detonates as a small bomb on arrival. Means subs project power
    // inland from far offshore.
    if (s.kind === 'submarine') {
      let tx = -1, ty = -1, bestD = Infinity;
      const W2 = this.territory.width;
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const cx = Math.floor(s.x + dx), cy = Math.floor(s.y + dy);
          if (!this.territory.inBounds(cx, cy)) continue;
          if (!this.territory.isPassable(cx, cy)) continue;
          const o = this.territory.getOwner(cx, cy);
          if (o <= 0 || o === s.owner) continue;
          if (this.areAllied(s.owner, o)) continue;
          if (d2 < bestD) { bestD = d2; tx = cx; ty = cy; }
        }
      }
      void W2;
      if (tx < 0) return;
      // Spawn a missile (plane) from the sub's tile flying to the target.
      const missile: Plane = {
        id: this._planeNextId++,
        owner: s.owner,
        bombType: 'small',
        x: s.x, y: s.y,
        destX: tx + 0.5, destY: ty + 0.5,
        speed: this.config.PLANE_SPEED.small,
        rolledAA: new Set<number>(),
        orbitUntilTick: 0,
        nextStrafeTick: 0,
      };
      this.planes.push(missile);
      this.events.push({
        type: 'plane-launched', bombType: 'small', ownerId: s.owner,
        x: s.x, y: s.y, destX: missile.destX, destY: missile.destY,
      });
      const reloadMult = owner?.mastery === 'naval' ? 0.75 : 1.0;
      s.fireCooldown = Math.max(1, Math.floor(this.config.SHIP_FIRE_TICKS[s.kind] * reloadMult));
      return;
    }

    // STANDARD ship fire (scout / skirmisher / warship — and destroyers
    // that found no ships in range).
    const dmg = s.kind === 'destroyer' ? 6 : this.config.SHIP_DAMAGE[s.kind];
    let bestX = -1, bestY = -1, bestD = Infinity;
    const W = this.territory.width;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const tx = s.x + dx, ty = s.y + dy;
        if (!this.territory.inBounds(tx, ty)) continue;
        if (!this.territory.isPassable(tx, ty)) continue;
        const o = this.territory.getOwner(tx, ty);
        if (o <= 0 || o === s.owner) continue;
        if (this.areAllied(s.owner, o)) continue;
        if (d2 < bestD) { bestD = d2; bestX = tx; bestY = ty; }
      }
    }
    if (bestX < 0) return;
    const defender = this.players[this.territory.getOwner(bestX, bestY)];
    if (defender) defender.troops = Math.max(0, defender.troops - dmg);
    // Warship landfall: if the hit tile is within 2 tiles AND not a capital,
    // attempt to flip it to the ship's owner.
    if (s.kind === 'warship') {
      const md = Math.abs(bestX - s.x) + Math.abs(bestY - s.y);
      if (md <= 2 && this._capitalIndexAt(bestX, bestY) < 0) {
        this.tryCapture(bestX, bestY, s.owner);
      }
    }
    // Naval mastery: ships reload 25% faster.
    const reloadMult = owner?.mastery === 'naval' ? 0.75 : 1.0;
    s.fireCooldown = Math.max(1, Math.floor(this.config.SHIP_FIRE_TICKS[s.kind] * reloadMult));
    void W;
  }

  /** Pick a water tile near an enemy coast (preferred) or a random water
   *  tile within sight. Used as the auto-patrol target. */
  private _pickShipPatrolTarget(s: Ship): Point | null {
    // Sample a few enemy coastal tiles within a radius and target adjacent water.
    const W = this.territory.width;
    const H = this.territory.height;
    const maxR = 30;
    for (let attempt = 0; attempt < 12; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * maxR;
      const tx = (s.x + Math.cos(ang) * dist) | 0;
      const ty = (s.y + Math.sin(ang) * dist) | 0;
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
      if (!this._isWaterTile(tx, ty)) continue;
      // Score: nearby enemy land = good.
      let enemyAdj = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (!this.territory.inBounds(nx, ny)) continue;
        const o = this.territory.getOwner(nx, ny);
        if (o > 0 && o !== s.owner) enemyAdj++;
      }
      if (enemyAdj > 0 || attempt >= 8) return { x: tx, y: ty };
    }
    return null;
  }

  // --- Planes (deferred bomb delivery) ---------------------------------

  /** Per-tick simulation for in-flight planes:
   *   - move toward dest at the bomb's speed
   *   - any enemy AA whose radius the plane is inside (and that hasn't
   *     yet rolled against it) gets one 75% chance to shoot it down
   *   - on arrival, detonate the bomb and remove the plane
   */
  private _planesTick(): void {
    if (this.planes.length === 0) return;
    const aaR2 = this.config.AA_RADIUS * this.config.AA_RADIUS;
    const hitChance = this.config.AA_HIT_CHANCE;
    for (let i = this.planes.length - 1; i >= 0; i--) {
      const pl = this.planes[i]!;
      // Advance position toward dest.
      const dx = pl.destX - pl.x;
      const dy = pl.destY - pl.y;
      const d = Math.hypot(dx, dy);

      // AC-130 orbit mode: instead of detonating on arrival, the gunship
      // hovers near the target and strafes periodically until orbit ends.
      // Each pass through enemy AA range gets a fresh roll because we
      // clear rolledAA when the plane moves out of range — see the AA
      // loop below for the re-entry handling.
      if (pl.bombType === 'ac130' && pl.orbitUntilTick > 0) {
        // Orbit done? Despawn.
        if (this.tickCount >= pl.orbitUntilTick) {
          this.planes.splice(i, 1);
          continue;
        }
        // Figure-8 (lemniscate of Bernoulli) around (destX, destY).
        // x(t) = a*cos(t) / (1 + sin²(t))
        // y(t) = a*cos(t)*sin(t) / (1 + sin²(t))
        // a = horizontal lobe size; the curve is naturally narrower
        // vertically so we stretch it slightly for a clean ∞ shape.
        const a = 3.5;
        const t = (this.tickCount * 0.07) + pl.id * 1.3;
        const denom = 1 + Math.sin(t) * Math.sin(t);
        pl.x = pl.destX + (a * Math.cos(t)) / denom;
        pl.y = pl.destY + (a * Math.cos(t) * Math.sin(t)) / denom;
        // Strafe at intervals.
        if (this.tickCount >= pl.nextStrafeTick) {
          this._strafe(pl.destX, pl.destY, pl.owner);
          pl.nextStrafeTick = this.tickCount + this.config.AC130_STRAFE_INTERVAL;
        }
        // Reset AA roll tracking every 3s so AA can fire again on a
        // gunship that's been overhead for a while. Otherwise a single
        // miss permanently neutralises that AA against the orbit.
        if (this.tickCount % 30 === 0) pl.rolledAA.clear();
        // Fall through to AA check (orbit phase is the most vulnerable).
      } else if (d <= pl.speed) {
        // Arrived — bombers detonate and despawn; AC-130 enters orbit.
        if (pl.bombType === 'ac130') {
          pl.x = pl.destX; pl.y = pl.destY;
          pl.orbitUntilTick = this.tickCount + this.config.AC130_ORBIT_TICKS;
          pl.nextStrafeTick = this.tickCount + 4; // first strafe almost immediately
          // Don't continue — fall through so AA can immediately roll
          // against the now-stationary gunship.
        } else {
          this._detonateBomb(pl.bombType, Math.floor(pl.destX), Math.floor(pl.destY), pl.owner);
          this.planes.splice(i, 1);
          continue;
        }
      } else {
        pl.x += (dx / d) * pl.speed;
        pl.y += (dy / d) * pl.speed;
      }

      // Check enemy AA for shootdown. Each AA gets one roll per plane.
      let shotDown = false;
      let killer: PlayerId = 0;
      for (const b of this.buildings) {
        if (b.type !== 'aa') continue;
        if (b.owner === pl.owner) continue;
        if (this.areAllied(b.owner, pl.owner)) continue;
        if (pl.rolledAA.has(this._buildingKey(b))) continue;
        const bx = b.x + 0.5, by = b.y + 0.5;
        const ddx = bx - pl.x, ddy = by - pl.y;
        if (ddx * ddx + ddy * ddy > aaR2) continue;
        // Plane is in range AND this AA hasn't rolled yet — roll now.
        pl.rolledAA.add(this._buildingKey(b));
        if (Math.random() < hitChance) {
          shotDown = true;
          killer = b.owner;
          break;
        }
      }

      // Naval AA: warships and skirmishers also defend against bombers.
      // Each ship gets one roll per plane (keyed by negative ship id so
      // it doesn't collide with the building keyspace).
      if (!shotDown) {
        for (const sh of this.ships) {
          if (sh.owner === pl.owner) continue;
          if (this.areAllied(sh.owner, pl.owner)) continue;
          const shipKey = -sh.id;
          if (pl.rolledAA.has(shipKey)) continue;
          const range = this.config.SHIP_RANGE[sh.kind];
          const sddx = sh.x + 0.5 - pl.x;
          const sddy = sh.y + 0.5 - pl.y;
          if (sddx * sddx + sddy * sddy > range * range) continue;
          pl.rolledAA.add(shipKey);
          // Per-tier shootdown chance — scout has none (too small for AA),
          // skirmisher 30%, warship 55%.
          const navalChance = sh.kind === 'warship' ? 0.55
            : sh.kind === 'skirmisher' ? 0.30
            : 0;
          if (navalChance > 0 && Math.random() < navalChance) {
            shotDown = true;
            killer = sh.owner;
            break;
          }
        }
      }

      if (shotDown) {
        this.events.push({
          type: 'plane-shot-down',
          bombType: pl.bombType,
          ownerId: pl.owner,
          byOwner: killer,
          x: pl.x, y: pl.y,
        });
        this.planes.splice(i, 1);
      }
    }
  }

  /** Stable id for a building (for the AA-already-rolled set). Buildings
   *  don't carry an id field today so we synth one from coords + type. */
  private _buildingKey(b: Building): number {
    return ((b.y | 0) * 65536 + (b.x | 0)) * 8 + (b.type === 'aa' ? 1 : b.type === 'turret' ? 2 : 0);
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
