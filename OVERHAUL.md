# Trade Empire Overhaul — design doc

The game today is a fast-paced expansion race: tap a region, it fills, repeat. Late game is dominated by raw tile count + military spam. We're pivoting to a **slow strategic empire** where wealth comes from **connections** between vassals, not just tile area.

> Status: **planning**. Nothing in here is implemented yet. This doc is the contract for the next 4-5 commits.

---

## Vision

Three principles drive every change:

1. **Owning land is hard. Holding land is harder.** Expansion slows substantially. Maintenance costs grow. Snowballing is punished by the math, not just by AI opponents.
2. **Wealth is a network effect.** Two vassals connected by trade are worth more than the sum of two isolated vassals. Big empires that stay connected dominate; big empires that fragment collapse.
3. **The map matters.** Continents are real. Sea trade between continents is a strategic decision, not a free side-effect. Cutting an enemy's trade routes is as decisive as taking their tiles.

---

## Phase 1 — Pacing slowdown

The whole game runs ~50% slower so trade routes have time to matter.

| Constant | Today | Target | Effect |
|---|---|---|---|
| `EXPANSION_CHANCE_PER_FRONTIER_TILE` | 0.05 | **0.025** | Half the tiles flip per second |
| `ATTACK_RATE_MULT` | 0.18 | **0.10** | Combats resolve slower |
| `VASSAL_EXPANSION_BOOST` | 1.4 | **1.2** | Vassals less twitchy |
| `TROOP_GROWTH_PER_TILE_PER_TICK` | 0.38 | **0.25** | Slower army recovery |
| `GOLD_PER_TILE_PER_TICK` | 0.018 | **0.010** | Land yields less; trade fills the gap |

New mechanics in Phase 1:

- **Empire upkeep** — every owned tile beyond `400` costs `0.005 g/tick` (negative income on bloated empires). Forces consolidation over endless growth.
- **Frontier-only expansion** — your own non-vassal frontier no longer auto-pushes when you set a manual target. Manual attacks now require *active* tap-and-hold. This is the biggest pacing knob — removes the "tap once, walk away" drift.
- **Region capture cooldown** — a region you just lost cannot be re-attacked by you for `15s`. Stops yo-yo border thrashing.

---

## Phase 2 — Internal trade routes (vassal ↔ vassal)

**Auto-established** between any two vassals you dominate, as long as a path of your own land connects them.

### Detection

Each tick (throttled to every 30 ticks = 3s), recompute connected components of your dominant regions. For each pair `(A, B)` in the same component:

- Path length = Manhattan distance between region centroids
- Route exists if path length < `120 tiles` (half the map width)
- All-pairs in same component → up to `O(n²)` routes per empire

Stored as `_tradeRoutes: Array<{ a: number; b: number; ownerId: PlayerId; flow: number }>`.

### Income

Each route generates per tick:

```
base_flow = sqrt(tilesA × tilesB) × 0.002
distance_bonus = sqrt(distance) × 0.05      // longer routes = more
flow = (base_flow + distance_bonus) × resource_multiplier
```

Routes feed into the leader's **treasury** (commander pool), not gold. So trade replaces the tribute system somewhat — vassal-direct gold still flows to vassal pools, but the *connection* between vassals generates extra income to the commander.

### Cut routes

If the path between A and B is broken (enemy tile cuts the connected component), the route disappears next think tick. Visible immediately in the HUD.

### Visualization

A new `TradeLayer` (Pixi container, screen-space, sits between the OverlayLayer and the ShipsLayer) draws:
- A faint gold line from centroid A to centroid B
- An animated dot that travels along the line in the direction of flow (purely visual — actual flow is per-tick)
- Hover/tap on a route: tooltip shows `Bhutan ↔ Yunnan · 4.2 g/sec`

Throttled to repaint only when route set changes (signature gate, like the diplomacy panel).

---

## Phase 3 — External trade routes (cross-continent)

The structural unlock that makes naval mastery genuinely strategic.

### Establishment

In the **Diplomacy panel**, a new row per enemy: `[Trade Route]` button. Either side proposes; the other accepts or rejects.

- Both sides gain treasury income from the route (mutual benefit — incentive to make peace)
- A route between two players requires a **sea path** between their territories
- Default duration: 60s, auto-renews if both sides remain undestroyed

### Income

Higher than internal routes per tick:

```
flow = base × 0.005 × min(tilesA, tilesB)   // smaller side caps the flow
```

A route between you (200 tiles) and an AI (150 tiles) yields `~0.75 g/sec` to **both sides**. Comparable to 3-4 internal routes.

