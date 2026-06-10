# WealthQuest — repo notes for Claude

## ▶ CURRENT BUILD: v0.41.0 · build 92

This number is the source of truth. It is shown **pinned at the top of the
in-app header** so the user can confirm the live page is the latest build (and
not a stale cache). Keep this line in sync with `lib/version.dart`.

## RELEASE RULE (do this on EVERY deploy)

Whenever you push a change that triggers a build/deploy:

1. **Increment `kBuildNumber`** in `lib/version.dart` (every single build).
2. Bump `kAppVersion` in `lib/version.dart` for notable features
   (e.g. 0.5.0 → 0.6.0).
3. Update `version:` in `pubspec.yaml` to match (`<kAppVersion>+<kBuildNumber>`).
4. Update the **CURRENT BUILD** line at the top of this file.

The badge renders via `appVersionLabel` in `lib/ui/home_screen.dart`'s header.
Never let these four drift apart.

## What this is

A mobile life-sim / stock-market game in Flutter. Start at 18 with a day job;
press **Next Week** (one in-game week) to advance — salary in, expenses out,
markets move, interest/dividends/coupons accrue, rumors resolve, age ticks up a
year every 52 weeks. See `README.md` for the full feature list.

## Deploy / see it on a phone

- GitHub Actions (`.github/workflows/wealthquest-web.yml`, in the repo root)
  builds Flutter web and publishes to the Pages branch at
  **https://armandoxh.github.io/Territorygame/wealthquest/**.
- Build uses `--pwa-strategy=none` (no caching service worker) so changes show
  up on a single refresh. `web/flutter_service_worker.js` is a kill-switch that
  evicts any old worker still installed on a returning device.
- Flutter isn't installed in the sandbox — CI is the build/typecheck. Watch the
  run and fix failures.

## Conventions

- **Tunables live in `data/catalog.dart`** (assets, categories, jobs, starting
  cash, expenses). Adding an investment = one `AssetDef`; adding a job = one
  `JobDef`. Nothing else changes.
- **The engine branches on `AssetKind`, not specific assets** — a new
  instrument is data, not code.
- Market math is pure + seedable (`engine/`), so it's deterministic under a seed
  and unit-testable (`test/`).
- A "week" is the unit of time everywhere user-facing. (Some internal
  identifiers still read `day`/`daily` — they mean per-week; don't let new
  user-facing strings say "day".)

## Layout

```
lib/
  models/   AssetDef/AssetKind, Holding, JobDef, Rumor
  data/catalog.dart   single source of truth (economy + catalog)
  engine/   market_engine.dart (prices), news_engine.dart (rumor mill)
  state/game_controller.dart   ChangeNotifier: time, cash, holdings, advanceDay()
  ui/       header + Dashboard/Market/Portfolio/News/Life + asset detail + widgets
  version.dart   kAppVersion / kBuildNumber  ← bump every deploy
```
