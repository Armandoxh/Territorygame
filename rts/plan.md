# rts/ — plan of record

A third, separate game in this repo: a **classic medieval base-builder
RTS** (Age of Empires / Warcraft feel), mobile-first. Not v1, not
swarm (v2) — it shares no code with either.

Decided with the user 2026-09-25:

- **Genre:** classic base-builder — gather, build, train, (later) fight.
- **Theme:** medieval. Peasants, Town Hall, wood + gold.
- **Platform:** mobile-first web (360×740 is the test viewport),
  deployed to GitHub Pages at `/Territorygame/rts/`.
- **Location:** standalone `rts/` folder, own `package.json`, builds to
  `../docs/rts/`. Stack: Vite + TypeScript + Pixi 8, nothing else.

## Milestone 1 — economy only (current)

No combat, no enemies. Prove that gathering and building feel good on a phone.

- 48×48 tile map: grass, lakes, forests, 3 gold mines (one near start).
- Town Hall + 3 peasants at start. 100 wood, 150 gold.
- Peasants gather wood (trees deplete) and gold (mines deplete), carry
  10 per trip to the nearest drop-off, and loop automatically. When a
  tree runs out they move on to the next nearest one.
- Buildings: **House** (60 wood, +5 pop), **Lumber Mill** (80 wood, wood
  drop-off). Town Hall trains peasants (50 gold, 10 s, queue of 5).
- Population cap from Town Hall (5) + houses.

### Input model (one visible expectation at a time)

The bottom panel always says what the next tap does.

- Drag = pan, pinch / wheel = zoom.
- Tap peasant → select it. HUD buttons: "Idle peasants", "All peasants".
- With peasants selected: tap tree / mine = gather, construction site =
  help build, ground = move. ✕ deselects.
- Tap building → select it (Town Hall shows Train).
- Build: pick a building in the panel → a ghost appears at screen centre
  → tap the map to move it (green = ok, red = blocked) → ✓ Build here.

## Not yet (ask before adding)

Combat, enemy AI, military units / barracks, fog of war, more resources
(food, stone), unit collision, multi-select by drag, win condition,
save/load, sound, sprite art (all shapes are drawn in code for now).
