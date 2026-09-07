# Project Status — Where We're At

_Last updated: 2026-09-05 (session: Metro Magnate approved-network port)_

This repo is a portfolio of game experiments built with Claude. Everything
develops on branch `claude/investment-game-9xxLw`; GitHub Actions builds,
tests, and deploys each game to GitHub Pages on every push.

## The games

| Game | Where | Live URL | Version | State |
|---|---|---|---|---|
| **Metro Magnate** | `metro/` | armandoxh.github.io/Territorygame/metro/ | v0.10.0 · build 25 | **Active** — approved 9-line network LIVE with per-line upgrades + NETWORK tab (signals, doors, marketing, fare reviews), rebalanced demand |
| **Scratch Empire** | `scratch/` | …/Territorygame/scratch/ | v0.1.0 · build 6 | Parked, green — v0.1 complete (true scratch reveal, EV-positive economy). Open: iPhone web haptics unverified (test panel shipped, awaiting device check) |
| **WealthQuest** | `wealthquest/` | …/Territorygame/wealthquest/ | v0.50.0 · build 125 | Parked — deep sim, honest accounting. Audited: engine sound, balance fails own scorecard (bankruptcy spiral, crypto tail, crisis drag). Fix list in the audit (chat log) |
| Territory v1 / Swarm v2 | `client/`+`shared/` / `swarm/` | root / `/swarm/` | — | Legacy/reference, untouched this era |

## Metro Magnate — the active game

**Concept:** idle subway empire. Trains run themselves on a transit-diagram
map; riders queue at stations; you collect fares, buy trains, unlock lines,
build food courts. Offline earnings (50% rate, 8h cap) with a
"while you were away" return moment.

**The point (build 19): the CITY GOALS ladder.** A goal bar above the map
shows the current target (12 rungs: riders carried, lines unlocked, money
earned … ending in NEW MERIDIAN COMPLETE at $25M). Each completion is a
COMMENDATION: a permanent ×1.25–×2 income multiplier that COMPOUNDS (×89
by the ladder top). This is the anti-bottleneck lane — upgrade levels are
linear against exponential costs, but the goal lane multiplies (the
greedy-bot probe measured income going merely linear in play time without
it). Ladder completion is the hook for the next layer: the city ladder,
then prestige.

**The city ladder (build 20): ANGEL BAY is real.** Completing NEW
MERIDIAN COMPLETE puts an OPEN ANGEL BAY button in the goal bar: cash,
lifetime totals, and every commendation carry; the network starts fresh
in a player-approved second map (9 lines, 59 stations — bay, Presidio
peninsula, Isla Chica island tunnel) at 10× costs and 8× fares, with its
own 12-rung ladder (ANGEL BAY COMPLETE at $1.5B lifetime). One-way move;
`tools/angelbay.py` is its generated-data rig. More cities = new rigs.

**The approved network — NEW MERIDIAN XL (player-approved 2026-09-07):**
- **24 lines, 162 stations, 28 interchanges, 520-unit world.** The
  original 9-line core (approved 2026-09-05) sits verbatim as downtown;
  ① Ⓜ Ⓛ extended outward; 15 new lines across five boroughs (Westbank,
  Northgate, Long Haven, Eastport, South Shore) around a bay with the
  Ⓓ bay-bridge. Unlock ladder: original nine unchanged ($0→$3M), then
  ② $6M → … → ⑥ $1B → Ⓩ $1.4B
- Goal ladder extended to 18 rungs (first 12 unchanged for migrated
  saves; DOWNTOWN COMPLETE at $25M, NEW MERIDIAN COMPLETE at $250M
  lifetime); Angel Bay unlock now sits atop the full XL arc
- **No 90° turns** — every bend is 45°, like real track
- **Shared corridors ≤ 3 stops**, drawn side-by-side on lane offsets;
  trains ride their own lane (Ⓐ and Ⓝ run visibly abreast Union Sq → 34 St)
