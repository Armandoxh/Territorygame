// Combat resolver for the Simulate option in the battle menu.
//
// Fight-to-finish per port.md ("when two opposing soldier sprites are
// in the same tile, both have a per-tick die-roll. Loser despawns").
// No retreat threshold — sim runs until one side reaches zero power
// (or a stalemate-guard MAX_ROUNDS is hit, treated as mutual
// destruction). Battles are decisive: the loser is gone, the winner
// keeps survivors.
//
//   Round (per side, simultaneous):
//     raw    = sum(count * unit.atk) * DAMAGE_SCALE
//     to-reg = raw * (regiment.count * regiment.hp) / opponent_total_hp
//     red    = regiment.count * regiment.def * DEF_SCALE
//     killed = max(1 if effective>0 else 0, floor(effective / hp))
//
// The min-1 floor on damage (when there's any positive incoming) stops
// armor-stalemate at small numbers — without it, when both sides
// shrink to ~4 soldiers the def reduction wipes out incoming damage
// and the loop never resolves.

import { UNIT_DEFS } from './units';
import type { Regiment } from './army';

const DAMAGE_SCALE = 0.5;
const DEF_SCALE = 0.3;
// Stalemate guard. With min-1 floor, even very large symmetric
// armies (200 vs 200) finish in <40 rounds. 60 leaves headroom.
const MAX_ROUNDS = 60;

export type SimOutcome =
  | 'enemy_destroyed'
  | 'player_destroyed'
  | 'mutual_destruction';

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
    let killed = Math.floor(effective / def.hp);
    if (killed === 0 && effective > 0) killed = 1;
    if (killed > r.count) killed = r.count;
    r.count -= killed;
  }
}

export function simulateBattle(player: SimSide, enemy: SimSide): SimResult {
  const pBefore: Regiment[] = player.regiments.map((r) => ({ type: r.type, count: r.count }));
  const eBefore: Regiment[] = enemy.regiments.map((r) => ({ type: r.type, count: r.count }));
  const pNow: Regiment[] = pBefore.map((r) => ({ ...r }));
  const eNow: Regiment[] = eBefore.map((r) => ({ ...r }));

  let outcome: SimOutcome = 'mutual_destruction';
  let rounds = 0;

  // Degenerate cases — one or both sides start empty.
  const pStart = totalPower(pBefore);
  const eStart = totalPower(eBefore);
  if (pStart === 0 && eStart === 0) outcome = 'mutual_destruction';
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
      if (pDestroyed && eDestroyed) { outcome = 'mutual_destruction'; break; }
      if (pDestroyed) { outcome = 'player_destroyed'; break; }
      if (eDestroyed) { outcome = 'enemy_destroyed'; break; }
    }
    // Fell through MAX_ROUNDS without resolution → treat as mutual
    // destruction. With current tuning + min-1 floor this should never
    // trigger in practice; it's a guard for pathological inputs.
    if (rounds >= MAX_ROUNDS && totalPower(pNow) > 0 && totalPower(eNow) > 0) {
      // Zero both sides so the result panel reads "MUTUAL DESTRUCTION"
      // consistently rather than showing leftover soldiers.
      for (const r of pNow) r.count = 0;
      for (const r of eNow) r.count = 0;
      outcome = 'mutual_destruction';
    }
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
