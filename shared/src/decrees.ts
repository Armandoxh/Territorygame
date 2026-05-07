// Commander upgrade tree — five branches, three tiers each. The leader
// spends their treasury (mostly fed by 10% vassal tribute) to buy nodes.
// Stackable nodes can be bought repeatedly with cumulative effect; one-shot
// nodes apply once per purchase but don't store state in addition to a stack
// counter. Locked nodes light up once their prereq has at least one stack.
//
// Effects are read from player.decreeStacks at the relevant points in
// Game logic (income, troops, defense, expansion, bombs, etc.).

export type DecreeBranch = 'economy' | 'defense' | 'military' | 'offense' | 'espionage' | 'naval' | 'diplomacy';

export interface Decree {
  id: string;
  branch: DecreeBranch;
  tier: 1 | 2 | 3;
  name: string;
  desc: string;
  cost: number;
  prereq?: string;
  /** Buyable repeatedly — each stack adds one unit of effect. */
  stackable?: boolean;
  /** Effect fires once per purchase (e.g. instant troops); stack counter
   *  still increments so the player sees how many they've issued. */
  oneShot?: boolean;
  /** Visible in UI but cannot be bought yet (deferred implementation). */
  comingSoon?: boolean;
  /** Optional branching: when set, buying a stack >= forkAt forks
   *  the decree into two specializations (a / b). Player picks
   *  one; subsequent stacks compound the chosen branch's effect.
   *  Earlier stacks (< forkAt) apply both branches' "base" effect
   *  (whatever the multiplier helper does at L1-L2). */
  branches?: {
    forkAt: number;
    a: { name: string; desc: string };
    b: { name: string; desc: string };
  };
}

/** Branch ID. 'none' = no fork choice made yet (decree at < forkAt). */
export type BranchChoice = 'a' | 'b' | 'none';

