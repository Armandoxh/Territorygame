---
name: playtest-career
description: Agentic playthrough focused on careers, education, retirement, and taxes — age 18→60. Climbs a full career track, earns degrees (incl. switching tracks), tunes 401(k) contributions to test the employer match and pre-tax shelter, checks income tax brackets and the early-withdrawal penalty, and verifies student-loan amortization. Use when the user wants to playtest jobs/education/retirement/tax.
---

# /playtest-career — careers, education, retirement & tax (18 → 60)

Uses the **harness, run procedure, engine API cheat-sheet, and report
format from `/playtest`** — read that skill first and reuse
`test/playthrough/life_agent.dart`. Write the driver to
`test/playthrough/career_playthrough_test.dart`.

## What this life does

- **18–22:** enroll in a degree (`enroll`), go part-time, watch the
  student loan accrue, then graduate and confirm a fixed monthly
  `studentLoanPayment` begins (it must NOT compound forever).
- **Join and climb a track** (`joinTrack`) — advance year by year and
  confirm automatic promotions up the rungs, with pay rising over ~30
  years (not maxing in 10).
- **Switch tracks once** mid-career and confirm you restart at the new
  track's entry rung (no demotion exploit, no free senior pay).
- **Retirement/401(k):** `setRetirementContribPct` at 0%, 5%, 10% across
  the life. Verify: employer match is 100% up to 5%; contributions are
  pre-tax (lower the income-tax line); `retirementBalance` grows;
  `withdrawRetirement` before 59½ takes the 25% penalty.
- **Tax:** confirm `DayResult.tax` tracks income-tax brackets and the
  standard deduction, and that a higher contribution lowers it.

## Coverage checklist (mark each)

`enroll`, `graduate`, `studentLoanAmortizes`, `joinTrack`, `promotion`,
`switchTrack`, `setRetirementContribPct`, `employerMatch`,
`preTaxShelter`, `withdrawRetirementPenalty`, `incomeTax`.

## Focused assertions

- Pay at age ~50 on a long track ≫ entry pay (career actually ramps).
- After graduation, `studentLoan` strictly decreases each month until 0.
- `tax` at 10% contribution < `tax` at 0% contribution (same role).
- Early `withdrawRetirement(x)` nets `< x` to cash (penalty applied).

Report per `/playtest`'s format, emphasizing balance of the career
ladders (time-to-ceiling) and whether any degree is a trap or a steal.
