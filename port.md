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
- **Two-scale view, one simulation.** Pinch / scroll zooms
  smoothly between a strategic map (regiments as colored blobs,
  solid-color territory, region labels — make decisions here) and
  a tactical view (individual soldier sprites scrapping, terrain
  detail — watch and nudge here). No mode switch, no separate
  battle screen. Total War vibe, but battles resolve in tens of
  seconds, not 20 minutes.

## Hard cuts (do NOT port from v1)

- ❌ Decrees (all 24), commander tree, masteries, doctrine system
- ❌ Bombs, ground ops (artillery / blitz / tank / paratrooper),
  nukes
- ❌ Ships (warship / destroyer / sub), planes, airstrips, AA,
  naval colonies
- ❌ Trade, alliances, war invites, diplomacy menu, nation profile
  sheets
- ❌ Resources beyond gold (no food / wood / stone / oil / gems)
- ❌ Vassal-as-region with separate gold pools
- ❌ ARMY_MODE flag (there is only one mode in v2)

These come back as **expansions** if and only if the core loop is
fun without them. Not before.

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

Until a new GitHub repo is set up, v2 will be scaffolded under
`/home/user/Territorygame/swarm/` on this branch. v1 (the current
pixel-territory game) stays on `claude/territorial-game-mobile-xXdYn`
as reference. When milestone 1 feels right, the user creates a
fresh GitHub repo and we move `swarm/` there with clean history.

## Process rules

- Every change to v2 gets logged in `v2.me` (one short entry per
  change: WHAT + WHY).
- New systems require a paragraph in this file before any code is
  written. Avoids the "second-system creep" that buried v1.
- If a cut from the list above is being reconsidered, it gets
  explicitly un-cut here with reasoning.
