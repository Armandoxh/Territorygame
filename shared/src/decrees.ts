// Commander upgrade tree — five branches, three tiers each. The leader
// spends their treasury (mostly fed by 10% vassal tribute) to buy nodes.
// Stackable nodes can be bought repeatedly with cumulative effect; one-shot
// nodes apply once per purchase but don't store state in addition to a stack
// counter. Locked nodes light up once their prereq has at least one stack.
//
// Effects are read from player.decreeStacks at the relevant points in
// Game logic (income, troops, defense, expansion, bombs, etc.).

export type DecreeBranch = 'economy' | 'defense' | 'military' | 'offense' | 'espionage';

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
}

export const DECREES: readonly Decree[] = [
  // ECONOMY
  { id: 'production',   branch: 'economy', tier: 1, name: 'Production Decree',
    desc: '+10% gold income empire-wide per stack.', cost: 500, stackable: true },
  { id: 'free-market',  branch: 'economy', tier: 2, name: 'Free Market',
    desc: 'Vassal tribute drops 10% → 5% — they keep more, build faster.', cost: 1500, prereq: 'production' },
  { id: 'industrial',   branch: 'economy', tier: 3, name: 'Industrial Revolution',
    desc: 'Settlements gradually self-upgrade over time. (Coming soon)', cost: 3000, prereq: 'free-market', comingSoon: true },

  // DEFENSE
  { id: 'border-patrol', branch: 'defense', tier: 1, name: 'Border Patrol',
    desc: 'Turrets gain +1 radius and +50% retaliation damage.', cost: 800 },
  { id: 'iron-doctrine', branch: 'defense', tier: 1, name: 'Iron Doctrine',
    desc: 'Tiles you defend gain +20% effective defense (stacks with turrets).', cost: 800 },
  { id: 'watchtowers',   branch: 'defense', tier: 2, name: 'Watchtowers',
    desc: 'Free L1 turrets auto-build on fully-owned region frontiers. (Coming soon)', cost: 2000, prereq: 'border-patrol', comingSoon: true },

  // MILITARY
  { id: 'conscription',  branch: 'military', tier: 1, name: 'Conscription',
    desc: '+1000 troops to your pool, instant. Repeatable.', cost: 300, oneShot: true, stackable: true },
  { id: 'standing-army', branch: 'military', tier: 2, name: 'Standing Army',
    desc: '+50% troop cap empire-wide per stack.', cost: 1200, prereq: 'conscription', stackable: true },
  { id: 'war-bonds',     branch: 'military', tier: 3, name: 'War Bonds',
    desc: 'Spend 30% of your gold for 5000 troops, instant.', cost: 0, prereq: 'standing-army', oneShot: true, stackable: true },

  // OFFENSE
  { id: 'forced-march',   branch: 'offense', tier: 1, name: 'Forced March',
    desc: '+20% vassal expansion rate per stack.', cost: 600, stackable: true },
  { id: 'air-supremacy',  branch: 'offense', tier: 2, name: 'Air Supremacy',
    desc: 'Empire-wide bomb cooldowns ×0.5.', cost: 1800, prereq: 'forced-march' },
  { id: 'nuclear-program', branch: 'offense', tier: 3, name: 'Nuclear Program',
    desc: 'Unlocks Nuke decree — 2000g per nuke, massive blast. (Coming soon)', cost: 5000, prereq: 'air-supremacy', comingSoon: true },

  // ESPIONAGE
  { id: 'spy-network', branch: 'espionage', tier: 1, name: 'Spy Network',
    desc: 'Reveal enemy troop counts and target regions in the leader board.', cost: 700 },
  { id: 'sabotage',    branch: 'espionage', tier: 2, name: 'Sabotage',
    desc: '5% of every enemy\'s gold income drains to your treasury per stack.', cost: 1500, prereq: 'spy-network', stackable: true },
  { id: 'coup-detat',  branch: 'espionage', tier: 3, name: "Coup d'État",
    desc: 'One-time: flip a chosen enemy region. (Coming soon)', cost: 3000, prereq: 'sabotage', comingSoon: true },
];

export function decreeById(id: string): Decree | undefined {
  return DECREES.find(d => d.id === id);
}