export const DECREES: readonly Decree[] = [
  // ECONOMY
  { id: 'production',   branch: 'economy', tier: 1, name: 'Production Decree',
    desc: 'Every owned tile generates more gold per second.', cost: 500, stackable: true },
  { id: 'master-builder', branch: 'economy', tier: 1, name: 'Master Builder',
    desc: 'Buildings cost less gold + resources to construct.', cost: 700, stackable: true },
  { id: 'free-market',  branch: 'economy', tier: 2, name: 'Free Market',
    desc: 'Vassal tribute drops 10% → 5%. Your vassals keep more, build faster.', cost: 1500, prereq: 'production' },
  { id: 'industrial',   branch: 'economy', tier: 3, name: 'Industrial Revolution',
    desc: 'Settlements gradually self-upgrade over time.', cost: 3000, prereq: 'free-market', comingSoon: true },

  // DEFENSE
  { id: 'border-patrol', branch: 'defense', tier: 1, name: 'Border Patrol',
    desc: 'Turrets gain +1 frontier coverage and +50% retaliation damage.', cost: 800 },
  { id: 'iron-doctrine', branch: 'defense', tier: 1, name: 'Iron Doctrine',
    desc: 'All your defended tiles gain +20% effective defense (stacks with turrets).', cost: 800 },
  { id: 'reinforced-bunkers', branch: 'defense', tier: 2, name: 'Reinforced Bunkers',
    desc: 'Turrets defend much harder per stack. Picks WALLS or GARRISON at L3.', cost: 1500, prereq: 'iron-doctrine', stackable: true,
    branches: {
      forkAt: 3,
      a: { name: 'Walls',
        desc: 'Pure defense — turret defense bonus scales harder per stack.' },
      b: { name: 'Garrison',
        desc: 'Counterattack focus — turret retaliation damage scales harder per stack.' },
    },
  },
  { id: 'watchtowers',   branch: 'defense', tier: 2, name: 'Watchtowers',
    desc: 'Free L1 turrets auto-build on fully-owned region frontiers.', cost: 2000, prereq: 'border-patrol', comingSoon: true },

  // MILITARY
  { id: 'conscription',  branch: 'military', tier: 1, name: 'Conscription',
    desc: '+1000 troops to your pool, instantly. Repeatable.', cost: 300, oneShot: true, stackable: true },
  { id: 'veterans',      branch: 'military', tier: 1, name: 'Veterans',
    desc: 'Your troops fight harder (more damage on attack AND defense). Picks STORM TROOPERS or IRON GUARD at L3.', cost: 900, stackable: true,
    branches: {
      forkAt: 3,
      a: { name: 'Storm Troopers',
        desc: 'Pure offense — branch stacks scale ATTACKING power only, +10%/stack.' },
      b: { name: 'Iron Guard',
        desc: 'Pure defense — branch stacks scale DEFENDING power only, +10%/stack.' },
    },
  },
  { id: 'standing-army', branch: 'military', tier: 2, name: 'Standing Army',
    desc: 'Your maximum troop cap (per owned tile) goes way up.', cost: 1200, prereq: 'conscription', stackable: true },
  { id: 'war-bonds',     branch: 'military', tier: 3, name: 'War Bonds',
    desc: 'Spend 30% of your gold treasury to instantly conscript 5000 troops.', cost: 0, prereq: 'standing-army', oneShot: true, stackable: true },

  // OFFENSE
  { id: 'forced-march',   branch: 'offense', tier: 1, name: 'Forced March',
    desc: 'Your tiles claim faster (manual taps + vassal autopilot). Picks VASSAL INITIATIVE or DIRECT COMMAND at L3.', cost: 600, stackable: true,
    branches: {
      forkAt: 3,
      a: { name: 'Vassal Initiative',
        desc: 'Branch stacks scale VASSAL expansion only, +30%/stack. Manual pushes freeze at L2 baseline.' },
      b: { name: 'Direct Command',
        desc: 'Branch stacks scale MANUAL (player-driven) expansion only, +30%/stack. Vassals freeze at L2.' },
    },
  },
  { id: 'air-supremacy',  branch: 'offense', tier: 2, name: 'Air Supremacy',
    desc: 'Empire-wide bomb cooldowns are halved. AC-130 / stealth ready twice as often.', cost: 1800, prereq: 'forced-march' },
  { id: 'nuclear-program', branch: 'offense', tier: 3, name: 'Nuclear Program',
    desc: 'Unlocks Nuke — 2000g per drop, massive radius, nothing survives.', cost: 5000, prereq: 'air-supremacy', comingSoon: true },

  // ESPIONAGE
  { id: 'spy-network', branch: 'espionage', tier: 1, name: 'Spy Network',
    desc: 'Reveal enemy troop counts and target regions in the leader board.', cost: 700 },
  { id: 'sabotage',    branch: 'espionage', tier: 2, name: 'Sabotage',
    desc: 'Per stack, you skim 5% of every enemy\'s gold income into your treasury.', cost: 1500, prereq: 'spy-network', stackable: true },
  { id: 'forced-labor', branch: 'espionage', tier: 2, name: 'Forced Labor',
    desc: 'Tiles you capture pay 2× gold for 30s after capture.', cost: 1800, prereq: 'sabotage', comingSoon: true },
  { id: 'coup-detat',  branch: 'espionage', tier: 3, name: "Coup d'État",
    desc: 'One-time: flip a chosen enemy region to neutral instantly.', cost: 3000, prereq: 'sabotage', comingSoon: true },

  // NAVAL
  { id: 'admiralty',   branch: 'naval', tier: 1, name: 'Admiralty',
    desc: 'Ships move faster and cost less to build per stack.', cost: 800, stackable: true },
  { id: 'privateer',   branch: 'naval', tier: 2, name: 'Privateer',
    desc: 'Warships near enemy trade routes siphon the route\'s gold into your treasury.', cost: 2500, prereq: 'admiralty', comingSoon: true },

  // DIPLOMACY
  { id: 'embassy',     branch: 'diplomacy', tier: 1, name: 'Embassy',
    desc: 'AI players are 25% more likely to accept your alliance / trade proposals per stack.', cost: 800, stackable: true },
  { id: 'cartel',      branch: 'diplomacy', tier: 2, name: 'Cartel',
    desc: 'Your trade-route income (gold/sec from allies) is boosted per stack.', cost: 1500, prereq: 'embassy', stackable: true },
  { id: 'cold-war',    branch: 'diplomacy', tier: 3, name: 'Cold War',
    desc: 'One-time: shatter any active alliance between two of your enemies.', cost: 3000, prereq: 'cartel', comingSoon: true },
];

