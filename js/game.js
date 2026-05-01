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
    const baseChance = CONFIG.EXPANSION_CHANCE_PER_FRONTIER_TILE;
    const target = p.target;
    const tiles = Array.from(frontier);
    for (let k = 0; k < tiles.length; k++) {
      if (p.gold < CONFIG.EXPANSION_COST_PER_CLAIM) break;
      const i = tiles[k];
      const x = i % W;
      const y = (i - x) / W;

      const cands = this._unclaimedNeighbors(x, y);
      if (cands.length === 0) continue;

      // Modulate per-tile chance by alignment with target so frontier tiles
      // facing AWAY from the target almost never fire. This is what makes
      // tap-to-expand feel directional.
      let chance = baseChance;
      let chosen;
      if (target) {
        const tdx = target.x - x;
        const tdy = target.y - y;
        const dist = Math.hypot(tdx, tdy) || 1;
        const ntx = tdx / dist, nty = tdy / dist;
        let bestAlign = -2;
        let bestCand = cands[0];
        for (const c of cands) {
          const align = c.dx * ntx + c.dy * nty;
          if (align > bestAlign) { bestAlign = align; bestCand = c; }
        }
        // (align+1) is in [0,2]; raise to power for sharper falloff.
        const mult = Math.pow(Math.max(0, bestAlign + 1), CONFIG.EXPANSION_DIRECTIONAL_EXP);
        chance *= mult;
        chosen = (Math.random() < CONFIG.EXPANSION_TARGET_BIAS)
          ? bestCand
          : cands[(Math.random() * cands.length) | 0];
      } else {
        chosen = cands[(Math.random() * cands.length) | 0];
      }

      if (Math.random() > chance) continue;
      // M2: only claim unclaimed tiles. Combat lands in M3.
      if (this.territory.getOwner(chosen.x, chosen.y) !== 0) continue;
      if (this.territory.claim(chosen.x, chosen.y, p.id)) {
        p.gold -= CONFIG.EXPANSION_COST_PER_CLAIM;
      }
    }
  }

  _unclaimedNeighbors(x, y) {
    const cands = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      if (this.territory.getOwner(x + dx, y + dy) === 0) {
        cands.push({ x: x + dx, y: y + dy, dx, dy });
      }
    }
    return cands;
  }
}
