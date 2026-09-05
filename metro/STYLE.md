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
- **Background landmass:** flat ultra-light off-white **#F4F4F4** (dark mode:
  flat #1A1A1A). Water: one solid, textureless flat color — **#BFD7E4**, with
  water labels in **#6E93AC**. Parks: flat **#CBE2C6**. No textures, no
  gradients, no grid overlays.
- **Typography:** heavy Swiss neo-grotesque only. Inter (via google_fonts) is
  the free Helvetica stand-in. Station labels sharp, highly legible, adjacent
  to their dots, never overlapping lines.

## 3. Station markers & UI
- **Local station:** solid crisp white circle, thin black border.
- **Express/interchange:** larger **concentric circles** (or elongated pill
  when two dots merge), mirroring the real digital map.
- **UI is a data overlay, not a game menu:** razor-thin 1px borders, **sharp
  0-radius square corners**, flat white panels, minimalist text rows. No
  drop shadows, no rounded cards, no emoji clutter in data rows.
- **Upgrade feedback:** clean geometric rings or numerical increments that
  scale linearly. No cartoony bounce, no sparkles.

## 4. Train movement ("live tracker")
- Trains are **solid circles/pills in the line color containing the bold
  white route letter** (ink letter on light colors like #FCCC0A).
- Motion is smooth interpolation along the vector path: constant linear
  velocity, crisp stops at stations. No stutter, no sway.

## 5. Locked proportions (map units; changed only via the design rig)
- Active line stroke **2.2** · locked line **1.15** dashed 3.8/2.4 in #D2D2D2.
- Local dot r **1.6**, ring 0.55 · interchange r **2.4** ring 0.7 + inner
  ring r 1.1 · locked-line stop: solid #BDBDBD dot r 0.75.
- Train circle r **2.6**, white ring 0.5, route letter ≈1.15×r.
- Labels 2.9 (white halo) · badges 2.0 hugging the dot · plates hand-placed
  per line (LineDef.plateX/Y), never at the path midpoint.
- **Process rule:** iterate any map-visual change in `tools/mapmock.py`
  (renders the same geometry to SVG + headless-Chromium screenshot) and
  LOOK at it before touching the Flutter painter. No more designing blind.

## 6. Assets & effects policy
- This game is **100% vector, code-drawn** — that is the premium look; no
  bitmap asset packs needed. If an environment feature ever demands more
  (water sim, fog), integrate a reputable open-source package rather than
  hand-rolling shaders.
- Any decorative variation (future landmass shapes, park blocks) follows
  **asymmetrical variation**: no two elements share identical rotation,
  scale, and spacing.