- Quiet stations = tiny black dots; waiting riders inflate the dot into a
  white circle showing `up/down` counts (one per departing direction; a
  single number at a line's end); full station = red ring + red numbers
- Map fills the whole screen (build 23): slim header + goal strip above,
  LINES/NETWORK as bottom sheets with a live BALANCE readout; opens
  scale-to-fit and pinch-zooms to 10× with no scroll-gesture conflicts

**Engineering state:**
- `lib/data/cities.dart` is **generated** from the design rig — never
  hand-edit coordinates
- Deterministic engine (no RNG), save v6 (older saves migrate money/
  upgrades, world restarts on ①), balance harness enforces the approved
  rules as tests (unique colors, escalating ladder, shares ≤ 3 stops,
  fun-zone earn rate, offline math, determinism)
- **Upgrades at three scopes, all harness-pinned** (build 18):
  - *Per line* (tap a line): add trains, Express Motors (+15% speed/lv),
    Bigger Cars (+6 riders/stop/lv), Step-Free (+10% ridership/lv), New
    Subway Cars (+8% ridership/lv)
  - *Per station* (tap a station, 6 works): Food Court (+$0.40/rider
    AND +10% ridership/lv), Fare Gates (+$0.25/rider/lv), Platform Works
    (−15% dwell here/lv), Park & Ride (+6% ridership/lv), Escalators
    (+8 platform cap here/lv), Security Desk (+4% income here/lv).
    Sheet shows live DEMAND, WAITING up/down, $/RIDER
  - *STATION WORKS bulk planner* (build 25, in every line sheet): one
    row per work type in a player-reorderable PRIORITY order (▲); each
    buy raises only the line's LOWEST-tier stations — nobody reaches
    tier N+1 until every stop has tier N — and buys as many as cash
    allows, in line order. NEXT marker shows where the priority points
  - *Network* (NETWORK tab, 8): Signals (+4% speed/lv), Platform Doors
    (−5% dwell/lv), City Marketing (+5% ridership/lv), Fare Review
    (+$0.25 fare/lv), Ad Billboards (+3% income/lv), Crowd Control
    (+8 station cap/lv), Rail Yards (−4% train cost/lv), Night Service
    (+6% offline rate/lv)
- **Shared stations COMPOUND**: every serving line's ridership upgrades
  multiply together at an interchange (×food ×marketing on top) — pinned
  by a unit test on demandMultAt, and the UI stats read the same function
- Pace (build 24): `demandScale = 1.3`, base capacity 22, station cap 80
  (+crowd control), fare pops `22× +$44`, level 0 ≈ $17.5/s — demand and
  base capacity move together or demand-side upgrades die (build 12's
  lesson)
- **Directional platforms + smart spawns** (build 16): waiting queues are
  per-direction (uptown/downtown); a train boards only the platform for
  the direction it departs with; arrivals fill only platforms a line
  actually leaves from. New trains enter at the midpoint of the WIDEST
  round-trip-phase gap in the line's live fleet (build 21) — a 2nd train
  spawns exactly opposite the 1st wherever it is, and any later purchase
  drops into the biggest hole — bidirectionally equidistant no matter
  when the button is pressed. Save v6 split old single queues onto the
  served platforms

**Next up (discussed, not committed):** make unlocks feel bigger
(district-reveal moment, per-line ridership stats), then the city ladder
(Angel Bay, Lakewind, Fogport, Kanto as new data files) and daily-hook /
share-card retention layer.

## Process rules (hard-won this session — do not drop)

1. **Design rig before painter** — `metro/tools/mapmock.py` renders the
   exact map geometry to SVG + headless-Chromium screenshot. All visual
   iteration happens there, by eye, before any Dart changes.
2. **SVG APPROVAL GATE** — the player approves the rig render **before**
   any visual change is committed or deployed. Render → send → wait →
   port. Locked into `metro/STYLE.md` + `metro/CLAUDE.md`.
3. **STYLE.md is visual law** — NYC Live Map dashboard language: flat
   water-framed land, official line hexes, data-overlay UI (1px hairlines,
   square corners, Inter/heavy), no cartoon effects.
4. **Balance harness from commit 1** — every economy change must keep the
   Sim workflow green; the harness is the balance authority.
5. **Build stamping** — bump `version.dart` + `pubspec.yaml` + the
   CLAUDE.md header on every deployed change; the live footer must always
   identify its build.
6. **CI is the compiler** — no local Flutter toolchain; watch both
   workflows after every push (Sim = tests, Web = build + deploy to
   `docs/<game>` on the Pages branch).

## Pipeline

```
edit <game>/** → push (claude/investment-game-9xxLw)
  ├─ <Game> Sim — flutter test (balance harness gate)
  └─ <Game> Web — flutter build web → deploy → armandoxh.github.io/Territorygame/<game>/
```
Six workflow files: metro-, scratch-, wealthquest- × sim/web. Concurrency
dedupe cancels superseded runs (a rapid second push replaces the first).

## Known issues / open threads

- **Scratch Empire iPhone haptics**: Safari has no vibration API; shipped
  the toggle-switch trick + a 🔧 test panel — awaiting a device report
  (needs iOS 17.4+ and System Haptics ON). Native app would solve it.
- **WealthQuest balance** (if ever resumed): tame the bankruptcy spiral
  (competent players ruin 100%), clamp crypto's long-horizon tail (p90
  1,663×), pull crisis drag to the stated 15–20% target.
- **WealthQuest ui_flow test**: long-standing paint-overflow red; only
  failing test in its suite.
- **App Store path** (deferred): Flutter exports native; needs Apple
  Developer ($99/yr), a cloud-Mac build (Codemagic), and Apple review.
  Save systems + build pipelines are already in place.

## History worth remembering

- WealthQuest source was nearly lost when its dev branch was deleted —
  recovered by sha and restored to this branch. Anything not on a living
  branch is one GC away from gone.
- Scratch Empire and Metro Magnate both compiled green on their first CI
  run — the generated-scaffold + harness-first pattern works.
- The visual-quality turnaround came from the rig: designing blind cost
  three ugly deploys; designing by screenshot got approval in one session.
