#!/usr/bin/env python3
"""Design rig v3: the full-network metropolis. 300x300 world, three land
masses, 21 services in MTA color families with trunk bundles (parallel
strokes), 45-degree bends only. Generates the network from service specs;
the same data gets emitted to Dart after approval."""
import subprocess, pathlib

WORLD = 300
S = 3.2
W = H = int(WORLD * S)

LINE_W = 2.2
LANE_GAP = 2.7          # spacing between parallel services in a bundle
DOT_R = 1.9
DOT_RING = 0.55
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

RED = '#EE352E'; GREEN = '#00933C'; BLUE = '#0039A6'; ORANGE = '#FF6319'
YELLOW = '#FCCC0A'; PURPLE = '#B933AD'; GRAY = '#A7A9AC'; LGREEN = '#6CBE45'
BROWN = '#996633'

def vert(x, ys): return [(x, y) for y in ys]
LOCAL_Y = [18, 38, 58, 78, 98, 118, 138, 158, 178, 198, 218, 238]
EXP_Y   = [18, 58, 98, 138, 178, 218, 238]

# bullet: (color, path, stops) — every line a UNIQUE color and its own
# scattered route; short 2-3 stop shared corridors render side-by-side via
# per-segment lane offsets. 45-degree bends only.
services = {
  '1': ('#EE352E', [(96,238),(96,214),(96,190),(114,172),(114,150),(114,130),
                    (96,112),(96,88),(96,64),(114,46),(114,22)], None),
  'A': ('#0039A6', [(24,236),(48,236),(66,218),(90,218),(114,194),
                    (126,182),(156,182),(186,212),(210,212)], None),
  'N': ('#FCCC0A', [(90,254),(90,218),(114,194),(114,172),
                    (114,150),(114,130),(156,88),(180,88),(204,64),(228,64)],
        None),
  '7': ('#B933AD', [(84,88),(96,88),(120,88),(156,52),(192,52),(216,28),(252,28)], None),
  'G': ('#6CBE45', [(192,28),(192,52),(192,88),(174,106),(174,142),(192,160),
                    (192,196)], None),
  'L': ('#A7A9AC', [(96,238),(120,238),(156,238),(180,238),(204,262),(228,262)], None),
  'E': ('#00933C', [(24,36),(24,58),(24,80),(42,98),(42,142),(24,160),(24,200),
                    (24,236)], None),
  'M': ('#FF6319', [(24,58),(48,58),(84,22),(114,22),(156,22),(180,22)], None),
  'J': ('#996633', [(156,132),(156,182),(186,212),(210,212),(234,236),(258,236)], None),
}
lands = [
  [(0,0),(46,0),(58,46),(58,254),(46,300),(0,300)],
  [(78,14),(114,14),(126,26),(126,214),(114,250),(96,262),(84,250),(78,214)],
  [(158,0),(300,0),(300,300),(170,300),(152,272),(152,28)],
]
districts = [('WESTBANK',24,150,-90),('LONG HAVEN',240,140,0)]
water_labels = [('WEST RIVER',68,120,-90),('EAST RIVER',139,110,-90),
                ('MERIDIAN BAY',105,287,0)]
parks = [(230,180,26,16,6),(30,60,13,20,4),(206,70,14,10,-5),(258,140,12,18,9),
         (102,40,10,7,-3)]

# ---- generate stations (dedupe by coordinate) ----
streets = {y: f'{int((262-y)/2)} St' for y in
           {238,214,190,172,150,130,112,88,64,46,22,194,200}}
pool = iter(['Harbor Pier','Westgate','Old Mill','Union Sq','Riverside',
  'Bedford Av','Court Sq','Steinway St','Atlantic Av','Myrtle Av','DeKalb Av',
  'Kingsland Rd','Metropolitan','Seneca Av','Woodhaven','Junction Blvd',
  'Broadway Jct','Sunset Pk','Bay Pkwy','Ocean Pkwy','Brighton','Astoria Blvd',
  'Ditmars Blvd','Queensview','Forest Hls','Kew Gdns','Jamaica Ctr','Greenpoint',
  'Nassau Av','Classon Av','Clinton Wash','Fulton St','Crown Hts','Prospect Pk',
  'Church Av','Newkirk Av','Midwood','Canarsie','Livonia Av','East End',
  'Harbor View','Palisade','Iron Docks','Cargoport','Expo Grounds','Cathedral',
  'Garment Dist','Stadium','Airfield','Lighthouse','Gasworks','Foundry',
  'Beacon Hill','Copper Row','Salt Flats','Mariner Wharf'])
stations = {}
def sid(x, y): return f's{x}_{y}'
def svc(v):
    col, path, stops = v
    return col, path, (stops if stops else path)
