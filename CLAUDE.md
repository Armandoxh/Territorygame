# Repo notes for Claude

## Deployment / live UI

GitHub Pages serves from branch **`claude/territorial-game-mobile-xXdYn`**. That
is the live-UI branch — anything merged into it auto-reflects on the hosted
page.

There is currently no GitHub Actions workflow that builds and deploys the
client; Pages is wired directly to that branch's contents.

### When asked to ship a fix to the live UI

1. Develop on the session's assigned feature branch (per task instructions).
2. When the change is ready, open a PR with base
   `claude/territorial-game-mobile-xXdYn` and head = the feature branch. The
   user merges, Pages rebuilds, change is live.
3. Do **not** push directly to `claude/territorial-game-mobile-xXdYn` unless
   the user explicitly authorises it.

This preference is durable — don't ask again, just open the PR.

## Project layout

- `shared/` — engine code (game state, AI, expansion, vassal logic). Pure TS,
  no DOM, no node deps. Typecheck with `npx tsc -p shared --noEmit`.
- `client/` — Pixi 8 renderer + HUD. `npm run dev` for local, `npm run build`
  for the Pages bundle.
- `server/` — Colyseus server (declared in workspaces; not always present in
  every branch).
- `legacy/`, `docs/` — reference material, not built.

## Conventions

- Game tunables live in `shared/src/config.ts`. Prefer adjusting a named
  constant there over hardcoding a number in `game.ts`.
- All tile-ownership mutations route through `Game._claim` so region
  ownership/dominance tables stay in sync — never call
  `territory.claim` directly from new code.
- `_regionOwner[r]` = strict 100% owner. `_regionDominant[r]` = >50% owner.
  Vassal AI keys off `_regionDominant`; full-region bonuses key off
  `_regionOwner`.
