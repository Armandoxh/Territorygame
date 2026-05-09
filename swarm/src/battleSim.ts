// Combat resolver for the Simulate option in the battle menu.
//
// Rounds-based: both sides exchange blows simultaneously each round.
// After every round, each side independently checks two retreat
// conditions; if either fires, that side retreats. The first side to
// retreat (or hit zero) determines the outcome label.
//
//   Round (per side, simultaneous):
//     raw    = sum(count * unit.atk) * DAMAGE_SCALE
//     to-reg = raw * (regiment.count * regiment.hp) / opponent_total_hp
//     red    = regiment.count * regiment.def * DEF_SCALE
//     killed = floor(max(0, to-reg - red) / regiment.hp)
//
//   Power score (used for retreat checks):
//     sum(count * (atk + hp))   // bulk + offense in one scalar
//
//   Retreat triggers (either fires):
//     1. current_power / opponent_power < RETREAT_RATIO   (outmatched)
//     2. (start_power - current_power) / start_power > RETREAT_CASUALTIES
//
// The numbers below were tuned so symmetric battles take ~4-6 rounds
// and a 1.4x advantage routs the weaker side in ~2 rounds. Tune via
// the named constants — don't hardcode in the loop.

import { UNIT_DEFS } from './units';
import type { Regiment } from './army';

const DAMAGE_SCALE = 0.5;
const DEF_SCALE = 0.3;
const RETREAT_RATIO = 0.4;
const RETREAT_CASUALTIES = 0.6;
// Stalemate fallback. With the tuning above, real battles never
// approach this — it's just a guard against integer-precision loops
// where neither side can break the other's armor.
const MAX_ROUNDS = 30;

export type SimOutcome =
  | 'enemy_routed'
  | 'player_routed'
  | 'mutual_rout'
  | 'enemy_destroyed'
  | 'player_destroyed';

export interface SimSide {
  regiments: readonly Regiment[];
}

export interface SimSideResult {
  before: Regiment[];
  after: Regiment[];
  totalBefore: number;
  totalAfter: number;
}

export interface SimResult {
  player: SimSideResult;
  enemy: SimSideResult;
  outcome: SimOutcome;
  rounds: number;
}

function totalCount(regs: readonly Regiment[]): number {
  let s = 0;
  for (const r of regs) s += r.count;
  return s;
}

function totalAtk(regs: readonly Regiment[]): number {
  let a = 0;
  for (const r of regs) a += r.count * UNIT_DEFS[r.type].atk;
  return a;
}

function totalPower(regs: readonly Regiment[]): number {
  let p = 0;
  for (const r of regs) {
    const def = UNIT_DEFS[r.type];
    p += r.count * (def.atk + def.hp);
  }
  return p;
}

function totalHp(regs: readonly Regiment[]): number {
  let h = 0;
  for (const r of regs) h += r.count * UNIT_DEFS[r.type].hp;
  return h;
}

// Mutates `target` in place: resolves one side's incoming round of
// damage. Returns nothing — caller checks counts post-call.
function applyRound(target: Regiment[], attackerAtk: number): void {
  const raw = attackerAtk * DAMAGE_SCALE;
  const tHp = totalHp(target);
  if (tHp <= 0 || raw <= 0) return;
  for (const r of target) {
    if (r.count <= 0) continue;
    const def = UNIT_DEFS[r.type];
    const incoming = raw * ((r.count * def.hp) / tHp);
    const reduction = r.count * def.def * DEF_SCALE;
    const effective = Math.max(0, incoming - reduction);
    const killed = Math.min(r.count, Math.floor(effective / def.hp));
    r.count -= killed;
  }
}

function shouldRetreat(currentPower: number, opponentPower: number, startPower: number): boolean {
  if (currentPower <= 0) return true;
  if (opponentPower > 0 && currentPower / opponentPower < RETREAT_RATIO) return true;
  if (startPower > 0 && (startPower - currentPower) / startPower > RETREAT_CASUALTIES) return true;
  return false;
}

export function simulateBattle(player: SimSide, enemy: SimSide): SimResult {
  const pBefore: Regiment[] = player.regiments.map((r) => ({ type: r.type, count: r.count }));
  const eBefore: Regiment[] = enemy.regiments.map((r) => ({ type: r.type, count: r.count }));
  // Working copies — same length / type ordering as `*Before` so the
  // result UI can interpolate count-by-count without alignment work.
  const pNow: Regiment[] = pBefore.map((r) => ({ ...r }));
  const eNow: Regiment[] = eBefore.map((r) => ({ ...r }));
  const pStart = totalPower(pBefore);
  const eStart = totalPower(eBefore);

  let outcome: SimOutcome = 'mutual_rout';
  let rounds = 0;

  // Degenerate cases — one or both sides start empty.
  if (pStart === 0 && eStart === 0) outcome = 'mutual_rout';
  else if (pStart === 0) outcome = 'player_destroyed';
  else if (eStart === 0) outcome = 'enemy_destroyed';
  else {
    while (rounds < MAX_ROUNDS) {
      // Snapshot atk values BEFORE the round so both sides hit at full
      // pre-round strength (simultaneous resolution).
      const pAtk = totalAtk(pNow);
      const eAtk = totalAtk(eNow);
      applyRound(eNow, pAtk);  // player → enemy
      applyRound(pNow, eAtk);  // enemy → player
      rounds++;

      const pPower = totalPower(pNow);
      const ePower = totalPower(eNow);
      const pDestroyed = pPower <= 0;
      const eDestroyed = ePower <= 0;
      if (pDestroyed && eDestroyed) { outcome = 'mutual_rout'; break; }
      if (pDestroyed) { outcome = 'player_destroyed'; break; }
      if (eDestroyed) { outcome = 'enemy_destroyed'; break; }

      const pRetreat = shouldRetreat(pPower, ePower, pStart);
      const eRetreat = shouldRetreat(ePower, pPower, eStart);
      if (pRetreat && eRetreat) { outcome = 'mutual_rout'; break; }
      if (pRetreat) { outcome = 'player_routed'; break; }
      if (eRetreat) { outcome = 'enemy_routed'; break; }
    }
    // Fell through without retreat → MAX_ROUNDS stalemate, mutual rout.
  }

  return {
    player: {
      before: pBefore,
      after: pNow,
      totalBefore: totalCount(pBefore),
      totalAfter: totalCount(pNow),
    },
    enemy: {
      before: eBefore,
      after: eNow,
      totalBefore: totalCount(eBefore),
      totalAfter: totalCount(eNow),
    },
    outcome,
    rounds,
  };
}
