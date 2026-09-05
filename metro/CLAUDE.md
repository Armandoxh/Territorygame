# Metro Magnate — project rules

## ▶ CURRENT BUILD: v0.2.0 · build 3

An idle game about building a subway empire, one line at a time, drawn in
the modern Live Subway Map dashboard style (see STYLE.md). Lives at
https://armandoxh.github.io/Territorygame/metro/ (deployed by
`.github/workflows/metro-web.yml` on every push that touches `metro/`).

## Design pillars (decided with the user — do not drift)

1. **The map IS the game — styled per `STYLE.md` (authoritative).** The
   modern NYC Live Subway Map dashboard look: flat #F4F4F4 ground, official
   MTA line hexes, 0°/45°/90° vectors only, trains as route-bullet circles,
   1px-border square-cornered data-overlay UI. Read STYLE.md before touching
   any visual. Fictional city names on purpose — real transit branding is
   trademarked.
2. **Trains run themselves.** The idle core: riders accumulate at stations,
   the train scoops them for fares. Away time pays 50% of the live rate,
   capped at 8h, delivered as the "while you were away" moment.
3. **Upgrades are the player's hands**: train speed, car capacity, and
   accessibility (step-free stations = more riders) from day one; food
   courts and map attractions are on the roadmap, not forgotten.
4. **Deterministic sim, no RNG.** `GameState.tick(dt)` is pure — the balance
   harness replays exact worlds. Keep it that way until randomness earns
   its place.

## Roadmap

- **v0.1 — The Line** (done): one city, one line, animated map, riders +
  fares, 3 upgrades, save + offline earnings.
- **v0.2 — The System** (this): more lines in New Meridian, more trains,
  per-station upgrades (accessibility, food courts).
- **v0.3 — The Attractions:** purchasable map POIs with demand halos.
- **v0.4 — The Cities:** the 4–5 city ladder (Angel Bay, Lakewind, Fogport,
  Kanto) as data templates + prestige carry-over.
- **v0.5 — The Hooks:** daily rush hour, ridership share card.

## Conventions

- Bump `lib/version.dart` + `pubspec.yaml` build number on every deployed
  change; keep the header above in sync.
- Cities/lines/stations live in `lib/data/cities.dart` as data, never
  hardcoded in UI or engine.
- Every economy change must keep `test/economy_test.dart` green — the
  harness is the balance authority.
- No local Flutter toolchain in the dev container: CI is the compiler.
  Watch both workflows after every push.
