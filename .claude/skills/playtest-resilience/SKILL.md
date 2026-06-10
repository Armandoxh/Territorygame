---
name: playtest-resilience
description: Agentic stress-test playthrough — crises/decision events, the overdraft → margin-call doom loop, cash-flow edge cases, and the prestige/retirement loop. Age 18→60 (and beyond via prestige). Drives the player into the red on purpose to verify recovery, then retires at $1M to confirm prestige unlocks carry over. Use when the user wants to playtest crises, overdraft/margin, softlocks, or prestige.
---

# /playtest-resilience — crises, cash-flow & prestige (18 → 60+)

Uses the **harness, run procedure, engine API cheat-sheet, and report
format from `/playtest`** — read that first and reuse
`test/playthrough/life_agent.dart`. Write the driver to
`test/playthrough/resilience_playthrough_test.dart`. Run several seeds
(e.g. 1, 7, 42, 99) since crises and markets are seed-dependent.

## What this life does

- **Crises:** advance long enough that many decision events fire. For
  each, resolve via `g.resolveCrisis(g.pendingCrisis!.choices.first)` AND
  in a second run `...choices.last` — confirm both branches resolve
  cleanly, never softlock, and never gouge an asset-rich/cash-light
  player past the documented caps (≤6% net worth / ≤30% cash).
- **Overdraft → margin call:** deliberately overspend (buy an expensive
  business or property with thin cash) to go negative. Confirm the
  overdraft fee is the gentler capped amount (5%/mo, ≤2% net worth), that
  the margin call fires on the 4th red month, and that liquidating
  recovers cash ≥ 0 and clears the streak. Confirm a player with **no**
  liquidatable assets still resolves (no infinite popup, no crash).
- **Softlock probe:** assert there is always *some* legal action that
  advances the game — the player can never be permanently stuck with
  negative cash and nothing to do.
- **Prestige loop:** play a frugal, all-in life to cross
  `retireThreshold` ($1M). Construct a fresh `GameController(prestige: 1)`
  and confirm the Prestige-1 unlocks are present
  (`Catalog.unlocksAt(1)` — Founder track, Unicorn stock, Platinum) and
  that they're gated off at prestige 0.

## Coverage checklist (mark each)

`crisisFirstChoice`, `crisisLastChoice`, `crisisCapsRespected`,
`overdraftFee`, `overdraftCapped`, `marginCall`, `marginRecovery`,
`brokeNoAssetsSurvives`, `noSoftlock`, `reachMillion`, `prestigeUnlocks`,
`prestigeGating`.

## Focused assertions

- Worst single crisis cash-hit ≤ 30% of cash and ≤ 6% of net worth.
- Overdraft fee in any month ≤ 2% of net worth (when net worth > 0).
- After a margin-call liquidation, `g.cash >= -0.01` and
  `monthsCashNegative == 0`.
- `GameController(prestige:1)` exposes content that
  `GameController(prestige:0)` does not (jobs/assets with
  `unlockLevel == 1`).
- Across all seeds, no action throws and `netWorth` stays finite.

Report per `/playtest`, emphasizing any path that softlocks, any crisis
that violates its caps, and whether the prestige payoff feels worth a
retirement.
