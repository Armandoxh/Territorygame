# Port to v2 — plan of record

This file captures the decision and the plan to rebuild Territorygame
from scratch as a soldier-swarm RTS. Anything not in here is **not**
in scope for v2. If something needs to be added, it gets added here
first, with rationale, then implemented.

## Decision

Start over in a new repo. The current codebase has absorbed three
pivots (flood → army-stack → vassal-army hybrid) without finishing
any of them, and the ARMY_MODE flag gates half the engine. Patching
forward costs more than rebuilding. See `lessons.md` for what to
carry forward and what to leave behind.

## The new game in 6 bullets

- **Soldiers are visible, individual.** A "regiment" is N
  owner-colored sprites at sub-tile positions. Strength = body
  count, not an abstract number you read off a label.
- **Drag-select, group-march.** Rectangle-drag selects every
  regiment in the box. Tap destination → group walks there. Tap
  empty space → deselect.
- **Smooth-color map.** Owner-tinted regions on a green / sand /
  water base. Vector region borders. No pixel staircase.
- **Recruit at capitals.** Capital generates +1 soldier / sec up
  to a regiment cap. Captured regions add capacity.
- **Win = capture all enemy capitals OR control N% of the map.**
  Single clear win condition.
- **Three-tier view, one simulation.** Pinch / scroll zooms
  smoothly between two **manual** tiers, plus a third **battle**
  tier that's reachable only when fighting begins.

  1. **Strategic** (zoomed out) — whole map, regions as colored
     blobs, big picture. Decide where to push.
  2. **Operational** (zoomed in via pinch) — your nation's land
     in detail. Capital, settlements, armies as formation icons.
     Enemy territory still visible but less detailed. **Manual
     pinch caps here** — zooming further does not reveal
     individual soldiers.
  3. **Tactical** (battle only) — pixel-art individual soldiers
     in formation grids on pixel-textured ground (the screenshot
     reference, see "Tactical aesthetic reference" below).
     Camera locks to the engagement. Entered either by
     **(a)** issuing an attack order that starts a battle
     (auto-snap), or **(b)** tapping a "battle in progress"
     badge from strategic / operational view. Same simulation
     throughout — no mode switch, just camera + layer toggles.

  Battles resolve in tens of seconds, not Total War's 20 minutes.

## Hard cuts (forever — do NOT port from v1)

These belong to v1's failure mode and will not return.

- ❌ Decrees (all 24), commander tree, masteries, doctrine system
- ❌ Vassal-as-region with separate gold pools
- ❌ ARMY_MODE flag (there is only one mode in v2)
- ❌ Diplomacy as a menu system (relation panels, treaty UI,
  nation profile sheets, war/peace formal declarations)

## Deferred scope (in the long-term v2 vision, NOT being built now)

User confirmed (2026-05-09) that v2 is intended to grow toward a
full settlement / building system over time: **barracks,
airstrips, warship factories, energy factories, markets, houses,
mines**, etc. Air, naval, and multi-resource layers are part of
that long-term vision.

