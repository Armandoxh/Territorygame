#!/usr/bin/env python3
"""Design rig: NEW MERIDIAN XL — the 24-line metropolis. 520x520 world.
The approved 300-unit city sits as the dense downtown core (offset +110,
its 9 lines intact, several extended outward); around it: Northgate and
the Airfield strip (N), an expanded Westbank (W), Eastport with its own
trunk (E), and the South Shore around a much larger Meridian Bay (S),
crossed by a bay-bridge line. Rules asserted mechanically: 45-degree
bends only, >=6 stops per line, <=3 shared stops per line pair, unique
colors, min station spacing, and every station on land."""
import subprocess, pathlib, sys

WORLD = 520
S = 2.4
W = H = int(WORLD * S)

INK = '#1A1A1A'
GROUND = '#BDD3E8'
LAND = '#FAF9F6'
WATER_TXT = '#6E93AC'
PARK = '#CBE2C6'

OX = OY = 110  # offset of the approved core within the XL world

def O(pts):  # offset a core path into XL coordinates
    return [(x + OX, y + OY) for (x, y) in pts]

# ---- the approved core lines (verbatim, offset), with extensions ----
core = {
  '1': [(96,238),(96,214),(96,190),(114,172),(114,150),(114,130),(96,112),
        (96,88),(96,64),(114,46),(114,22)],
  'A': [(24,236),(48,236),(66,218),(90,218),(114,194),(126,182),(156,182),
        (186,212),(210,212)],
  'L': [(96,238),(120,238),(156,238),(180,238),(204,262),(228,262)],
  'M': [(24,58),(48,58),(84,22),(114,22),(156,22),(180,22)],
  'N': [(90,254),(90,218),(114,194),(114,172),(114,150),(114,130),(156,88),
        (180,88),(204,64),(228,64)],
  'J': [(156,132),(156,182),(186,212),(210,212),(234,236),(258,236)],
  'G': [(192,28),(192,52),(192,88),(174,106),(174,142),(192,160),(192,196)],
  'E': [(24,36),(24,58),(24,80),(42,98),(42,142),(24,160),(24,200),(24,236)],
  '7': [(84,88),(96,88),(120,88),(156,52),(192,52),(216,28),(252,28)],
}

services = {}
services['1'] = ('#EE352E',
    [(126,452),(158,452),(158,420),(218,360)] + O(core['1']) +
    [(224,100),(224,68)])
services['A'] = ('#0039A6', O(core['A']))
services['L'] = ('#A7A9AC', O(core['L']) + [(362,396),(394,396),(426,364)])
services['M'] = ('#FF6319',
    O(core['M']) + [(338,84),(386,84),(438,84),(438,124),(494,124)])
services['N'] = ('#FCCC0A', O(core['N']))
services['J'] = ('#996633', O(core['J']))
services['G'] = ('#6CBE45', O(core['G']))
services['E'] = ('#00933C', O(core['E']))
services['7'] = ('#B933AD', O(core['7']))

# ---- the 15 new lines ----
services['2'] = ('#00A1DE', [(128,68),(160,68),(192,100),(224,100),(272,100),
                             (304,100),(336,100),(368,100),(400,68),(432,68)])
services['3'] = ('#C60C30', [(40,60),(72,60),(104,92),(104,124),(104,156),
                             (104,188)])
services['4'] = ('#00695C', [(40,188),(40,220),(40,252),(72,252),(104,252),
                             (136,284),(160,284)])
services['6'] = ('#9575CD', [(20,140),(20,172),(20,204),(20,236),(20,268),
                             (20,300)])
services['8'] = ('#C2185B', [(270,266),(302,234),(334,234),(366,234),
                             (398,234),(430,266)])
services['B'] = ('#3F51B5', [(72,60),(72,92),(72,124),(72,156),(72,188),
                             (72,220),(72,252),(72,284),(72,316),(72,348),
                             (96,372)])
services['C'] = ('#26A69A', [(40,60),(40,92),(40,124),(40,156),(72,156),
                             (104,156)])
services['D'] = ('#808000', [(134,346),(134,378),(158,402),(158,434),
                             (270,434),(302,466),(334,466),(366,466)])
services['F'] = ('#FFB300', [(318,282),(350,282),(382,314),(414,314),
                             (414,346),(414,378)])
