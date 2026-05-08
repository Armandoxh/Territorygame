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
    desc: 'Every owned tile generates more gold per second. Slow start, ramps sharply with stacks.', cost: 500, stackable: true },
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

/** Two-word power label for a decree node — what the buff IS,
 *  not what it currently does. Shown as the second line of every
 *  node in the tree. Designed to read like a tag/category. */
export function decreePowerLabel(d: Decree): string {
  switch (d.id) {
    case 'production': return 'Gold income';
    case 'master-builder': return 'Build cost';
    case 'free-market': return 'Vassal income';
    case 'industrial': return 'Auto-upgrade';
    case 'border-patrol': return 'Turret reach';
    case 'iron-doctrine': return 'Defense bonus';
    case 'reinforced-bunkers': return 'Wall hardening';
    case 'watchtowers': return 'Auto-turrets';
    case 'conscription': return 'Instant troops';
    case 'veterans': return 'Combat power';
    case 'standing-army': return 'Troop cap';
    case 'war-bonds': return 'Gold→troops';
    case 'forced-march': return 'Expansion rate';
    case 'air-supremacy': return 'Bomb cooldown';
    case 'nuclear-program': return 'Nukes';
    case 'spy-network': return 'Enemy intel';
    case 'sabotage': return 'Skim income';
    case 'forced-labor': return 'Capture bonus';
    case 'coup-detat': return 'Region flip';
    case 'admiralty': return 'Ship perks';
    case 'privateer': return 'Trade raiding';
    case 'embassy': return 'Diplomacy';
    case 'cartel': return 'Trade income';
    case 'cold-war': return 'Break alliance';
    default: return '';
  }
}

/** Compact one-line "current value" for a node — designed for
 *  the tree node where space is limited. Returns just the number/
 *  multiplier without prose. e.g. "+33% income" or "×2.49". */
