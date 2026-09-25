# rts/ — medieval base-builder RTS

Standalone game, separate from v1 (`shared/`, `client/`) and swarm
(`swarm/`). Read `plan.md` (scope) and `changelog.md` (latest state)
before changing anything.

- Same mantra as swarm: finish one thing before starting the next. Ask
  before adding anything listed under "Not yet" in `plan.md`.
- Tunables live in `src/config.ts`.
- `npm run typecheck`, `npm run build` (writes `../docs/rts/`, which is
  committed so Pages can serve it). Dev server: `npm run dev`.
- Append to `changelog.md` after each meaningful change.