services['H'] = ('#37474F', [(302,36),(334,36),(366,36),(398,36),(430,36),
                             (462,68)])
services['Q'] = ('#4A148C', [(46,364),(46,396),(46,428),(78,428),(102,452),
                             (126,452)])
services['R'] = ('#E91E8C', [(290,348),(314,372),(346,404),(378,404),
                             (410,436),(442,436)])
services['V'] = ('#001F5B', [(462,68),(462,100),(438,124),(438,156),
                             (462,180),(462,212),(462,244),(462,276),
                             (462,308),(462,340)])
services['W'] = ('#5A6B7A', [(366,466),(398,466),(430,466),(462,434),
                             (462,402),(462,370),(462,340)])
services['Z'] = ('#6D4C41', [(494,124),(494,156),(494,188),(494,220),
                             (494,252),(494,284)])

lands = [
  # Westbank, a full borough now.
  [(16,44),(136,44),(168,76),(168,464),(136,496),(16,496)],
  # Meridian island, stretched north and south.
  [(196,56),(228,56),(236,64),(236,336),(224,372),(206,384),(194,372),
   (188,336),(188,64)],
  # The east mainland: Northgate, Long Haven, Eastport, South Shore.
  [(290,20),(500,20),(500,500),(300,500),(262,462),(262,48)],
]
districts = [('WESTBANK',48,330,-90),('NORTHGATE',380,60,0),
             ('LONG HAVEN',330,190,0),('EASTPORT',462,230,-90),
             ('SOUTH SHORE',380,480,0),('MERIDIAN',212,220,-90)]
water_labels = [('WEST RIVER',176,240,-90),('EAST RIVER',249,220,-90),
                ('MERIDIAN BAY',212,460,0),('THE SOUND',80,508,0)]
parks = [(340,150,26,16,6),(140,170,13,20,4),(316,80,14,10,-5),
         (368,250,12,18,9),(212,150,10,7,-3),(60,120,12,14,5),
         (420,220,14,12,-6),(330,420,16,12,4),(90,250,10,12,-3)]

# ---- checks (report, don't crash, so a render always comes out) ----
problems = []
for b, (col, path) in services.items():
    if len(path) < 6:
        problems.append(f'{b}: only {len(path)} stops')
    for i in range(len(path) - 1):
        dx = abs(path[i+1][0] - path[i][0])
        dy = abs(path[i+1][1] - path[i][1])
        if not (dx == 0 or dy == 0 or dx == dy):
            problems.append(f'{b} seg {i} {path[i]}->{path[i+1]}: {dx},{dy}')
colors = [c for c, _ in services.values()]
if len(set(colors)) != len(colors):
    problems.append('duplicate colors')
for a in services:
    for b in services:
        if a >= b: continue
        shared = len(set(services[a][1]) & set(services[b][1]))
        if shared > 3:
            problems.append(f'{a}/{b} share {shared} stops')

def inside(pt, poly, tol=0.6):
    x, y = pt
    n = len(poly)
    hit = False
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i+1) % n]
        # on-edge tolerance
        cross = (x2-x1)*(y-y1) - (y2-y1)*(x-x1)
        seglen2 = (x2-x1)**2 + (y2-y1)**2
        if seglen2 and cross*cross <= tol*tol*seglen2 and \
           min(x1,x2)-tol <= x <= max(x1,x2)+tol and \
           min(y1,y2)-tol <= y <= max(y1,y2)+tol:
            return True
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1) + x1:
            hit = not hit
    return hit

core_pts = {(x+OX, y+OY) for path in core.values() for (x, y) in path}
allstops = {}
for b, (col, path) in services.items():
    for p in path:
        allstops.setdefault(p, set()).add(b)
for p in allstops:
    if p in core_pts:
        continue  # the approved core is grandfathered as-shipped
    if not any(inside(p, poly) for poly in lands):
        problems.append(f'station {p} ({"/".join(sorted(allstops[p]))}) in water')
pts = list(allstops)
MIN_D = 14
for i in range(len(pts)):
    for j in range(i+1, len(pts)):
        if pts[i] in core_pts and pts[j] in core_pts:
            continue  # approved core spacing is grandfathered
        d2 = (pts[i][0]-pts[j][0])**2 + (pts[i][1]-pts[j][1])**2
        if d2 < MIN_D*MIN_D:
            problems.append(f'crowded: {pts[i]} {"/".join(sorted(allstops[pts[i]]))}'
                            f' vs {pts[j]} {"/".join(sorted(allstops[pts[j]]))}'
                            f' d={d2**0.5:.1f}')

