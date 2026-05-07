import type { GameConfig } from './config.js';
import type {
  Player, PlayerId, Capital, Building, BuildingType, BombType, GameEvent,
  GameOutcome, BuildError, BombError, GroundOpType, GroundOpError, Point,
  Ship, ShipKind, ShipBuildError,
  Plane, ArtilleryUnit,
  TradeRoute, ExternalTradeRoute,
  ResourceKind,
} from './types.js';
import { RESOURCE_KINDS } from './types.js';
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
  readonly artilleryUnits: ArtilleryUnit[] = [];
  private _artilleryNextId = 1;
  /** Active trade routes (Phase 2 — internal vassal-to-vassal). Rebuilt
   *  every TRADE_RESCAN_TICKS via union-find connectivity + MST per
   *  component. Each route adds `flow` to its owner's treasury per tick. */
  readonly tradeRoutes: TradeRoute[] = [];
  /** Active external trade routes between allied players (Phase 3). Both
   *  sides earn `flow` per tick. Pruned automatically when either side
   *  dies or the alliance ends. */
  readonly externalTradeRoutes: ExternalTradeRoute[] = [];
  /** When each AI last considered proposing a trade route. Tick-throttled
   *  so AI doesn't hammer accept logic every tick. */
  private _aiTradeProposeAt = new Map<PlayerId, number>();
  private _tradeRouteRescanAt = 0;
  /** Centroid cache: `_regionCentroids[r*2 + 0/1]` = x/y in tile-space.
   *  Computed once at terrain init since regions are static partitions. */
  private _regionCentroids = new Float32Array(0);
  private _planeNextId = 1;
  readonly goldMultiplier: Float32Array;
  tickCount: number;
  outcome: GameOutcome;
  private events: GameEvent[];
  /** Monotonic counter bumped on any building add/remove/upgrade. Render
   *  layers gate redraw signatures off this so they don't have to scan
   *  `buildings` to detect change. */
  buildingsVersion = 0;

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
  /** Primary strategic resource per region, indexed by regionId.
   *  Empty string for region 0 (water). One resource per region —
   *  owning the region's tiles generates that resource per tick. */
  regionResources: (ResourceKind | null)[] = [];
  /** Per-tile numeric resource id (0..5) — denormalized from
   *  regionResources for the territory shader's B-channel encoding.
   *  0 = none (water), 1 = food, 2 = wood, 3 = stone, 4 = oil, 5 = gems.
   *  Resources are static after game init so this never changes. */
  resourceByTile!: Uint8Array;
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
  /** Per-region siege counter (ticks of continuous enemy adjacency).
   *  Drives the stalemate-breaker: sieged regions stop recovering
   *  morale and start bleeding it once the siege passes a grace period. */
  private _regionSiegeTicks!: Uint16Array;
  /** Per-region "morale at floor" counter — increments while morale is
   *  pinned at the 0.20 floor. Once this exceeds MORALE_COLLAPSE_GRACE,
   *  the region starts defecting tiles to the strongest besieger every
   *  few ticks. The endgame stalemate breaker: fortify all you want,
   *  but a sustained siege eventually cracks the region. */
  private _regionFloorTicks!: Uint16Array;
  /** Sum of settlement levels per owner. Updated incrementally on
   *  build/upgrade/destroy/consolidate so per-tick troop growth and
   *  combat-power math don't have to scan all buildings. */
  private _settlementLevelsByOwner = new Float32Array(256);
  /** Sum of settlement levels per (region * 256 + ownerId). Same idea
   *  but per-region for the settlement-garrison combat multiplier. */
  private _settlementLevelsByRegion!: Float32Array;

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

  /** Centroid x in tile-space for a region (0 if missing). Used by the
   *  TradeLayer to draw routes between vassal hubs. */
  regionCentroidX(regionId: number): number {
    return this._regionCentroids[regionId * 2] ?? 0;
  }
  /** Centroid y in tile-space for a region. */
  regionCentroidY(regionId: number): number {
    return this._regionCentroids[regionId * 2 + 1] ?? 0;
  }

  /** Sum of trade-route flows owned by this player per tick. UI uses
   *  this to display the player's net trade income (treasury delta/sec
   *  is `flow × SIM_HZ`). */
  tradeFlowFor(playerId: PlayerId): number {
    let sum = 0;
    for (const r of this.tradeRoutes) {
      if (r.ownerId === playerId) sum += r.flow;
    }
    return sum;
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
    this._regionSiegeTicks = new Uint16Array(this.regionCount + 1);
    this._regionFloorTicks = new Uint16Array(this.regionCount + 1);
    this._settlementLevelsByRegion = new Float32Array((this.regionCount + 1) * 256);
    this._settlementLevelsByOwner.fill(0);
    this.regionNames = generateRegionNames(this.regionCount);
    this._assignRegionResources();
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
    // Region centroid cache — averaged tile coords per region. Static
    // since regions are a fixed partition of the map.
    this._regionCentroids = new Float32Array((this.regionCount + 1) * 2);
    for (let r = 1; r <= this.regionCount; r++) {
      const tiles = this._tilesByRegion[r]!;
      if (tiles.length === 0) continue;
      let sx = 0, sy = 0;
      for (const i of tiles) {
        const x = i % W;
        sx += x;
        sy += (i - x) / W;
      }
      this._regionCentroids[r * 2]     = sx / tiles.length;
      this._regionCentroids[r * 2 + 1] = sy / tiles.length;
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
    // Whenever a tile flips away from a real owner, the loser's
    // building on that tile falls. Without this, paths that skip
    // tryCapture (morale collapse, ship landings, etc.) leave
    // turrets/settlements stuck on enemy land — the building keeps
    // buffing the original owner who no longer holds the tile.
    if (oldOwner > 0 && oldOwner !== newOwner) {
      this._destroyBuildingsAt(x, y);
    }
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
    if (idx >= 0) {
      // Toggle off — also clear the timer so re-tapping resets cleanly.
      p.targetRegions.splice(idx, 1);
      this._humanTargetSetAt.delete(r);
    } else {
      // Cooldown gate — can't re-target a region the human just lost
      // dominance of for REGION_LOSS_COOLDOWN_TICKS, but ONLY when an
      // enemy actually holds the region now. If a bomb wiped us below
      // dominance and the region is currently no-owner or back to us,
      // the cooldown is a false positive (no yo-yo to prevent) — drop
      // it and accept the tap.
      const cd = this._regionLossCooldown.get(`${r}.${p.id}`) ?? 0;
      if (cd > this.tickCount) {
        const dom = this._regionDominant[r] ?? 0;
        const enemyHolds = dom > 0 && dom !== p.id && !this.areAllied(p.id, dom);
        if (enemyHolds) return 0;
        this._regionLossCooldown.delete(`${r}.${p.id}`);
      }
      p.targetRegions.push(r);
      this._humanTargetSetAt.set(r, this.tickCount);
      // Aggression auto-declares war on the region's dominant owner if
      // they're a non-allied player at peace with us. Targeting a
      // neutral region or a region you already have war/alliance
      // status with skips the declaration.
      const dom = this._regionDominant[r] ?? 0;
      if (dom > 0 && dom !== p.id && !this.areAllied(p.id, dom) && !this.areAtWar(p.id, dom)) {
        this.declareWar(p.id, dom, 'aggression');
      }
    }
    p.expanding = p.targetRegions.length > 0;
    return r;
  }

  haltHuman(): void {
    const p = this.human();
    p.targetRegions = [];
    p.expanding = false;
    this._humanTargetSetAt.clear();
  }

  /** Tick count remaining (≥0) before the human can target a region
   *  they recently lost dominance over. 0 = ready. UI uses this to
   *  grey out the region-tap-target. */
  regionCooldownFor(playerId: PlayerId, regionId: number): number {
    const t = this._regionLossCooldown.get(`${regionId}.${playerId}`) ?? 0;
    return Math.max(0, t - this.tickCount);
  }

  // --- Tick ---

  tick(): void {
    if (this.outcome) return;
    this.tickCount++;
    this._expireHumanTargets();
    this._recoverMorale();
    this._applyMoraleCollapse();
    if (this.tickCount >= this._tradeRouteRescanAt) {
      this._rescanTradeRoutes();
      this._tradeRouteRescanAt = this.tickCount + 30; // every 3s
    }
    this._aiOfferTradeRoutes();
    this._applyTradeFlow();
    this._earnGoldAll();
    this._generateResources();
    this._payBuildingUpkeep();
    this._growTroops();
    this._vassalsThink();
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (!p || !p.alive) continue;
      if (!p.isHuman) {
        this._aiConsiderWar(p);
        this._aiThink(p);
        this._aiBuild(p);
        this._aiBuyDecrees(p);
      }
      // Always attempt expansion. _expand falls through tile-by-tile and
      // skips tiles with no effective target (no override + non-vassal).
      this._expand(p);
    }
    this._shipsTick();
    this._planesTick();
    this._portsTick();
    this._artilleryTick();
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
    if (type === 'aa')         return 1 + Math.floor(regionTiles / 50);
    if (type === 'port')       return 1 + Math.floor(regionTiles / 60);
    if (type === 'barracks')   return 1 + Math.floor(regionTiles / 60);
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

  hasBarracks(ownerId: PlayerId): boolean {
    return this.countBuildings(ownerId, 'barracks') > 0;
  }

  hasPort(ownerId: PlayerId): boolean {
    return this.countBuildings(ownerId, 'port') > 0;
  }

  /** Soonest tick at which a barracks belonging to ownerId will be
   *  ready to fire `opType`, or -1 if the player has no barracks at all.
   *  Each barracks tracks its own cooldown per ground-op type, so a
   *  player with two barracks can stagger Blitzkriegs but the same
   *  barracks can't fire the same op back-to-back. */
  barracksReadyAt(ownerId: PlayerId, opType: GroundOpType): number {
    let best = Infinity;
    let any = false;
    for (const b of this.buildings) {
      if (b.type !== 'barracks' || b.owner !== ownerId) continue;
      any = true;
      const ready = b.opCooldowns?.[opType] ?? 0;
      if (ready < best) best = ready;
    }
    if (!any) return -1;
    // Player-wide floor so the HUD reflects the actual gate.
    const owner = this.players[ownerId];
    const playerReady = owner?.groundOpCooldowns?.[opType] ?? 0;
    return Math.max(best, playerReady);
  }

  /** Fire a ground deployment from any ready Barracks belonging to
   *  ownerId. Mirror of dropBomb but for ground effects.
   *
   *  Effects (see _fire* methods below):
   *    - 'blitzkrieg' (300g, 30s): pick a target tile inside an enemy
   *      region. Each frontier tile of yours within R of target launches
   *      a 10-tile-deep BFS claim toward target, ignoring defense.
   *    - 'artillery' (250g, 20s): single shell at target tile. Drains
   *      80 troops from any enemy player owning tiles in r5, plus
   *      heavy ship damage. No claim wipe.
   *    - 'tanks' (400g, 60s): pick target tile. From your nearest
   *      frontier toward target, claim a LINE of 8 tiles ignoring
   *      defense. Steamroll. */
  tryGroundOp(type: GroundOpType, x: number, y: number, ownerId: PlayerId): GroundOpError | null {
    if (!this.territory.inBounds(x, y)) return 'oob';
    const owner = this.players[ownerId];
    if (!owner || !owner.alive) return 'dead';
    const cost = this.config.GROUND_OP_COSTS[type];
    if (cost == null) return 'bad-type';

    // Find soonest-ready barracks for this op type.
    let chosen: Building | null = null;
    let chosenReady = Infinity;
    let any = false;
    for (const b of this.buildings) {
      if (b.type !== 'barracks' || b.owner !== ownerId) continue;
      any = true;
      const ready = b.opCooldowns?.[type] ?? 0;
      if (ready <= this.tickCount && ready < chosenReady) {
        chosen = b;
        chosenReady = ready;
      }
    }
    if (!any) return 'no-barracks';
    if (!chosen) return 'cooldown';
    // Player-wide cooldown floor: stacking many barracks doesn't let
    // you spam the SAME op concurrently. Each op type has a single
    // cadence per player. Multiple barracks still let DIFFERENT ops
    // fire in parallel (you can blitz + arty + tanks at once), but
    // 15-blitz-burst-takes-half-the-map is over.
    const playerReady = owner.groundOpCooldowns?.[type] ?? 0;
    if (playerReady > this.tickCount) return 'cooldown';

    // Aggression auto-declares war on the target tile owner if needed.
    // Same logic as dropBomb so ground deployments don't bypass the
    // peace-state model.
    const targetOwner = this.territory.getOwner(x, y);
    if (targetOwner > 0 && targetOwner !== ownerId
        && !this.areAllied(ownerId, targetOwner)
        && !this.areAtWar(ownerId, targetOwner)) {
      this.declareWar(ownerId, targetOwner, 'aggression');
    }

    if (!this._chargeOps(owner, cost)) return 'gold';

    // Set per-op cooldown on the firing barracks AND player-wide floor.
    if (!chosen.opCooldowns) chosen.opCooldowns = {};
    chosen.opCooldowns[type] = this.tickCount + this.config.GROUND_OP_COOLDOWN_TICKS[type];
    if (!owner.groundOpCooldowns) owner.groundOpCooldowns = {};
    owner.groundOpCooldowns[type] = this.tickCount + this.config.GROUND_OP_COOLDOWN_TICKS[type];

    // Apply effect.
    if (type === 'blitzkrieg') this._fireBlitzkrieg(owner, x, y);
    else if (type === 'artillery') this._fireArtilleryStrike(owner, x, y);
    else if (type === 'tanks') this._fireTankPush(owner, x, y);

    this.events.push({ type: 'ground-op', opType: type, ownerId, x, y });
    return null;
  }

  /** Blitzkrieg: every frontier tile of `p` within R of (tx,ty) launches
   *  a BFS claim up to 10 tiles deep toward target. Ignores defense.
   *  Only takes neutral / at-war tiles. Per-anchor depth cap so the
   *  burst feels like multiple simultaneous deep pushes from the front. */
  private _fireBlitzkrieg(p: Player, tx: number, ty: number): void {
    const DEPTH = this.config.GROUND_OP_RADII['blitzkrieg'];
    const ANCHOR_R = 8;
    const W = this.territory.width;
    const territory = this.territory;
    const claimedThisFire = new Set<number>();
    // Find frontier tiles within ANCHOR_R of target.
    const anchors: number[] = [];
    const frontier = territory.getFrontier(p.id);
    for (const i of frontier) {
      const x = i % W, y = (i - x) / W;
      const dx = x - tx, dy = y - ty;
      if (dx * dx + dy * dy > ANCHOR_R * ANCHOR_R) continue;
      anchors.push(i);
    }
    if (anchors.length === 0) return;
    const queue: Array<[number, number, number]> = [];
    const visited = new Set<number>();
    for (const i of anchors) {
      const x = i % W, y = (i - x) / W;
      for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        queue.push([x + ddx, y + ddy, 1]);
      }
    }
    // Hard cap on total claims regardless of anchor count. Without
    // this, claims = depth × max(2, anchors), so 30 frontier anchors
    // → 300 claims per fire — half the map vanishes per blitz. Cap
    // keeps a single blitz to ~30 tiles across however many anchors
    // contribute. Player-wide cooldown handles the spam vector.
    const MAX_CLAIMS = 30;
    let claims = 0;
    while (queue.length > 0 && claims < MAX_CLAIMS) {
      const [x, y, depth] = queue.shift()!;
      if (depth > DEPTH) continue;
      if (!territory.inBounds(x, y)) continue;
      if (!territory.isPassable(x, y)) continue;
      const idx = y * W + x;
      if (visited.has(idx) || claimedThisFire.has(idx)) continue;
      visited.add(idx);
      const o = territory.getOwner(x, y);
      if (o === p.id) {
        for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          queue.push([x + ddx, y + ddy, depth]);
        }
        continue;
      }
      if (o > 0) {
        if (this.areAllied(p.id, o)) continue;
        if (!this.areAtWar(p.id, o)) continue;
      }
      if (this._capitalIndexAt(x, y) >= 0) continue;
      if (!this._claim(x, y, p.id)) continue;
      claimedThisFire.add(idx);
      claims++;
      for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        queue.push([x + ddx, y + ddy, depth + 1]);
      }
    }
  }

  /** Artillery Strike: single shell at (tx,ty). Drains troops from
   *  enemy owners with tiles in radius and damages ships in range.
   *  Does NOT wipe claims — this is troop attrition, not territory. */
  /** Artillery Strike: spawn a rolling artillery unit. It moves toward
   *  the player's frontier nearest the target (a few seconds of "rolling"),
   *  then sets up and barrages the target zone for ~8s with a series of
   *  small AOE shells (AC-130 cadence, ground-launched). The unit despawns
   *  after the barrage ends. Real-time _artilleryTick processes phases. */
  private _fireArtilleryStrike(p: Player, tx: number, ty: number): void {
    // Find a Barracks owned by p closest to target — that's the spawn
    // (where the unit "rolls out from"). Falls back to player centroid.
    let spawnX = -1, spawnY = -1, bestD = Infinity;
    for (const b of this.buildings) {
      if (b.type !== 'barracks' || b.owner !== p.id) continue;
      const dx = b.x - tx, dy = b.y - ty;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; spawnX = b.x; spawnY = b.y; }
    }
    if (spawnX < 0) {
      const c = this.territory.centroid(p.id);
      spawnX = Math.floor(c.x); spawnY = Math.floor(c.y);
    }
    // Firing position: nearest player-owned tile to target. Not the
    // exact frontier (we want the unit to sit just behind the line),
    // but the closest owned tile is a fine proxy.
    const W = this.territory.width;
    const owners = this.territory.owners;
    let firingX = spawnX, firingY = spawnY, bestFD = Infinity;
    for (let i = 0; i < owners.length; i++) {
      if (owners[i] !== p.id) continue;
      const x = i % W, y = (i - x) / W;
      const dx = x - tx, dy = y - ty;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestFD) { bestFD = d2; firingX = x; firingY = y; }
    }
    this.artilleryUnits.push({
      id: this._artilleryNextId++,
      owner: p.id,
      x: spawnX + 0.5, y: spawnY + 0.5,
      destX: firingX + 0.5, destY: firingY + 0.5,
      targetX: tx + 0.5, targetY: ty + 0.5,
      fireUntilTick: 0,
      nextShotTick: 0,
    });
  }

  /** Per-tick: advance every ArtilleryUnit. Two phases:
   *    1. Rolling — move toward (destX, destY) at 0.35 tiles/tick.
   *    2. Firing — once arrived, fire a shell every 12 ticks for 8s
   *       (~7 shells). Each shell hits a tight radius-2 area at a
   *       random offset within r4 of the target zone, draining
   *       troops + damaging ships. */
  private _artilleryTick(): void {
    if (this.artilleryUnits.length === 0) return;
    const ROLL_SPEED = 0.35;
    const FIRE_DURATION_TICKS = 80; // 8s @ SIM_HZ=10
    const FIRE_INTERVAL = 12;
    const W = this.territory.width;
    const H = this.territory.height;
    for (let i = this.artilleryUnits.length - 1; i >= 0; i--) {
      const u = this.artilleryUnits[i]!;
      // Owner may have died mid-deployment.
      const owner = this.players[u.owner];
      if (!owner || !owner.alive) { this.artilleryUnits.splice(i, 1); continue; }

      if (u.fireUntilTick === 0) {
        // Phase 1: roll.
        const dx = u.destX - u.x, dy = u.destY - u.y;
        const d = Math.hypot(dx, dy);
        if (d <= ROLL_SPEED) {
          u.x = u.destX; u.y = u.destY;
          u.fireUntilTick = this.tickCount + FIRE_DURATION_TICKS;
          u.nextShotTick = this.tickCount + 4; // first shell almost immediately
        } else {
          u.x += (dx / d) * ROLL_SPEED;
          u.y += (dy / d) * ROLL_SPEED;
        }
        continue;
      }

      // Phase 2: fire.
      if (this.tickCount >= u.fireUntilTick) {
        this.artilleryUnits.splice(i, 1);
        continue;
      }
      if (this.tickCount >= u.nextShotTick) {
        u.nextShotTick = this.tickCount + FIRE_INTERVAL;
        // Random offset within r4 of target.
        const SCATTER = 4;
        let sx = Math.floor(u.targetX + (Math.random() * 2 - 1) * SCATTER);
        let sy = Math.floor(u.targetY + (Math.random() * 2 - 1) * SCATTER);
        if (sx < 0) sx = 0; if (sx >= W) sx = W - 1;
        if (sy < 0) sy = 0; if (sy >= H) sy = H - 1;
        this._fireArtilleryShell(u.owner, sx, sy);
      }
    }
  }

  /** One artillery shell impact: tight radius-2 AOE. Wipes enemy tiles
   *  to neutral (and destroys buildings on them) — same effect a Small
   *  bomb has but with a smaller blast. Drains 30 troops per hit tile
   *  per enemy owner, 25hp ship damage. */
  private _fireArtilleryShell(ownerId: PlayerId, tx: number, ty: number): void {
    const r = 2;
    const r2 = r * r;
    const W = this.territory.width;
    const H = this.territory.height;
    const drainPerOwner = new Map<PlayerId, number>();
    const wipedByRegion = new Map<number, number>();
    for (let dy = -r; dy <= r; dy++) {
      const y = ty + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = tx + dx;
        if (x < 0 || x >= W) continue;
        if (this._capitalIndexAt(x, y) >= 0) continue;
        if (!this.territory.isPassable(x, y)) continue;
        const o = this.territory.getOwner(x, y);
        if (o === ownerId) continue;
        if (o > 0 && this.areAllied(ownerId, o)) continue;
        if (o > 0) {
          // Track for troop drain.
          drainPerOwner.set(o, (drainPerOwner.get(o) ?? 0) + 1);
          // Wipe to neutral. Buildings come down with the tile via _claim.
          if (this._claim(x, y, 0)) {
            const reg = this.regions[y * W + x]!;
            if (reg > 0) wipedByRegion.set(reg, (wipedByRegion.get(reg) ?? 0) + 1);
          }
        } else {
          // Already neutral — still destroy any building sitting there.
          if (this.buildingAt(x, y)) this._destroyBuildingsAt(x, y);
        }
      }
    }
    for (const [oid, hits] of drainPerOwner) {
      const enemy = this.players[oid];
      if (!enemy) continue;
      enemy.troops = Math.max(0, enemy.troops - hits * 30);
    }
    for (const [reg, n] of wipedByRegion) this._drainMoraleForRegion(reg, n);
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i]!;
      if (s.owner === ownerId) continue;
      if (this.areAllied(ownerId, s.owner)) continue;
      const sdx = s.x + 0.5 - tx;
      const sdy = s.y + 0.5 - ty;
      if (sdx * sdx + sdy * sdy > r2) continue;
      s.hp -= 25;
      if (s.hp <= 0) {
        this.events.push({ type: 'ship-sunk', shipKind: s.kind, ownerId: s.owner, x: s.x, y: s.y });
        this.ships.splice(i, 1);
      }
    }
    this.events.push({ type: 'bomb', bombType: 'small', x: tx, y: ty, radius: r, ownerId });
  }

  /** Tank Push: from the closest frontier tile to target, claim every
   *  tile inside a wide V-cone (90° wedge) up to DEPTH+50% deep toward
   *  target. Ignores defense. Each enemy tile claimed also drains 50
   *  troops from its owner — armor visibly grinds infantry as it
   *  rolls, not just paints territory. Steamroll. */
  private _fireTankPush(p: Player, tx: number, ty: number): void {
    // Beefed up per playtest: cone widened to 90° (45° half-angle) and
    // depth boosted +50%, claim cap doubled. Single push now visibly
    // sweeps a chunk of the map.
    const DEPTH = Math.floor(this.config.GROUND_OP_RADII['tanks'] * 1.5);
    const HALF_ANGLE_COS = Math.cos(Math.PI / 4); // 45° half-angle → 90° cone
    const W = this.territory.width;
    const territory = this.territory;
    const frontier = territory.getFrontier(p.id);
    if (frontier.size === 0) return;
    let bestI = -1, bestD = Infinity;
    for (const i of frontier) {
      const x = i % W, y = (i - x) / W;
      const dx = x - tx, dy = y - ty;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; bestI = i; }
    }
    if (bestI < 0) return;
    const sx = bestI % W;
    const sy = (bestI - sx) / W;
    const ddx = tx - sx, ddy = ty - sy;
    const dlen = Math.hypot(ddx, ddy);
    if (dlen < 0.001) return;
    const nx = ddx / dlen, ny = ddy / dlen;
    const MAX_CLAIMS = 70;
    let claimed = 0;
    const drainPerOwner = new Map<PlayerId, number>();
    for (let yy = -DEPTH; yy <= DEPTH; yy++) {
      for (let xx = -DEPTH; xx <= DEPTH; xx++) {
        if (claimed >= MAX_CLAIMS) break;
        const dist2 = xx * xx + yy * yy;
        if (dist2 === 0 || dist2 > DEPTH * DEPTH) continue;
        const dist = Math.sqrt(dist2);
        const dot = (nx * xx + ny * yy) / dist;
        if (dot < HALF_ANGLE_COS) continue;
        const ix = sx + xx, iy = sy + yy;
        if (!territory.inBounds(ix, iy)) continue;
        if (!territory.isPassable(ix, iy)) continue;
        if (this._capitalIndexAt(ix, iy) >= 0) continue;
        const o = territory.getOwner(ix, iy);
        if (o === p.id) continue;
        if (o > 0) {
          if (this.areAllied(p.id, o)) continue;
          if (!this.areAtWar(p.id, o)) continue;
        }
        if (this._claim(ix, iy, p.id)) {
          claimed++;
          if (o > 0) drainPerOwner.set(o, (drainPerOwner.get(o) ?? 0) + 1);
        }
      }
    }
    // Visible bleed on every enemy who lost ground to the push — armor
    // chews infantry, not just paints territory.
    for (const [oid, hits] of drainPerOwner) {
      const enemy = this.players[oid];
      if (!enemy) continue;
      enemy.troops = Math.max(0, enemy.troops - hits * 50);
    }
    // Brief +50% combat power buff for 12s after — the steamroll
    // momentum continues longer than before.
    p.activeBuffs['tank-rush'] = this.tickCount + 120; // 12s (was 8s)
  }

  /** null on success, error code otherwise. */
  /**
   * Build a building. If `fromVassalRegion` > 0, the cost is paid from that
   * vassal's gold pool (used by autonomous vassal builds). Default 0 means
   * the cost is paid from the player's main gold pool (manual builds).
   */
  tryBuild(type: BuildingType, x: number, y: number, ownerId: PlayerId, fromVassalRegion = 0): BuildError | null {
    const baseCost = this.config.BUILDING_COSTS[type];
    if (baseCost == null) return 'bad-type';
    if (!this.territory.inBounds(x, y)) return 'oob';
    const owner = this.players[ownerId];
    if (!owner || !owner.alive) return 'dead';
    if (this.territory.getOwner(x, y) !== ownerId) return 'not-yours';
    if (this.buildingAt(x, y)) return 'occupied';
    if (this._capitalIndexAt(x, y) >= 0) return 'on-capital';
    // Mastery gate. Settlement + turret are always available; airstrip
    // and AA require the AIR mastery.
    if (type === 'airstrip' && !this.isUnlocked(ownerId, 'airstrip')) return 'locked';
    // AA, port, artillery are defensive buildings available to everyone.
    // Earlier design gated AA behind air-mastery, but that left ground/
    // naval AIs unable to defend at all and air-mastery dominated late
    // game. Defense should be universal; mastery differentiates offense.
    // Defense Port must sit on a coastal tile (land tile with at least
    // one adjacent water tile) — that's its whole job.
    if (type === 'port') {
      let coastal = false;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        if (this._isWaterTile(x + dx, y + dy)) { coastal = true; break; }
      }
      if (!coastal) return 'not-coastal';
    }
    // Master Builder discount applies to leader-paid builds only —
    // vassal-funded builds use their own pool at face value (the
    // discount is a leader-side investment).
    const cost = fromVassalRegion > 0 ? baseCost : Math.ceil(baseCost * this._buildCostMult(owner));
    // Strategic resource gate (Phase 3): every building requires a
    // combination of raw materials in addition to gold. Resources are
    // shared across the empire (no per-vassal pool). Must be checked
    // before charging gold so we don't half-pay on a failed build.
    const resourceCosts = this.config.BUILDING_RESOURCE_COSTS[type] ?? {};
    for (const [kind, need] of Object.entries(resourceCosts)) {
      if ((need ?? 0) <= 0) continue;
      if ((owner.resources[kind as keyof typeof owner.resources] ?? 0) < (need ?? 0)) {
        return 'resources';
      }
    }
    if (fromVassalRegion > 0) {
      if ((this._vassalGold[fromVassalRegion] ?? 0) < cost) return 'gold';
      this._vassalGold[fromVassalRegion]! -= cost;
    } else {
      // Manual builds drain gold first, fall back to treasury for any
      // remainder. Treasury still can't be drained passively.
      if (!this._chargeOps(owner, cost)) return 'gold';
    }
    // Resources confirmed available — drain them now that gold cleared.
    for (const [kind, need] of Object.entries(resourceCosts)) {
      if ((need ?? 0) <= 0) continue;
      const k = kind as keyof typeof owner.resources;
      owner.resources[k] = Math.max(0, owner.resources[k] - (need ?? 0));
    }
    const b: Building = { x, y, owner: ownerId, type, level: 1 };
    this.buildings.push(b);
    this.buildingsVersion++;
    if (type === 'settlement') {
      this._applySettlement(x, y, +1, this._settlementRadius(1));
      this._adjSettlementLevels(x, y, ownerId, +1);
    }
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
    const baseCost = this._upgradeCost(b.type, b.level);
    const cost = fromVassalRegion > 0 ? baseCost : Math.ceil(baseCost * this._buildCostMult(owner));
    if (fromVassalRegion > 0) {
      if ((this._vassalGold[fromVassalRegion] ?? 0) < cost) return 'gold';
      this._vassalGold[fromVassalRegion]! -= cost;
    } else {
      if (!this._chargeOps(owner, cost)) return 'gold';
    }
    b.level++;
    this.buildingsVersion++;
    // Settlement gold-multiplier accounting: each tier adds one full
    // SETTLEMENT_BONUS unit at the level's current radius.
    if (b.type === 'settlement') {
      this._applySettlement(b.x, b.y, +1, this._settlementRadius(b.level));
      this._adjSettlementLevels(b.x, b.y, ownerId, +1);
    }
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
    // Bombing an enemy's land is an act of war. Auto-declare against
    // the target tile's owner if peace is currently in effect.
    const targetOwner = this.territory.getOwner(x, y);
    if (targetOwner > 0 && targetOwner !== ownerId
        && !this.areAllied(ownerId, targetOwner)
        && !this.areAtWar(ownerId, targetOwner)) {
      this.declareWar(ownerId, targetOwner, 'aggression');
    }

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
      if (!this._chargeOps(owner, cost)) return 'gold';
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
      originX: chosen.x + 0.5,
      originY: chosen.y + 0.5,
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

  /** AC-130 strafe — heavier mini-bomb that punches a sustained radius-3
   *  blast each pass. Picks a random spot inside the orbit zone and
   *  detonates (wipes claims, destroys buildings, damages ships).
   *  Called every AC130_STRAFE_INTERVAL ticks (~0.9s) during a 15s
   *  orbit → ~16 strafes per gunship. Cumulative coverage now solidly
   *  out-clears a Large bomb, justifying the 350g cost. */
  private _strafe(cx: number, cy: number, ownerId: PlayerId): void {
    const orbitR = this.config.BOMB_RADII['ac130'];
    const W = this.territory.width;
    const H = this.territory.height;
    let tx = Math.floor(cx + (Math.random() * 2 - 1) * orbitR);
    let ty = Math.floor(cy + (Math.random() * 2 - 1) * orbitR);
    if (tx < 0) tx = 0; if (tx >= W) tx = W - 1;
    if (ty < 0) ty = 0; if (ty >= H) ty = H - 1;
    const blastR = 3;
    const blastR2 = blastR * blastR;
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
        if (o > 0) {
          const dp = this.players[o];
          if (dp) dp.troops = Math.max(0, dp.troops - 60);
        }
        if (this._claim(nx, ny, 0)) {
          this._destroyBuildingsAt(nx, ny);
          const W2 = this.territory.width;
          const r = this.regions[ny * W2 + nx]!;
          if (r > 0) wipedByRegion.set(r, (wipedByRegion.get(r) ?? 0) + 1);
        } else if (this.buildingAt(nx, ny)) {
          this._destroyBuildingsAt(nx, ny);
        }
      }
    }
    for (const [r, n] of wipedByRegion) this._drainMoraleForRegion(r, n);
    this.events.push({ type: 'bomb', bombType: 'ac130', x: tx, y: ty, radius: blastR, ownerId });
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i]!;
      if (s.owner === ownerId) continue;
      if (this.areAllied(ownerId, s.owner)) continue;
      const dx2 = s.x + 0.5 - tx;
      const dy2 = s.y + 0.5 - ty;
      if (dx2 * dx2 + dy2 * dy2 > blastR2) continue;
      s.hp -= 35;
      if (s.hp <= 0) {
        this.events.push({ type: 'ship-sunk', shipKind: s.kind, ownerId: s.owner, x: s.x, y: s.y });
        this.ships.splice(i, 1);
      }
    }
  }

  /** Stealth-bomber carpet — detonates a SERIES of overlapping bomblets
   *  along the flight axis, producing a long strip of devastation
   *  instead of a single circle. 7 bomblets, each radius BOMB_RADII
   *  ['stealth'] (4), spaced 5 tiles apart along origin → dest. Net
   *  coverage ≈ 30 tiles long × 8 tiles wide. Premium 1000g price tag
   *  earned by area + AA bypass (handled in _planesTick). */
  private _carpetBomb(plane: Plane): void {
    const W = this.territory.width;
    const H = this.territory.height;
    const dx = plane.destX - plane.originX;
    const dy = plane.destY - plane.originY;
    const len = Math.hypot(dx, dy);
    let nx = 1, ny = 0;
    if (len > 0.001) { nx = dx / len; ny = dy / len; }
    const SPACING = 5;
    const BOMBLETS = 7;
    const bombR = this.config.BOMB_RADII['stealth'];
    const bombR2 = bombR * bombR;
    // Lay the carpet centered on the target, extending along the
    // incoming flight axis (so it visually reads as the bomber's run).
    for (let b = 0; b < BOMBLETS; b++) {
      const offset = (b - (BOMBLETS - 1) / 2) * SPACING;
      const cx = Math.floor(plane.destX + nx * offset);
      const cy = Math.floor(plane.destY + ny * offset);
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
      const wipedByRegion = new Map<number, number>();
      for (let ddy = -bombR; ddy <= bombR; ddy++) {
        const ty = cy + ddy;
        if (ty < 0 || ty >= H) continue;
        for (let ddx = -bombR; ddx <= bombR; ddx++) {
          if (ddx * ddx + ddy * ddy > bombR2) continue;
          const tx = cx + ddx;
          if (tx < 0 || tx >= W) continue;
          if (this._capitalIndexAt(tx, ty) >= 0) continue;
          if (!this.territory.isPassable(tx, ty)) continue;
          const o = this.territory.getOwner(tx, ty);
          if (o === plane.owner) continue;
          if (o > 0 && this.areAllied(plane.owner, o)) continue;
          if (o > 0) {
            const dp = this.players[o];
            if (dp) dp.troops = Math.max(0, dp.troops - 40);
          }
          if (this._claim(tx, ty, 0)) {
            this._destroyBuildingsAt(tx, ty);
            const r = this.regions[ty * W + tx]!;
            if (r > 0) wipedByRegion.set(r, (wipedByRegion.get(r) ?? 0) + 1);
          } else if (this.buildingAt(tx, ty)) {
            this._destroyBuildingsAt(tx, ty);
          }
        }
      }
      for (const [r, n] of wipedByRegion) this._drainMoraleForRegion(r, n);
      this.events.push({ type: 'bomb', bombType: 'stealth', x: cx, y: cy, radius: bombR, ownerId: plane.owner });
      // Ship splash per bomblet (heavy — stealth carpets shred fleets).
      for (let i = this.ships.length - 1; i >= 0; i--) {
        const s = this.ships[i]!;
        if (s.owner === plane.owner) continue;
        if (this.areAllied(plane.owner, s.owner)) continue;
        const sdx = s.x + 0.5 - cx;
        const sdy = s.y + 0.5 - cy;
        if (sdx * sdx + sdy * sdy > bombR2) continue;
        s.hp -= 80;
        if (s.hp <= 0) {
          this.events.push({ type: 'ship-sunk', shipKind: s.kind, ownerId: s.owner, x: s.x, y: s.y });
          this.ships.splice(i, 1);
        }
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
    // Peace is the default state — only attack other players when
    // formally at war. Neutral (defender = 0) is always claimable.
    if (defender > 0 && !this.areAtWar(attackerId, defender)) return false;
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
      resources: { oil: 0, stone: 0, gems: 0, food: 0, wood: 0 },
    };
  }

  // --- Mastery (path-based specialization) ----------------------------------

  /** Returns true if a building/unit category is unlocked for this player.
   *  Humans with no chosen mastery yet are treated as 'ground' so they can
   *  still build settlements/turrets while the picker is open. */
  /** Charge a player for an explicit ops action (build, upgrade, bomb,
   *  ship). Drains gold first; falls back to treasury for any
   *  remainder. The treasury "passive-drain" guarantee is preserved
   *  because this is only called from click-driven code paths.
   *  Returns true on success (full cost paid); false if pooled total
   *  was insufficient (no partial deduction). */
  private _chargeOps(p: Player, cost: number): boolean {
    if (cost <= 0) return true;
    const total = p.gold + p.treasury;
    if (total < cost) return false;
    if (p.gold >= cost) {
      p.gold -= cost;
    } else {
      const fromGold = p.gold;
      const fromTreasury = cost - fromGold;
      p.gold = 0;
      p.treasury -= fromTreasury;
    }
    return true;
  }

  /** Combined ops budget — gold + treasury. Used by HUD affordability
   *  checks so the build sheet greys out only when both pools combined
   *  can't cover the cost. */
  combinedFundsFor(playerId: PlayerId): number {
    const p = this.players[playerId];
    if (!p) return 0;
    return p.gold + p.treasury;
  }

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
    const wasUnchosen = p.mastery == null;
    p.mastery = mastery;
    // Naval mastery + first-time pick: relocate the player to a coastal
    // spawn so they can actually use ships from tick 1. We only do this
    // on the very first pick (not re-picks) because by then the player
    // has already expanded and a respawn would be disruptive.
    if (mastery === 'naval' && wasUnchosen) this._relocateToCoast(playerId);
    return null;
  }

  /** Wipe the player's existing tiles + capitals and re-spawn them on a
   *  coastal patch. Called when a player picks NAVAL mastery on the
   *  first-time picker so they actually start near water. */
  private _relocateToCoast(playerId: PlayerId): void {
    const W = this.territory.width;
    const H = this.territory.height;
    // Wipe existing claims for this player.
    const owners = this.territory.owners;
    for (let i = 0; i < owners.length; i++) {
      if (owners[i] === playerId) this._claim(i % W, (i / W) | 0, 0);
    }
    // Wipe their capitals.
    for (let i = this.capitals.length - 1; i >= 0; i--) {
      if (this.capitals[i]!.owner === playerId) this.capitals.splice(i, 1);
    }
    // Find a coastal land tile (any land tile with a water neighbour)
    // far enough from other players' spawns that we don't overlap.
    const minSeparation = 30 * 30;
    const others: Array<{ x: number; y: number }> = [];
    for (const c of this.capitals) others.push({ x: c.x, y: c.y });
    let best = { x: -1, y: -1, score: -Infinity };
    // Sample a chunk of coastal tiles, pick the one furthest from other spawns.
    for (let attempt = 0; attempt < 800; attempt++) {
      const rx = (Math.random() * W) | 0;
      const ry = (Math.random() * H) | 0;
      if (!this.territory.isPassable(rx, ry)) continue;
      // Coastal check: any 4-neighbor is water
      let coastal = false;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const nx = rx + dx, ny = ry + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        if (!this.territory.isPassable(nx, ny)) { coastal = true; break; }
      }
      if (!coastal) continue;
      // Distance from nearest other spawn (further is better).
      let nearestD2 = Infinity;
      for (const o of others) {
        const ddx = o.x - rx, ddy = o.y - ry;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < nearestD2) nearestD2 = d2;
      }
      if (nearestD2 < minSeparation) continue;
      // Score = nearestD2 (further from rivals = better).
      if (nearestD2 > best.score) best = { x: rx, y: ry, score: nearestD2 };
    }
    if (best.x < 0) return; // no good spot found; leave player wiped
    this._spawnPlayerAt(playerId, best.x, best.y);
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

  /** AI commander logic: spend treasury on decrees periodically so the
   *  AI actually benefits from the commander tree instead of leaving
   *  it unused. Without this, decree investments give the human a
   *  one-sided advantage that compounds late-game.
   *
   *  Priority list is keyed off the AI's mastery so a naval AI tilts
   *  toward admiralty/embassy/cartel, ground tilts toward defense, etc.
   *  Universal picks (production, master-builder, conscription) sit at
   *  the top of every list because they're always good. */
  private _aiBuyDecrees(p: Player): void {
    if (p.isHuman || !p.alive) return;
    // Throttle: each AI considers a purchase every ~10s (offset per-id
    // so ticks stay deterministic but spread out across players).
    if (((this.tickCount + p.id * 13) % 100) !== 0) return;
    if (p.treasury < 300) return;

    const masteryPicks: Record<'ground' | 'air' | 'naval', string[]> = {
      ground: [
        'production', 'master-builder', 'iron-doctrine', 'border-patrol',
        'reinforced-bunkers', 'veterans', 'standing-army', 'conscription',
        'forced-march', 'free-market', 'spy-network', 'sabotage',
      ],
      air: [
        'production', 'master-builder', 'forced-march', 'air-supremacy',
        'veterans', 'standing-army', 'conscription', 'iron-doctrine',
        'free-market', 'spy-network', 'embassy', 'cartel',
      ],
      naval: [
        'production', 'master-builder', 'admiralty', 'embassy', 'cartel',
        'forced-march', 'veterans', 'standing-army', 'conscription',
        'iron-doctrine', 'free-market', 'spy-network',
      ],
    };
    const list = masteryPicks[p.mastery ?? 'ground'];

    // Pick the FIRST affordable + available decree on the list. Stops
    // after one purchase per tick so a wealthy AI doesn't blow its
    // entire treasury on a single tick (still makes progress over time).
    for (const id of list) {
      const d = decreeById(id);
      if (!d || d.comingSoon) continue;
      if (!this.decreeAvailable(p.id, id)) continue;
      // Skip non-stackable decrees we already own.
      if (!d.stackable && (p.decreeStacks[id] ?? 0) > 0) continue;
      // Don't endlessly stack — soft cap at 8 stacks per decree so the
      // AI diversifies instead of dumping 30 forced-march.
      if ((p.decreeStacks[id] ?? 0) >= 8) continue;
      const cost = id === 'war-bonds' ? Math.floor(p.treasury * 0.30) : d.cost;
      if (p.treasury < cost) continue;
      this.buyDecree(p.id, id);
      return;
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

  /** Expansion-rate boost from decrees + buffs that applies to BOTH
   *  vassal-driven and leader-driven (manual) expansion. Forced March
   *  stacks here are the player's primary expansion-power investment —
   *  they should buff every push, not just autonomous ones, otherwise
   *  the moment a player takes direct command their decree investment
   *  silently turns off. */
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

  /** Build-cost multiplier from Master Builder. Each stack is –10%,
   *  capped at –50% so we don't free-build at 5+ stacks. */
  private _buildCostMult(p: Player): number {
    const stacks = p.decreeStacks['master-builder'] ?? 0;
    return Math.max(0.5, 1 - 0.10 * stacks);
  }

  /** Combat-power multiplier from Veterans (attacker side). +5% per
   *  stack. Capped so 30+ stacks doesn't double DPS by itself. */
  private _veteransMult(p: Player): number {
    const stacks = p.decreeStacks['veterans'] ?? 0;
    return Math.min(2.0, 1 + 0.05 * stacks);
  }

  /** Turret-defense bonus multiplier from Reinforced Bunkers. */
  private _reinforcedBunkersMult(p: Player): number {
    const stacks = p.decreeStacks['reinforced-bunkers'] ?? 0;
    return Math.min(2.0, 1 + 0.50 * stacks);
  }

  /** Ship-speed multiplier from Admiralty (lower move-ticks = faster). */
  private _admiraltySpeedDivisor(p: Player): number {
    const stacks = p.decreeStacks['admiralty'] ?? 0;
    return Math.min(2.5, 1 + 0.20 * stacks);
  }

  /** Ship-cost multiplier from Admiralty. */
  private _admiraltyCostMult(p: Player): number {
    const stacks = p.decreeStacks['admiralty'] ?? 0;
    return Math.max(0.4, 1 - 0.20 * stacks);
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
  /** Active alliances. Keyed `min-max` of player IDs. Value is the
   *  tickCount at which the alliance expires, or `Infinity` for
   *  permanent alliances (the new default — alliances last until
   *  manually broken). The legacy expiry path is preserved for any
   *  proposeAlliance call that explicitly passes a duration. */
  private _alliances = new Map<string, number>();
  /** Active wars. Keyed `min-max` of player IDs. Membership = at war.
   *  Default state for any pair is PEACE — the engine only allows
   *  inter-player attacks when this set contains the pair. Aggression
   *  (manual taps on enemy land, bombs on enemy tiles, etc.) auto-
   *  declares war so the player doesn't have to navigate menus to
   *  start fighting; the new peace-as-default just means stuff doesn't
   *  start fighting on its own. */
  private _wars = new Set<string>();
  /** Pending war-join invitations from AI allies to the human. Each
   *  entry is the inviter and target of the war they're asking us to
   *  join. The HUD shows a toast/prompt for each, and accept/decline
   *  is wired via acceptWarInvite / declineWarInvite. */
  pendingWarInvites: Array<{ from: PlayerId; target: PlayerId }> = [];

  /** When each manual human target was set, by region id. Targets older
   *  than HUMAN_TARGET_EXPIRY_TICKS are auto-cleared each tick — kills
   *  the "tap once and walk away" drift that made attacks feel passive. */
  private _humanTargetSetAt = new Map<number, number>();
  /** When a player lost dominance over a region, they can't re-target
   *  it until this tick. Keyed `${regionId}.${playerId}`. Prevents
   *  yo-yo border thrashing. */
  private _regionLossCooldown = new Map<string, number>();

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

  /** Pure-AI accept rule for alliance proposals.
   *  Embassy stacks loosen the dominance threshold: each stack lets the
   *  proposer be 25% more dominant before being rejected, so a player
   *  invested in diplomacy can ally even when they're outsized. Also
   *  lets the AI overlook the "you're my bully" reflex once stacks ≥ 2. */
  private _aiAcceptsAlliance(proposer: Player, target: Player): boolean {
    const embassy = proposer.decreeStacks['embassy'] ?? 0;
    const total = this.totalLand;
    const propShare = total > 0 ? (this.territory.counts[proposer.id] ?? 0) / total : 0;
    const targShare = total > 0 ? (this.territory.counts[target.id] ?? 0) / total : 0;
    const dominanceThreshold = 1.6 * (1 + 0.25 * embassy);
    if (propShare > targShare * dominanceThreshold) return false;
    const threat = this._findGreatestThreatTo(target.id);
    if (threat === proposer.id && embassy < 2) return false;
    return true;
  }

  /** Propose an alliance from `fromId` to `toId`. Permanent by default —
   *  alliances last until one side breaks them. Pass an explicit
   *  durationTicks to time-limit if needed (legacy use only).
   *  Returns 'accepted' on success or a reason string. */
  proposeAlliance(fromId: PlayerId, toId: PlayerId, durationTicks = 0):
    'accepted' | 'rejected' | 'invalid' | 'already' {
    if (fromId === toId) return 'invalid';
    const a = this.players[fromId];
    const b = this.players[toId];
    if (!a || !a.alive || !b || !b.alive) return 'invalid';
    if (this.areAllied(fromId, toId)) return 'already';
    if (b.isHuman) return 'rejected';
    if (!this._aiAcceptsAlliance(a, b)) return 'rejected';
    const expiry = durationTicks > 0
      ? this.tickCount + durationTicks
      : Number.POSITIVE_INFINITY;
    this._alliances.set(this._allianceKey(fromId, toId), expiry);
    this.events.push({ type: 'alliance-formed', a: fromId, b: toId });
    // Forming an alliance ends any active war between them — peace
    // through diplomacy.
    this._endWarBetween(fromId, toId);
    return 'accepted';
  }

  /** End an alliance early. Auto-cancels any external trade route the
   *  pair shared, since trade is hard-gated on alliance. Also drops
   *  any pending war invites between the two so a stale invite doesn't
   *  haunt the player after they break the alliance. */
  breakAlliance(byId: PlayerId, otherId: PlayerId): boolean {
    const key = this._allianceKey(byId, otherId);
    if (!this._alliances.has(key)) return false;
    this._alliances.delete(key);
    this.events.push({ type: 'alliance-broken', a: byId, b: otherId, brokenBy: byId });
    this._dropTradeRouteBetween(byId, otherId, byId);
    // Drop any pending war invites either direction between this pair.
    this.pendingWarInvites = this.pendingWarInvites.filter(
      (inv) => !((inv.from === byId && inv.target === otherId)
              || (inv.from === otherId && inv.target === byId)
              || inv.from === byId   // also drop invites FROM the broken-with party
              || inv.from === otherId),
    );
    return true;
  }

  // --- Wars -------------------------------------------------------------

  private _warKey(a: PlayerId, b: PlayerId): string {
    return a < b ? `w:${a}-${b}` : `w:${b}-${a}`;
  }

  /** True iff the two players are currently at war. Default for any
   *  pair is PEACE — only set to war via `declareWar` (manual or
   *  triggered by aggression). Allies cannot be at war. */
  areAtWar(a: PlayerId, b: PlayerId): boolean {
    if (a === b) return false;
    return this._wars.has(this._warKey(a, b));
  }

  /** All player IDs `playerId` is currently at war with. */
  enemiesOf(playerId: PlayerId): PlayerId[] {
    const out: PlayerId[] = [];
    for (const key of this._wars) {
      // key format: "w:min-max"
      const m = key.slice(2);
      const dash = m.indexOf('-');
      const a = parseInt(m.slice(0, dash), 10);
      const b = parseInt(m.slice(dash + 1), 10);
      if (a === playerId) out.push(b);
      else if (b === playerId) out.push(a);
    }
    return out;
  }

  /** Declare war on `target` from `declarer`. Idempotent if already at
   *  war. Bandwagons: target's allies (other than declarer) are pulled
   *  into the war on target's side, so attacking a player with allies
   *  has real diplomatic cost. The `reason` flag short-circuits the
   *  bandwagon recursion so the cascade only fires one level deep. */
  declareWar(declarer: PlayerId, target: PlayerId, reason: 'manual' | 'aggression' | 'bandwagon' | 'ai' = 'manual'): void {
    if (declarer === target || declarer <= 0 || target <= 0) return;
    const a = this.players[declarer];
    const b = this.players[target];
    if (!a || !a.alive || !b || !b.alive) return;
    // Allies cannot be at war. (You can break the alliance first if you
    // really mean it — that's a deliberate two-step.)
    if (this.areAllied(declarer, target)) return;
    const key = this._warKey(declarer, target);
    if (this._wars.has(key)) return;
    this._wars.add(key);
    this.events.push({ type: 'war-declared', declarer, target, reason });
    if (reason !== 'bandwagon') {
      // Bandwagon: pull target's allies into the war (one level deep).
      for (const ally of this.alliesOf(target)) {
        if (ally === declarer) continue;
        if (this.areAllied(declarer, ally)) continue;
        this.declareWar(declarer, ally, 'bandwagon');
      }
    }
  }

  /** End a war (peace treaty). Either side can initiate. */
  endWar(byId: PlayerId, otherId: PlayerId): boolean {
    return this._endWarBetween(byId, otherId);
  }

  private _endWarBetween(a: PlayerId, b: PlayerId): boolean {
    const key = this._warKey(a, b);
    if (!this._wars.has(key)) return false;
    this._wars.delete(key);
    this.events.push({ type: 'war-ended', a, b });
    return true;
  }

  /** Coerce an ally into declaring war on a target. Only your own
   *  allies can be coerced. The ally accepts based on a simple AI
   *  rule: stronger ally = more likely to comply. Returns 'accepted'
   *  on success. */
  coerceAllyToWar(byId: PlayerId, allyId: PlayerId, targetId: PlayerId):
    'accepted' | 'declined' | 'invalid' | 'no-ally' | 'already' {
    if (byId === allyId || byId === targetId || allyId === targetId) return 'invalid';
    if (!this.areAllied(byId, allyId)) return 'no-ally';
    const ally = this.players[allyId];
    const target = this.players[targetId];
    if (!ally || !ally.alive || !target || !target.alive) return 'invalid';
    if (this.areAllied(allyId, targetId)) return 'invalid';
    if (this.areAtWar(allyId, targetId)) return 'already';
    // Acceptance rule: ally agrees if its share of the world is at
    // least 0.6× the target's (i.e. it's strong enough to feel safe
    // jumping in). Embassy stacks of the requester loosen this.
    const total = this.totalLand;
    const allyShare = total > 0 ? (this.territory.counts[allyId] ?? 0) / total : 0;
    const targShare = total > 0 ? (this.territory.counts[targetId] ?? 0) / total : 0;
    const requester = this.players[byId];
    const embassy = requester ? (requester.decreeStacks['embassy'] ?? 0) : 0;
    const threshold = 0.6 / (1 + 0.20 * embassy);
    if (targShare > 0 && allyShare < targShare * threshold) return 'declined';
    this.declareWar(allyId, targetId, 'manual');
    return 'accepted';
  }

  // --- Alliances (cont.) ------------------------------------------------

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

  /** Per-tick AI diplomacy: every 50 ticks (~5s), each alive AI looks at
   *  its allies and proposes a trade route to any it doesn't already
   *  share one with. The other side auto-accepts (allies always accept;
   *  it's mutual income with the alliance gating the downside). */
  private _aiOfferTradeRoutes(): void {
    if ((this.tickCount % 50) !== 0) return;
    for (let pid = 2; pid < this.players.length; pid++) {
      const p = this.players[pid];
      if (!p || !p.alive) continue;
      const last = this._aiTradeProposeAt.get(pid) ?? 0;
      if (this.tickCount - last < 50) continue;
      this._aiTradeProposeAt.set(pid, this.tickCount);
      const allies = this.alliesOf(pid);
      if (allies.length === 0) continue;
      for (const otherId of allies) {
        // Skip if we already have a route or the other side is the human
        // (humans must explicitly accept via the diplomacy panel — but
        // the human side proposes, AI accepts, so this branch is just
        // AI-AI proposal). For AI→human, we just leave it for the
        // human to propose.
        if (this.externalTradeRouteBetween(pid, otherId)) continue;
        const other = this.players[otherId];
        if (!other || other.isHuman) continue;
        this.proposeTradeRoute(pid, otherId);
      }
    }
  }

  // --- External trade routes (Phase 3) ---------------------------------

  /** Returns the active external trade route between two players, or null. */
  externalTradeRouteBetween(a: PlayerId, b: PlayerId): ExternalTradeRoute | null {
    if (a === b) return null;
    for (const r of this.externalTradeRoutes) {
      if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r;
    }
    return null;
  }

  /** Anchor centroid for a player's trade route — picks their largest
   *  dominant region's centroid. Returns null if the player has no
   *  dominant regions (rare, basically dead). */
  private _tradeAnchorFor(playerId: PlayerId): { x: number; y: number } | null {
    let bestR = 0, bestSize = 0;
    for (let r = 1; r <= this.regionCount; r++) {
      if (this._regionDominant[r] !== playerId) continue;
      const sz = this._tilesByRegion[r]?.length ?? 0;
      if (sz > bestSize) { bestSize = sz; bestR = r; }
    }
    if (bestR === 0) return null;
    return {
      x: this._regionCentroids[bestR * 2]!,
      y: this._regionCentroids[bestR * 2 + 1]!,
    };
  }

  /** Per-tick income for an external route. Spec: 30g per 20s per
   *  "land block" (region) — 1.5g/s/region. Both sides earn equally,
   *  scaled by the smaller side's dominant-region count.
   *
   *  Diminishing returns by alliance count: each additional active
   *  trade route a player has multiplies that route's income by
   *  successively smaller factors (1.0 / 0.7 / 0.5 / 0.35 / 0.25),
   *  so stacking many alliances doesn't snowball linearly. We use the
   *  HIGHER of the two sides' route counts (worst case for the route
   *  about to be added) so the diminishing kicks in symmetrically.
   *
   *  Per-side multipliers from Cartel decree are applied at flow-pour
   *  time in `_applyTradeFlow`, not here, so each side's own stacks
   *  buff their own income only. */
  private _externalTradeFlow(a: PlayerId, b: PlayerId): number {
    let regA = 0, regB = 0;
    for (let r = 1; r <= this.regionCount; r++) {
      const dom = this._regionDominant[r];
      if (dom === a) regA++;
      else if (dom === b) regB++;
    }
    const minRegions = Math.min(regA, regB);
    if (minRegions <= 0) return 0;
    // Count active routes per side, including the one we're computing
    // for (so the first route is "1st", not "0th").
    let routesA = 1, routesB = 1;
    for (const r of this.externalTradeRoutes) {
      if ((r.a === a && r.b !== b) || (r.b === a && r.a !== b)) routesA++;
      if ((r.a === b && r.b !== a) || (r.b === b && r.a !== a)) routesB++;
    }
    const dimFactors = [1.0, 0.7, 0.5, 0.35, 0.25];
    const dim = dimFactors[Math.min(dimFactors.length - 1, Math.max(routesA, routesB) - 1)]!;
    const perTickPerRegion = 1.5 / this.config.SIM_HZ;
    return perTickPerRegion * minRegions * dim;
  }

  /** Propose an external trade route from `fromId` to `toId`. Hard-gated
   *  on alliance — if the two aren't allied, returns 'no-alliance'. AI
   *  always accepts (mutual benefit). Returns 'accepted' on success. */
  proposeTradeRoute(fromId: PlayerId, toId: PlayerId):
    'accepted' | 'rejected' | 'invalid' | 'already' | 'no-alliance' {
    if (fromId === toId) return 'invalid';
    const a = this.players[fromId];
    const b = this.players[toId];
    if (!a || !a.alive || !b || !b.alive) return 'invalid';
    if (!this.areAllied(fromId, toId)) return 'no-alliance';
    if (this.externalTradeRouteBetween(fromId, toId)) return 'already';
    const anchorA = this._tradeAnchorFor(fromId);
    const anchorB = this._tradeAnchorFor(toId);
    if (!anchorA || !anchorB) return 'invalid';
    // AI always accepts: it's strictly mutual income with no downside
    // beyond being tied to the alliance, which both already agreed to.
    if (b.isHuman) return 'rejected';
    this.externalTradeRoutes.push({
      a: fromId, b: toId,
      flow: this._externalTradeFlow(fromId, toId),
      ax: anchorA.x, ay: anchorA.y,
      bx: anchorB.x, by: anchorB.y,
    });
    this.events.push({ type: 'trade-route-formed', a: fromId, b: toId });
    return 'accepted';
  }

  /** End a trade route early (alliance stays). */
  breakTradeRoute(byId: PlayerId, otherId: PlayerId): boolean {
    return this._dropTradeRouteBetween(byId, otherId, byId);
  }

  private _dropTradeRouteBetween(a: PlayerId, b: PlayerId, brokenBy: PlayerId): boolean {
    let dropped = false;
    for (let i = this.externalTradeRoutes.length - 1; i >= 0; i--) {
      const r = this.externalTradeRoutes[i]!;
      if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) {
        this.externalTradeRoutes.splice(i, 1);
        this.events.push({ type: 'trade-route-broken', a, b, brokenBy });
        dropped = true;
      }
    }
    return dropped;
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
    // Settlement count comes from the incremental cache — no per-tick
    // O(buildings) scan. With thousands of late-game settlements that
    // scan was a real cost.
    const settlementCount = this._settlementLevelsByOwner;
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
        // Production decree applies here too — without this, "+10% gold
        // empire-wide" silently exempted settlement flat income, so a
        // settlement-heavy economy got half the boost the player paid for.
        const decreeMult = this._productionMult(p) * this._embargoMult(p);
        const tierGold = flatGold * (b.level ?? 1) * decreeMult;
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
    // Empire upkeep — every owned tile beyond UPKEEP_TILE_THRESHOLD costs
    // gold per tick. Forces consolidation over endless growth, and drives
    // the strategic shift from "bigger empire wins" to "denser network
    // of vassals + trade routes wins".
    const upkeepStart = this.config.UPKEEP_TILE_THRESHOLD;
    const upkeepRate  = this.config.UPKEEP_PER_EXCESS_TILE;
    if (upkeepStart > 0 && upkeepRate > 0) {
      for (let id = 1; id < players.length; id++) {
        const p = players[id];
        if (!p || !p.alive) continue;
        const owned = this.territory.counts[id] ?? 0;
        if (owned <= upkeepStart) continue;
        const drain = (owned - upkeepStart) * upkeepRate;
        p.gold = Math.max(0, p.gold - drain);
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
      // Vassals never autonomously target a region dominated by a
      // player the leader is at peace with — leader is the only one
      // who can start a war. If the dominant owner is an ally OR a
      // peaceful neighbor, skip the region entirely (the vassal
      // wouldn't be able to do anything productive there anyway).
      if (dominantEnemy > 0) {
        if (this.areAllied(leader.id, dominantEnemy)) continue;
        if (!this.areAtWar(leader.id, dominantEnemy)) continue;
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
      // Resource priority: regions with a resource the leader is short
      // on get a big boost, so vassals naturally roll toward
      // strategically valuable land. "Short on" = inventory below 100
      // for that resource. Stacks per matching kind so a region we
      // genuinely need pulls hard.
      const kind = this.regionResources[r];
      if (kind && (leader.resources[kind] ?? 0) < 100) {
        score += 600;
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
    if (aaCount < aaCap && this._anyEnemyHasAir(leader.id)) {
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

    // 1c. NAVAL DEFENCE — coastal Defense Port if enemies have ships
    // and this region has coastal land.
    const portCount = this._countBuildingsInRegion(regionId, leader.id, 'port');
    const portCap = Math.max(1, Math.floor(tiles.length / 60));
    if (portCount < portCap && this._anyEnemyHasShips(leader.id)) {
      const portCost = this.config.BUILDING_COSTS.port;
      if (vGold >= reserve + portCost) {
        for (const i of safe.concat(exposed)) {
          const x = i % W, y = (i - x) / W;
          let coastal = false;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
            if (this._isWaterTile(x + dx, y + dy)) { coastal = true; break; }
          }
          if (!coastal) continue;
          if (this.tryBuild('port', x, y, leader.id, regionId) === null) {
            this.events.push({ type: 'vassal-built', regionId, ownerId: leader.id, buildingType: 'port' });
            return;
          }
          break;
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
    // Only the leader declares war. Vassals can't bomb a region whose
    // dominant owner is a peace-state neighbor — that would auto-
    // declare war via dropBomb's aggression check, dragging the leader
    // into a conflict they didn't sanction. Bombs only authorized
    // against neutrals or actual at-war enemies.
    const targetDom = this._regionDominant[targetRegion] ?? 0;
    if (targetDom > 0 && targetDom !== leader.id && !this.areAtWar(leader.id, targetDom)) {
      return;
    }

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
  /** Assign one primary resource to each region at game start.
   *  Distribution targets:
   *    food   ~30%   (plains/lowlands — common, drives settlements)
   *    wood   ~25%   (forest — common)
   *    stone  ~22%   (highlands/mountains — common, drives turrets)
   *    oil    ~15%   (less common — needed for air/naval)
   *    gems   ~8%    (rare — premium, gates upgrades)
   *  Deterministic per-region: hashes regionId so a fresh game with
   *  the same region count gets the same distribution.
   */
  private _assignRegionResources(): void {
    this.regionResources = [];
    this.regionResources[0] = null; // water
    for (let r = 1; r <= this.regionCount; r++) {
      // Cheap deterministic hash on regionId.
      const h1 = Math.sin(r * 12.9898 + 78.233) * 43758.5453;
      const h = h1 - Math.floor(h1); // 0..1
      let kind: ResourceKind;
      if      (h < 0.30) kind = 'food';
      else if (h < 0.55) kind = 'wood';
      else if (h < 0.77) kind = 'stone';
      else if (h < 0.92) kind = 'oil';
      else               kind = 'gems';
      this.regionResources[r] = kind;
    }
    // Denormalize to a per-tile lookup (Uint8Array) so the territory
    // shader can pack the resource id into its texture without a JS
    // map traversal per tile during flushDirty.
    const N = this.regions.length;
    this.resourceByTile = new Uint8Array(N);
    const idMap: Record<ResourceKind, number> = {
      food: 1, wood: 2, stone: 3, oil: 4, gems: 5,
    };
    for (let i = 0; i < N; i++) {
      const reg = this.regions[i]!;
      const kind = reg > 0 ? this.regionResources[reg] : null;
      this.resourceByTile[i] = kind ? idMap[kind] : 0;
    }
  }

  /** Per-tick: generate resources from regions the player owns tiles in.
   *  Each owned tile in a region produces a small fraction of that
   *  region's resource. Regions with rarer resources (gems) generate at
   *  a slower rate to preserve scarcity.
   */
  private _generateResources(): void {
    const owners = this.territory.owners;
    const regions = this.regions;
    const players = this.players;
    // Per-resource generation rate per tile per tick. Tuned so a
    // typical 50-tile region gives ~0.5 wood/sec etc. Gems intentionally
    // an order of magnitude slower.
    const RATE: Record<ResourceKind, number> = {
      food:  0.0015,
      wood:  0.0015,
      stone: 0.0012,
      oil:   0.0008,
      gems:  0.0002,
    };
    for (let i = 0; i < owners.length; i++) {
      const oid = owners[i]!;
      if (oid === 0) continue;
      const r = regions[i]!;
      if (r === 0) continue;
      const kind = this.regionResources[r];
      if (!kind) continue;
      const p = players[oid];
      if (!p || !p.alive) continue;
      p.resources[kind] += RATE[kind];
    }
  }

  /** Per-tick: drain resource upkeep for every owned building. If the
   *  owner can't cover all components of a building's upkeep, the
   *  building enters "starving" state (starvingSinceTick set). After
   *  STARVING_DECAY_TICKS of continuous starvation, the building
   *  destructs. Buildings that pay upkeep clear the starvation flag.
   */
  private _payBuildingUpkeep(): void {
    const upkeepTable = this.config.BUILDING_UPKEEP;
    const decayTicks = this.config.STARVING_DECAY_TICKS;
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!;
      const owner = this.players[b.owner];
      if (!owner || !owner.alive) continue;
      const upkeep = upkeepTable[b.type] ?? {};
      // Check affordability across all components.
      let canPay = true;
      for (const [kind, amount] of Object.entries(upkeep)) {
        if ((amount ?? 0) <= 0) continue;
        if ((owner.resources[kind as keyof typeof owner.resources] ?? 0) < (amount ?? 0)) {
          canPay = false; break;
        }
      }
      if (canPay) {
        for (const [kind, amount] of Object.entries(upkeep)) {
          if ((amount ?? 0) <= 0) continue;
          const k = kind as keyof typeof owner.resources;
          owner.resources[k] = Math.max(0, owner.resources[k] - (amount ?? 0));
        }
        if (b.starvingSinceTick !== undefined) b.starvingSinceTick = undefined;
      } else {
        if (b.starvingSinceTick === undefined) {
          b.starvingSinceTick = this.tickCount;
        } else if (this.tickCount - b.starvingSinceTick >= decayTicks) {
          // Sustained starvation — building collapses.
          this._destroyBuildingsAt(b.x, b.y);
        }
      }
    }
  }

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
    if (newDom !== oldDom) {
      // Region-loss cooldown: when a player loses dominance over a
      // region, they can't re-target it for REGION_LOSS_COOLDOWN_TICKS.
      // Stops yo-yo border thrashing and lets the new owner set up
      // defenses without an immediate counter-flip.
      if (oldDom > 0) {
        const cdTicks = this.config.REGION_LOSS_COOLDOWN_TICKS;
        if (cdTicks > 0) {
          this._regionLossCooldown.set(
            `${regionId}.${oldDom}`,
            this.tickCount + cdTicks,
          );
        }
        // Drop expired human target if it points at the region we just
        // lost dominance of — UX feels weird if it lingers.
        const human = this.human();
        if (human.id === oldDom) {
          const idx = human.targetRegions.indexOf(regionId);
          if (idx >= 0) human.targetRegions.splice(idx, 1);
          this._humanTargetSetAt.delete(regionId);
        }
      }
      if (newDom > 0) {
        const player = this.players[newDom];
        if (player && player.isHuman) this._vassalTickFor(regionId, player);
      }
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

  /** Morale recovery + siege fatigue — the late-game stalemate breaker.
   *
   *  - Regions with no enemy adjacency recover morale toward 1.0.
   *  - Regions under continuous siege (any enemy bordering an owned
   *    tile in the region) accumulate siege ticks. After a grace
   *    period morale starts BLEEDING — sustained pressure cracks
   *    fortified borders on its own clock. Floor stays at 0.20 so
   *    sieged regions never go fully impotent.
   *
   *  Net effect on stalemates: persistent pressure now matters more
   *  than spam attacks. A defender that holds for 30s is cracking;
   *  a defender that holds for 60s is at ~50% effectiveness.
   *
   *  Per-tick siege detection iterates the dominant owner's tiles in
   *  each region looking for an enemy neighbor. Throttled to every
   *  other tick so per-tick cost stays manageable on big maps. */

  /** Rebuild the trade-route set for every player. Per the locked-in
   *  design (OVERHAUL.md):
   *
   *    1. Union-find over each player's dominant regions via the static
   *       region adjacency graph → connected components.
   *    2. For each component, build a complete-graph edge list weighted
   *       by centroid distance, sort, run Kruskal's MST → exactly N-1
   *       edges per N-region component.
   *    3. Each MST edge becomes a TradeRoute with snapshotted centroids
   *       and a flow value derived from region sizes + distance.
   *
   *  Throttled to once every 30 ticks (~3s); per-scan cost is
   *  dominated by the O(n²) edge list and trivial in practice. */
  private _rescanTradeRoutes(): void {
    this.tradeRoutes.length = 0;
    // Re-snapshot external routes' anchor centroids + flow. Cheap —
    // there are at most a handful of routes — and it keeps the line
    // attached to each side's current largest region rather than the
    // one they had at proposal time.
    for (let i = this.externalTradeRoutes.length - 1; i >= 0; i--) {
      const r = this.externalTradeRoutes[i]!;
      const aA = this._tradeAnchorFor(r.a);
      const aB = this._tradeAnchorFor(r.b);
      if (!aA || !aB) {
        this.externalTradeRoutes.splice(i, 1);
        this.events.push({ type: 'trade-route-broken', a: r.a, b: r.b, brokenBy: 0 });
        continue;
      }
      r.ax = aA.x; r.ay = aA.y;
      r.bx = aB.x; r.by = aB.y;
      r.flow = this._externalTradeFlow(r.a, r.b);
    }

    for (let pid = 1; pid < this.players.length; pid++) {
      const p = this.players[pid];
      if (!p || !p.alive) continue;

      // Collect dominant regions for this player.
      const myRegions: number[] = [];
      for (let r = 1; r <= this.regionCount; r++) {
        if (this._regionDominant[r] === pid) myRegions.push(r);
      }
      if (myRegions.length < 2) continue;

      // Cap at 50 by tile count so a runaway empire doesn't pay O(n²)
      // edges on every scan. Below that limit it's a no-op.
      if (myRegions.length > 50) {
        myRegions.sort((a, b) =>
          (this._tilesByRegion[b]?.length ?? 0) - (this._tilesByRegion[a]?.length ?? 0));
        myRegions.length = 50;
      }

      // Connectivity: union-find via the static region-adjacency graph
      // restricted to this player's dominant regions.
      const parent = new Map<number, number>();
      const find = (x: number): number => {
        let cur = x;
        while (parent.get(cur)! !== cur) cur = parent.get(cur)!;
        // Path compression
        let n = x;
        while (parent.get(n)! !== cur) { const p2 = parent.get(n)!; parent.set(n, cur); n = p2; }
        return cur;
      };
      for (const r of myRegions) parent.set(r, r);
      for (const r of myRegions) {
        const adj = this._regionAdjacency[r];
        if (!adj) continue;
        for (const nr of adj) {
          if (parent.has(nr)) {
            const ra = find(r), rb = find(nr);
            if (ra !== rb) parent.set(ra, rb);
          }
        }
      }

      // Bucket regions into components.
      const components = new Map<number, number[]>();
      for (const r of myRegions) {
        const root = find(r);
        let bucket = components.get(root);
        if (!bucket) { bucket = []; components.set(root, bucket); }
        bucket.push(r);
      }

      // For each component with ≥2 regions, build the MST.
      for (const component of components.values()) {
        if (component.length < 2) continue;

        // Edge list: all pairs, weighted by centroid distance.
        const edges: { a: number; b: number; w: number }[] = [];
        for (let i = 0; i < component.length; i++) {
          for (let j = i + 1; j < component.length; j++) {
            const a = component[i]!;
            const b = component[j]!;
            const ax = this._regionCentroids[a * 2]!;
            const ay = this._regionCentroids[a * 2 + 1]!;
            const bx = this._regionCentroids[b * 2]!;
            const by = this._regionCentroids[b * 2 + 1]!;
            const dx = ax - bx, dy = ay - by;
            edges.push({ a, b, w: Math.sqrt(dx * dx + dy * dy) });
          }
        }
        edges.sort((p, q) => p.w - q.w);

        // Kruskal: separate union-find for the MST being built.
        const mstParent = new Map<number, number>();
        const mstFind = (x: number): number => {
          let cur = x;
          while (mstParent.get(cur)! !== cur) cur = mstParent.get(cur)!;
          return cur;
        };
        for (const r of component) mstParent.set(r, r);
        let added = 0;
        const target = component.length - 1;
        for (const e of edges) {
          if (added >= target) break;
          const ra = mstFind(e.a), rb = mstFind(e.b);
          if (ra === rb) continue;
          mstParent.set(ra, rb);
          // Snapshot the route.
          const tilesA = this._tilesByRegion[e.a]?.length ?? 1;
          const tilesB = this._tilesByRegion[e.b]?.length ?? 1;
          const baseFlow = Math.sqrt(tilesA * tilesB) * 0.002;
          const distBonus = Math.sqrt(e.w) * 0.05;
          this.tradeRoutes.push({
            ownerId: pid,
            regionA: e.a, regionB: e.b,
            flow: baseFlow + distBonus,
            distance: e.w,
            ax: this._regionCentroids[e.a * 2]!,
            ay: this._regionCentroids[e.a * 2 + 1]!,
            bx: this._regionCentroids[e.b * 2]!,
            by: this._regionCentroids[e.b * 2 + 1]!,
          });
          added++;
        }
      }
    }
  }

  /** Per-tick: pour each trade route's flow into its owner's treasury,
   *  but validate the route is still live first — if a region has lost
   *  dominance to someone else since the last rescan, the route silently
   *  prunes itself instead of paying the wrong player.
   *
   *  Also handles external (cross-player) trade routes: both sides earn
   *  flow; routes prune themselves if the alliance has ended or either
   *  side is dead. */
  private _applyTradeFlow(): void {
    const routes = this.tradeRoutes;
    for (let i = routes.length - 1; i >= 0; i--) {
      const route = routes[i]!;
      const owner = this.players[route.ownerId];
      if (!owner || !owner.alive) { routes.splice(i, 1); continue; }
      if (this._regionDominant[route.regionA] !== route.ownerId
       || this._regionDominant[route.regionB] !== route.ownerId) {
        routes.splice(i, 1);
        continue;
      }
      owner.treasury += route.flow;
    }

    const ext = this.externalTradeRoutes;
    for (let i = ext.length - 1; i >= 0; i--) {
      const r = ext[i]!;
      const a = this.players[r.a];
      const b = this.players[r.b];
      if (!a || !a.alive || !b || !b.alive) {
        ext.splice(i, 1);
        this.events.push({ type: 'trade-route-broken', a: r.a, b: r.b, brokenBy: 0 });
        continue;
      }
      if (!this.areAllied(r.a, r.b)) {
        ext.splice(i, 1);
        this.events.push({ type: 'trade-route-broken', a: r.a, b: r.b, brokenBy: 0 });
        continue;
      }
      // Each side's Cartel decree stacks buff their OWN income from
      // the route. Route flow stays the same; the multiplier just
      // scales how much each side keeps.
      const cartelA = 1 + 0.20 * (a.decreeStacks['cartel'] ?? 0);
      const cartelB = 1 + 0.20 * (b.decreeStacks['cartel'] ?? 0);
      a.treasury += r.flow * cartelA;
      b.treasury += r.flow * cartelB;
    }
  }

  private _expireHumanTargets(): void {
    const expiry = this.config.HUMAN_TARGET_EXPIRY_TICKS;
    if (expiry <= 0) return;
    const human = this.human();
    if (human.targetRegions.length === 0) return;
    const cutoff = this.tickCount - expiry;
    for (let i = human.targetRegions.length - 1; i >= 0; i--) {
      const r = human.targetRegions[i]!;
      const setAt = this._humanTargetSetAt.get(r) ?? 0;
      if (setAt < cutoff) {
        human.targetRegions.splice(i, 1);
        this._humanTargetSetAt.delete(r);
      }
    }
    human.expanding = human.targetRegions.length > 0;
  }

  private _recoverMorale(): void {
    const m = this._regionMorale;
    if (!m) return;
    const sieges = this._regionSiegeTicks;
    const RECOVER         = 0.005; // 0.5%/tick when peaceful → ~20s 0→1
    const SIEGE_GRACE     = 200;   // 20s of siege before drain begins
    const SIEGE_RAMP      = 400;   // by 40s sieged: full drain rate
    const SIEGE_DRAIN_MAX = 0.0012; // peak drain — ~0.07/sec at 10Hz

    // Update siege ticks every other tick to amortise the per-tile scan.
    if ((this.tickCount & 1) === 0) {
      const W = this.territory.width;
      const owners = this.territory.owners;
      for (let r = 1; r <= this.regionCount; r++) {
        const dom = this._regionDominant[r] ?? 0;
        if (dom <= 0) { sieges[r] = 0; continue; }
        const tiles = this._tilesByRegion[r];
        let sieged = false;
        if (tiles) {
          for (const i of tiles) {
            if (owners[i] !== dom) continue;
            const x = i % W, y = (i - x) / W;
            if (this._hasEnemyNeighbor(x, y, dom)) { sieged = true; break; }
          }
        }
        if (sieged) sieges[r] = Math.min(0xffff, sieges[r]! + 2);
        else        sieges[r] = sieges[r]! >= 4 ? sieges[r]! - 4 : 0;
      }
    }

    const floor = this._regionFloorTicks;
    for (let r = 1; r <= this.regionCount; r++) {
      const sieged = sieges[r]!;
      let v = m[r]!;
      if (sieged > SIEGE_GRACE) {
        // Bleed morale; intensity ramps with siege duration.
        const intensity = Math.min(1, (sieged - SIEGE_GRACE) / SIEGE_RAMP);
        v -= SIEGE_DRAIN_MAX * intensity;
        if (v < 0.20) v = 0.20;
        m[r] = v;
      } else {
        if (v < 1.0) m[r] = v + RECOVER > 1.0 ? 1.0 : v + RECOVER;
      }
      // Track time spent pinned at floor morale. Drives the morale-
      // collapse defection mechanic.
      if (floor) {
        if (m[r]! <= 0.22 && sieged > SIEGE_GRACE) {
          floor[r] = floor[r]! >= 0xfffe ? 0xfffe : floor[r]! + 1;
        } else if (floor[r]! > 0) {
          // Recover floor-time twice as fast as it accumulates so a
          // brief reprieve actually resets the collapse clock.
          floor[r] = floor[r]! >= 2 ? floor[r]! - 2 : 0;
        }
      }
    }
  }

  /** Stalemate breaker: once a region's morale has been pinned at the
   *  0.20 floor for MORALE_COLLAPSE_GRACE ticks, its dominant defender
   *  starts losing tiles to the strongest besieger on a regular cadence
   *  — without anyone needing to win an expansion roll. The cracked
   *  region literally hemorrhages soldiers to whoever's pressing hardest.
   *
   *  Picks a defender-owned frontier tile (adjacent to the besieger's
   *  land) when possible so the bleed feels like the line being pushed
   *  in, not random interior teleporting. */
  private _applyMoraleCollapse(): void {
    const MORALE_COLLAPSE_GRACE = 300;  // 30s of floor morale before defection
    const DEFECT_INTERVAL       = 4;    // one tile per 4 ticks once collapsing
    if ((this.tickCount % DEFECT_INTERVAL) !== 0) return;
    const floor = this._regionFloorTicks;
    if (!floor) return;
    const W = this.territory.width;
    const owners = this.territory.owners;
    for (let r = 1; r <= this.regionCount; r++) {
      if (floor[r]! < MORALE_COLLAPSE_GRACE) continue;
      const dom = this._regionDominant[r] ?? 0;
      if (dom <= 0) continue;

      // Find the strongest besieger — the non-dominant owner with the
      // most tiles in this region. They reap the defection.
      const base = r * 256;
      let bestId: PlayerId = 0, bestCount = 0;
      for (let o = 1; o < 256; o++) {
        if (o === dom) continue;
        if (this.areAllied(dom, o)) continue;
        const c = this._regionOwnedTiles[base + o] ?? 0;
        if (c > bestCount) { bestCount = c; bestId = o; }
      }
      if (bestId === 0 || bestCount === 0) continue;

      // Pick a defender-owned tile adjacent to the besieger so the flip
      // looks like a frontline collapse, not a teleport. Fall back to
      // any defender-owned tile if no clear frontline exists.
      const tiles = this._tilesByRegion[r];
      if (!tiles) continue;
      let chosen = -1;
      for (const i of tiles) {
        if (owners[i] !== dom) continue;
        const x = i % W, y = (i - x) / W;
        if (
          this.territory.getOwner(x - 1, y) === bestId ||
          this.territory.getOwner(x + 1, y) === bestId ||
          this.territory.getOwner(x, y - 1) === bestId ||
          this.territory.getOwner(x, y + 1) === bestId
        ) { chosen = i; break; }
      }
      if (chosen < 0) {
        for (const i of tiles) {
          if (owners[i] === dom) { chosen = i; break; }
        }
      }
      if (chosen < 0) continue;
      const cx = chosen % W, cy = (chosen - cx) / W;
      this._claim(cx, cy, bestId);
    }
  }

  /** Settlement garrison multiplier — every settlement physically inside
   *  the region buffs that region's combat power. Stacks by level
   *  (4% per level), capped at +40%. So a vassal with one bronze (L4)
   *  gets +16%; a vassal with several settlements maxes out at +40%.
   *  Applied multiplicatively on top of regional troop share + morale.
   *
   *  O(1) cache lookup — _settlementLevelsByRegion is maintained
   *  incrementally on build/upgrade/destroy/consolidate. */
  private _settlementGarrison(regionId: number, ownerId: PlayerId): number {
    if (regionId <= 0) return 1.0;
    const levels = this._settlementLevelsByRegion[regionId * 256 + ownerId] ?? 0;
    return 1 + Math.min(0.40, levels * 0.04);
  }

  /** Per-AA-level shootdown probability. L1 weak, L3 reliable, L4+
   *  (consolidated) very reliable. Same scale used for Defense Port
   *  hit rates — cluster a few low-tier AAs to consolidate into a
   *  high-tier umbrella that actually denies airspace. */
  private _aaHitChanceFor(level: number): number {
    if (level >= 4) return 0.85;
    if (level === 3) return 0.75;
    if (level === 2) return 0.60;
    return 0.50;
  }

  /** Defense Port hit rate uses the same level-tier scale as AA:
   *  L1 50%, L2 60%, L3 75%, L4+ 85%. Each port rolls once per tick
   *  per ship in range — so a L3 port in range of a destroyer sinks
   *  it in ~3 ticks (75 dmg/tick × ~2-3 ticks vs 110 hp). */
  private _portHitChanceFor(level: number): number {
    return this._aaHitChanceFor(level);
  }

  /** Per-tick scan: every Defense Port projects fire onto enemy ships
   *  within PORT_RADIUS. Each port rolls one shot per tick per ship
   *  in range, gated by level-based hit chance. Damage stacks across
   *  ports. Allies and at-peace neighbors are not engaged — same
   *  peace gate as ship combat. */
  private _portsTick(): void {
    if (this.ships.length === 0) return;
    const r = this.config.PORT_RADIUS;
    const r2 = r * r;
    const dmgBase = this.config.PORT_DAMAGE;
    for (const b of this.buildings) {
      if (b.type !== 'port') continue;
      const lvl = b.level ?? 1;
      const chance = this._portHitChanceFor(lvl);
      const bx = b.x + 0.5, by = b.y + 0.5;
      // Higher-tier ports hit harder too: L1 dmg, L2 ×1.25, L3 ×1.5,
      // L4+ ×2 — combined with the higher hit rate this makes a
      // bronze port a serious naval deterrent.
      const dmgMult = lvl >= 4 ? 2.0 : 1 + 0.25 * (lvl - 1);
      const dmg = dmgBase * dmgMult;
      for (let i = this.ships.length - 1; i >= 0; i--) {
        const s = this.ships[i]!;
        if (s.owner === b.owner) continue;
        if (this.areAllied(b.owner, s.owner)) continue;
        if (!this.areAtWar(b.owner, s.owner)) continue;
        const dx = s.x + 0.5 - bx, dy = s.y + 0.5 - by;
        if (dx * dx + dy * dy > r2) continue;
        if (Math.random() >= chance) continue;
        s.hp -= dmg;
        if (s.hp <= 0) {
          this.events.push({ type: 'ship-sunk', shipKind: s.kind, ownerId: s.owner, x: s.x, y: s.y });
          this.ships.splice(i, 1);
        }
      }
    }
  }

  /** Increment-or-decrement the cached settlement-level totals for the
   *  given tile. Called on every settlement build, upgrade, destroy,
   *  and consolidation event. */
  private _adjSettlementLevels(x: number, y: number, ownerId: PlayerId, delta: number): void {
    if (delta === 0) return;
    this._settlementLevelsByOwner[ownerId] = (this._settlementLevelsByOwner[ownerId] ?? 0) + delta;
    const W = this.territory.width;
    if (x < 0 || x >= W) return;
    const r = this.regions[y * W + x] ?? 0;
    if (r > 0) {
      const idx = r * 256 + ownerId;
      this._settlementLevelsByRegion[idx] = (this._settlementLevelsByRegion[idx] ?? 0) + delta;
    }
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

  /** True if any non-allied player has at least one ship. Drives the
   *  AI's Defense Port build trigger — same reactive posture as AA. */
  private _anyEnemyHasShips(playerId: PlayerId): boolean {
    for (const s of this.ships) {
      if (s.owner === playerId) continue;
      if (this.areAllied(s.owner, playerId)) continue;
      const o = this.players[s.owner];
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
    if (this.hasPort(p.id)) this._aiMaybeBuildShip(p);

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
    if (aaCount < aaCap && this._anyEnemyHasAir(p.id)) {
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

    // 1c. NAVAL DEFENCE — coastal Defense Port if any non-allied
    // player has ships and we have coastal land. Same reactive
    // posture as AA: don't build until there's a threat to deny.
    const portCount = this._countBuildingsInRegion(regionId, p.id, 'port');
    const portCap = Math.max(1, Math.floor(tiles.length / 60));
    // Naval-mastery AIs build a port even without an enemy ship threat —
    // they need the building to construct ships at all now.
    if (portCount < portCap && (this._anyEnemyHasShips(p.id) || p.mastery === 'naval')) {
      const portCost = this.config.BUILDING_COSTS.port;
      if (p.gold >= reserve + portCost) {
        // Find an owned coastal tile (own + adjacent water).
        for (const i of safe.concat(exposed)) {
          const x = i % W, y = (i - x) / W;
          let coastal = false;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
            if (this._isWaterTile(x + dx, y + dy)) { coastal = true; break; }
          }
          if (!coastal) continue;
          if (this.tryBuild('port', x, y, p.id) === null) return;
          break;
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

  // Region IDs touching the player's frontier — regions the player
  // can push into right now (peace-aware). Allied players' regions
  // are filtered out (can't attack); enemy regions are filtered out
  // unless we're at war with that player (peace = no attack).
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
        if (own > 0 && !this.areAtWar(playerId, own)) continue;
        const r = this.regions[ny * W + nx]!;
        if (r > 0) out.add(r);
      }
    }
    return out;
  }

  /** AI war-declaration logic. Runs every ~10s per AI. If the AI has
   *  no peaceful expansion options (all adjacent land is owned by
   *  non-war non-ally players) AND it has a strength advantage over
   *  one of those neighbors, declare war on the weakest one. AI
   *  players also pull their human allies into the conflict via the
   *  pendingWarInvites queue (human gets to accept or decline). */
  private _aiConsiderWar(p: Player): void {
    if (p.isHuman || !p.alive) return;
    if (((this.tickCount + p.id * 17) % 100) !== 0) return;
    // If we have neutral expansion available, no need to declare war.
    if (this._hasNeutralExpansion(p.id)) return;
    // Find adjacent non-war non-ally players we COULD attack.
    const W = this.territory.width;
    const frontier = this.territory.getFrontier(p.id);
    const dirs: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const candidates = new Set<PlayerId>();
    for (const i of frontier) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!this.territory.inBounds(nx, ny)) continue;
        const o = this.territory.getOwner(nx, ny);
        if (o <= 0 || o === p.id) continue;
        if (this.areAllied(p.id, o)) continue;
        if (this.areAtWar(p.id, o)) continue;
        candidates.add(o);
      }
    }
    if (candidates.size === 0) return;
    // Pick the weakest candidate by tile count where we have strength
    // advantage. Strength = troops × tile-count.
    let bestId: PlayerId = 0;
    let bestStrength = Infinity;
    const myStrength = p.troops * Math.max(1, this.territory.counts[p.id] ?? 1);
    for (const id of candidates) {
      const e = this.players[id];
      if (!e || !e.alive) continue;
      const eStrength = e.troops * Math.max(1, this.territory.counts[id] ?? 1);
      // Need at least 1.3× our strength advantage to commit. Embargo
      // / sabotage decree-stack situations not factored in for v1.
      if (myStrength < eStrength * 1.3) continue;
      if (eStrength < bestStrength) { bestStrength = eStrength; bestId = id; }
    }
    if (bestId === 0) return;
    this.declareWar(p.id, bestId, 'ai');
    // Invite human allies to join the fight. Only humans currently
    // allied with the AI receive an invite — never strangers. We also
    // double-check the alliance bit here even though alliesOf already
    // filters, so the invariant is enforced at the push site.
    for (const ally of this.alliesOf(p.id)) {
      const allyP = this.players[ally];
      if (!allyP || !allyP.alive || !allyP.isHuman) continue;
      if (!this.areAllied(p.id, ally)) continue;
      if (this.areAtWar(ally, bestId)) continue;
      if (this.areAllied(ally, bestId)) continue;
      this.pendingWarInvites.push({ from: p.id, target: bestId });
      this.events.push({ type: 'war-invite', from: p.id, target: bestId });
    }
  }

  /** True if the player has at least one neutral tile adjacent to their
   *  frontier — i.e. they can expand peacefully without needing war. */
  private _hasNeutralExpansion(playerId: PlayerId): boolean {
    const W = this.territory.width;
    const frontier = this.territory.getFrontier(playerId);
    const dirs: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const i of frontier) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!this.territory.inBounds(nx, ny)) continue;
        if (!this.territory.isPassable(nx, ny)) continue;
        if (this.territory.getOwner(nx, ny) === 0) return true;
      }
    }
    return false;
  }

  /** Human accepts an AI's invitation to join their war. Returns true
   *  if a war was actually opened. Removes the invite from the queue
   *  whether accepted or declined. */
  acceptWarInvite(idx: number): boolean {
    const inv = this.pendingWarInvites[idx];
    if (!inv) return false;
    this.pendingWarInvites.splice(idx, 1);
    if (this.areAllied(1, inv.target)) return false;
    if (this.areAtWar(1, inv.target)) return false;
    this.declareWar(1, inv.target, 'manual');
    return true;
  }

  declineWarInvite(idx: number): boolean {
    if (idx < 0 || idx >= this.pendingWarInvites.length) return false;
    this.pendingWarInvites.splice(idx, 1);
    return true;
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
      const tileRegion = this.regions[i]!;
      const isVassal = tileRegion > 0 && this._regionDominant[tileRegion] === p.id;

      // Build candidate list, filtered for actionability:
      //   - neutral (owner 0) is always claimable
      //   - allied players can never be attacked
      //   - peace neighbors can never be attacked (must be at war)
      // This filters out tiles we'd waste rolls on inside tryCapture.
      const cands = this._validTargets(x, y, p.id);
      if (cands.length === 0) continue;
      const actionable: ExpansionCandidate[] = [];
      for (const c of cands) {
        const o = this.territory.getOwner(c.x, c.y);
        if (o === 0) { actionable.push(c); continue; }
        if (this.areAllied(p.id, o)) continue;
        if (!this.areAtWar(p.id, o)) continue;
        actionable.push(c);
      }
      if (actionable.length === 0) continue;

      // Decide pool + driver for this frontier tile.
      //
      //   1. MANUAL ORDER: if any of this tile's actionable candidates
      //      sits in a manual-target region, the leader's command wins.
      //      Pool is restricted to those candidates ONLY — no spreading
      //      to other directions even if they're easier. This is the
      //      "general's order to drop everything and take this land".
      //
      //   2. VASSAL AUTONOMOUS: tile is in a region we dominate but no
      //      manual order applies → push toward the vassal's chosen
      //      target if it's reachable, else into ANY adjacent neutral
      //      tile. Aggressive early-game neutral-eating happens here.
      //
      //   3. IDLE: non-vassal tile with no manual order → do nothing
      //      this tick. Stops the random spread that made the focus
      //      multiplier feel like "spread 3× everywhere" instead of
      //      "100% on the target".
      let pool: ExpansionCandidate[] = [];
      let isManualDriven = false;
      let isVassalDriven = false;
      let effectiveTarget = 0;

      if (manualTargets.length > 0) {
        const targetSet = new Set(manualTargets);
        for (const c of actionable) {
          if (targetSet.has(this.regions[c.y * W + c.x]!)) pool.push(c);
        }
        if (pool.length > 0) {
          isManualDriven = true;
          effectiveTarget = manualTargets.length === 1
            ? manualTargets[0]!
            : this._pickClosestTarget(x, y, manualTargets);
        }
      }

      if (pool.length === 0 && isVassal) {
        const vt = this._vassalTarget[tileRegion];
        if (vt && vt > 0) {
          for (const c of actionable) {
            if (this.regions[c.y * W + c.x] === vt) pool.push(c);
          }
          if (pool.length > 0) effectiveTarget = vt;
        }
        if (pool.length === 0) {
          // Aggressive fallback: any adjacent neutral. Vassals never
          // sit idle when there's free land touching their border.
          for (const c of actionable) {
            if (this.territory.getOwner(c.x, c.y) === 0) pool.push(c);
          }
          if (pool.length > 0 && effectiveTarget === 0) {
            effectiveTarget = this.regions[pool[0]!.y * W + pool[0]!.x]!;
          }
        }
        if (pool.length > 0) isVassalDriven = true;
      }

      if (pool.length === 0) continue;

      // Gold routing:
      //   - Manual / leader-driven (incl. AI): pays from p.gold first,
      //     falls back to treasury. Same combined-ops budget builds use.
      //   - Vassal-driven (humans only): pays from the vassal's own pool
      //     first, but if that's dry, drains a small amount from the
      //     leader's TREASURY so a fortified vassal whose pool got eaten
      //     by builds doesn't just stop pushing.
      const useVassalGold = isVassalDriven && p.isHuman && tileRegion > 0;
      const goldPool = (): number => {
        if (useVassalGold) {
          return (this._vassalGold[tileRegion] ?? 0) + p.treasury;
        }
        return p.gold + p.treasury;
      };
      const spend = (n: number): void => {
        if (useVassalGold) {
          const pool = this._vassalGold[tileRegion] ?? 0;
          if (pool >= n) { this._vassalGold[tileRegion]! = pool - n; return; }
          this._vassalGold[tileRegion]! = 0;
          const remainder = n - pool;
          p.treasury = Math.max(0, p.treasury - remainder);
          return;
        }
        if (p.gold >= n) { p.gold -= n; return; }
        const remainder = n - p.gold;
        p.gold = 0;
        p.treasury = Math.max(0, p.treasury - remainder);
      };

      if (goldPool() < this.config.EXPANSION_COST_PER_CLAIM) continue;

      // Decree-driven expansion boost (Forced March etc.) applies to
      // both manual and vassal pushes.
      let tileChance = baseChance * this._expansionBoostFor(p);
      // Focus multiplier: a single manual front gets the full FOCUS_BOOST,
      // multi-front splits the boost by N. Only applies to tiles that
      // ACTUALLY contribute to the front (have a target-region candidate).
      if (isManualDriven && p.isHuman && manualTargets.length > 0) {
        tileChance *= this.config.MANUAL_FOCUS_BOOST / manualTargets.length;
      }
      // Vassal autonomous: 1.5× boost when pushing into neutral land,
      // so early-game vassals eat free territory aggressively.
      if (isVassalDriven) {
        const targetingNeutral = pool.every((c) => this.territory.getOwner(c.x, c.y) === 0);
        if (targetingNeutral) tileChance *= 1.5;
      }
      if (!p.isHuman && p.gold > 1500) tileChance *= 1.6;

      const chosen = pool[(Math.random() * pool.length) | 0]!;
      void effectiveTarget;

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
        // Veterans decree multiplies attacker power. Stacks with
        // regional math (vassal-driven path multiplies its own
        // attackerPower below) and rally buffs.
        const veteransMult = this._veteransMult(p);
        // Tank-Push buff (set by _fireTankPush): brief +50% attacker
        // combat power so the steamroll momentum continues for ~8s.
        const tankMult = this._abilityActive(p, 'tank-rush') ? 1.5 : 1;
        let attackerPower = p.troops * veteransMult * tankMult;
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
          attackerPower = p.troops * fracA * moraleA * garrisonA * veteransMult * tankMult;
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
    // Reinforced Bunkers buffs the turret bonus specifically (not the
    // full-region or mastery components). +50%/stack capped at +100%,
    // so a defender invested in turrets+bunkers gets a hardened ring.
    if (defender) bonus *= this._reinforcedBunkersMult(defender);
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
      const r = lvl <= 3
        ? baseRBy[owner]! + (lvl - 1)
        : baseRBy[owner]! + 2 + (lvl - 3) * 4;
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
          this._adjSettlementLevels(b.x, b.y, b.owner, -lvl);
        }
        if (b.type === 'turret') this._turretCacheDirty = true;
        this.buildings.splice(i, 1);
        this.buildingsVersion++;
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
    if (b.type !== 'settlement' && b.type !== 'turret'
        && b.type !== 'aa' && b.type !== 'port') return;
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
        this._adjSettlementLevels(c.x, c.y, c.owner, -cl);
      }
      if (c.type === 'turret') this._turretCacheDirty = true;
      const idx = this.buildings.indexOf(c);
      if (idx >= 0) this.buildings.splice(idx, 1);
    }
    this.buildingsVersion++;

    // Add the promoted building at the centroid.
    const promoted: Building = { x: cx, y: cy, owner: b.owner, type: b.type, level: lvl + 1 };
    this.buildings.push(promoted);
    this.buildingsVersion++;
    if (b.type === 'settlement') {
      this._applySettlement(cx, cy, lvl + 1, this._settlementRadius(lvl + 1));
      this._adjSettlementLevels(cx, cy, b.owner, lvl + 1);
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
    const baseCost = this.config.SHIP_COSTS[kind];
    if (baseCost == null) return 'bad-type';
    if (!this.territory.inBounds(x, y)) return 'oob';
    const owner = this.players[ownerId];
    if (!owner || !owner.alive) return 'dead';
    const cost = Math.ceil(baseCost * this._admiraltyCostMult(owner));
    // Ships require a Defense Port — same building gates both anti-naval
    // defense AND fleet construction. Naval mastery still buffs cap and
    // reload, but no longer gatekeeps the ability to build.
    if (!this.hasPort(ownerId)) return 'no-port';
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
    if (!this._chargeOps(owner, cost)) return 'gold';
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
    const owner = this.players[s.owner];
    const baseMoveTicks = this.config.SHIP_MOVE_TICKS[s.kind];
    // Admiralty stacks divide the move-ticks (lower = faster).
    const speedDiv = owner ? this._admiraltySpeedDivisor(owner) : 1;
    const moveTicks = Math.max(1, Math.round(baseMoveTicks / speedDiv));
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
        if (!this.areAtWar(s.owner, o.owner)) continue;
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
          if (!this.areAtWar(s.owner, o)) continue;
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
        originX: s.x, originY: s.y,
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

    // WARSHIP: dedicated battery + beachhead path. Fires in a 3x3 pattern
    // for area damage, then attempts a cluster landfall (primary + up to
    // 4 adjacent enemy tiles) so the beachhead survives the immediate
    // counter-push. If no enemy in range, fall back to claiming neutral
    // coastal land — a warship with no fight nearby still expands the
    // empire instead of idling.
    if (s.kind === 'warship') {
      // Find the closest enemy land tile in range.
      let bestEX = -1, bestEY = -1, bestED = Infinity;
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
          // Peace gate — ships only fire on at-war players, not on
          // every non-allied neighbor. Without this they'd open fire
          // on peaceful neighbors and lose every shot to the war
          // gate inside tryCapture.
          if (!this.areAtWar(s.owner, o)) continue;
          if (d2 < bestED) { bestED = d2; bestEX = tx; bestEY = ty; }
        }
      }

      if (bestEX >= 0) {
        // BATTERY — 3×3 area shell. Primary tile takes full damage
        // (50 hp drained from owner), adjacent enemy tiles take 60%
        // (30 hp). Diagonals included unlike the old cross splash.
        const primaryDmg = 50;
        const splashDmg  = 30;
        for (let ddy = -1; ddy <= 1; ddy++) {
          for (let ddx = -1; ddx <= 1; ddx++) {
            const ax = bestEX + ddx, ay = bestEY + ddy;
            if (!this.territory.inBounds(ax, ay)) continue;
            if (!this.territory.isPassable(ax, ay)) continue;
            const ao = this.territory.getOwner(ax, ay);
            if (ao <= 0 || ao === s.owner) continue;
            if (this.areAllied(s.owner, ao)) continue;
            const ap = this.players[ao];
            const isPrimary = (ddx === 0 && ddy === 0);
            const d = isPrimary ? primaryDmg : splashDmg;
            if (ap) ap.troops = Math.max(0, ap.troops - d);
          }
        }
        // CLUSTER LANDFALL — primary + adjacent enemy tiles flip if the
        // primary is within reach (md <= 3). Means each volley plants a
        // 2-5 tile beachhead instead of 1 lonely tile that gets re-flipped
        // immediately. Capitals still immune.
        const md = Math.abs(bestEX - s.x) + Math.abs(bestEY - s.y);
        if (md <= 3 && this._capitalIndexAt(bestEX, bestEY) < 0) {
          this.tryCapture(bestEX, bestEY, s.owner);
          // 4-direction adjacents
          for (const [adx, ady] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
            const ax = bestEX + adx, ay = bestEY + ady;
            if (!this.territory.inBounds(ax, ay)) continue;
            if (this._capitalIndexAt(ax, ay) >= 0) continue;
            if (!this.territory.isPassable(ax, ay)) continue;
            const ao = this.territory.getOwner(ax, ay);
            if (ao > 0 && ao !== s.owner && !this.areAllied(s.owner, ao)) {
              this.tryCapture(ax, ay, s.owner);
            }
          }
        }
      } else {
        // No enemy in range — claim nearest neutral coastal land instead
        // (warships expand the empire when not fighting).
        let bestNX = -1, bestNY = -1, bestND = Infinity;
        for (let dy = -range; dy <= range; dy++) {
          for (let dx = -range; dx <= range; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 > r2) continue;
            const tx = s.x + dx, ty = s.y + dy;
            if (!this.territory.inBounds(tx, ty)) continue;
            if (!this.territory.isPassable(tx, ty)) continue;
            if (this.territory.getOwner(tx, ty) !== 0) continue;
            // Prefer coastal (water-adjacent) tiles for beach landings.
            let coastal = false;
            for (const [cdx, cdy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
              if (this.territory.inBounds(tx + cdx, ty + cdy)
                  && !this.territory.isPassable(tx + cdx, ty + cdy)) {
                coastal = true; break;
              }
            }
            const score = d2 + (coastal ? 0 : 50); // bias toward coast
            if (score < bestND) { bestND = score; bestNX = tx; bestNY = ty; }
          }
        }
        if (bestNX >= 0) {
          this._claim(bestNX, bestNY, s.owner);
          // Also claim 1-2 adjacent neutrals so the beachhead is real.
          let extra = 0;
          for (const [adx, ady] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
            if (extra >= 2) break;
            const ax = bestNX + adx, ay = bestNY + ady;
            if (!this.territory.inBounds(ax, ay)) continue;
            if (!this.territory.isPassable(ax, ay)) continue;
            if (this.territory.getOwner(ax, ay) !== 0) continue;
            if (this._claim(ax, ay, s.owner)) extra++;
          }
        }
      }

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
        if (!this.areAtWar(s.owner, o)) continue;
        if (d2 < bestD) { bestD = d2; bestX = tx; bestY = ty; }
      }
    }
    if (bestX < 0) return;
    const defender = this.players[this.territory.getOwner(bestX, bestY)];
    if (defender) defender.troops = Math.max(0, defender.troops - dmg);
    // Warship has its own dedicated branch above; this path is for
    // scout / skirmisher / destroyer (no-ships fallback) only.
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
        // Arrived — bombers detonate and despawn; AC-130 enters orbit;
        // stealth bombers lay a carpet along their flight axis.
        if (pl.bombType === 'ac130') {
          pl.x = pl.destX; pl.y = pl.destY;
          pl.orbitUntilTick = this.tickCount + this.config.AC130_ORBIT_TICKS;
          pl.nextStrafeTick = this.tickCount + 4; // first strafe almost immediately
          // Don't continue — fall through so AA can immediately roll
          // against the now-stationary gunship.
        } else if (pl.bombType === 'stealth') {
          this._carpetBomb(pl);
          this.planes.splice(i, 1);
          continue;
        } else {
          this._detonateBomb(pl.bombType, Math.floor(pl.destX), Math.floor(pl.destY), pl.owner);
          this.planes.splice(i, 1);
          continue;
        }
      } else {
        pl.x += (dx / d) * pl.speed;
        pl.y += (dy / d) * pl.speed;
      }

      // Stealth bombers bypass AA entirely — that's the whole point of
      // the 1000g price tag. They cannot be shot down en route.
      if (pl.bombType === 'stealth') continue;

      // Check enemy AA for shootdown. Each AA gets one roll per plane.
      // Per-level hit rate: L1 50%, L2 60%, L3 75%, L4+ (consolidated)
      // 85%. Bigger AA umbrellas reward upgrade investment.
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
        pl.rolledAA.add(this._buildingKey(b));
        const lvl = b.level ?? 1;
        const chance = this._aaHitChanceFor(lvl);
        if (Math.random() < chance) {
          shotDown = true;
          killer = b.owner;
          break;
        }
      }
      void hitChance;

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
