#!/usr/bin/env python3
"""Design rig: ANGEL BAY — city 2 of the ladder. 300x300 world. Distinct
silhouette from New Meridian: one mainland arcing around a big southwest
bay, a peninsula arm reaching into it, and an island mid-bay served by a
tunnel line. Same approved rules: 45-degree bends only, unique color per
line, shared corridors <= 3 stops drawn side-by-side, no line under 6
stops. Approve the render, then emit to Dart."""
import subprocess, pathlib

WORLD = 300
S = 3.2
W = H = int(WORLD * S)

LINE_W = 2.2
DOT_R = 1.9
INT_R = 2.4
INT_RING = 0.7
TRAIN_R = 2.6
LABEL_F = 2.9
DISTRICT_F = 9.0
WATER_F = 4.5

INK = '#1A1A1A'
GROUND = '#BDD3E8'
LAND = '#FAF9F6'
WATER_TXT = '#6E93AC'
PARK = '#CBE2C6'

# bullet: (color, path) — stops == path vertices, like the approved map.
services = {
  '1': ('#EE352E', [(16,132),(44,132),(68,156),(96,156),(120,180),(152,212),
                    (152,240),(176,264),(176,288)]),
  'B': ('#0039A6', [(16,40),(16,72),(16,104),(16,132),(16,204),(16,240),
                    (40,264)]),
  'K': ('#6CBE45', [(24,232),(48,232),(72,232),(104,232),(140,232),(172,232),
                    (196,232)]),
  '5': ('#00933C', [(60,40),(92,40),(124,40),(156,40),(188,40),(220,72),
                    (252,72),(284,104)]),
  'C': ('#FF6319', [(60,16),(60,40),(60,72),(60,104),(84,128),(112,128),
                    (112,156)]),
  'T': ('#FCCC0A', [(284,16),(284,48),(284,80),(284,104),(284,152),(260,176),
                    (236,176),(236,208),(236,240)]),
  'R': ('#B933AD', [(188,16),(188,40),(188,64),(188,96),(212,120),(212,152),
                    (236,176),(236,208),(236,240),(212,264)]),
  'W': ('#A7A9AC', [(176,288),(208,288),(240,288),(268,260),(268,228),
                    (268,196)]),
  '9': ('#996633', [(36,28),(36,60),(36,92),(36,124),(68,156),(96,156)]),
}
lands = [
  # Mainland: everything north and east of the bay coast.
  [(0,0),(300,0),(300,300),(168,300),(140,272),(140,208),(112,180),(64,180),
   (36,152),(0,152)],
  # The peninsula arm reaching into the bay.
  [(0,204),(44,204),(72,232),(72,252),(48,276),(0,276)],
  # Isla Chica, mid-bay.
  [(96,216),(114,216),(122,224),(122,240),(114,248),(96,248),(88,240),
   (88,224)],
]
districts = [('WESTHILL',48,84,-90),('UPTOWN',224,124,0),('BAY FLATS',216,270,0)]
water_labels = [('ANGEL BAY',64,194,0),('THE NARROWS',131,230,-90),
                ('PACIFIC REACH',64,292,0)]
parks = [(250,132,20,14,5),(84,60,12,16,-4),(160,84,10,8,6),
         (248,220,12,16,-7),(210,60,10,7,3)]

def sid(x, y): return f's{x}_{y}'

