// Placeholder combat resolution for the Simulate option in the battle
// menu (#6.2). Real per-soldier combat math arrives with the full sim
// in #6.6 — this file is intentionally crude so we don't pre-empt that
// design space. It exists only so Simulate produces *some* observable
// state change (regiment counts go down).
//
// Formula: total head-count comparison. Side with more soldiers takes
// proportionally fewer casualties. No per-unit-type weighting, no
// terrain, no morale, no rolls. Deterministic.

import type { Regiment } from './army';

// Total fraction of the losing side's force lost in a balanced (50/50)
// engagement. Lower = lighter casualties. 0.6 means an even fight wipes
// 30% of each side.
const LOSS_SCALE = 0.6;

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
}

function totalCount(regs: readonly Regiment[]): number {
  let s = 0;
  for (const r of regs) s += r.count;
  return s;
}

// Apply a loss fraction to each regiment, rounding down. A regiment
// with count > 0 keeps at least 1 soldier so a token force survives —
// avoids the player's army silently disappearing on a single bad sim.
function applyLoss(regs: readonly Regiment[], lossFrac: number): Regiment[] {
  return regs.map((r) => {
    const losses = Math.floor(r.count * lossFrac);
    const survivors = Math.max(r.count > 0 ? 1 : 0, r.count - losses);
    return { type: r.type, count: survivors };
  });
}

export function simulateBattle(player: SimSide, enemy: SimSide): SimResult {
  const pBefore = player.regiments.map((r) => ({ type: r.type, count: r.count }));
  const eBefore = enemy.regiments.map((r) => ({ type: r.type, count: r.count }));
  const pTotal = totalCount(pBefore);
  const eTotal = totalCount(eBefore);
  const denom = pTotal + eTotal;

  // Degenerate cases: zero-count side. Treat as instant rout.
  if (denom === 0 || pTotal === 0 || eTotal === 0) {
    return {
      player: { before: pBefore, after: pBefore.map((r) => ({ ...r })), totalBefore: pTotal, totalAfter: pTotal },
      enemy: { before: eBefore, after: eBefore.map((r) => ({ ...r })), totalBefore: eTotal, totalAfter: eTotal },
    };
  }

  const enemyShare = eTotal / denom;
  const playerLossFrac = enemyShare * LOSS_SCALE;
  const enemyLossFrac = (1 - enemyShare) * LOSS_SCALE;
  const pAfter = applyLoss(pBefore, playerLossFrac);
  const eAfter = applyLoss(eBefore, enemyLossFrac);
  return {
    player: { before: pBefore, after: pAfter, totalBefore: pTotal, totalAfter: totalCount(pAfter) },
    enemy: { before: eBefore, after: eAfter, totalBefore: eTotal, totalAfter: totalCount(eAfter) },
  };
}
