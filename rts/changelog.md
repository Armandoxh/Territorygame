# rts/ changelog

One entry per change: WHAT + WHY.

---

2026-09-25  Milestone 1: economy-only base-builder
  WHAT: New standalone project in rts/ (Vite + TS + Pixi 8) building
        to docs/rts/. Seeded map gen (lakes, forests, mines), A*
        pathfinding, peasants with gather → return → gather loops,
        construction sites, House / Lumber Mill, peasant training at
        the Town Hall, pop cap, touch pan / pinch / tap input, DOM HUD
        with a single context panel.
  WHY:  User asked for a new RTS game: a separate classic medieval
        base-builder, mobile-first, starting with only the economy.
  Note: startup is wrapped in an async boot() because top-level await in
        the entry chunk deadlocks against Pixi's lazy renderer chunks in
        the production build (the page loaded blank). `?seed=N` in the
        URL pins the map; `window.game` / `window.cam` are debug handles.
