#!/usr/bin/env python3
"""Design rig v2: the 240x240 metropolis. Same geometry/constants as the
Flutter painter; screenshot + eyeball before porting numbers to Dart."""
import subprocess, pathlib

WORLD = 240
S = 4.0  # px per map unit -> 960px render
W = H = int(WORLD * S)

LINE_W = 2.2
LOCK_W = 1.15
LOCK_DASH, LOCK_GAP = 3.8, 2.4
DOT_R = 1.9
DOT_RING = 0.55
INT_R = 2.4
INT_RING = 0.7
INT_INNER_R = 1.1
INT_INNER_RING = 0.5
LOCK_DOT_R = 0.75
TRAIN_R = 2.6
LABEL_F = 2.9
PLATE_F = 2.6
DISTRICT_F = 9.0
WATER_F = 4.5

INK = '#1A1A1A'
GROUND = '#BDD3E8'
LAND = '#FAF9F6'
WATER_TXT = '#6E93AC'
PARK = '#CBE2C6'

# (x, y, name, labelDx, labelDy, mockWaiting)
stations = {
  'battery':  (36, 228, 'Battery Pt',   0, 0, 0),
  'harbor':   (36, 204, 'Harbor Yards', 2.5, 4.2, 3),
  'brookside':(65, 175, 'Brookside',    0, 0, 2),
  'union':    (96, 144, 'Union Square', -9, 4.5, 15),
  'grand':    (144, 144, 'Grand Terminal', 13, -6.5, 4),
  'cityhall': (144, 113, 'City Hall',  -8.5, 4.5, 5),
  'museum':   (144, 84, 'Museum Mile', -9.5, 0, 0),
  'highridge':(168, 60, 'High Ridge',  -3, 0, 0),
  'northgate':(192, 36, 'Northgate',   0, 0, 30),
  'ironhills':(204, 24, 'Iron Hills',  9, 0, 0),
  'palisade': (216, 12, 'Palisade',    0, 4.2, 1),
  'southport':(96, 216, 'Southport',  10, -4.5, 0),
  'ferryst':  (96, 180, 'Ferry St',   -7, 0, 0),
  'westgate': (77, 125, 'Westgate',   -7, 0, 0),
  'midwest':  (60, 108, 'Midtown West', -8, 4.5, 0),
  'cathedral':(60, 60, 'Cathedral',    0, 0, 0),
  'airport':  (96, 24, 'Airport',      0, 0, 0),
  'boardwalk':(96, 228, 'Boardwalk',   0, 0, 0),
  'cargocity':(120, 24, 'Cargo City',  9, 0, 0),
  'eastdocks':(216, 180, 'East Docks', 0, 0, 0),
  'riverbend':(198, 162, 'Riverbend',  0, 0, 0),
  'gaslight': (180, 144, 'Gaslight Qtr', 3, 4.5, 0),
  'oldtown':  (108, 108, 'Old Town',   0, 0, 0),
  'garment':  (108, 72, 'Garment Dist', -8, 0, 0),
  'stadium':  (108, 48, 'Stadium',     0, 0, 0),
  'expo':     (108, 24, 'Expo Park',  -9, 0, 0),
}
lines = [
  ('1', '#EE352E', ['battery','harbor','brookside','union','grand','cityhall',
                    'museum','highridge','northgate','ironhills','palisade'], True, None),
  ('A', '#0039A6', ['boardwalk','southport','ferryst','union','westgate',
                    'midwest','cathedral','airport','cargocity'], False, (31, 84, 'A · $4,000')),
  ('7', '#B933AD', ['eastdocks','riverbend','gaslight','grand','oldtown',
                    'garment','stadium','expo'], False, (166, 184, '7 · $40,000')),
]
land = [(19,0),(221,0),(240,19),(240,221),(221,240),(19,240),(0,221),(0,19)]
districts = [('HARBORSIDE',65,158),('EASTBANK',190,125),('NORTH HEIGHTS',160,18)]
waters = [
  [(0,132),(14,149),(14,178),(29,197),(29,240),(0,240)],
  [(240,115),(223,134),(221,168),(228,206),(240,221)],
  [(216,0),(240,0),(240,24)],
  [(0,0),(38,0),(0,38)],
]
parks = [(120,175,26,14,7),(34,38,14,19,5),(82,72,17,10,-4),(199,101,15,12,11)]
water_labels = [('MERIDIAN\nHARBOR', 15, 208, 0), ('EAST RIVER', 232, 182, -90)]

def px(v): return v * S
def pt(x, y): return f"{px(x):.1f},{px(y):.1f}"

svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
       f'style="background:{GROUND};font-family:Inter,Helvetica,Arial,sans-serif">']
land_pts = " ".join(pt(x,y) for x,y in land)
svg.append(f'<polygon points="{land_pts}" fill="{LAND}" stroke="{LAND}" '
           f'stroke-width="{px(3)}" stroke-linejoin="round"/>')
for name, dx_, dy_ in districts:
    svg.append(f'<text x="{px(dx_)}" y="{px(dy_)}" text-anchor="middle" fill="#CDCDCD" '
               f'font-size="{px(DISTRICT_F)}" font-weight="800" letter-spacing="3">{name}</text>')