export function decreeById(id: string): Decree | undefined {
  return DECREES.find(d => d.id === id);
}

/** Plain-English "Currently / Next" readout for a decree at a given
 *  stack count + branch choice. Returns undefined for non-numeric
 *  decrees (one-shots, flat toggles) since "current vs next" doesn't
 *  apply. Two-line output: ["Currently: ...", "Next stack: ..."]. */
export function decreeEffectFor(
  d: Decree, stacks: number, branch?: 'a' | 'b',
): { current: string; next?: string } | undefined {
  const fmtPct = (mul: number, signed = true): string => {
    const pct = (mul - 1) * 100;
    const sign = pct >= 0 && signed ? '+' : '';
    return `${sign}${pct.toFixed(pct >= 100 ? 0 : 1)}%`;
  };
  const compound = (s: number, pct: number): number => Math.pow(1 + pct, s);
  switch (d.id) {
    case 'production': {
      const cur = compound(stacks, 0.10);
      const nxt = compound(stacks + 1, 0.10);
      return { current: `Empire-wide gold income ${fmtPct(cur)}.`, next: `Next stack: ${fmtPct(nxt)}.` };
    }
    case 'master-builder': {
      const cur = Math.max(0.5, Math.pow(0.90, stacks));
      const nxt = Math.max(0.5, Math.pow(0.90, stacks + 1));
      return { current: `Build cost ${fmtPct(cur)} (${(cur * 100).toFixed(0)}% of base).`,
               next: `Next stack: ${fmtPct(nxt)} (${(nxt * 100).toFixed(0)}% of base).` };
    }
    case 'forced-march': {
      // Pre-fork (L1, L2): both vassal + manual compound 1.20.
      // Post-fork: chosen branch compounds 1.30, other freezes at L2.
      const baseStacks = Math.min(2, stacks);
      const branchStacks = Math.max(0, stacks - 2);
      const baseMul = compound(baseStacks, 0.20);
      const vassalMul = (branch === 'a') ? baseMul * compound(branchStacks, 0.30) : baseMul;
      const manualMul = (branch === 'b') ? baseMul * compound(branchStacks, 0.30) : baseMul;
      // For pre-fork ranges, both sides identical.
      const both = (vassalMul === manualMul);
      const cur = both
        ? `Expansion ${fmtPct(vassalMul)} (manual + vassal).`
        : `Vassal expansion ${fmtPct(vassalMul)}; manual ${fmtPct(manualMul)}.`;
      const nextStacks = stacks + 1;
      const nextBase = Math.min(2, nextStacks);
      const nextBranch = Math.max(0, nextStacks - 2);
      const nextBaseMul = compound(nextBase, 0.20);
      const nextVassal = (branch === 'a') ? nextBaseMul * compound(nextBranch, 0.30) : nextBaseMul;
      const nextManual = (branch === 'b') ? nextBaseMul * compound(nextBranch, 0.30) : nextBaseMul;
      const nextDesc = (nextVassal === nextManual)
        ? `Next: ${fmtPct(nextVassal)}.`
        : `Next: vassal ${fmtPct(nextVassal)}, manual ${fmtPct(nextManual)}.`;
      return { current: cur, next: nextDesc };
    }
    case 'veterans': {
      const baseStacks = Math.min(2, stacks);
      const branchStacks = Math.max(0, stacks - 2);
      const baseMul = compound(baseStacks, 0.05);
      const atk = Math.min(2.0, (branch === 'a') ? baseMul * compound(branchStacks, 0.10) : baseMul);
      const def = Math.min(2.0, (branch === 'b') ? baseMul * compound(branchStacks, 0.10) : baseMul);
      const cur = (atk === def)
        ? `Combat power ${fmtPct(atk)} (attacker + defender).`
        : `Attack ${fmtPct(atk)}; defense ${fmtPct(def)}.`;
      const ns = stacks + 1, nb = Math.min(2, ns), nbr = Math.max(0, ns - 2);
      const nm = compound(nb, 0.05);
      const na = Math.min(2.0, (branch === 'a') ? nm * compound(nbr, 0.10) : nm);
      const nd = Math.min(2.0, (branch === 'b') ? nm * compound(nbr, 0.10) : nm);
      const nx = (na === nd) ? `Next: ${fmtPct(na)}.` : `Next: atk ${fmtPct(na)}, def ${fmtPct(nd)}.`;
      return { current: cur, next: nx };
    }
    case 'reinforced-bunkers': {
      const baseStacks = Math.min(2, stacks);
      const branchStacks = Math.max(0, stacks - 2);
      const baseMul = compound(baseStacks, 0.50);
      const dfn = Math.min(3.0, (branch === 'a') ? baseMul * compound(branchStacks, 0.75) : baseMul);
      const ret = Math.min(3.0, (branch === 'b') ? baseMul * compound(branchStacks, 1.00) : baseMul);
      const cur = (dfn === ret)
        ? `Turret defense + retaliation each ×${dfn.toFixed(2)}.`
        : `Turret defense ×${dfn.toFixed(2)}; retaliation ×${ret.toFixed(2)}.`;
      const ns = stacks + 1, nb = Math.min(2, ns), nbr = Math.max(0, ns - 2);
      const nbm = compound(nb, 0.50);
      const nd = Math.min(3.0, (branch === 'a') ? nbm * compound(nbr, 0.75) : nbm);
      const nr = Math.min(3.0, (branch === 'b') ? nbm * compound(nbr, 1.00) : nbm);
      const nx = (nd === nr) ? `Next: ×${nd.toFixed(2)}.` : `Next: def ×${nd.toFixed(2)}, retal ×${nr.toFixed(2)}.`;
      return { current: cur, next: nx };
    }
    case 'standing-army': {
      const cur = compound(stacks, 0.50);
      const nxt = compound(stacks + 1, 0.50);
      return { current: `Troop cap ×${cur.toFixed(2)} per owned tile.`, next: `Next stack: ×${nxt.toFixed(2)}.` };
    }
    case 'admiralty': {
      const speed = compound(stacks, 0.20);
      const cost  = Math.max(0.4, Math.pow(0.80, stacks));
      const ns = compound(stacks + 1, 0.20);
      const nc = Math.max(0.4, Math.pow(0.80, stacks + 1));
      return { current: `Ship speed ×${speed.toFixed(2)}, ship cost ×${cost.toFixed(2)}.`,
               next: `Next: speed ×${ns.toFixed(2)}, cost ×${nc.toFixed(2)}.` };
    }
    case 'sabotage': {
      const drain = Math.min(50, stacks * 5);
      const next = Math.min(50, (stacks + 1) * 5);
      return { current: `Skimming ${drain}% of every enemy's gold income into your treasury.`,
               next: `Next stack: ${next}%.` };
    }
    case 'embassy': {
      const lift = stacks * 25;
      const next = (stacks + 1) * 25;
      return { current: `AI accepts your proposals +${lift}% more often.`,
               next: `Next stack: +${next}%.` };
    }
    case 'cartel': {
      const cur = compound(stacks, 0.20);
      const nxt = compound(stacks + 1, 0.20);
      return { current: `Trade-route income ${fmtPct(cur)}.`, next: `Next stack: ${fmtPct(nxt)}.` };
    }
    case 'conscription': {
      return { current: stacks > 0 ? `Issued ${stacks}× — total +${stacks * 1000} troops gained.` : '+1000 troops on each issue.',
               next: 'Next: +1000 troops, instant.' };
    }
    case 'war-bonds': {
      return { current: stacks > 0 ? `Issued ${stacks}× so far.` : 'Spend 30% gold treasury for 5000 troops.',
               next: 'Next: 30% of treasury → 5000 troops.' };
    }
    // Flat one-shots have no per-stack scaling.
    case 'border-patrol':
    case 'iron-doctrine':
    case 'free-market':
    case 'air-supremacy':
    case 'spy-network':
      return undefined;
    default:
      return undefined;
  }
}