**Crucial guardrail (lesson #4):** none of this gets built until
the core loop — *move army → take territory → win* — is fun on
phone. If we add System B before System A is fun, we re-create v1.

What's deferred:

- 🕓 Buildings / settlements beyond the capital. The full list
  (barracks, airstrips, warship factory, energy factory,
  markets, houses, mines) lives here, **frozen**, until the core
  loop earns them.
- 🕓 Ships (warship / destroyer / sub) and naval combat.
- 🕓 Planes, airstrips, AA, air combat.
- 🕓 Resources beyond gold (food / wood / stone / oil / gems /
  energy).
- 🕓 Bombs, ground ops (artillery / blitz / tank / paratrooper),
  nukes.
- 🕓 Trade routes / markets as a mechanic.
- 🕓 **Capital art.** Capitals currently render as colored
  centroid dots (nail #5a). User will provide castle / capital
  sprites; swap the `capitalLayer` circle draws for sprite
  placement keyed off `region.centroidX/Y`. Deferred until the
  art is in hand — dot is functionally sufficient.

When any of these is un-deferred, it gets its own paragraph in
this file — what it is, why it earns its place, and what
existing system it composes with.

## Open questions

- **Sea travel.** Map gen produces small islands disconnected
  from the main continent. Decision to make: (a) tune gen to
  favor a single connected landmass (cleanest while ships are
  deferred); (b) keep islands as decorative unreachable scenery;
  (c) un-defer ships earlier than the rest of the building
  system to make islands meaningful. **Current default: (a)**
  — bias gen toward one continent in a follow-up tweak to
  nail #2 if it remains an issue.

## Tactical aesthetic reference

A screenshot shared 2026-05-09 of u/Fabian_Viking's Grand RTS
(r/RealTimeStrategy, "DSS 2: War Industry") is the visual anchor
for the tactical view. User re-shared a second tactical
screenshot 2026-05-09 confirming the reference. What we
**borrow**:

- **Soldiers as tiny pixel-art sprites** (~4-6 px tall) in tight
  rectangular formation grids.
- **A regiment is a homogeneous block** — every sprite inside
  one regiment is the same unit type. Rows and columns are
  visible; spacing is tight; orientation is consistent across
  the regiment.
- **An army contains multiple regiments of different unit
  types** placed side-by-side. In the reference image: small
  infantry blocks, mounted/cavalry blocks (larger sprite
  silhouettes), and heavy/distinct unit blocks all coexist
  within one team's army.
- **Pixel-textured ground** at tactical zoom — subtle dirt /
  sand tile texture, not smooth flat color. Regions of grass
  / forest at the edges are also pixel-textured.
- **Owner color = unit color** on every sprite (white team vs
  red team in the reference). Terrain stays ground-colored —
  no territory tint at full tactical zoom.
- **Minimal HUD** — only a small nation/unit badge area, an
  HP / morale strip near the top, and a minimap in a corner.
  No floating panels, no command grids on top of the field.
- **A bottom HUD strip of regiment portraits** (compact cards
  showing each regiment in the selected army; roster-style
  affordance). This is the only meaningful UI element on the
  field at tactical zoom.

This visually confirms the **army → regiments → individual
soldiers** three-tier hierarchy (see "Army composition model"
section).

What we explicitly **do not** borrow (re-affirming the hard cuts):

- Buildings / settlements / the entire DSS 2 "War Industry"
  city-building mechanic. We have only the capital (for now —
  see deferred scope).
- Diplomacy HUD (relation badges, profile sheets, war/peace UI).
- Multiple resource icons / inventories.
- Map-screen UI for trading, alliances, treaties.

The reference is for the **look at tactical zoom**, not for the
systems behind it.

## Army composition model

User confirmed 2026-05-09 (after seeing the tactical reference):
the on-map controllable thing is a **battalion** (one player
can have many) and a battalion is a **mixed force** internally
composed of multiple **regiments**, each regiment being a
homogeneous block of one unit type.

The hierarchy:

```
nation
  └─ N battalions   (each is one map glyph, drag-marched independently)
       └─ M regiments (each homogeneous, one unit type)
            └─ K individual soldier sprites (only rendered at tactical zoom)
```

What this means for data shape (when we get there):

- A battalion is `{ regiments: Regiment[] }`, NOT a flat
  `{ infantry: 100, cavalry: 20 }` map. Each regiment is its
  own object so it can have per-regiment state (HP, morale,
  facing) later.
- A nation owns an array of battalions, not a single army.
- Recruitment ultimately produces *regiments* (or fills them),
  not loose soldiers. Tactical view renders one formation
  block per regiment, drawn from per-type sprite atlases.

**This section describes the shape we are building toward.**
None of it gets implemented until the core loop earns it
(lesson #4). Combat lands first against the current
single-glyph army; recruitment / battalion composition arrive
in a later wave once combat is fun.

## First milestone (one playable build)

- Map gen: ~150×150 tile world, regions, water / land, capital
  placement.
- Render (dual-scale, one simulation): pinch / scroll zoom.
  Zoomed out → smooth-color territory + vector region borders +
  regiments as colored blobs. Zoomed in → individual soldier
  sprites (2-pixel dots, owner-colored, jittered) + terrain
  detail. Same sim driving both — view scale only changes what's
  drawn, never what's simulated.
- Three players (1 human, 2 AI). Each spawns with 1 capital + 50
  starting soldiers around it.
- Recruit tick: capital adds 1 soldier / sec to a max of 200.
- Movement: tap a soldier → drag-rectangle to select group → tap
  destination → group walks there.
- Combat: when two opposing soldier sprites are in the same tile,
  both have a per-tick die-roll. Loser despawns.
- Territory claim: when a tile has only one player's soldiers
  on / adjacent for ~30 ticks, it flips to that owner.
- Win: capture all enemy capitals.

That's it. No decrees, no resources beyond a single gold pool, no
buildings beyond the capital. Goal of milestone 1: prove the core
loop and the new visual style feel right on phone before adding
anything.

## Where v2 lives

Until a new GitHub repo is set up, v2 lives under
`/home/user/Territorygame/swarm/` on this branch. v1 (the current
pixel-territory game) stays on `claude/territorial-game-mobile-xXdYn`
as reference. When milestone 1 feels right, the user creates a
fresh GitHub repo and we move `swarm/` there with clean history.

## Stack & deployment (decided 2026-05-09, verified live)

- **Stack:** Vite + TypeScript + Pixi 8 + Zustand. No additional
  libraries unless a concrete need arises.
- **Project shape:** `swarm/` is fully standalone — its own
  `package.json`, its own `node_modules`. When v2 graduates to a
  new repo it's a clean `mv swarm /new-repo` with zero workspace
  untangling.
- **Build → deploy path:** `npm run build` (inside `swarm/`)
  writes to `../docs/swarm/`. GH Pages serves `/docs` from this
  branch, so v2 is live at
  **https://armandoxh.github.io/Territorygame/swarm/**.
  v1 stays untouched at **https://armandoxh.github.io/Territorygame/**.
  Both confirmed working as of commit `ef704bf`.
- **Mobile testing flow:** commit + push → Pages rebuild
  (~30-60 s) → load on phone. No tunnels, no LAN setup. Cost: a
  build artifact in `/docs/swarm/` goes into git on every push
  that wants to be tested on phone.
- **Lean constraint:** no sourcemaps in prod, no lint/test/CI
  scaffolding in early nails. Add only when there's a concrete
  need, not preemptively. (Per the user note: "I don't want the
  code base to get inflated so hard.")

## Nail-1 spec (dual-scale zoom on a placeholder map)

Decisions locked 2026-05-09:

- **Placeholder content:** 50×50 grid of colored cells in 2-3
  colors. Cheap, gives clear reference for zoom feel without
  committing to any final map look.
- **Zoom behavior:** smooth continuous (any zoom level via pinch /
  scroll). Strategic vs tactical visual styles **crossfade** as
  zoom crosses a threshold. Not discrete snap.
- **Zoom input:** pinch (mobile) + mouse wheel (desktop) + keyboard
  `+` / `-`. No on-screen buttons.
- **Pan:** single-finger drag = pan (so you can move around to feel
  the zoom). Drag-to-select for units comes in a later nail.
- **Done = on phone, you can pinch the placeholder grid in and out
  and the strategic↔tactical look crossfades smoothly.** Then we
  stop and move to the next nail.

## Process rules

- Every change to v2 gets logged in `v2.me` (one short entry per
  change: WHAT + WHY).
- New systems require a paragraph in this file before any code is
  written. Avoids the "second-system creep" that buried v1.
- If a cut from the list above is being reconsidered, it gets
  explicitly un-cut here with reasoning.
