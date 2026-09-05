#!/usr/bin/env python3
"""Local design rig for the Metro Magnate map: renders the exact same
geometry/constants as the Flutter painter into SVG, so the look can be
iterated here (screenshot + eyeball) before porting numbers to Dart."""
import math, subprocess, sys, pathlib

S = 8.6  # px per map unit (~phone map width 860px at 2x)
W = H = int(100 * S)

# ---- Tunable style constants (the things being designed) ----
LINE_W = 2.2          # was 4.5 — 'toddler crayon'
LOCK_W = 1.15
LOCK_DASH, LOCK_GAP = 3.8, 2.4
DOT_R = 1.6           # was 3.0
DOT_RING = 0.55
INT_R = 2.4           # interchange outer
INT_RING = 0.7
INT_INNER_R = 1.1
INT_INNER_RING = 0.5
LOCK_DOT_R = 0.75
TRAIN_R = 2.6
LABEL_F = 2.9
BADGE_F = 2.0
PLATE_F = 2.6

INK = '#1A1A1A'
GROUND = '#F4F4F4'
WATER = '#BFD7E4'
WATER_TXT = '#6E93AC'
PARK = '#CBE2C6'

stations = {
  'harbor':   (15, 85, 'Harbor Yards', 2.5, 4.2,  3),
  'union':    (40, 60, 'Union Square', -9,  4.5, 15),
  'grand':    (60, 60, 'Grand Terminal', 13, -6.5, 4),
  'museum':   (60, 35, 'Museum Mile', -9.5, 0,  2),
  'northgate':(80, 15, 'Northgate',    0,  0,   30),
  'southport':(40, 90, 'Southport',   10, -4.5, 0),
  'midwest':  (25, 45, 'Midtown West',-8,  4.5, 0),
  'cathedral':(25, 25, 'Cathedral',    0,  0,   0),
  'airport':  (40, 10, 'Airport',      0,  0,   0),
  'eastdocks':(90, 75, 'East Docks',   0,  0,   0),
  'gaslight': (75, 60, 'Gaslight Qtr', 3,  4.5, 0),
  'oldtown':  (45, 45, 'Old Town',     0,  0,   0),
  'stadium':  (45, 20, 'Stadium',      0,  0,   0),
}
lines = [
  ('1', '#EE352E', ['harbor','union','grand','museum','northgate'], True,  None),
  ('A', '#0039A6', ['southport','union','midwest','cathedral','airport'], False, (13, 35, 'A · $4,000')),
  ('7', '#B933AD', ['eastdocks','gaslight','grand','oldtown','stadium'], False, (69, 76.5, '7 · $40,000')),
]
waters = [
  [(0,60),(6,66),(10,76),(12,86),(13,96),(13,100),(0,100)],
  [(100,58),(95,64),(93,76),(96,90),(100,94)],
  [(86,0),(100,0),(100,14)],
]
parks = [(50,73,15,8,7),(14,16,8,11,5),(34,30,10,6,-4),(83,42,9,7,11)]

def px(v): return v * S
def pt(x, y): return f"{px(x):.1f},{px(y):.1f}"

svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
       f'style="background:{GROUND};font-family:Inter,Helvetica,Arial,sans-serif">']
# water
for poly in waters:
    svg.append(f'<polygon points="{" ".join(pt(x,y) for x,y in poly)}" fill="{WATER}"/>')
svg.append(f'<text x="{px(8)}" y="{px(95)}" fill="{WATER_TXT}" font-size="{px(2.2)}" '
           f'font-weight="700" letter-spacing="1.5">MERIDIAN HARBOR</text>')
svg.append(f'<text x="{px(96.6)}" y="{px(76)}" fill="{WATER_TXT}" font-size="{px(2.2)}" '
           f'font-weight="700" letter-spacing="1.5" transform="rotate(-90 {px(96.6)} {px(76)})" '
           f'text-anchor="middle">EAST RIVER</text>')
# parks
for cx, cy, w, h, rot in parks:
    svg.append(f'<rect x="{px(cx-w/2)}" y="{px(cy-h/2)}" width="{px(w)}" height="{px(h)}" '
               f'fill="{PARK}" transform="rotate({rot} {px(cx)} {px(cy)})"/>')
# locked lines under, solid on top
for bullet, color, ids, unlocked, plate in lines:
    ptsd = " ".join(pt(*stations[i][:2]) for i in ids)
    if unlocked:
        continue
    svg.append(f'<polyline points="{ptsd}" fill="none" stroke="#D2D2D2" stroke-opacity="1" '
               f'stroke-width="{px(LOCK_W)}" stroke-dasharray="{px(LOCK_DASH)} {px(LOCK_GAP)}"/>')
    for i in ids:
        x, y = stations[i][:2]
        if i in ('union','grand'):
            continue
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(LOCK_DOT_R)}" fill="#BDBDBD"/>')
for bullet, color, ids, unlocked, plate in lines:
    if not unlocked:
        continue
    ptsd = " ".join(pt(*stations[i][:2]) for i in ids)
    svg.append(f'<polyline points="{ptsd}" fill="none" stroke="{color}" '
               f'stroke-width="{px(LINE_W)}" stroke-linecap="round" stroke-linejoin="round"/>')
