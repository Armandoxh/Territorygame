# Playtest skills — index

Agentic playthroughs of WealthQuest. They drive the `GameController`
engine (the same logic the UI calls) from age 18→60 and report bugs,
softlocks, and balance flags. Execution runs as a Dart test in the
`wealthquest-sim` GitHub Actions workflow (Flutter isn't installed
locally).

| Skill | Scope |
|-------|-------|
| `/playtest` | **Master** — one life touching *every* system + prestige. Holds the shared harness, run procedure, engine API cheat-sheet, and report format the others reuse. |
| `/playtest-career` | Careers, education, retirement/401(k), taxes, student loans. |
| `/playtest-wealth` | Investing, real estate, Main Street businesses, commodities, betting. |
| `/playtest-life` | Family, housing/transport, social standing, event access, expenses. |
| `/playtest-resilience` | Crises, overdraft/margin doom-loop, softlock probe, prestige loop. |

Run on request — the user invokes one (e.g. `/playtest-wealth`) when
they want it. Always start with the container-reset guard
(`git fetch && git reset --hard origin/<branch>`) and verify the API
cheat-sheet against `lib/state/game_controller.dart` before writing the
driver.
