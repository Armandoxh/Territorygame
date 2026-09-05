# Metro Magnate — MASTER STYLE SHEET (authoritative)

The game must read as a **premium, real-time transit data dashboard** in the
modern NYC Live Subway Map aesthetic — never as a generic "AI game." Every
element (map, UI, animation) must pass a consistency check against this sheet
before implementation. This file wins over taste, defaults, and old code.

## 1. Line geometry & vector rendering
- All transit lines are clean anti-aliased **vector paths at 0° / 45° / 90°
  only**. No organic curves, no random angles.
- Parallel routes sharing a corridor are **distinct, perfectly spaced parallel
  strokes** — colors never bleed or blend.
- **Live line states:** active lines solid and vibrant; locked/"maintenance"
  lines are a **semi-transparent light-gray dashed stroke**.

## 2. Color & typography
- **Official MTA hex colors** for lines: #EE352E (1/2/3), #0039A6 (A/C/E),
  #FF6319 (B/D/F/M), #B933AD (7), #FCCC0A (N/Q/R/W, ink text), #00933C
  (4/5/6), #6CBE45 (G), #A7A9AC (S).
- **Water frames the city** (flat **#BDD3E8**); the landmass floats on it as
  near-white **#FAF9F6** shapes with 45-degree corners softened by a fat
  round-join stroke. Water channels cut into the land; water labels in
  **#6E93AC**; parks flat **#CBE2C6**. Big district names (**#CDCDCD**, 4.0,
  w800) sit UNDER the network. No textures, no gradients, no grids.
- **Typography:** heavy Swiss neo-grotesque only. Inter (via google_fonts) is
  the free Helvetica stand-in. Station labels sharp, highly legible, adjacent
  to their dots, never overlapping lines.

## 3. Station markers & UI
- **Quiet local station:** a tiny solid ink dot (r 0.85) on the line — the
  real diagram's marker. A station holding riders inflates into the white
  circle with its count inside.
- **Express/interchange:** larger **concentric circles** (or elongated pill
  when two dots merge), mirroring the real digital map.
- **UI is a data overlay, not a game menu:** razor-thin 1px borders, **sharp
  0-radius square corners**, flat white panels, minimalist text rows. No
  drop shadows, no rounded cards, no emoji clutter in data rows.
- **Upgrade feedback:** clean geometric rings or numerical increments that
  scale linearly. No cartoony bounce, no sparkles.

- **Terminal bullets:** every unlocked line is capped past both ends with
  its route bullet (r 1.7, letter 2.0), like the printed diagram.

## 4. Train movement ("live tracker")
- Trains are **solid circles/pills in the line color containing the bold
  white route letter** (ink letter on light colors like #FCCC0A).
- Motion is smooth interpolation along the vector path: constant linear
  velocity, crisp stops at stations. No stutter, no sway.

## 5. Locked proportions (map units; changed only via the design rig)
- **The world is big**: New Meridian is a 240-unit metropolis. The map opens
  scale-to-fit (the whole diagram, tiny, top-down — like the printed map)
  and zooms to 10×. Type sizes are TRUE map units, never pixel-clamped, so
  zooming out is authentically small and zooming in is readable. District
  names 9.0, water labels 4.5.
- Active line stroke **2.2** · locked line **1.15** dashed 3.8/2.4 in #D2D2D2.
- Local dot r **1.9**, ring 0.55 · interchange r **2.4** ring 0.7 (+ inner
  ring r 1.1 only while empty) · locked-line stop: solid #BDBDBD dot r 0.75.
- **Waiting counts live INSIDE the station circle** (ink, w900; 2.1 for one
  digit / 1.7 for two). Full platform = **red ring + red number on white** —
  solid-color circles with numbers are trains and nothing else.
- Train circle r **2.6**, white ring 0.5, route letter ≈1.15×r.
- Labels 2.9 (white halo) · plates hand-placed
  per line (LineDef.plateX/Y), never at the path midpoint.
- **Process rule:** iterate any map-visual change in `tools/mapmock.py`
  (renders the same geometry to SVG + headless-Chromium screenshot) and
  LOOK at it before touching the Flutter painter. No more designing blind.
- **APPROVAL GATE (hard rule):** the rig's SVG render must be SENT TO THE
  PLAYER and EXPLICITLY APPROVED before any visual change is committed or
  deployed. Render -> send -> wait for approval -> only then port and push.
  No exceptions, no "just a small tweak".

## 6. Assets & effects policy
- This game is **100% vector, code-drawn** — that is the premium look; no
  bitmap asset packs needed. If an environment feature ever demands more
  (water sim, fog), integrate a reputable open-source package rather than
  hand-rolling shaders.
- Any decorative variation (future landmass shapes, park blocks) follows
  **asymmetrical variation**: no two elements share identical rotation,
  scale, and spacing.
