# Lessons from v1

A field guide written for whoever (Claude, future me) builds v2.
Each lesson is anchored in something concrete that happened in
this codebase. Ignore at your peril.

---

## 1. Visual style locks the engine

Going pixel-tile committed v1 to nearest-neighbor render at one
pixel per tile. Late-session attempts to soften the look
(`scaleMode: 'linear'`, thicker outlines) helped but couldn't
shake the staircase. Changing the visual identity after the engine
is built means fighting the engine.

**Rule for v2:** decide the look FIRST — smooth color, vector
borders, soldier sprites — then design the renderer around batched
sprite draw and vector strokes. Don't pick the engine and discover
the look.

---

## 2. One mode at a time, and the mode is visible

Hidden mode state (am I in bomb? op? ship? build?) was a UX
disaster. The persistent mode-bar (`#mode-bar`, commit f147be6)
fixed the symptom but only because we finally accepted that any
tap on the canvas needs a single, visible expectation.

**Rule for v2:** at any moment there is exactly ONE thing the next
tap can do, and the screen tells you what. Build the input model
this way from commit 1, not as a late retrofit.

---

## 3. Don't ship pivots without finishing them

The engine carries three half-finished pivots:

- Flood mode (legacy) — partly removed, partly load-bearing.
- Army-stack mode (ARMY_MODE flag) — half the code is gated on it.
- Vassal-army hybrid — third revision (a51395f) of armies-vs-flood
  semantics in three days.

Each was a real design change. None got a clean refactor pass to
delete the predecessor. Result: two-and-a-half overlapping models
in the same file.

**Rule for v2:** if a mechanic changes, the old code dies in the
same PR as the new code lands. No flags. No "we'll clean up
later." Later doesn't come.

---

## 4. Don't add System B before System A is fun

v1 grew decrees, commander trees, masteries, naval colonies, nukes,
and privateer raids before the basic move-troops-take-tile loop
felt good on phone. The new systems competed with the core loop
for attention (yours and the player's) and made the core feel
worse, not better.

**Rule for v2:** ship milestone 1 (capital + soldiers + claim +
win con) and play it. Only add the next system if the absence of
that system is what's keeping the game from being fun. If it's
fun without it, don't add it.

---

## 5. Mobile is the spec, not a port

The 5/8 dev_log is almost entirely "fix on mobile" — overflow,
cutoff close buttons, tap targets, font normalization. Every fix
was a bug that wouldn't have existed if mobile had been the
target from commit 1.

**Rule for v2:**
- Test viewport: 360×740 (small Android phone). If it works there
  it works everywhere.
- Tap targets ≥ 44×44 css px.
- Drag threshold ≥ 8px before "drag" fires (or trackpad scrolling
  fires false drags).
- Safe-area insets honored.
- No hover affordances.

---

## 6. Game logic lives in `shared/`, renderer is dumb

This is the one thing v1 mostly got right. `shared/` holds the
sim, `client/` renders it. Vassal AI, expansion, claim
bookkeeping all live in the engine.

**Rule for v2:** keep this discipline. Renderer reads sim state,
draws it, sends input intents back. No game decisions inside
draw.

---

## 7. All ownership goes through ONE function

`Game._claim` is the only thing allowed to flip a tile owner. All
of `_regionOwner` (strict 100%) and `_regionDominant` (>50%)
bookkeeping hangs off that function. Bypassing it
(`territory.claim` directly) silently breaks region totals.

**Rule for v2:** preserve this pattern from day 1. Single mutation
funnel for owner state. Region tallies updated only there.

---

## 8. Tunables in one file or they sprawl

`shared/src/config.ts` mostly held the line — when a magic number
needed tuning, it was usually in there. Where we cheated and
hardcoded (e.g. inside an aura BFS), tuning got painful.

**Rule for v2:** every number that affects play (radii, rates,
caps, costs) lives in `config.ts`. No exceptions. If a function
needs a constant for clarity that isn't a tunable, name it locally
but mark it.

---

## 9. Save / load early, or the game feels disposable

v1 had no persistence. Every refresh = new game. Players don't
invest in a 90-second match the same way they invest in a saved
campaign. By the time the game felt worth saving, save/load was a
big retrofit because the state shape kept shifting.

**Rule for v2:** as soon as the world is stable
(post-milestone-1), add `serialize()` / `deserialize()` to `Game`.
Localstorage save slot. Treat the state shape as a versioned
contract from then on.

---

## 10. Performance has a phone budget, not a desktop budget

384×384 grid at 30fps was the v1 ceiling and it took work to hold
it. Soldier sprites in v2 will be N × ~500 sprites per battlefield
— need `ParticleContainer` (batched draw, no per-sprite filters)
from the first commit, not as a late optimization.

**Rule for v2:** any layer that draws > 100 things uses a
batched / instanced path. Profile on phone, not on laptop.

---

## 11. Toasts are not state

Early v1 used "Army selected" / "Army deselected" toasts to
communicate state. Toasts are lossy (they fade), so the player who
glances at the screen 2 seconds later has no idea what's happening.
The mode-bar replaced them.

**Rule for v2:** persistent state goes in persistent UI. Toasts
are for events that happened (e.g. "Capital captured!") — never
for state that exists.

---

## 12. The dev_log is load-bearing

When something feels broken, the dev_log explains why it's that
way. Without it, every session re-litigates decisions made the
day before. The CLAUDE.md "read dev_log first" rule is the single
most useful instruction in this repo.

**Rule for v2:** carry the dev_log convention into the new repo.
One paragraph per meaningful change. WHAT + WHY. Future Claude
needs the rationale, not the diff.