for poly in waters:
    svg.append(f'<polygon points="{" ".join(pt(x,y) for x,y in poly)}" fill="{GROUND}"/>')
for text, wx, wy, rot in water_labels:
    lines_ = text.split('\n')
    t = "".join(f'<tspan x="{px(wx)}" dy="{px(WATER_F) if i else 0}">{l}</tspan>'
                for i, l in enumerate(lines_))
    svg.append(f'<text x="{px(wx)}" y="{px(wy)}" fill="{WATER_TXT}" font-size="{px(WATER_F)}" '
               f'font-weight="700" letter-spacing="1.5" text-anchor="middle" '
               f'transform="rotate({rot} {px(wx)} {px(wy)})">{t}</text>')
for cx, cy, w, h, rot in parks:
    svg.append(f'<rect x="{px(cx-w/2)}" y="{px(cy-h/2)}" width="{px(w)}" height="{px(h)}" '
               f'fill="{PARK}" transform="rotate({rot} {px(cx)} {px(cy)})"/>')
for bullet, color, ids, unlocked, plate in lines:
    if unlocked:
        continue
    ptsd = " ".join(pt(*stations[i][:2]) for i in ids)
    svg.append(f'<polyline points="{ptsd}" fill="none" stroke="#D2D2D2" '
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
    for end, prev in ((ids[0], ids[1]), (ids[-1], ids[-2])):
        ex, ey = stations[end][:2]; pxx, pyy = stations[prev][:2]
        dx_, dy_ = ex - pxx, ey - pyy
        n = (dx_**2 + dy_**2) ** 0.5
        bx_, by_ = ex + dx_/n*5, ey + dy_/n*5
        svg.append(f'<circle cx="{px(bx_)}" cy="{px(by_)}" r="{px(1.7)}" fill="{color}"/>')
        svg.append(f'<text x="{px(bx_)}" y="{px(by_+0.72)}" text-anchor="middle" fill="#fff" '
                   f'font-size="{px(2.0)}" font-weight="900">{bullet}</text>')
for bullet, color, ids, unlocked, plate in lines:
    if unlocked or not plate:
        continue
    x, y, label = plate
    w, h = px(len(label)*PLATE_F*0.62 + 3), px(PLATE_F + 2.2)
    svg.append(f'<rect x="{px(x)-w/2}" y="{px(y)-h/2}" width="{w}" height="{h}" fill="#fff" stroke="{INK}" stroke-width="1"/>')
    svg.append(f'<text x="{px(x)}" y="{px(y)+px(PLATE_F)*0.36}" fill="{INK}" text-anchor="middle" '
               f'font-size="{px(PLATE_F)}" font-weight="800">{label}</text>')
served = set(lines[0][2])
for sid, (x, y, name, ldx, ldy, waiting) in stations.items():
    if sid not in served:
        continue
    inter = sid == 'grand'
    full = waiting >= 30
    if waiting == 0 and not inter:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(0.85)}" fill="{INK}"/>')
    else:
        r = INT_R if inter else DOT_R
        ringc = '#C62828' if full else INK
        ringw = 0.85 if full else (INT_RING if inter else DOT_RING)
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(r)}" fill="#fff" stroke="{ringc}" stroke-width="{px(ringw)}"/>')
        if waiting > 0:
            fs = 2.1 if waiting < 10 else 1.7
            txtc = '#C62828' if full else INK
            svg.append(f'<text x="{px(x)}" y="{px(y+fs*0.36)}" text-anchor="middle" fill="{txtc}" '
                       f'font-size="{px(fs)}" font-weight="900">{waiting}</text>')
    if ldy > 0: ty = y + ldy + LABEL_F*0.8
    elif ldy < 0: ty = y + ldy
    else:
        ty = y - 3.2 if y > WORLD*0.88 else y + 3.2 + LABEL_F*0.8
    svg.append(f'<text x="{px(x+ldx)}" y="{px(ty)}" text-anchor="middle" font-size="{px(LABEL_F)}" '
               f'font-weight="700" fill="{INK}" stroke="#fff" stroke-width="3" paint-order="stroke">{name}</text>')
for tx, ty in [(144,144),(65,175)]:
    svg.append(f'<circle cx="{px(tx)}" cy="{px(ty)}" r="{px(TRAIN_R)}" fill="#EE352E" stroke="#fff" stroke-width="{px(0.5)}"/>')
    svg.append(f'<text x="{px(tx)}" y="{px(ty)+px(TRAIN_R)*0.42}" text-anchor="middle" fill="#fff" '
               f'font-size="{px(TRAIN_R*1.15)}" font-weight="900">1</text>')
svg.append('</svg>')

out = pathlib.Path(__file__).parent
(out / 'mapmock.html').write_text('<!doctype html><body style="margin:0">' + "\n".join(svg))
r = subprocess.run(['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '--headless=new',
                    '--no-sandbox', '--disable-gpu', f'--window-size={W},{H+40}',
                    f'--screenshot={out}/mapmock.png', f'file://{out}/mapmock.html'],
                   capture_output=True, text=True, timeout=60)
print(r.returncode, r.stderr[-200:] if r.returncode else 'OK')
