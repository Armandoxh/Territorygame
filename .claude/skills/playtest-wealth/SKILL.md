---
name: playtest-wealth
description: Agentic playthrough focused on the money-making engines — investing (stocks/bonds/funds/crypto/commodities + shorting + locked funds), real estate (buy/rent/mortgage/renovate/refinance/sell), Main Street businesses (buy/manage/expand/sell + failures), and DraftDay betting (single bets, featured parlays, custom parlays). Age 18→60. Use when the user wants to playtest investing, real estate, businesses, commodities, or betting.
---

# /playtest-wealth — investing, real estate, business & betting (18 → 60)

Uses the **harness, run procedure, engine API cheat-sheet, and report
format from `/playtest`** — read that first and reuse
`test/playthrough/life_agent.dart`. Write the driver to
`test/playthrough/wealth_playthrough_test.dart`. Give yourself a head
start (`g.cash = 250000` after construction) so every system is
reachable, then play 18→60.

## What this life does

- **Investing:** `buy` at least one asset in **every** category
  (`Catalog.categories` → `unlockedAssets`), including a `short` and a
  locked fund (CD / private credit / hedge fund). Hold through several
  months, then `sell`/`coverShort`. Confirm dividends & coupons show in
  `DayResult.dividends`, locked funds can't be sold early without the
  documented penalty, and a short profits when its asset falls.
- **Real estate:** `buyProperty` across categories (house, apartment,
  commercial, land), `toggleRental`, collect rent (`DayResult.rent`),
  `renovate` and confirm rent/value actually rises with ROI, `refinance`
  to pull cash, `payDownMortgage`, then `sellProperty`. Check the
  mortgage qualification gate (needs enough qualifying income).
- **Businesses (Main Street):** `buyBusiness`, run hands-on vs.
  `toggleManager`, `expandBusiness` and confirm monthly
  `DayResult.businessIncome` rises, push past `activeBusinessLimit` to
  trigger `businessesOverextended`, survive a hard failure, then
  `sellBusiness`.
- **Betting (DraftDay):** `placeBet` (single), `placeFeatured` (a
  populated parlay), and a custom `placeParlay`. Advance to settle them;
  confirm `betWinRate`/`betNetProfit` update and the house edge keeps
  long-run EV negative.

## Coverage checklist (mark each)

`buy:<each category>`, `short`, `coverShort`, `lockedFund`, `dividends`,
`buyProperty:<each category>`, `toggleRental`, `rentCollected`,
`renovate`, `refinance`, `payDownMortgage`, `sellProperty`,
`buyBusiness`, `toggleManager`, `expandBusiness`, `overextended`,
`businessFailure`, `sellBusiness`, `placeBet`, `placeFeatured`,
`placeParlay`, `betSettled`.

## Focused assertions

- Cash-flow identity holds every month (cash moves by
  income − tax − expenses + dividends + interest + rent − mortgage
  − overdraftFee + businessIncome ± trades).
- A renovated rental's monthly net cash > pre-reno (ROI is real).
- Long-run betting net profit ≤ 0 across many wagers (negative EV).
- No action ever throws; selling everything always returns cash ≥ 0.

Report per `/playtest`, flagging any dominant or dead strategy (e.g. a
business that prints money with a manager and no downside, or a property
tier with negative ROE).
