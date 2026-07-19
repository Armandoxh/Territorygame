# Scratch Empire — project rules

## ▶ CURRENT BUILD: v0.1.0 · build 6

An idle/incremental game about building a scratch-off ticket empire.
Lives at https://armandoxh.github.io/Territorygame/scratch/ (deployed by
`.github/workflows/scratch-web.yml` on every push that touches `scratch/`).

## Design pillars (decided with the user — do not drift)

1. **Every ticket is EV-positive.** You're the luckiest person alive.
   Variance delivers the dopamine; positive EV guarantees the climb never
   stalls. CI enforces EV bounds per ticket (1.05×–1.35× cost at level 0).
2. **The scratch must feel great.** True finger-scratch reveal (latex +
   BlendMode.clear), haptics, confetti on big wins. Juice before features.
3. **Softlock-proof.** A broke player always gets a free "found on the
   ground" ticket. CI enforces it.
4. **Nail one aspect at a time.** Roadmap: v0.1 the scratch → v0.2 the
   ladder (tiers/themes/styles) → v0.3 the machines (idle/offline) →
   v0.4 the hooks (daily Golden Ticket, streaks, jackpot share card).

## Conventions

- Bump `lib/version.dart` + `pubspec.yaml` build number on every deployed
  change; keep the header above in sync.
- Ticket definitions live in `lib/data/tickets.dart` as data, never
  hardcoded in UI.
- Every economy change must keep `test/economy_test.dart` green — that
  harness is the balance authority (WealthQuest lesson: build it early,
  trust it).
- No local Flutter toolchain in the dev container: CI is the compiler.
  Watch both workflows after every push.
