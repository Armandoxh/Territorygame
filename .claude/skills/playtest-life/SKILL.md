---
name: playtest-life
description: Agentic playthrough focused on the Life app — family & relationships (dating → partner income → marriage → kids), housing & transport choices (real-cost tiers), social standing & event access (status-gated tips), and the live expense breakdown. Age 18→60. Use when the user wants to playtest the Life app, family, lifestyle, housing/transport, or social standing.
---

# /playtest-life — family, lifestyle & social standing (18 → 60)

Uses the **harness, run procedure, engine API cheat-sheet, and report
format from `/playtest`** — read that first and reuse
`test/playthrough/life_agent.dart`. Write the driver to
`test/playthrough/life_playthrough_test.dart`.

## What this life does

- **Relationships:** `goOnDate()` until partnered (default 3 dates),
  confirm `partnerMonthlyIncome` then lands in cash each month
  (`DayResult.income` rises). `proposeMarriage()` (married income bump +
  standing +8). `haveChild()` up to `maxChildren`; confirm `childcareCost`
  adds to monthly expenses and a too-small home shows the "cramped"
  capacity warning condition (`children > housing.capacityKids`).
- **Housing & transport:** sweep `chooseHousing(id)` /
  `chooseTransport(id)` across the whole ladder (incl. `null` = follow
  income). Confirm `housingCost`/`transportCost` change the monthly
  `expenses`, that cheaper-than-`autoHousingCost` actually saves cash, and
  that nicer tiers add `lifestyleStanding`.
- **Social standing & access:** verify `totalStanding =` earned +
  lifestyle, that `standingTier` climbs, and that
  `attendLifeEvent(e)` is **blocked** when `standingTier < e.minTier` and
  **allowed** once standing (via marriage/family/lifestyle/events) clears
  the bar. Confirm the tip reliability bonus scales with tier.
- **Expenses:** confirm the live breakdown (housing + transport +
  food/insurance/utilities/fun + childcare) reconciles to what's billed.
- **Insurance:** toggle each of `Insurance.all` (`toggleInsurance(id)`) and
  confirm premiums show up in monthly expenses; run an uninsured life on
  the same seed and confirm it occasionally eats a full-freight incident.
  Health insurance should also slow `g.health` decline (longevity payoff).

## Coverage checklist (mark each)

`goOnDate`, `partnered`, `partnerIncome`, `proposeMarriage`, `married`,
`haveChild`, `childcareCost`, `crampedWarning`, `chooseHousing:<each>`,
`chooseTransport:<each>`, `lifestyleSaving`, `lifestyleStanding`,
`standingTierUp`, `eventGatedBlocked`, `eventGatedAllowed`,
`tipReliabilityBonus`.

## Focused assertions

- After partnering, monthly `income` increases by ≈ `partnerMonthlyIncome`.
- Choosing a tier cheaper than `autoHousingCost` lowers monthly
  `expenses` by exactly the delta; pricier raises it by the delta.
- A tier-2/3 event errors for a `standingTier 0` agent and succeeds once
  standing is built — proving family/lifestyle truly buys access.
- Total expenses always equal housing+transport+childcare+base*0.47.

Report per `/playtest`, flagging whether family is a no-brainer (free
money) or properly balanced, and whether status→access feels meaningful.