### Naval interception

This is what makes warships actually decisive:

- Each external trade route is "carried" by an invisible cargo vessel that moves between coastal anchors
- An enemy `destroyer` or `warship` within `5 tiles` of the cargo path **interrupts the route this tick** — no income for either side
- Sustained interruption (say 10 ticks) **breaks the route entirely** — both sides lose it

Naval mastery becomes the trade-disruption / trade-protection axis. Air mastery levels coastal AAs; ground mastery walls off territory; **naval mastery controls the wealth network**.

### Visualization

External routes drawn as **dashed lines across the water** between coastal anchor tiles. Same color-coding (gold). When interrupted, the dash flickers red.

---

## Phase 4 — Resource system (placeholder for now)

For Phase 2-3 ship `gold` only as the carried good. Resource system slots in when designed:

- Each region has a primary resource based on terrain (forest → wood, mountain → iron, coastal → fish, lush → grain, etc.)
- Trade routes carry resources, not gold — the leader's "treasury" becomes a multi-resource bag
- Different resources buff different things:
  - **Wood** → faster building construction
  - **Iron** → cheaper turrets + AA
  - **Oil** → faster ships + bombers
  - **Grain** → faster troop growth
  - **Spice** → straight gold conversion
- Resources bottlenecked → strategic raids on specific regions

This phase has its own design doc when we get there. Don't build it speculatively now.

---

## Phase 5 — UI / HUD touchpoints

- **Topbar:** new `routes: N` stat showing how many active trade routes you have
- **Treasury:** display **net trade flow** alongside the static balance: `1234 (+12.4/s)`
- **Diplomacy:** new `Trade Route` action per enemy; show active external routes with their flow
- **Region label:** when zoomed in on a vassal, show its **connected count** (e.g. `Bhutan · 31kg · 4 routes`)
- **Toast:** when a route is cut, fire a notification: *"Trade route Bhutan ↔ Yunnan severed by Korea"*

---

## Migration plan (per-commit checkpoints)

Each step is shippable on its own; we don't touch the next one until the previous is verified in playtest.

1. **Pacing pass** — config tweaks + manual-only frontier + capture cooldown. ~150 LOC. Risk: low. Existing balance breaks slightly.
2. **Internal trade routes** — connected-component scan + per-route income + TradeLayer visualization. ~400 LOC. Risk: medium. New per-tick work, must be cheap (connected-component algorithm needs to be O(regions), not O(tiles)).
3. **External trade routes** — diplomacy proposal flow + naval interception + dashed-line render. ~300 LOC. Risk: medium. Requires `_tradeRoutes` to support cross-player entries.
4. **Empire upkeep + tile cap** — config tweak + per-tick deduction. ~50 LOC. Risk: low.
5. **Resource system** — separate design doc when ready. Skip until requested.

---

## Open questions

These need a call before phase 2 starts:

- **Path detection cost.** Connected components over ~50 regions per player every 3s = cheap. But if we want path *length* (not just "are they connected"), a BFS per pair is O(n²) BFS = O(n² × tiles). At 50 regions × 50 = 2500 BFS × maybe 200 tiles each = 500k ops every 3s. Probably fine on phones. Confirm before writing.
- **Route limit per player.** Unlimited = late-game spaghetti map. Cap at, say, 20 routes per player? Or render-cull at low zoom (already a pattern).
- **Cargo vessel interception.** Implementing as an invisible "ghost ship" that moves tile-by-tile is heavy. Cheaper alternative: just check whether *any enemy ship* is within N tiles of the *line segment* between the two anchors. Pick this unless you want the visible cargo ship.
- **External routes and alliances.** Should two allied players auto-have a trade route? Or always opt-in?
- **Backwards compat.** Old saves don't have `_tradeRoutes`. They'll just initialise empty — no migration needed since this is single-player. Confirm.

---

## What this doc replaces

Today's economy: gold per tile + settlement multipliers + 10% vassal tribute. That math stays — trade routes add **on top of it**, not replace. The dynamic shifts because trade scales with empire connectivity, not raw tile count, so a tightly-knit medium empire eventually out-earns a fragmented giant.

Today's diplomacy: alliance + trade (one-shot exchange) + embargo. Trade routes augment this with **persistent** trade flows. The one-shot trade stays for emergency liquidity moves.

Today's naval role: bombard coast + AA + landfall. Adds: trade route protection / interception. Naval becomes the **economic warfare** mastery in addition to the coastal-pressure mastery.
