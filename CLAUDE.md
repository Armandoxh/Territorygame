# Repo notes for Claude

## ⚡ v2 pivot in progress (May 2026)

**This repo is being rebuilt** as a soldier-swarm RTS in the
`swarm/` subdirectory. Three files at the repo root are the v2
plan of record:

- **`port.md`** — what v2 is, what's in scope, what's hard-cut.
  If a system isn't here, it doesn't belong in v2 yet.
- **`lessons.md`** — 12 lessons distilled from v1, each anchored
  in a concrete v1 incident. The guardrails for the rebuild.
- **`v2.me`** — running changelog of v2 work. Read for the most
  recent state.

**EVERY SESSION, before doing anything else: read `port.md`,
`lessons.md`, and `v2.me`.** Then read the most recent
`dev_log/` entries (see next section) for the diary. Skipping
either step means re-deriving (or contradicting) work that's
already done.

**Mantra:** start incrementally — nail one aspect before moving
to the next. Ask LOTS of clarifying questions before assuming.
Full v2-specific rules in `swarm/CLAUDE.md` (auto-loaded when
working inside `swarm/`).

v1 (the existing pixel-territory game in `shared/` + `client/`)
is preserved as reference. It still ships at
https://armandoxh.github.io/Territorygame/. v2 ships at
https://armandoxh.github.io/Territorygame/swarm/. The rest of
this file documents v1 conventions, kept for any one-off v1 fix
that comes up.

---

## Session start: read the dev log

Before doing anything else, list `dev_log/` and read the most recent
file (filename format `m-d-yyyy.txt`). Read 2-3 of the most recent if
present — they capture WHAT changed and WHY, so you don't repeat past
mistakes or undo recent design decisions.

After completing meaningful work in a session, append a new entry to
the day's file (or create it if it's the first session of the day).
Each entry is one short paragraph: WHAT changed (a commit hash or
brief description) and WHY (the user-facing problem it addresses).
Concise — future Claude needs the rationale, not the diff.

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