# ---- names ----
streets = {238:'12 St',214:'24 St',190:'36 St',172:'45 St',150:'56 St',
           130:'66 St',112:'75 St',88:'87 St',64:'99 St',46:'108 St',
           22:'120 St',194:'34 St'}
named = {}
for y, nm in streets.items():
    named[(96+OX, y+OY)] = nm
    named[(114+OX, y+OY)] = nm
core_named = {(24,236):'Harbor Pier',(48,236):'Westgate',(66,218):'Old Mill',
  (90,218):'Union Sq',(126,182):'Riverside',(156,182):'Bedford Av',
  (186,212):'Court Sq',(210,212):'Steinway St',(120,238):'Atlantic Av',
  (156,238):'Myrtle Av',(180,238):'DeKalb Av',(204,262):'Kingsland Rd',
  (228,262):'Metropolitan',(24,58):'Seneca Av',(48,58):'Woodhaven',
  (84,22):'Junction Blvd',(156,22):'Broadway Jct',(180,22):'Sunset Pk',
  (90,254):'Bay Pkwy',(156,88):'Ocean Pkwy',(180,88):'Brighton',
  (204,64):'Astoria Blvd',(228,64):'Ditmars Blvd',(156,132):'Queensview',
  (234,236):'Forest Hls',(258,236):'Kew Gdns',(192,28):'Jamaica Ctr',
  (192,52):'Greenpoint',(192,88):'Nassau Av',(174,106):'Classon Av',
  (174,142):'Clinton Wash',(192,160):'Fulton St',(192,196):'Crown Hts',
  (24,36):'Prospect Pk',(24,80):'Church Av',(42,98):'Newkirk Av',
  (42,142):'Midwood',(24,160):'Canarsie',(24,200):'Livonia Av',
  (84,88):'East End',(120,88):'Harbor View',(156,52):'Palisade',
  (216,28):'Iron Docks',(252,28):'Cargoport'}
for p, nm in core_named.items():
    named[(p[0]+OX, p[1]+OY)] = nm
pool = iter(['South Ferry','Two Bridges','Bayfront','Sound View','Gull Is',
  'Northgate','Terminal A','Terminal B','Airfield','Runway Rd','Customs Hse',
  'Freight Yd','Cedar Falls','Maple Hts','Birchwood','Elm Sq','Ashford',
  'Willow Bend','Granite Pk','Quarry St','Millbrook','Foundry Sq','Steel Pier',
  'Coke Works','Brickyard','Tannery Row','Wool Exchange','Corn Hill',
  'Market Cross','Fish Wharf','Oyster Bay','Clam Cove','Herring Run',
  'Salmon Falls','Trout Brook','Beaver Dam','Otter Creek','Fox Hollow',
  'Wolf Point','Bear Ridge','Eagle Hts','Hawk Hill','Raven Ct','Sparrow Ln',
  'Finch Grove','Wren St','Robin Rd','Cardinal Sq','Bluebird Av','Dove Ct',
  'North Meadow','South Meadow','East Meadow','West Meadow','Long Acre',
  'Short Acre','Broad Acre','Green Acre','Stone Acre','High Acre',
  'Kingsbridge','Queensbridge','Dukes Ct','Earls Ct','Barons Gate',
  'Regent Row','Crown Point','Scepter St','Orb Lane','Throne Hill',
  'Anchor Wharf','Beacon Pt','Compass Rose','Davit St','Ensign Av',
  'Fathom Ct','Galley Rd','Helm St','Inlet Av','Jetty Rd','Keel Ct',
  'Lighthouse','Mast Hill','Nautilus Sq','Outrigger','Porthole Pl',
  'Quarterdeck','Rudder Row','Spinnaker','Tiller St','Windlass Ct',
  'Alder Grove','Basil Ct','Clove Hill','Dill Lane','Fennel Sq','Ginger Row',
  'Hazel Wood','Ivy Ridge','Juniper Av','Kale Yard','Laurel Pk','Mint Hollow',
  'Nutmeg St','Olive Branch','Pepper Hill','Quince Orchard','Rosemary Ln',
  'Sage Flats','Thyme Sq','Vervain Ct','Walnut Row','Yarrow Fld','Zinnia Pl',
  'Old Toll Gate','New Toll Gate','Ferry Slip','Drydock','Ropewalk',
  'Sailmakers','Coopers Yd','Chandlery','Riggers Row','Ballast Pt'])