for b in services:
    col, path, stops = svc(services[b])
    for (x,y) in stops:
        k = sid(x,y)
        if k in stations: continue
        if x in (96,108,114) and y in streets:
            nm = streets[y]
        else:
            try: nm = next(pool)
            except StopIteration: nm = f'{x}-{y}'
        stations[k] = (x,y,nm)
use = {}
for b in services:
    col, path, stops = svc(services[b])
    for (x,y) in set(stops): use.setdefault(sid(x,y), set()).add(b)

# per-SEGMENT sharing: services drawing the same segment get side-by-side lanes
seg_use = {}
def segkey(a, b): return tuple(sorted([a, b]))
for b in services:
    col, path, stops = svc(services[b])
    for i in range(len(path)-1):
        seg_use.setdefault(segkey(path[i], path[i+1]), []).append(b)
for k in seg_use: seg_use[k].sort()

def px(v): return v * S
def pt(x, y): return f"{px(x):.1f},{px(y):.1f}"

svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
       f'style="background:{GROUND};font-family:Inter,Helvetica,Arial,sans-serif">']
for land in lands:
    lp = " ".join(pt(x,y) for x,y in land)
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

# services drawn segment-by-segment; shared segments fan into lanes
LANE = 3.2
def draw_service(b):
    col, path, stops = svc(services[b])
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
    # terminal bullets past both ends
    for endi, previ in ((0,1),(-1,-2)):
        ex,ey = path[endi]; pxx,pyy = path[previ]
        dx_,dy_ = ex-pxx, ey-pyy
        ln = (dx_*dx_+dy_*dy_) ** 0.5 or 1
        bx_,by_ = ex+dx_/ln*4.5, ey+dy_/ln*4.5
        dark = col == '#FCCC0A'
        svg.append(f'<circle cx="{px(bx_)}" cy="{px(by_)}" r="{px(1.6)}" fill="{col}"/>')
        svg.append(f'<text x="{px(bx_)}" y="{px(by_+0.65)}" text-anchor="middle" '
                   f'fill="{INK if dark else "#fff"}" font-size="{px(1.8)}" '
                   f'font-weight="900">{b}</text>')
for b in services:
    draw_service(b)

label_over = {'s84_88': ('end', -3.4, 1.0), 's192_88': ('start', 3.4, 1.0),
              's156_88': ('end', -3.4, 1.0), 's90_218': ('end', -3.6, 1.6)}
for k,(x,y,nm) in stations.items():
    nserv = len(use[k])
    inter = nserv >= 2
    if inter:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(INT_R)}" fill="#fff" '
                   f'stroke="{INK}" stroke-width="{px(INT_RING)}"/>')
    else:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(0.85)}" fill="{INK}"/>')
    if k in label_over:
        anchor, odx, ody = label_over[k]
        lx, ly = x + odx, y + ody
    elif x in (96,114):
        lx, anchor = (x - 3.4, 'end') if x == 96 else (x + 3.4, 'start')
        ly = y + 1.0
    else:
        lx, anchor = x, 'middle'
        ly = y + 3.2 + LABEL_F*0.8 if y < WORLD*0.94 else y - 3.2
    svg.append(f'<text x="{px(lx)}" y="{px(ly)}" text-anchor="{anchor}" font-size="{px(LABEL_F)}" '
               f'font-weight="700" fill="{INK}" stroke="#fff" stroke-width="3" '
               f'paint-order="stroke">{nm}</text>')

# a few staged trains
for (tx,ty,col,b) in [(96,100,'#EE352E','1'),(48,236,'#0039A6','A'),(156,52,'#B933AD','7')]:
    dark = col == YELLOW
    svg.append(f'<circle cx="{px(tx)}" cy="{px(ty)}" r="{px(TRAIN_R)}" fill="{col}" stroke="#fff" stroke-width="{px(0.5)}"/>')
    svg.append(f'<text x="{px(tx)}" y="{px(ty)+px(TRAIN_R)*0.42}" text-anchor="middle" '
               f'fill="{INK if dark else "#fff"}" font-size="{px(TRAIN_R*1.15)}" font-weight="900">{b}</text>')
svg.append('</svg>')

out = pathlib.Path(__file__).parent
(out / 'mapmock.html').write_text('<!doctype html><body style="margin:0">' + "\n".join(svg))
r = subprocess.run(['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '--headless=new',
                    '--no-sandbox', '--disable-gpu', f'--window-size={W},{H+40}',
                    f'--screenshot={out}/mapmock.png', f'file://{out}/mapmock.html'],
                   capture_output=True, text=True, timeout=60)
print(r.returncode, r.stderr[-200:] if r.returncode else 'OK', '| stations:', len(stations),
      '| services:', len(services))
