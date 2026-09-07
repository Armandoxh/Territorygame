# Metro Magnate — STYLE.md (visual law)

This file is authoritative for every pixel. Read it before touching any
visual. HUD/dashboard changes follow the language below; MAP GEOMETRY
changes go through the Approval Gate.

## THE APPROVAL GATE (hard rule)

The player approves the design-rig render **before** any map-geometry
change is committed or deployed. Render in the rig → send SVG/PNG →
wait for explicit approval → emit to Dart. No exceptions.

- Rigs: `tools/meridian_xl.py` (New Meridian XL), `tools/angelbay.py`
  (Angel Bay), `tools/mapmock.py` (the original core, historical).
- `lib/data/cities.dart` is GENERATED from rig data. Never hand-edit
  coordinates; change the rig, re-approve, re-emit.
- Rigs mechanically assert the approved rules: 45°-only bends (no 90°
  turns), ≥6 stops per line, ≤3 shared stops per line pair (drawn
  side-by-side on lane offsets), unique color per line, minimum station
  spacing, stations on land.

## Approved networks

- **New Meridian XL** — player-approved 2026-09-07: 520-unit world,
  24 lines, 162 stations, 28 interchanges. The original 300-unit core
  (approved 2026-09-05) sits offset +110 as downtown, grandfathered
  verbatim; boroughs: Westbank, Northgate, Long Haven, Eastport,
  South Shore, Meridian island, around a bay with a bridge line.
- **Angel Bay** — player-approved 2026-09-07: 300-unit world, 9 lines,
  59 stations; bay + Presidio peninsula + Isla Chica island tunnel.

## The rendering language (modern NYC Live Subway Map dashboard)

- **Geography:** water #BDD3E8 frames near-white #FAF9F6 land polygons
  (45°-cornered, softened by a same-color fat round-join stroke); park
  blocks #CBE2C6; big soft district names (#CDCDCD–#D4D4D4) UNDER the
  network; water labels #6E93AC.
- **Lines:** solid 2.2-unit round-cap strokes in the line's unique hex;
  locked lines #D2D2D2 dashed (3.8/2.4) with a white price plate
  (1px ink border) at hand-placed plate coordinates; shared segments fan
  onto lane offsets (gap 3.2); terminal route bullets r1.6 extended 4.5
  past each end.
- **Stations:** quiet local = solid ink dot r0.85; waiting riders
  inflate to a white circle (r1.9 local / r2.4 interchange) with the
  `up/down` counts inside (single number at a line's end); full station
  = red ring + red numbers; interchange at rest = white dot + ink ring.
  Labels: Inter w700 at 2.9 map units with a white halo, side-anchored
  per StationDef.labelSide.
- **Trains:** solid line-color circles r2.6 with the bold route letter,
  riding their segment lane. Boarding feedback: expanding geometric ring
  + `N× +$` rising text. No bounce, no sparkle, no cartoon effects.
- **Type:** Inter (the Helvetica stand-in), heavy weights, tracked-out
  small caps for signage. True map-unit sizes — the map is a top-down
  document that rewards zooming, not a scaled screen overlay.
- **HUD:** data-overlay language — black StationSign bars with the white
  top rule, flat white DataPanels with 1px hairline borders, square
  corners everywhere, no shadows. Route bullets are the only circles.
- **Ink:** #1A1A1A. Ground behind HUD: #F4F4F4.

## Process

1. All visual iteration happens in the rig, by eye, against headless-
   Chromium screenshots — never blind in Dart.
2. The balance harness (`test/economy_test.dart`) enforces the approved
   SHAPE rules as tests on every city, every push.
3. Bump the build number on every deployed change (see CLAUDE.md).
