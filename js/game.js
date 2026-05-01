// Game state: players (id, color, gold, target, alive) and per-tick logic
// (gold accrual, expansion). M2 only spawns the human; M3 adds AI players.
class Game {
  constructor(territory) {
    this.territory = territory;
    this.players = [
      null, // index 0 = unclaimed sentinel
      this._mkPlayer(1, 'You',  true),
    ];
    this.tickCount = 0;
  }

  _mkPlayer(id, name, isHuman) {
    return {
      id,
      name,
      isHuman,
      gold: CONFIG.STARTING_GOLD,
      alive: true,
      target: null,
      expanding: false,
    };
  }

  human() { return this.players[1]; }

  spawnHuman() {
    const x = Math.floor(this.territory.width  * CONFIG.HUMAN_SPAWN_X_FRAC);
    const y = Math.floor(this.territory.height * CONFIG.HUMAN_SPAWN_Y_FRAC);
    this._spawnBlob(x, y, 1, CONFIG.SPAWN_RADIUS);
  }

  _spawnBlob(cx, cy, owner, r) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          this.territory.claim(cx + dx, cy + dy, owner);
        }
      }
    }
  }

  setHumanTarget(x, y) {
    if (!this.territory.inBounds(x, y)) return;
    const p = this.human();
    p.target = { x, y };
    p.expanding = true;
  }

  haltHuman() {
    const p = this.human();
    p.target = null;
    p.expanding = false;
  }

  tick() {
    this.tickCount++;
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (!p || !p.alive) continue;
      this._earnGold(p);
      if (p.expanding) this._expand(p);
    }
  }

  _earnGold(p) {
    const owned = this.territory.counts[p.id];
    p.gold += owned * CONFIG.GOLD_PER_TILE_PER_TICK;
  }

  _expand(p) {
    const frontier = this.territory.getFrontier(p.id);
    if (frontier.size === 0 || p.gold < CONFIG.EXPANSION_COST_PER_CLAIM) return;
    const W = this.territory.width;
    const chance = CONFIG.EXPANSION_CHANCE_PER_FRONTIER_TILE;
    const target = p.target;
    // Snapshot the frontier so we don't mutate-while-iterating
    const tiles = Array.from(frontier);
    for (let k = 0; k < tiles.length; k++) {
      if (p.gold < CONFIG.EXPANSION_COST_PER_CLAIM) break;
      if (Math.random() > chance) continue;
      const i = tiles[k];
      const x = i % W;
      const y = (i - x) / W;
      const n = this._pickExpansionNeighbor(x, y, p.id, target);
      if (!n) continue;
      // M2: only claim unclaimed tiles. Combat (overwrite enemy) lands in M3.
      if (this.territory.getOwner(n.x, n.y) !== 0) continue;
      if (this.territory.claim(n.x, n.y, p.id)) {
        p.gold -= CONFIG.EXPANSION_COST_PER_CLAIM;
      }
    }
  }

  _pickExpansionNeighbor(x, y, owner, target) {
    const cands = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (this.territory.getOwner(nx, ny) === 0) {
        cands.push({ x: nx, y: ny, dx, dy });
      }
    }
    if (cands.length === 0) return null;
    if (target && Math.random() < CONFIG.EXPANSION_TARGET_BIAS) {
      const tdx = target.x - x;
      const tdy = target.y - y;
      let best = cands[0];
      let bestScore = -Infinity;
      for (const c of cands) {
        const score = c.dx * tdx + c.dy * tdy;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      return best;
    }
    return cands[(Math.random() * cands.length) | 0];
  }
}
