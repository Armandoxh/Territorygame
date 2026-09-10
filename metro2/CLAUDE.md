# Metro Magnate v2 — project rules

## ▶ CURRENT BUILD: v2 · b65 (the compulsion build — stakes, variance, verbs)

The WebGL successor to Metro Magnate v1. Player verdict on v1's craft
ceiling: "V2 needs to be on a better graphics engine." Stack:
**TypeScript + Vite + three.js**, deployed by
`.github/workflows/metro2-web.yml` to
https://armandoxh.github.io/Territorygame/metro2/.

**DESIGN DIVERGENCE (b54, repriced b64 — both player-directed):**
line-upgrade progression is v2's own: L100 caps, ×1.25 cost curve,
shallow per-level effects, milestones at 10/25/50/100 paying ×1.5
line income each (+1 visible train car, max 5), and LINE UNLOCKS
scaled ×1.6 per line already owned. The ⏩ fast-forward is a DEBUG
tool (?dev only); the game is balanced for 1× + offline. Pacing
validated by the greedy-bot probe: hook buys every ~15s, spree
minutes 20-90, then growing walls; 15/24 lines at hour 6.

**DESIGN DIVERGENCE (b65, player-directed engagement laws):** all
deterministic (hashes/state, no RNG): commission payouts vary
×0.6-×2.4 by index hash with ×10 GOLDEN contracts ~1 in 11;
platforms pinned at capacity SHED demand (up to −60%, recovers 2×
faster when served); STREET TEAM is an uncapped filler priced at
≈25s of live income (+0.5% riders each); RELIEF DISPATCH clears a
≥50%-full platform for instant fares (90s cooldown); a real-day
STREAK pays +2%/day income (cap +20%); offline cap is 4h (was
v1's 8h — the comeback window). Monetization rule (player+audit):
build the compulsion, never sell relief from it.

**DESIGN DIVERGENCE (b51, player-directed):** v2's goals are FOUR
PARALLEL TRACKS with typed benefits (GROWTH→ridership mult,
PROFIT/MASTERY→income mult, EXPANSION→build-cost discounts) — v1's
single 22-rung ladder is retired in v2. The v1 harness remains the
authority for the SIM CORE only; goal design is now v2's own.

v1 (Flutter) is the FROZEN TRUNK at commit tag point b37 — it stays
live at /metro/ and its `metro/test/economy_test.dart` harness remains
the balance authority while systems port over. Fix v1 only on request.

## The three laws carried over from v1 (do not drift)

1. **Deterministic sim, no RNG.** `src/engine/game.ts` is a faithful
   port of the Dart engine, constant for constant. Visual-only PRNG
   (seeded, in the renderer) is allowed; the sim stays pure.
2. **Approved geometry only.** `src/data/new_meridian.json` is
   GENERATED from `metro/lib/data/cities.dart` by `tools/dart2json.py`.
   The design rigs + SVG approval gate in `metro/STYLE.md` still govern
   any map change: rig → approval → emit Dart → re-run dart2json.
3. **Every rush hour is the night rush.** The light cycle
   (`nightFactor`) matches v1 exactly and is tested in both engines.

## The new superpower: local eyes

Unlike v1 (CI-was-the-compiler, blind builds), this stack builds and
tests IN the dev container, and headless Chromium screenshots the real
render (`node shot.mjs` pattern in the session scratchpad — serve
dist/, screenshot `?fixed&t=55` day and `?fixed&t=140` night at 1280px).
**Look at both screenshots before every deploy.** Never ship a visual
change unseen.

## Conventions

- Build numbering continues repo-wide from v1: b38, b39, … Bump
  `src/version.ts` on every deployed change and keep this header in sync.
- `npm test` (vitest) guards the engine port; grow it with every ported
  system, mirroring the v1 harness test-for-test where the system exists.
- URL debug knobs: `?t=<sec>` clock, `?speed=<mult>`, `?fixed` camera,
  `?nobloom`.
- Milestones: M1 render proof ✓ (b38) → M2 interaction ✓ (b40) →
  M3a upgrade economy ✓ (b42: line upgrades, station works with the
  tier-even planner, network upgrades — v1 formulas verbatim, v1
  harness bounds green in vitest) → M3b OPS + GOALS ✓ (b43:
  rush timetable, five commission types, the 22-rung ladder with
  compounding commendations, the ⏩10×) → M3c the city ladder (Angel
  Bay in 3D + moveOn) → M4 v1-save migration.