# Hand-named landmarks; the pool fills the rest.
named = {
  sid(16,132): 'Angel Pier',      # 1×B interchange on the west shore
  sid(16,204): 'Presidio',        # peninsula, over the tunnel
  sid(16,240): 'Fort Sur',
  sid(40,264): 'Lands End',
  sid(24,232): 'Ferry Landing',
  sid(48,232): 'Old Mission',
  sid(72,232): 'Punta Este',
  sid(104,232): 'Isla Chica',     # the island itself
  sid(140,232): 'Narrows East',
  sid(176,288): 'Boardwalk',      # 1×W interchange, south shore
  sid(120,180): 'Bayview',
  sid(152,212): 'Costa Bella',
  sid(68,156): 'Cannery Row',
  sid(96,156): 'Marina',
  sid(112,156): 'Fog Pt',
}
pool = iter(['Twin Rocks','Anchor St','Pelican Cove','Cliffside','Oak Knoll',
  'Laurel Cyn','Copper Gate','Union Depot','Grand Mesa','Roseland',
  'Falcon Ridge','Deer Park','Stonebridge','Palm Ct','Orchard','Silver Lake',
  'Echo Hts','Crescent','Windward','Salt Pt','Coral Way','Kings Rd','Verano',
  'La Cumbre','Estrella','Camino Alto','Puerto Sol','Solano','Alta Vista',
  'Seaglass','Tidewater','Pier Nine','Wharf End','El Dorado','Sunset Clfs',
  'Gaviota','Miramar','Los Robles','Cortez','Halcyon','Rincon','Sea Cliff',
  'Junipero','Terraza','Del Rey','Chaparral','Buena Vista','Mission Sq',
  'Vista Verde','Cedar Hts','Dune Pk','Meadowbrook','Kelp Cove','Sandpiper',
  'Cape Rey','Vaquero'])
stations = {}
for b in services:
    col, path = services[b]
    for (x, y) in path:
        k = sid(x, y)
        if k in stations: continue
        stations[k] = (x, y, named.get(k) or next(pool))
use = {}
for b in services:
    col, path = services[b]
    for (x, y) in set(path): use.setdefault(sid(x, y), set()).add(b)

seg_use = {}
def segkey(a, b): return tuple(sorted([a, b]))
for b in services:
    col, path = services[b]
    for i in range(len(path)-1):
        seg_use.setdefault(segkey(path[i], path[i+1]), []).append(b)
for k in seg_use: seg_use[k].sort()

# sanity: 45-degree rule + corridor rule
for b, (col, path) in services.items():
    for i in range(len(path)-1):
        dx = abs(path[i+1][0]-path[i][0]); dy = abs(path[i+1][1]-path[i][1])
        assert dx == 0 or dy == 0 or dx == dy, f'{b} seg {i}: {dx},{dy}'
for a in services:
    for b in services:
        if a >= b: continue
        shared = len({p for p in services[a][1]} & {p for p in services[b][1]})
        assert shared <= 3, f'{a}/{b} share {shared} stops'

def px(v): return v * S
def pt(x, y): return f"{px(x):.1f},{px(y):.1f}"

svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
       f'style="background:{GROUND};font-family:Inter,Helvetica,Arial,sans-serif">']
for land in lands:
    lp = " ".join(pt(x, y) for x, y in land)
    svg.append(f'<polygon points="{lp}" fill="{LAND}" stroke="{LAND}" '
               f'stroke-width="{px(3)}" stroke-linejoin="round"/>')
for name, dx_, dy_, rot in districts:
    svg.append(f'<text x="{px(dx_)}" y="{px(dy_)}" text-anchor="middle" fill="#D4D4D4" '
               f'font-size="{px(DISTRICT_F)}" font-weight="800" letter-spacing="3" '
               f'transform="rotate({rot} {px(dx_)} {px(dy_)})">{name}</text>')
for text, wx, wy, rot in water_labels:
    svg.append(f'<text x="{px(wx)}" y="{px(wy)}" fill="{WATER_TXT}" font-size="{px(WATER_F)}" '
               f'font-weight="700" letter-spacing="1.5" text-anchor="middle" '
               f'transform="rotate({rot} {px(wx)} {px(wy)})">{text}</text>')
for cx, cy, w, h, rot in parks:
    svg.append(f'<rect x="{px(cx-w/2)}" y="{px(cy-h/2)}" width="{px(w)}" height="{px(h)}" '
               f'fill="{PARK}" transform="rotate({rot} {px(cx)} {px(cy)})"/>')

