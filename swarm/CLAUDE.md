# swarm/ — v2 of Territorygame

## Mantra

**Start incrementally. Nail one aspect before moving to the next.**

This is the rebuild's only non-negotiable rule. v1 died from
shipping three half-finished pivots on top of each other. v2
ships one thing at a time, and that thing is *done* before the
next thing starts.

What "done" means:
- It works on phone (target viewport: 360×740).
- It does not have a "TODO: come back to this" attached.
- The dev_log + `v2.me` have an entry for it.
- The user has seen it and given a thumbs-up.

If you're tempted to add the next thing before the current thing
is done, **stop and re-read this section.**

## Ask a LOT of clarifying questions

Before writing code, ask. Before changing scope, ask. Before
making a design call that isn't explicitly covered in
`../port.md`, ask. The cost of asking is one round-trip; the
cost of guessing wrong is a rebuild (see lessons #3 and #4 in
`../lessons.md`).

Use the `AskUserQuestion` tool when there are 2-4 distinct
choices. Ask in plain English when it's open-ended. **Bias
heavily toward asking.** "I'll just guess and we can change it
later" is exactly how v1 ended up where it did.

## v2 docs — read these first every session

- `../port.md` — plan of record. New game spec. Hard cuts. What
  we're building. If a system isn't in `port.md`, it doesn't
  belong in v2 yet.
- `../lessons.md` — 12 lessons from v1, each anchored in a
  concrete v1 incident. The guardrails.
- `../v2.me` — running changelog of v2 work. Append after every
  meaningful change. WHAT + WHY, kept short.

## Conventions

Most conventions (dev_log format inside `swarm/`, code style,
build commands, mobile testing flow) are *not* pre-decided. They
get added to this file as we hit each decision and the user
makes the call. Per the mantra: nail one aspect before moving on.