export function decreeCompactCurrent(d: Decree, stacks: number, branch?: 'a' | 'b'): string {
  if (stacks <= 0) return '—';
  // Progressive: each stack k contributes (rate × k)%, then multiplies.
  // Slow start, sharp ramp. Mirrors Game._progressiveStack.
  const progressive = (s: number, rate: number): number => {
    if (s <= 0) return 1;
    let m = 1; for (let k = 1; k <= s; k++) m *= 1 + rate * k;
    return m;
  };
  const fmt = (mul: number): string => {
    const pct = (mul - 1) * 100;
    if (pct >= 100) return `+${pct.toFixed(0)}%`;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };
  switch (d.id) {
    case 'production': return fmt(progressive(stacks, 0.015));
    case 'master-builder': return fmt(Math.max(0.5, Math.pow(0.90, stacks)));
    case 'forced-march': {
      const baseStacks = Math.min(2, stacks);
      const branchStacks = Math.max(0, stacks - 2);
      const baseMul = progressive(baseStacks, 0.025);
      const v = (branch === 'a') ? baseMul * progressive(branchStacks, 0.05) : baseMul;
      const m = (branch === 'b') ? baseMul * progressive(branchStacks, 0.05) : baseMul;
      if (v === m) return fmt(v);
      return `V${fmt(v)} M${fmt(m)}`;
    }
    case 'veterans': {
      const bs = Math.min(2, stacks), brs = Math.max(0, stacks - 2);
      const bm = progressive(bs, 0.012);
      const a = Math.min(2.0, (branch === 'a') ? bm * progressive(brs, 0.025) : bm);
      const dd = Math.min(2.0, (branch === 'b') ? bm * progressive(brs, 0.025) : bm);
      if (a === dd) return fmt(a);
      return `A${fmt(a)} D${fmt(dd)}`;
    }
    case 'reinforced-bunkers': {
      const bs = Math.min(2, stacks), brs = Math.max(0, stacks - 2);
      const bm = progressive(bs, 0.04);
      const v = Math.min(3.0, (branch === 'a') ? bm * progressive(brs, 0.06) : bm);
      const r = Math.min(3.0, (branch === 'b') ? bm * progressive(brs, 0.08) : bm);
      if (v === r) return `×${v.toFixed(2)}`;
      return `D×${v.toFixed(1)} R×${r.toFixed(1)}`;
    }
    case 'standing-army': return `×${progressive(stacks, 0.04).toFixed(2)}`;
    case 'admiralty': return `×${progressive(stacks, 0.03).toFixed(2)}`;
    case 'sabotage': return `${Math.min(50, stacks * 5)}%`;
    case 'embassy': return `+${stacks * 25}%`;
    case 'cartel': return fmt(progressive(stacks, 0.03));
    case 'conscription': return `×${stacks}`;
    case 'war-bonds': return `×${stacks}`;
    default: return stacks > 0 ? '✓' : '';
  }
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
  const progressive = (s: number, rate: number): number => {
    if (s <= 0) return 1;
    let m = 1; for (let k = 1; k <= s; k++) m *= 1 + rate * k;
    return m;
  };
  switch (d.id) {
    case 'production': {
      const cur = progressive(stacks, 0.015);
      const nxt = progressive(stacks + 1, 0.015);
      return { current: `Empire-wide gold income ${fmtPct(cur)}.`, next: `Next stack: ${fmtPct(nxt)}.` };
    }
    case 'master-builder': {
      const cur = Math.max(0.5, Math.pow(0.90, stacks));
      const nxt = Math.max(0.5, Math.pow(0.90, stacks + 1));
      return { current: `Build cost ${fmtPct(cur)} (${(cur * 100).toFixed(0)}% of base).`,
               next: `Next stack: ${fmtPct(nxt)} (${(nxt * 100).toFixed(0)}% of base).` };
    }
    case 'forced-march': {
      const baseStacks = Math.min(2, stacks);
      const branchStacks = Math.max(0, stacks - 2);
      const baseMul = progressive(baseStacks, 0.025);
      const vassalMul = (branch === 'a') ? baseMul * progressive(branchStacks, 0.05) : baseMul;
      const manualMul = (branch === 'b') ? baseMul * progressive(branchStacks, 0.05) : baseMul;
      const both = (vassalMul === manualMul);
      const cur = both
        ? `Expansion ${fmtPct(vassalMul)} (manual + vassal).`
        : `Vassal expansion ${fmtPct(vassalMul)}; manual ${fmtPct(manualMul)}.`;
      const ns = stacks + 1, nb = Math.min(2, ns), nbr = Math.max(0, ns - 2);
      const nbm = progressive(nb, 0.025);
      const nv = (branch === 'a') ? nbm * progressive(nbr, 0.05) : nbm;
      const nmn = (branch === 'b') ? nbm * progressive(nbr, 0.05) : nbm;
      const nx = (nv === nmn) ? `Next: ${fmtPct(nv)}.` : `Next: vassal ${fmtPct(nv)}, manual ${fmtPct(nmn)}.`;
      return { current: cur, next: nx };
    }
    case 'veterans': {
      const baseStacks = Math.min(2, stacks);
      const branchStacks = Math.max(0, stacks - 2);
      const baseMul = progressive(baseStacks, 0.012);
      const atk = Math.min(2.0, (branch === 'a') ? baseMul * progressive(branchStacks, 0.025) : baseMul);
      const def = Math.min(2.0, (branch === 'b') ? baseMul * progressive(branchStacks, 0.025) : baseMul);
      const cur = (atk === def)
        ? `Combat power ${fmtPct(atk)} (attacker + defender).`
        : `Attack ${fmtPct(atk)}; defense ${fmtPct(def)}.`;
      const ns = stacks + 1, nb = Math.min(2, ns), nbr = Math.max(0, ns - 2);
      const nm = progressive(nb, 0.012);
      const na = Math.min(2.0, (branch === 'a') ? nm * progressive(nbr, 0.025) : nm);
      const nd = Math.min(2.0, (branch === 'b') ? nm * progressive(nbr, 0.025) : nm);
      const nx = (na === nd) ? `Next: ${fmtPct(na)}.` : `Next: atk ${fmtPct(na)}, def ${fmtPct(nd)}.`;
      return { current: cur, next: nx };
    }
    case 'reinforced-bunkers': {
      const baseStacks = Math.min(2, stacks);
      const branchStacks = Math.max(0, stacks - 2);
      const baseMul = progressive(baseStacks, 0.04);
      const dfn = Math.min(3.0, (branch === 'a') ? baseMul * progressive(branchStacks, 0.06) : baseMul);
      const ret = Math.min(3.0, (branch === 'b') ? baseMul * progressive(branchStacks, 0.08) : baseMul);
      const cur = (dfn === ret)
        ? `Turret defense + retaliation each ×${dfn.toFixed(2)}.`
        : `Turret defense ×${dfn.toFixed(2)}; retaliation ×${ret.toFixed(2)}.`;
      const ns = stacks + 1, nb = Math.min(2, ns), nbr = Math.max(0, ns - 2);
      const nbm = progressive(nb, 0.04);
      const nd = Math.min(3.0, (branch === 'a') ? nbm * progressive(nbr, 0.06) : nbm);
      const nr = Math.min(3.0, (branch === 'b') ? nbm * progressive(nbr, 0.08) : nbm);
      const nx = (nd === nr) ? `Next: ×${nd.toFixed(2)}.` : `Next: def ×${nd.toFixed(2)}, retal ×${nr.toFixed(2)}.`;
      return { current: cur, next: nx };
    }
    case 'standing-army': {
      const cur = progressive(stacks, 0.04);
      const nxt = progressive(stacks + 1, 0.04);
      return { current: `Troop cap ×${cur.toFixed(2)} per owned tile.`, next: `Next stack: ×${nxt.toFixed(2)}.` };
    }
    case 'admiralty': {
      const speed = progressive(stacks, 0.03);
      const cost  = Math.max(0.4, Math.pow(0.80, stacks));
      const ns = progressive(stacks + 1, 0.03);
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
      const cur = progressive(stacks, 0.03);
      const nxt = progressive(stacks + 1, 0.03);
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
