// Game state: human + AI players, capitals, per-tick simulation (gold,
// expansion, combat, AI behavior), elimination, victory check.
class Game {
  constructor(territory) {
    this.territory = territory;
    this.players = [null]; // index 0 = unclaimed sentinel
    this.players.push(this._mkPlayer(1, 'You', true));
    for (let i = 0; i < CONFIG.AI_PLAYER_COUNT; i++) {
      const id = 2 + i;
      this.players.push(this._mkPlayer(id, 'AI ' + (i + 1), false));
    }
    this.capitals = []; // [{x, y, owner}]
    this.tickCount = 0;
    this.outcome = null;       // 'victory' | 'defeat' | null
    this.events = [];          // queued game events for UI to consume (toasts)
  }

  _mkPlayer(id, name, isHuman) {
    return {
      id, name, isHuman,
      gold: CONFIG.STARTING_GOLD,
      alive: true,
      target: null,
      expanding: isHuman ? false : true, // AI always trying to grow
    };
  }

  human() { return this.players[1]; }

  // --- Setup ---

  spawnAll() {
    const W = this.territory.width, H = this.territory.height;
    const corners = [
      { id: 1, x: W * CONFIG.HUMAN_SPAWN_X_FRAC, y: H * CONFIG.HUMAN_SPAWN_Y_FRAC },
      { id: 2, x: W * 0.85, y: H * 0.18 },
      { id: 3, x: W * 0.85, y: H * 0.82 },
      { id: 4, x: W * 0.5,  y: H * 0.10 },
    ];
    for (let i = 0; i < this.players.length - 1; i++) {
      const c = corners[i];
      this._spawnPlayerAt(c.id, Math.floor(c.x), Math.floor(c.y));
    }
    // AI defaults to targeting the map center; will retarget periodically
    for (let id = 2; id < this.players.length; id++) {
      this.players[id].target = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
    }
  }

