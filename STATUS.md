# Project Status — Where We're At

_Last updated: 2026-09-05 (session: Metro Magnate approved-network port)_

This repo is a portfolio of game experiments built with Claude. Everything
develops on branch `claude/investment-game-9xxLw`; GitHub Actions builds,
tests, and deploys each game to GitHub Pages on every push.

## The games

| Game | Where | Live URL | Version | State |
|---|---|---|---|---|
| **Metro Magnate** | `metro/` | armandoxh.github.io/Territorygame/metro/ | v0.4.1 · build 13 | **Active** — approved 9-line network LIVE with per-line upgrades, $2 fare, cap 60, rebalanced demand |
| **Scratch Empire** | `scratch/` | …/Territorygame/scratch/ | v0.1.0 · build 6 | Parked, green — v0.1 complete (true scratch reveal, EV-positive economy). Open: iPhone web haptics unverified (test panel shipped, awaiting device check) |
| **WealthQuest** | `wealthquest/` | …/Territorygame/wealthquest/ | v0.50.0 · build 125 | Parked — deep sim, honest accounting. Audited: engine sound, balance fails own scorecard (bankruptcy spiral, crypto tail, crisis drag). Fix list in the audit (chat log) |
| Territory v1 / Swarm v2 | `client/`+`shared/` / `swarm/` | root / `/swarm/` | — | Legacy/reference, untouched this era |

## Metro Magnate — the active game

**Concept:** idle subway empire. Trains run themselves on a transit-diagram
map; riders queue at stations; you collect fares, buy trains, unlock lines,
build food courts. Offline earnings (50% rate, 8h cap) with a
"while you were away" return moment.

**The approved network (player-signed SVG, this session):**
- 9 lines, each a **unique MTA color** and its own territory — the unlock
  ladder: ① Meridian Local (free) → Ⓐ $4K → Ⓛ $15K → Ⓜ $45K → Ⓝ $120K →
  Ⓙ $300K → Ⓖ $700K → Ⓔ $1.5M → ⑦ $3M
- 56 stations, 300-unit world, three land masses (Meridian island,
  Long Haven, Westbank) across two rivers
- **No 90° turns** — every bend is 45°, like real track
- **Shared corridors ≤ 3 stops**, drawn side-by-side on lane offsets;
  trains ride their own lane (Ⓐ and Ⓝ run visibly abreast Union Sq → 34 St)
- Quiet stations = tiny black dots; waiting riders inflate the dot into a
  white circle with the count inside; full platform = red ring + red number
- Map opens scale-to-fit (whole city, top-down tiny) and pinch-zooms to 10×

**Engineering state:**
- `lib/data/cities.dart` is **generated** from the design rig — never
  hand-edit coordinates
- Deterministic engine (no RNG), save v4 (older saves migrate money/
  upgrades, world restarts on ①), balance harness enforces the approved
  rules as tests (unique colors, escalating ladder, shares ≤ 3 stops,
  fun-zone earn rate, offline math, determinism)
- **Upgrades are scoped per line** (tap a line → its trains, motors,
  cars, step-free), fare is a checkable \$2/rider (pops show `N× +$`),
  platform cap 60. `demandScale = 0.75` keeps level 0 just past the
  supply/demand balance point so all three upgrade types measurably pay —
  the harness proved access was dead weight at 1.0 (build 12's red Sim)
  and now pins it (speed 1.16×, cars 1.28×, access 1.12× at L5)

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
