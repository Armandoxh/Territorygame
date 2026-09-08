# Metro Magnate

An idle subway-empire game. Trains run themselves on a hand-approved
transit map; riders queue at stations, you collect fares, buy trains,
unlock lines, build out stations, and climb a city ladder — with a
deterministic, RNG-free simulation underneath so every mechanic is
testable and every balance claim is measured, not guessed.

**Play it:**

- **v2 (active):** https://armandoxh.github.io/Territorygame/metro2/ —
  the WebGL rebuild. Currently a render showcase, not yet the game.
- **v1 (complete, frozen):** https://armandoxh.github.io/Territorygame/metro/ —
  the full game, 37 builds deep. Still live, still playable.

---

## Where we are

### v1 — the game (frozen trunk at build 37)

Thirty-seven builds of Flutter/CanvasKit, developed entirely through CI
(no local toolchain — every build compiled blind and was verified by a
harness). Everything below ships and works today:

- **New Meridian XL:** 24 lines, 162 stations, 28 interchanges — every
  map drawn in Python design rigs with mechanical rules (45°-only
  bends, corridor limits, land containment) and player-approved as SVG
  before a single coordinate reaches the game.
- **The economy:** per-line upgrades (speed, cars, access, trainsets),
  six per-station works with tier-even bulk buying and player-set
  priority, eleven network-wide upgrades, and a second city (Angel Bay,
  10× costs / 8× fares) reached by finishing the goal ladder.
- **The hooks:** rush hour on a deterministic printable timetable
  (every rush window is also the night rush of the map's light cycle),
  five rotating commission types (haul, turnback run, hub service,
  clean sweep, rush contract), and a 22-rung mastery goal ladder whose
  commendations compound multiplicatively — the answer to idle games'
  linear-income-vs-exponential-cost trap.
- **The craft:** generative WebAudio soundtrack keyed to the lines,
  unlock cinematics, 10× fast-forward, onboarding coach, 15 save
  versions with migrations, offline earnings.
- **The law:** `metro/test/economy_test.dart` — a balance harness that
  replays exact worlds and pins every upgrade's measured effect. It
  remains the authority on tuning while v2 ports systems over.

### v2 — the engine pivot (build 38, just landed)

Player verdict after v1's final visual pass: *"V2 needs to be on a
better graphics engine."* The Flutter 2D canvas hit its ceiling, so v2
rebuilds on **TypeScript + Vite + three.js (WebGL)**:

- The same approved geometry, bridged from the generated v1 data
  (`tools/dart2json.py` — the rigs and approval gate still govern every
  map change), rendered as a living 3D city: extruded boroughs in the
  bay, ~2,000 procedural buildings seeded from station demand, track
  ribbons in the official line colors, trains with headlight beams,
  and the v1 light cycle with real sun, shadows, and bloom.
- A line-for-line TS port of the deterministic sim core (arrivals,
  directional platforms, ping-pong trains, boarding, rush clock),
  guarded by a growing vitest harness that mirrors v1's laws.
- A transformed workflow: v1 was built blind; v2 builds locally and is
  **screenshot-verified in headless Chromium before every deploy**.
  161 KB gzipped, versus Flutter's multi-megabyte bundle.

---

## Where we're going

Roughly in order; each milestone ships playable to the live URL:

1. **Graphics pass (next):** answer the first player critique of the
   render proof — *"looks too boxy."* Building variety (setbacks,
   rooftop massing, softened edges), rounded rolling stock, track
   beds, trees in the parks and streets, richer water.
2. **M2 — Interaction:** tap a station for its panel, buy lines and
   trains, the four-tab console (LINES · OPS · GOALS · NETWORK)
   rebuilt over the 3D map.
3. **M3 — The economy port:** upgrades, station works, rush hour,
   commissions, and the goal ladder brought over system by system,
   each landing with its harness tests mirrored from v1.
4. **M4 — Saves:** persistence plus migration of v1 localStorage
   saves, so nobody loses their empire to the engine swap.
5. **Beyond:** Angel Bay in 3D, the track-laying "charter" mode (the
   rig rules become in-game building code), prestige, and the App
   Store path.

## Development

```sh
cd metro2
npm install
npm run dev     # local dev server
npm test        # engine harness (vitest)
npm run build   # typecheck + production build
```

Deploys are automatic: `.github/workflows/metro2-web.yml` tests,
builds, and publishes to GitHub Pages on every push touching `metro2/`.
Debug knobs on the live page: `?t=<seconds>` sets the clock (140 =
night), `?speed=<mult>` scales it, `?fixed` parks the camera,
`?nobloom` disables post-processing.

Project law lives in `CLAUDE.md` (this directory) and the visual law in
`../metro/STYLE.md`. Build numbering is repo-continuous: v1 froze at
b37; v2 started at b38.