  _spawnPlayerAt(id, cx, cy) {
    const r = CONFIG.SPAWN_RADIUS;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          this.territory.claim(cx + dx, cy + dy, id);
        }
      }
    }
    // Capitals: a small spread inside the spawn blob
    const offsets = [
      { x: 0,  y: 0  },
      { x: 3,  y: 1  },
      { x: -2, y: -2 },
    ];
    for (let i = 0; i < CONFIG.CAPITALS_PER_PLAYER; i++) {
      const o = offsets[i];
      this.capitals.push({ x: cx + o.x, y: cy + o.y, owner: id });
    }
  }

  // --- Player actions ---

  setHumanTarget(x, y) {
    if (!this.territory.inBounds(x, y)) return;
    const p = this.human();
    if (!p.alive) return;
    p.target = { x, y };
    p.expanding = true;
  }

  haltHuman() {
    const p = this.human();
    p.target = null;
    p.expanding = false;
  }

  // --- Tick ---

  tick() {
    if (this.outcome) return;
    this.tickCount++;
    for (let id = 1; id < this.players.length; id++) {
      const p = this.players[id];
      if (!p || !p.alive) continue;
      this._earnGold(p);
      if (!p.isHuman) this._aiThink(p);
      if (p.expanding) this._expand(p);
    }
    this._checkVictory();
  }

  _earnGold(p) {
    p.gold += this.territory.counts[p.id] * CONFIG.GOLD_PER_TILE_PER_TICK;
  }

  _aiThink(p) {
    // Pick a new target every AI_RETARGET_TICKS. For M3 this just hops between
    // the map center and the centroid of the largest enemy — produces enough
    // pressure for a playtest. Smarter behavior comes with the general AI.
    if (this.tickCount % CONFIG.AI_RETARGET_TICKS !== 0 && p.target) return;
    const W = this.territory.width, H = this.territory.height;
    // Find the alive player with the largest territory (other than self)
    let bestId = -1, bestCount = -1;
    for (let id = 1; id < this.players.length; id++) {
      if (id === p.id) continue;
      const op = this.players[id];
      if (!op || !op.alive) continue;
      const c = this.territory.counts[id];
      if (c > bestCount) { bestCount = c; bestId = id; }
    }
    let tx = W / 2, ty = H / 2;
    if (bestId > 0 && Math.random() < 0.65) {
      const c = this.territory.centroid(bestId);
      tx = c.x; ty = c.y;
    }
    p.target = { x: Math.floor(tx), y: Math.floor(ty) };
  }

  _expand(p) {
    const frontier = this.territory.getFrontier(p.id);
    if (frontier.size === 0) return;
    const W = this.territory.width;
    const baseChance = CONFIG.EXPANSION_CHANCE_PER_FRONTIER_TILE;
    const target = p.target;

    // Centroid -> target unit vector for tile-position-based weighting
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
      if (p.gold < CONFIG.EXPANSION_COST_PER_CLAIM) break;
      const i = tiles[k];
      const x = i % W;
      const y = (i - x) / W;

      const cands = this._validTargets(x, y, p.id);
      if (cands.length === 0) continue;

      // Per-tile chance based on position relative to centroid -> target
      let chance = baseChance;
      if (useTarget) {
        const fx = x - cx, fy = y - cy;
        const fDist = Math.hypot(fx, fy) || 1;
        const align = (fx / fDist) * tNx + (fy / fDist) * tNy;
        chance *= Math.pow(Math.max(0, align + 1), CONFIG.EXPANSION_DIRECTIONAL_EXP);
      }

      // Pick the chosen neighbor
      let chosen;
      if (useTarget && Math.random() < CONFIG.EXPANSION_TARGET_BIAS) {
        let bestS = -Infinity;
        chosen = cands[0];
        for (const c of cands) {
          const s = c.dx * tNx + c.dy * tNy;
          if (s > bestS) { bestS = s; chosen = c; }
        }
      } else {
        chosen = cands[(Math.random() * cands.length) | 0];
      }

      const targetOwner = this.territory.getOwner(chosen.x, chosen.y);
      if (targetOwner === 0) {
        // Unclaimed expansion
        if (Math.random() > chance) continue;
        if (p.gold < CONFIG.EXPANSION_COST_PER_CLAIM) continue;
        if (this.territory.claim(chosen.x, chosen.y, p.id)) {
          p.gold -= CONFIG.EXPANSION_COST_PER_CLAIM;
        }
      } else {
        // Combat: attack an enemy tile
        if (Math.random() > chance * CONFIG.ATTACK_RATE_MULT) continue;
        if (p.gold < CONFIG.ATTACK_COST_PER_CLAIM) continue;
        if (this.tryCapture(chosen.x, chosen.y, p.id)) {
          p.gold -= CONFIG.ATTACK_COST_PER_CLAIM;
        }
      }
    }
  }

  _validTargets(x, y, owner) {
    const cands = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      const o = this.territory.getOwner(nx, ny);
      if (o === -1) continue;     // out of bounds
      if (o === owner) continue;  // own tile
      cands.push({ x: nx, y: ny, dx, dy, owner: o });
    }
    return cands;
  }

  // --- Captures + capitals ---

  // Attempt to flip (x, y) to attackerId. Generals (later) cannot capture
  // capital tiles; for M3, all players (human + AI) can. Returns true on success.
  tryCapture(x, y, attackerId) {
    const defender = this.territory.getOwner(x, y);
    if (defender < 0 || defender === attackerId) return false;

    const capIdx = this._capitalIndexAt(x, y);
    // Note: M6 will add general entities and block them here.

    if (!this.territory.claim(x, y, attackerId)) return false;
    if (capIdx >= 0) {
      // Capital is destroyed (not transferred). Defender loses one capital.
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

  _capitalIndexAt(x, y) {
    for (let i = 0; i < this.capitals.length; i++) {
      if (this.capitals[i].x === x && this.capitals[i].y === y) return i;
    }
    return -1;
  }

  _checkElimination(playerId) {
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

  _checkVictory() {
    if (this.outcome) return;
    let aliveCount = 0;
    let lastAlive = -1;
    for (let id = 1; id < this.players.length; id++) {
      if (this.players[id] && this.players[id].alive) {
        aliveCount++;
        lastAlive = id;
      }
    }
    if (aliveCount === 1) {
      this.outcome = (lastAlive === 1) ? 'victory' : 'defeat';
      this.events.push({ type: 'gameover', outcome: this.outcome, winner: lastAlive });
    } else if (aliveCount === 0) {
      this.outcome = 'defeat';
      this.events.push({ type: 'gameover', outcome: 'defeat', winner: -1 });
    } else if (!this.human().alive) {
      // Human eliminated but AIs still fight on; we still call this defeat
      this.outcome = 'defeat';
      this.events.push({ type: 'gameover', outcome: 'defeat', winner: -1 });
    }
  }

  // UI consumes queued events on each frame.
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