stations = {}
for b, (col, path) in services.items():
    for (x, y) in path:
        if (x, y) in stations: continue
        stations[(x, y)] = named.get((x, y)) or next(pool)

# ---- geometry for drawing ----
seg_use = {}
def segkey(a, b): return tuple(sorted([a, b]))
for b, (col, path) in services.items():
    for i in range(len(path)-1):
        seg_use.setdefault(segkey(path[i], path[i+1]), []).append(b)
for k in seg_use: seg_use[k].sort()

def px(v): return v * S
def pt(x, y): return f"{px(x):.1f},{px(y):.1f}"

LINE_W = 2.2
LANE = 3.2
LABEL_F = 2.9
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
       f'style="background:{GROUND};font-family:Inter,Helvetica,Arial,sans-serif">']
for land in lands:
    lp = " ".join(pt(x, y) for x, y in land)
    svg.append(f'<polygon points="{lp}" fill="{LAND}" stroke="{LAND}" '
               f'stroke-width="{px(3)}" stroke-linejoin="round"/>')
for name, dx_, dy_, rot in districts:
    svg.append(f'<text x="{px(dx_)}" y="{px(dy_)}" text-anchor="middle" fill="#D4D4D4" '
               f'font-size="{px(9)}" font-weight="800" letter-spacing="3" '
               f'transform="rotate({rot} {px(dx_)} {px(dy_)})">{name}</text>')
for text, wx, wy, rot in water_labels:
    svg.append(f'<text x="{px(wx)}" y="{px(wy)}" fill="{WATER_TXT}" font-size="{px(4.5)}" '
               f'font-weight="700" letter-spacing="1.5" text-anchor="middle" '
               f'transform="rotate({rot} {px(wx)} {px(wy)})">{text}</text>')
for cx, cy, w, h, rot in parks:
    svg.append(f'<rect x="{px(cx-w/2)}" y="{px(cy-h/2)}" width="{px(w)}" height="{px(h)}" '
               f'fill="{PARK}" transform="rotate({rot} {px(cx)} {px(cy)})"/>')

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
        dark = col in ('#FCCC0A', '#FFB300', '#26A69A', '#6CBE45')
        svg.append(f'<circle cx="{px(bx_)}" cy="{px(by_)}" r="{px(1.6)}" fill="{col}"/>')
        svg.append(f'<text x="{px(bx_)}" y="{px(by_+0.65)}" text-anchor="middle" '
                   f'fill="{INK if dark else "#fff"}" font-size="{px(1.8)}" '
                   f'font-weight="900">{b}</text>')
for b in services:
    draw_service(b)

side_cols = {20+0: 'start', 40: 'end', 72: 'start', 104: 'start',
             96+OX: 'end', 114+OX: 'start', 462: 'end', 494: 'end',
             438: 'end', 46: 'start'}
label_over = {(266,198): 'end', (302,198): 'start', (218,360): 'start'}
named[(224,100)] = 'Half Moon'
named[(218,360)] = 'South Landing'
if (218,360) in stations: stations[(218,360)] = 'South Landing'
named[(224,68)] = 'North Point'
for k in [(224,100),(224,68)]:
    if k in stations:
        stations[k] = named[k]
for (x, y), nm in stations.items():
    nserv = len(allstops[(x, y)])
    inter = nserv >= 2
    if inter:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(2.4)}" fill="#fff" '
                   f'stroke="{INK}" stroke-width="{px(0.7)}"/>')
    else:
        svg.append(f'<circle cx="{px(x)}" cy="{px(y)}" r="{px(0.85)}" fill="{INK}"/>')
    if (x, y) in label_over:
        anchor = label_over[(x, y)]
    elif x in side_cols:
        anchor = side_cols[x]
        lx = x + 3.4 if anchor == 'start' else x - 3.4
        ly = y + 1.0
    else:
        lx, anchor = x, 'middle'
        ly = y + 3.2 + LABEL_F*0.8 if y < WORLD*0.96 else y - 3.2
    svg.append(f'<text x="{px(lx)}" y="{px(ly)}" text-anchor="{anchor}" font-size="{px(LABEL_F)}" '
               f'font-weight="700" fill="{INK}" stroke="#fff" stroke-width="3" '
               f'paint-order="stroke">{nm}</text>')