# price plates (fixed positions from data, away from the network)
for bullet, color, ids, unlocked, plate in lines:
    if unlocked or not plate:
        continue
    x, y, label = plate
    w, h = px(len(label)*PLATE_F*0.62 + 3), px(PLATE_F + 2.2)
    svg.append(f'<rect x="{px(x)-w/2}" y="{px(y)-h/2}" width="{w}" height="{h}" fill="#fff" '
               f'stroke="{INK}" stroke-width="1"/>')
    svg.append(f'<text x="{px(x)}" y="{px(y)+px(PLATE_F)*0.36}" fill="{INK}" text-anchor="middle" '
               f'font-size="{px(PLATE_F)}" font-weight="800">{label}</text>')
# stations, labels, badges
served = {'harbor','union','grand','museum','northgate'}
for sid, (x, y, name, ldx, ldy, waiting) in stations.items():
    if sid not in served:
        continue
    inter = sid in ('union','grand') and False  # only with A/7 unlocked; mock line1 only
    if sid == 'grand':
        inter = False
    if inter:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(INT_R)}" fill="#fff" stroke="{INK}" stroke-width="{px(INT_RING)}"/>')
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(INT_INNER_R)}" fill="none" stroke="{INK}" stroke-width="{px(INT_INNER_RING)}"/>')
    else:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(DOT_R)}" fill="#fff" stroke="{INK}" stroke-width="{px(DOT_RING)}"/>')
    # label
    if ldy > 0: ty = y + ldy + LABEL_F*0.8
    elif ldy < 0: ty = y + ldy
    else:
        ty = y - 3.2 if y > 75 else y + 3.2 + LABEL_F*0.8
    svg.append(f'<text x="{px(x+ldx)}" y="{px(ty)}" text-anchor="middle" font-size="{px(LABEL_F)}" '
               f'font-weight="700" fill="{INK}" stroke="#fff" stroke-width="4" paint-order="stroke">{name}</text>')
    # waiting badge
    if waiting > 0:
        full = waiting >= 30
        bw, bh = px(BADGE_F*0.62*len(str(waiting)) + 1.6), px(BADGE_F + 0.9)
        bx, by = px(x + DOT_R + 0.5), px(y - DOT_R - 0.4) - bh
        col = '#C62828' if full else '#555'
        svg.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="{bh/2}" fill="{col}"/>')
        svg.append(f'<text x="{bx+bw/2}" y="{by+bh*0.74}" text-anchor="middle" fill="#fff" '
                   f'font-size="{px(BADGE_F)}" font-weight="800">{waiting}</text>')
# train at grand with bullet
tx, ty = 60, 60
svg.append(f'<circle cx="{px(tx)}" cy="{px(ty)}" r="{px(TRAIN_R)}" fill="#EE352E" stroke="#fff" stroke-width="{px(0.5)}"/>')
svg.append(f'<text x="{px(tx)}" y="{px(ty)+px(TRAIN_R)*0.42}" text-anchor="middle" fill="#fff" '
           f'font-size="{px(TRAIN_R*1.15)}" font-weight="900">1</text>')
# second train mid-segment harbor->union
mx, my = 27.5, 72.5
svg.append(f'<circle cx="{px(mx)}" cy="{px(my)}" r="{px(TRAIN_R)}" fill="#EE352E" stroke="#fff" stroke-width="{px(0.5)}"/>')
svg.append(f'<text x="{px(mx)}" y="{px(my)+px(TRAIN_R)*0.42}" text-anchor="middle" fill="#fff" '
           f'font-size="{px(TRAIN_R*1.15)}" font-weight="900">1</text>')
# corner plate bottom-right
svg.append(f'<rect x="{W-px(30)}" y="{H-px(7.5)}" width="{px(27)}" height="{px(5)}" fill="{INK}"/>')
svg.append(f'<circle cx="{W-px(27)}" cy="{H-px(5)}" r="{px(1.7)}" fill="#EE352E"/>')
svg.append(f'<text x="{W-px(27)}" y="{H-px(4.3)}" text-anchor="middle" fill="#fff" font-size="{px(1.9)}" font-weight="900">1</text>')
svg.append(f'<text x="{W-px(24.2)}" y="{H-px(4.2)}" fill="#fff" font-size="{px(2.2)}" font-weight="800" letter-spacing="1">New Meridian Transit</text>')
svg.append('</svg>')

out = pathlib.Path(__file__).parent
(out / 'mapmock.html').write_text('<!doctype html><body style="margin:0">' + "\n".join(svg))
r = subprocess.run(['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '--headless=new',
                    '--no-sandbox', '--disable-gpu', f'--window-size={W},{H}',
                    f'--screenshot={out}/mapmock.png', f'file://{out}/mapmock.html'],
                   capture_output=True, text=True, timeout=60)
print(r.returncode, r.stderr[-300:] if r.returncode else 'OK')
