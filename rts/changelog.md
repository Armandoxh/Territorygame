# rts/ changelog

One entry per change: WHAT + WHY.

---

2026-09-25  Isometric view + medieval HUD (stand-in art)
  WHAT: Renderer switched to isometric (2:1 diamonds, src/iso.ts). Sim is
        unchanged: still a square grid; only drawing and tap-picking
        project. Every tree / mine / building / peasant is its own
        display object in a depth-sorted container, so each can become a
        sprite independently. Taps resolve what is visibly hit first
        (peasant > building/mine silhouette > tree canopy > ground tile).
        New code-drawn art: pines + broadleaf trees, beaches, raised map
        slab, timber-framed buildings with hip roofs, rising construction
        sites, rock-mound gold mine, straw-hat peasants with walk cycle,
        tool swings and carried loads. HUD restyled as wood + gold-trim
        panels with inline SVG icons. New peasants now spawn on the
        camera-facing side of the hall.
  WHY:  User: "Graphics suck." Chose isometric / 2.5D using a free asset
        pack. kenney.nl is blocked by this environment's network policy,
        so this lands the isometric engine with stand-in art first; Kenney
        sprites replace the drawn objects once access is allowed.

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