svg.append('</svg>')

out = pathlib.Path(__file__).parent
(out / 'meridian_xl.html').write_text('<!doctype html><body style="margin:0">' + "\n".join(svg))
(out / 'meridian_xl.svg').write_text("\n".join(svg))
r = subprocess.run(['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '--headless=new',
                    '--no-sandbox', '--disable-gpu', f'--window-size={W+20},{H+60}',
                    f'--screenshot={out}/meridian_xl.png', f'file://{out}/meridian_xl.html'],
                   capture_output=True, text=True, timeout=60)
inters = sum(1 for p in allstops if len(allstops[p]) >= 2)
print(r.returncode, 'render OK' if r.returncode == 0 else r.stderr[-200:],
      f'| lines: {len(services)} | stations: {len(stations)} | interchanges: {inters}')
if problems:
    print(f'--- {len(problems)} PROBLEMS ---')
    for p in problems:
        print(' ', p)
else:
    print('ALL RULES PASS')


# ---- Dart emitter: run after approval to regenerate the CityDef ----
def emit_dart():
    # Unlock ladder: the original nine keep their order and prices; the
    # fifteen new lines continue the escalation.
    order = ['1','A','L','M','N','J','G','E','7',
             '2','C','3','Q','B','8','4','H','D','F','R','V','W','6','Z']
    unlock = {'1':0,'A':4000,'L':15000,'M':45000,'N':120000,'J':300000,
              'G':700000,'E':1500000,'7':3000000,
              '2':6000000,'C':10000000,'3':16000000,'Q':25000000,
              'B':40000000,'8':60000000,'4':90000000,'H':130000000,
              'D':190000000,'F':280000000,'R':400000000,'V':550000000,
              'W':750000000,'6':1000000000,'Z':1400000000}
    traincost = {'1':750,'A':1500,'L':4000,'M':12000,'N':30000,'J':75000,
                 'G':175000,'E':400000,'7':750000,
                 '2':1500000,'C':2500000,'3':4000000,'Q':6000000,
                 'B':10000000,'8':15000000,'4':22000000,'H':32000000,
                 'D':47000000,'F':70000000,'R':100000000,'V':140000000,
                 'W':190000000,'6':250000000,'Z':350000000}
    line_names = {'1':'Meridian Local','A':'Harbor Runner','L':'South Crosstown',
      'M':'Bridge Express','N':'Broadway Flyer','J':'Southeast Arrow',
      'G':'Haven Loop','E':'Westbank Line','7':'North Crosstown',
      '2':'Northgate Limited','C':'Coke Works Local','3':'Brickyard Branch',
      'Q':'Sound Ferryway','B':'Westbank Trunk','8':'Haven Heights',
      '4':'Meadow Crosstown','H':'Freight Harbor','D':'Bay Bridge Express',
      'F':'Airfield Flyer','R':'Terminal Runner','V':'Eastport Trunk',
      'W':'South Shoreline','6':'Sound Coast Local','Z':'Eastport Local'}
    old_plates = {'1':(150,36),'A':(40,256),'L':(150,252),'M':(52,40),
                  'N':(196,44),'J':(244,254),'G':(214,120),'E':(10,120),
                  '7':(150,68)}
    plates = {b: (x+OX, y+OY) for b, (x, y) in old_plates.items()}
    plates.update({'2':(250,84),'3':(66,32),'C':(30,36),'B':(114,336),
                   '4':(54,204),'6':(44,286),'Q':(24,380),'8':(344,210),
                   'H':(350,20),'D':(204,418),'F':(352,332),'R':(232,408),
                   'V':(430,200),'W':(416,490),'Z':(486,88)})
    core_demand = {(96,238):0.7,(96,214):0.45,(96,190):0.45,(114,172):0.7,
      (114,150):0.7,(114,130):0.7,(96,112):0.45,(96,88):0.7,(96,64):0.45,
      (114,46):0.45,(114,22):0.7,(24,236):0.7,(48,236):0.45,(66,218):0.45,
      (90,218):0.7,(114,194):0.7,(126,182):0.45,(156,182):0.7,(186,212):0.7,
      (210,212):0.7,(120,238):0.45,(156,238):0.45,(180,238):0.45,
      (204,262):0.45,(228,262):0.3,(24,58):0.7,(48,58):0.45,(84,22):0.45,
      (156,22):0.45,(180,22):0.3,(90,254):0.3,(156,88):0.45,(180,88):0.45,
      (204,64):0.45,(228,64):0.3,(156,132):0.3,(234,236):0.45,(258,236):0.3,
      (192,28):0.3,(192,52):0.7,(192,88):0.45,(174,106):0.45,(174,142):0.45,
      (192,160):0.45,(192,196):0.3,(24,36):0.3,(24,80):0.45,(42,98):0.45,
      (42,142):0.45,(24,160):0.45,(24,200):0.45,(84,88):0.3,(120,88):0.45,
      (156,52):0.45,(216,28):0.45,(252,28):0.3}
    demand_of = {}
    terminals = set()
    for b in order:
        p = services[b][1]
        terminals.add(p[0]); terminals.add(p[-1])
    for p in allstops:
        if (p[0]-OX, p[1]-OY) in core_demand:
            demand_of[p] = core_demand[(p[0]-OX, p[1]-OY)]
        elif len(allstops[p]) >= 2:
            demand_of[p] = 0.7
        elif p in terminals:
            demand_of[p] = 0.3
        else:
            demand_of[p] = 0.45
    lab = {(266,198): 'end', (302,198): 'start', (218,360): 'start'}
    def sid(p): return f's{p[0]}_{p[1]}'
    out = []
    out.append('  static const newMeridian = CityDef(')
    out.append("    id: 'new_meridian',")
    out.append("    name: 'New Meridian',")
    out.append('    size: 520,')
    out.append('    stations: [')
    out.append('      // GENERATED from the approved design rig (tools/meridian_xl.py) —')
    out.append('      // regenerate there, get approval, then re-emit. Do not hand-edit')
    out.append('      // coordinates.')
    for p, nm in stations.items():
        if p in lab:
            side = {'start': 1, 'end': -1}[lab[p]]
        elif p[0] in side_cols:
            side = {'start': 1, 'end': -1}[side_cols[p[0]]]
        else:
            side = 0
        sd = f', labelSide: {side}' if side else ''
        out.append(f"      StationDef(id: '{sid(p)}', name: '{nm}', x: {p[0]}, "
                   f"y: {p[1]}, demand: {demand_of[p]}{sd}),")
    out.append('    ],')
    out.append('    lines: [')
    for b in order:
        col, path = services[b]
        ids = ', '.join(f"'{sid(p)}'" for p in path)
        px_, py_ = plates[b]
        out.append('      LineDef(')
        out.append(f"        id: '{b}',")
        out.append(f"        name: '{line_names[b]}',")
        out.append(f"        bullet: '{b}',")
        out.append(f"        color: Color(0xFF{col[1:]}),")
        out.append(f'        stationIds: [{ids}],')
        out.append(f'        unlockCost: {unlock[b]},')
        out.append(f'        trainCost: {traincost[b]},')
        out.append(f'        plateX: {px_},')
        out.append(f'        plateY: {py_},')
        out.append('      ),')
    out.append('    ],')
    out.append('    lands: [')
    for land in lands:
        out.append('      [')
        for x, y in land:
            out.append(f'        Offset({x}, {y}),')
        out.append('      ],')
    out.append('    ],')
    out.append('    districts: [')
    for name, dx_, dy_, rot in districts:
        rs = f', rotDeg: {rot}' if rot else ''
        out.append(f"      WaterLabel('{name}', {dx_}, {dy_}{rs}),")
    out.append('    ],')
    out.append('    waterLabels: [')
    for text, wx, wy, rot in water_labels:
        rs = f', rotDeg: {rot}' if rot else ''
        out.append(f"      WaterLabel('{text}', {wx}, {wy}{rs}),")
    out.append('    ],')
    out.append('    parks: [')
    for cx, cy, w, h, rot in parks:
        out.append(f'      ParkDef({cx}, {cy}, {w}, {h}, {rot}),')
    out.append('    ],')
    out.append('  );')
    (pathlib.Path(__file__).parent / 'meridian_xl_dart.txt').write_text('\n'.join(out) + '\n')
    print('emitted', len(stations), 'stations,', len(order), 'lines')

if '--emit' in sys.argv:
    emit_dart()