LANE = 3.2
def draw_service(b):
    col, path = services[b]
    for i in range(len(path)-1):
        a, c = path[i], path[i+1]
        users = seg_use[segkey(a, c)]
        n = len(users); idx = users.index(b)
        off = (idx - (n-1)/2) * LANE
        dx_, dy_ = c[0]-a[0], c[1]-a[1]
        ln = (dx_*dx_+dy_*dy_) ** 0.5 or 1
        ox, oy = -dy_/ln*off, dx_/ln*off
        svg.append(f'<line x1="{px(a[0]+ox)}" y1="{px(a[1]+oy)}" '
                   f'x2="{px(c[0]+ox)}" y2="{px(c[1]+oy)}" stroke="{col}" '
                   f'stroke-width="{px(LINE_W)}" stroke-linecap="round"/>')
    for endi, previ in ((0, 1), (-1, -2)):
        ex, ey = path[endi]; pxx, pyy = path[previ]
        dx_, dy_ = ex-pxx, ey-pyy
        ln = (dx_*dx_+dy_*dy_) ** 0.5 or 1
        bx_, by_ = ex+dx_/ln*4.5, ey+dy_/ln*4.5
        dark = col == '#FCCC0A'
        svg.append(f'<circle cx="{px(bx_)}" cy="{px(by_)}" r="{px(1.6)}" fill="{col}"/>')
        svg.append(f'<text x="{px(bx_)}" y="{px(by_+0.65)}" text-anchor="middle" '
                   f'fill="{INK if dark else "#fff"}" font-size="{px(1.8)}" '
                   f'font-weight="900">{b}</text>')
for b in services:
    draw_service(b)

# Label placement: side-anchored on the vertical trunk columns, below dots
# elsewhere; per-station overrides for tight spots.
side_cols = {16: 'start', 36: 'end', 60: 'end', 188: 'start', 284: 'end',
             236: 'end', 268: 'end', 152: 'start'}
label_over = {  # (anchor, dx, dy) — hand-tuned tight spots
  sid(68,156): ('end', -2.6, -3.0),   # corridor: label up-left
  sid(96,156): ('middle', 0, 5.6),    # corridor: label below
  sid(112,156): ('start', 3.4, 1.0),  # C terminal: label right
  sid(16,132): ('start', 3.8, -3.2),  # Angel Pier: above the corridor start
  sid(176,288): ('end', -3.6, 1.0),   # Boardwalk: left of the W run
}
for k, (x, y, nm) in stations.items():
    inter = len(use[k]) >= 2
    if inter:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(INT_R)}" fill="#fff" '
                   f'stroke="{INK}" stroke-width="{px(INT_RING)}"/>')
    else:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(0.85)}" fill="{INK}"/>')
    if k in label_over:
        anchor, odx, ody = label_over[k]
        lx, ly = x + odx, y + ody
    elif x in side_cols:
        anchor = side_cols[x]
        lx = x + 3.4 if anchor == 'start' else x - 3.4
        ly = y + 1.0
    else:
        lx, anchor = x, 'middle'
        ly = y + 3.2 + LABEL_F*0.8 if y < WORLD*0.94 else y - 3.2
    svg.append(f'<text x="{px(lx)}" y="{px(ly)}" text-anchor="{anchor}" font-size="{px(LABEL_F)}" '
               f'font-weight="700" fill="{INK}" stroke="#fff" stroke-width="3" '
               f'paint-order="stroke">{nm}</text>')

for (tx, ty, col, b) in [(96,156,'#EE352E','1'),(16,204,'#0039A6','B'),
                         (236,208,'#FCCC0A','T')]:
    dark = col == '#FCCC0A'
    svg.append(f'<circle cx="{px(tx)}" cy="{px(ty)}" r="{px(TRAIN_R)}" fill="{col}" stroke="#fff" stroke-width="{px(0.5)}"/>')
    svg.append(f'<text x="{px(tx)}" y="{px(ty)+px(TRAIN_R)*0.42}" text-anchor="middle" '
               f'fill="{INK if dark else "#fff"}" font-size="{px(TRAIN_R*1.15)}" font-weight="900">{b}</text>')
svg.append('</svg>')

out = pathlib.Path(__file__).parent
(out / 'angelbay.html').write_text('<!doctype html><body style="margin:0">' + "\n".join(svg))
(out / 'angelbay.svg').write_text("\n".join(svg))
r = subprocess.run(['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '--headless=new',
                    '--no-sandbox', '--disable-gpu', f'--window-size={W+20},{H+60}',
                    f'--screenshot={out}/angelbay.png', f'file://{out}/angelbay.html'],
                   capture_output=True, text=True, timeout=60)
print(r.returncode, r.stderr[-200:] if r.returncode else 'OK', '| stations:', len(stations),
      '| services:', len(services))
