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

    // Compute the unit vector from territory CENTROID to target. A frontier
    // tile's expansion chance is then weighted by how aligned its position
    // (relative to the centroid) is with that vector. Tiles on the
    // away-side of the centroid get suppressed regardless of which
    // neighbors they have.
    let useTarget = false, tNx = 0, tNy = 0, cx = 0, cy = 0;
    if (target) {
      const c = this.territory.centroid(p.id);
      cx = c.x; cy = c.y;
      const tdx = target.x - cx;
      const tdy = target.y - cy;
      const tDist = Math.hypot(tdx, tdy);
      if (tDist > 0.5) { // ignore taps that land basically on top of the centroid
        useTarget = true;
        tNx = tdx / tDist;
        tNy = tdy / tDist;
      }
    }

    const tiles = Array.from(frontier);
    for (let k = 0; k < tiles.length; k++) {
      if (p.gold < CONFIG.EXPANSION_COST_PER_CLAIM) break;
      const i = tiles[k];
      const x = i % W;
      const y = (i - x) / W;

      const cands = this._unclaimedNeighbors(x, y);
      if (cands.length === 0) continue;

      let chance = baseChance;
      let chosen;
      if (useTarget) {
        // Position-of-tile relative to centroid → unit vector
        const fx = x - cx, fy = y - cy;
        const fDist = Math.hypot(fx, fy) || 1;
        const fNx = fx / fDist, fNy = fy / fDist;
        const align = fNx * tNx + fNy * tNy; // [-1, 1]
        const mult = Math.pow(Math.max(0, align + 1), CONFIG.EXPANSION_DIRECTIONAL_EXP);
        chance *= mult;

        // Pick the candidate whose neighbor-direction is most aligned with target.
        if (Math.random() < CONFIG.EXPANSION_TARGET_BIAS) {
          let bestCand = cands[0];
          let bestScore = -Infinity;
          for (const c of cands) {
            const s = c.dx * tNx + c.dy * tNy;
            if (s > bestScore) { bestScore = s; bestCand = c; }
          }
          chosen = bestCand;
        } else {
          chosen = cands[(Math.random() * cands.length) | 0];
        }
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
